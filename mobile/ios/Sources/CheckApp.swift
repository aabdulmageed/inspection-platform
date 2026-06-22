import SwiftUI

@main
struct CheckApp: App {
    @StateObject private var auth = AuthStore()
    @StateObject private var loc = Loc.shared

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(auth)
                .environmentObject(loc)
                .environment(\.locale, loc.locale)
                .environment(\.layoutDirection, loc.isRTL ? .rightToLeft : .leftToRight)
        }
    }
}

struct RootView: View {
    @EnvironmentObject var auth: AuthStore
    var body: some View {
        Group {
            if auth.isLoggedIn { HomeView() } else { LoginView() }
        }
        .task { await auth.devAutoLoginIfNeeded() }
    }
}
