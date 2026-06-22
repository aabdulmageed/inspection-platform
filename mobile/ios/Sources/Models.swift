import Foundation

struct AuthUser: Codable, Equatable {
    let id: String
    let name: String
    let role: String
    let discipline: String?
}

struct LoginResponse: Codable {
    let accessToken: String
    let refreshToken: String
    let user: AuthUser
}

struct UserRef: Codable, Identifiable {
    let id: String
    let name: String
    let email: String
    let role: String
    let discipline: String?
}

/// Minimal shape for endpoints that return the created record.
struct CreatedRef: Codable { let id: String }

struct ClientRef: Codable { let name: String }
struct PropertyRef: Codable { let address: String; let client: ClientRef }
struct InspectorRef: Codable { let id: String?; let name: String }

struct Assignment: Codable, Identifiable {
    var id: String { discipline }
    let discipline: String
    let status: String
    let inspector: InspectorRef
}

/// Used by both the dashboard list and the agenda (myStatus only on agenda).
struct InspectionSummary: Codable, Identifiable {
    let id: String
    let status: String
    let property: PropertyRef
    let assignments: [Assignment]
    var myStatus: String?
    var issuesCount: Int?
}

struct Photo: Codable, Identifiable { let id: String; let url: String; var note: String? }

struct Item: Codable, Identifiable {
    let id: String
    let discipline: String
    let component: String
    var status: String?
    var note: String?
    var photos: [Photo]
}

struct Room: Codable, Identifiable {
    let id: String
    let name: String
    var items: [Item]
}

struct Signature: Codable, Identifiable {
    let id: String
    let discipline: String?
    let isManager: Bool
    let imageUrl: String
}

struct InspectionDetail: Codable, Identifiable {
    let id: String
    let status: String
    let property: PropertyRef
    let assignments: [Assignment]
    var rooms: [Room]
    let signatures: [Signature]
}
