import SwiftUI

extension Color {
    init(hex: String) {
        let s = Scanner(string: hex)
        var rgb: UInt64 = 0
        s.scanHexInt64(&rgb)
        self.init(.sRGB,
                  red: Double((rgb >> 16) & 0xFF) / 255,
                  green: Double((rgb >> 8) & 0xFF) / 255,
                  blue: Double(rgb & 0xFF) / 255,
                  opacity: 1)
    }
    static let brandNavy = Color(hex: "134486")
    static let brandGreen = Color(hex: "39b045")
    static let good = Color(hex: "2e9e3f")
    static let issue = Color(hex: "c0392b")
}

extension LinearGradient {
    static let brand = LinearGradient(
        colors: [Color(hex: "1c5fb0"), Color(hex: "2f93b8"), Color(hex: "46c85d")],
        startPoint: .leading, endPoint: .trailing)
}

/// Localized status/discipline labels (EN for now; AR can be added later).
func disciplineLabel(_ d: String) -> String {
    ["CIVIL": "Civil", "ELECTRICAL": "Electrical", "PLUMBING": "Plumbing", "PEST_OTHER": "Pest / Other"][d] ?? d
}
func statusLabel(_ s: String) -> String {
    ["DRAFT": "Draft", "IN_PROGRESS": "In progress", "IN_REVIEW": "In review",
     "COMPLETED": "Completed", "REPORTED": "Reported",
     "PENDING": "Pending", "SIGNED": "Signed"][s] ?? s
}
