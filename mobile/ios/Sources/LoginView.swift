import SwiftUI

struct LoginView: View {
    @EnvironmentObject var auth: AuthStore
    @State private var email = ""
    @State private var password = ""
    @State private var error: String?
    @State private var busy = false

    var body: some View {
        ZStack {
            Color(.systemGroupedBackground).ignoresSafeArea()
            VStack(spacing: 20) {
                VStack(spacing: 6) {
                    Image(systemName: "house.fill").font(.system(size: 44)).foregroundStyle(LinearGradient.brand)
                    Text("CHECK House Inspections").font(.headline).foregroundStyle(.secondary)
                }
                VStack(spacing: 14) {
                    Text("Sign in").font(.title2.bold()).frame(maxWidth: .infinity, alignment: .leading)
                    TextField("Email", text: $email)
                        .textInputAutocapitalization(.never).keyboardType(.emailAddress)
                        .textFieldStyle(.roundedBorder)
                    SecureField("Password", text: $password).textFieldStyle(.roundedBorder)
                    if let error { Text(error).font(.footnote).foregroundStyle(.red) }
                    Button(action: submit) {
                        Text(busy ? "Signing in…" : "Sign in")
                            .bold().frame(maxWidth: .infinity).padding(.vertical, 12)
                            .background(LinearGradient.brand).foregroundStyle(.white).clipShape(.rect(cornerRadius: 10))
                    }.disabled(busy || email.isEmpty || password.isEmpty)
                    Text("Demo: admin@check.test / password123")
                        .font(.caption2).foregroundStyle(.secondary)
                }
                .padding(20)
                .background(Color(.secondarySystemGroupedBackground))
                .clipShape(.rect(cornerRadius: 16))
            }
            .padding()
            .frame(maxWidth: 420)
        }
    }

    private func submit() {
        busy = true; error = nil
        Task {
            do { try await auth.login(email: email, password: password) }
            catch APIError.http(401) { self.error = "Invalid email or password" }
            catch let APIError.http(code) { self.error = "Server error (\(code))" }
            catch {
                // Network/TLS failure — most often the cert isn't trusted or the
                // phone can't reach the Mac.
                self.error = "Can't reach the server. Same Wi‑Fi? Trusted the certificate?\n\(error.localizedDescription)"
            }
            busy = false
        }
    }
}
