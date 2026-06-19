import SwiftUI

@main
struct CheckApp: App {
    @StateObject private var auth = AuthStore()

    var body: some Scene {
        WindowGroup {
            RootView().environmentObject(auth)
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
