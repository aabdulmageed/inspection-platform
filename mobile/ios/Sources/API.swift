import Foundation
import SwiftUI
import Network

enum APIError: LocalizedError {
    case http(Int), badResponse
    var errorDescription: String? {
        switch self {
        case .http(let c): return "Request failed (\(c))"
        case .badResponse: return "Unexpected response"
        }
    }
}

/// App-wide auth + networking. Online-first; token kept for the session.
@MainActor
final class AuthStore: ObservableObject {
    @Published var user: AuthUser?
    @Published var loading = false
    /// Live connectivity + count of writes waiting to sync (drives the offline banner).
    @Published private(set) var online = true
    @Published private(set) var pendingCount = 0

    private let pathMonitor = NWPathMonitor()

    // Backend runs on OpenShift (CRC), reached via its API route hostname.
    // - Simulator resolves it through the Mac's /etc/hosts (CRC adds it).
    // - A real iPhone resolves it via the Mac's dnsmasq (Wi-Fi DNS = the Mac's
    //   LAN IP) and reaches it through the Mac's :443 forwarder.
    // The device must TRUST CRC's ingress CA (CN=ingress-operator…): install
    // mobile/crc-ca.crt as a profile and enable full trust. URLSession will not
    // accept the self-signed cert otherwise.
    //
    // Production (Azure/AKS) — real Let's Encrypt cert, no CA install needed.
    static let baseURL = URL(string: "https://api.gocheckpro.com")!

    private var accessToken: String? {
        didSet { UserDefaults.standard.set(accessToken, forKey: "accessToken") }
    }
    private var refreshToken: String? {
        didSet { UserDefaults.standard.set(refreshToken, forKey: "refreshToken") }
    }

    init() {
        accessToken = UserDefaults.standard.string(forKey: "accessToken")
        refreshToken = UserDefaults.standard.string(forKey: "refreshToken")
        if let data = UserDefaults.standard.data(forKey: "user") {
            user = try? JSONDecoder().decode(AuthUser.self, from: data)
        }
        pendingCount = OfflineStore.loadOutbox().count
        startMonitoring()
    }

