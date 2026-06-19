import Foundation

/// A write that couldn't reach the server and will be replayed when back online.
/// Stored generically as a raw request so any endpoint can be queued/replayed.
struct PendingOp: Codable, Identifiable {
    let id: UUID
    let path: String
    let method: String
    let body: Data?
    let contentType: String
    let label: String      // human-readable, for the pending list
    let createdAt: Date

    init(path: String, method: String, body: Data?, contentType: String, label: String) {
        self.id = UUID()
        self.path = path
        self.method = method
        self.body = body
        self.contentType = contentType
        self.label = label
        self.createdAt = Date()
    }
}

/// On-disk cache of GET responses + the write outbox. Survives app restarts.
enum OfflineStore {
    private static let fm = FileManager.default
    private static let dir: URL = {
        let base = fm.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("offline", isDirectory: true)
        try? fm.createDirectory(at: base, withIntermediateDirectories: true)
        return base
    }()
    private static let outboxURL = dir.appendingPathComponent("outbox.json")

    // MARK: Read cache (keyed by request path)

    private static func cacheURL(_ path: String) -> URL {
        let safe = path.unicodeScalars.map { CharacterSet.alphanumerics.contains($0) ? Character($0) : "_" }
        return dir.appendingPathComponent("cache_" + String(safe)).appendingPathExtension("json")
    }
    static func cache(_ data: Data, for path: String) {
        try? data.write(to: cacheURL(path))
    }
    static func cached(for path: String) -> Data? {
        try? Data(contentsOf: cacheURL(path))
    }

    // MARK: Outbox

    static func loadOutbox() -> [PendingOp] {
        guard let data = try? Data(contentsOf: outboxURL),
              let ops = try? JSONDecoder().decode([PendingOp].self, from: data) else { return [] }
        return ops
    }
    static func saveOutbox(_ ops: [PendingOp]) {
        try? JSONEncoder().encode(ops).write(to: outboxURL)
    }
    static func enqueue(_ op: PendingOp) {
        var ops = loadOutbox(); ops.append(op); saveOutbox(ops)
    }
}

/// True when an error means "couldn't reach the server" (vs. a real HTTP error).
func isConnectivityError(_ error: Error) -> Bool {
    guard let e = error as? URLError else { return false }
    switch e.code {
    case .notConnectedToInternet, .networkConnectionLost, .cannotConnectToHost,
         .cannotFindHost, .timedOut, .dataNotAllowed, .internationalRoamingOff,
         .dnsLookupFailed, .resourceUnavailable:
        return true
    default:
        return false
    }
}