    private func startMonitoring() {
        pathMonitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor in
                let nowOnline = path.status == .satisfied
                let cameBack = nowOnline && !(self?.online ?? true)
                self?.online = nowOnline
                if cameBack { await self?.flushOutbox() }
            }
        }
        pathMonitor.start(queue: DispatchQueue(label: "net.monitor"))
    }

    var isLoggedIn: Bool { user != nil && accessToken != nil }

    func login(email: String, password: String) async throws {
        var req = URLRequest(url: Self.baseURL.appendingPathComponent("auth/login"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: ["email": email, "password": password])
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard (resp as? HTTPURLResponse)?.statusCode == 201 else { throw APIError.http((resp as? HTTPURLResponse)?.statusCode ?? -1) }
        let r = try JSONDecoder().decode(LoginResponse.self, from: data)
        accessToken = r.accessToken
        refreshToken = r.refreshToken
        user = r.user
        UserDefaults.standard.set(try? JSONEncoder().encode(r.user), forKey: "user")
    }

    func logout() {
        accessToken = nil; refreshToken = nil; user = nil
        UserDefaults.standard.removeObject(forKey: "user")
    }

    /// Dev/testing only: auto-login when launched with AUTO_LOGIN_* env vars.
    func devAutoLoginIfNeeded() async {
        guard user == nil,
              let e = ProcessInfo.processInfo.environment["AUTO_LOGIN_EMAIL"],
              let p = ProcessInfo.processInfo.environment["AUTO_LOGIN_PASSWORD"] else { return }
        try? await login(email: e, password: p)
    }

    // MARK: - Authenticated requests (auto-refresh once on 401)

    private func authed(_ path: String, method: String = "GET", body: Data? = nil, contentType: String = "application/json") async throws -> Data {
        func make() async throws -> (Data, URLResponse) {
            var req = URLRequest(url: Self.baseURL.appendingPathComponent(path))
            req.httpMethod = method
            if let t = accessToken { req.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization") }
            if let body { req.httpBody = body; req.setValue(contentType, forHTTPHeaderField: "Content-Type") }
            return try await URLSession.shared.data(for: req)
        }
        var (data, resp) = try await make()
        if (resp as? HTTPURLResponse)?.statusCode == 401, await refresh() {
            (data, resp) = try await make()
        }
        let code = (resp as? HTTPURLResponse)?.statusCode ?? -1
        guard (200..<300).contains(code) else { throw APIError.http(code) }
        return data
    }

    private func refresh() async -> Bool {
        guard let rt = refreshToken else { return false }
        do {
            var req = URLRequest(url: Self.baseURL.appendingPathComponent("auth/refresh"))
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: ["refreshToken": rt])
            let (data, resp) = try await URLSession.shared.data(for: req)
            guard (resp as? HTTPURLResponse)?.statusCode == 201 else { logout(); return false }
            let r = try JSONDecoder().decode(LoginResponse.self, from: data)
            accessToken = r.accessToken; refreshToken = r.refreshToken; user = r.user
            return true
        } catch { return false }
    }

    private func decode<T: Decodable>(_ data: Data) throws -> T {
        try JSONDecoder().decode(T.self, from: data)
    }

    // MARK: - Offline plumbing

    /// GET with a disk cache: serve fresh data online (and refresh the cache),
    /// fall back to the last cached copy when the network is unreachable.
    private func cachedGet(_ path: String) async throws -> Data {
        do {
            let data = try await authed(path)
            OfflineStore.cache(data, for: path)
            return data
        } catch {
            if isConnectivityError(error), let cached = OfflineStore.cached(for: path) { return cached }
            throw error
        }
    }

    /// Send a write, or queue it if offline so it replays on reconnect.
    /// Returns true if it was queued (not yet applied on the server).
    @discardableResult
    private func enqueueOrSend(path: String, method: String, body: Data?,
                               contentType: String = "application/json", label: String) async throws -> Bool {
        if !online {
            OfflineStore.enqueue(PendingOp(path: path, method: method, body: body, contentType: contentType, label: label))
            pendingCount = OfflineStore.loadOutbox().count
            return true
        }
        do {
            _ = try await authed(path, method: method, body: body, contentType: contentType)
            return false
        } catch {
            if isConnectivityError(error) {
                OfflineStore.enqueue(PendingOp(path: path, method: method, body: body, contentType: contentType, label: label))
                pendingCount = OfflineStore.loadOutbox().count
                return true
            }
            throw error
        }
    }

    /// Replay queued writes oldest-first. Stop if we go offline mid-flush; drop
    /// ops that fail permanently (e.g. 4xx) so one bad op can't block the queue.
    func flushOutbox() async {
        guard online else { return }
        for op in OfflineStore.loadOutbox() {
            do {
                _ = try await authed(op.path, method: op.method, body: op.body, contentType: op.contentType)
                remove(op.id)
            } catch {
                if isConnectivityError(error) { break }
                remove(op.id) // permanent failure — discard
            }
        }
        pendingCount = OfflineStore.loadOutbox().count
    }

    private func remove(_ id: UUID) {
        OfflineStore.saveOutbox(OfflineStore.loadOutbox().filter { $0.id != id })
    }

    // MARK: - Endpoints

    func agenda(date: String) async throws -> [InspectionSummary] {
        try decode(try await cachedGet("agenda?date=\(date)"))
    }
    func inspections() async throws -> [InspectionSummary] {
        try decode(try await cachedGet("inspections"))
    }
    func inspection(_ id: String) async throws -> InspectionDetail {
        try decode(try await cachedGet("inspections/\(id)"))
    }
    func updateItem(_ itemId: String, status: String?, note: String?) async throws {
        var body: [String: Any] = [:]
        if let status, !status.isEmpty { body["status"] = status }
        if let note { body["note"] = note }
        try await enqueueOrSend(path: "items/\(itemId)", method: "PATCH",
                                body: try JSONSerialization.data(withJSONObject: body), label: "Update check")
    }
    func sign(_ inspectionId: String, imageDataURI: String) async throws {
        let body = try JSONSerialization.data(withJSONObject: ["imageData": imageDataURI])
        try await enqueueOrSend(path: "inspections/\(inspectionId)/sign", method: "POST",
                                body: body, label: "Signature")
    }
    func deletePhoto(_ photoId: String) async throws {
        try await enqueueOrSend(path: "photos/\(photoId)", method: "DELETE", body: nil, label: "Delete photo")
    }
    // MARK: Staff endpoints (ADMIN / MANAGER)

    func users() async throws -> [UserRef] {
        try decode(try await authed("users"))
    }

    /// Page 1 — create the customer + property as a DRAFT job. Returns its id.
    func createDraft(customerName: String, phone: String, email: String,
                     address: String, propertyType: String, inspectionType: String,
                     latitude: Double?, longitude: Double?) async throws -> String {
        var customer: [String: Any] = ["name": customerName]
        if !phone.isEmpty { customer["phone"] = phone }
        if !email.isEmpty { customer["email"] = email }
        var property: [String: Any] = ["address": address, "type": propertyType]
        if let latitude { property["latitude"] = latitude }
        if let longitude { property["longitude"] = longitude }
        let body = try JSONSerialization.data(withJSONObject: [
            "customer": customer, "property": property, "type": inspectionType,
        ])
        let data = try await authed("inspections/draft", method: "POST", body: body)
        let r: CreatedRef = try decode(data)
        return r.id
    }

    /// Page 2 — set the date and assign inspectors per discipline.
    func assignTeam(_ id: String, scheduledAt: String,
                    assignments: [(discipline: String, inspectorId: String)]) async throws {
        let body: [String: Any] = [
            "scheduledAt": scheduledAt,
            "assignments": assignments.map { ["discipline": $0.discipline, "inspectorId": $0.inspectorId] },
        ]
        _ = try await authed("inspections/\(id)/assign", method: "POST",
                             body: try JSONSerialization.data(withJSONObject: body))
    }

    func createUser(name: String, email: String, password: String,
                    role: String, discipline: String?) async throws {
        var body: [String: Any] = ["name": name, "email": email, "password": password, "role": role]
        if role == "INSPECTOR", let discipline { body["discipline"] = discipline }
        _ = try await authed("users", method: "POST",
                             body: try JSONSerialization.data(withJSONObject: body))
    }

    func uploadPhoto(itemId: String, jpeg: Data) async throws {
        let boundary = "Boundary-\(UUID().uuidString)"
        var data = Data()
        data.append("--\(boundary)\r\n".data(using: .utf8)!)
        data.append("Content-Disposition: form-data; name=\"file\"; filename=\"photo.jpg\"\r\n".data(using: .utf8)!)
        data.append("Content-Type: image/jpeg\r\n\r\n".data(using: .utf8)!)
        data.append(jpeg)
        data.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
        try await enqueueOrSend(path: "items/\(itemId)/photos", method: "POST", body: data,
                                contentType: "multipart/form-data; boundary=\(boundary)", label: "Photo")
    }
}
