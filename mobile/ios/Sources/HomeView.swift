import SwiftUI

struct HomeView: View {
    @EnvironmentObject var auth: AuthStore
    @EnvironmentObject var loc: Loc
    @State private var path: [String] = []
    @State private var showNew = false
    @State private var showUsers = false
    @State private var reloadToken = 0

    private var isStaff: Bool { auth.user?.role == "ADMIN" || auth.user?.role == "MANAGER" }

    var body: some View {
        NavigationStack(path: $path) {
            Group {
                if auth.user?.role == "INSPECTOR" { MyDayView() }
                else { ReportsView().id(reloadToken) }
            }
            .safeAreaInset(edge: .top) { SyncBanner() }
            .task {
                if path.isEmpty, let id = ProcessInfo.processInfo.environment["AUTO_OPEN_INSPECTION"] {
                    path = [id]
                }
            }
            .toolbar {
                if isStaff {
                    ToolbarItem(placement: .topBarLeading) {
                        Button { showUsers = true } label: { Image(systemName: "person.2") }
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { showNew = true } label: { Image(systemName: "plus") }
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Text(auth.user?.name ?? "")
                        LanguageToggle()
                        Button(loc.t("Log out"), role: .destructive) { auth.logout() }
                    } label: { Image(systemName: "person.crop.circle") }
                }
            }
            .sheet(isPresented: $showNew) {
                NewInspectionFlow { reloadToken += 1 }
            }
            .sheet(isPresented: $showUsers) {
                NavigationStack {
                    UsersView()
                        .toolbar {
                            ToolbarItem(placement: .topBarLeading) {
                                Button(loc.t("Done")) { showUsers = false }
                            }
                        }
                }
            }
        }
    }
}

/// Thin status strip: shows when offline and/or when writes are waiting to sync.
struct SyncBanner: View {
    @EnvironmentObject var auth: AuthStore
    @EnvironmentObject var loc: Loc
    var body: some View {
        if !auth.online || auth.pendingCount > 0 {
            HStack(spacing: 8) {
                Image(systemName: auth.online ? "arrow.triangle.2.circlepath" : "wifi.slash")
                Text(bannerText).font(.caption.bold())
                Spacer()
                if auth.online && auth.pendingCount > 0 {
                    Button(loc.t("Sync now")) { Task { await auth.flushOutbox() } }.font(.caption.bold())
                }
            }
            .padding(.horizontal, 14).padding(.vertical, 6)
            .foregroundStyle(.white)
            .background(auth.online ? Color.brandNavy : Color.issue)
        }
    }
    private var bannerText: String {
        if !auth.online {
            return auth.pendingCount > 0
                ? "\(loc.t("Offline")) · \(auth.pendingCount) \(loc.t("pending"))"
                : loc.t("Offline · showing saved data")
        }
        return "\(loc.t("Syncing…")) (\(auth.pendingCount))"
    }
}

// MARK: - Inspector: My Day (agenda by date)

struct MyDayView: View {
    @EnvironmentObject var auth: AuthStore
    @EnvironmentObject var loc: Loc
    @State private var date = Date()
    @State private var jobs: [InspectionSummary] = []
    @State private var loading = true

    private var dateKey: String {
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; f.timeZone = TimeZone(identifier: "UTC")
        return f.string(from: date)
    }

    var body: some View {
        List {
            Section {
                DatePicker(loc.t("Date"), selection: $date, displayedComponents: .date)
                    .onChange(of: date) { _, _ in Task { await load() } }
            }
            if loading {
                ProgressView()
            } else if jobs.isEmpty {
                Text(loc.t("No jobs scheduled for this day.")).foregroundStyle(.secondary)
            } else {
                ForEach(jobs) { job in
                    NavigationLink(value: job.id) { JobRow(job: job) }
                }
            }
        }
        .navigationTitle(loc.t("My Day"))
        .navigationDestination(for: String.self) { InspectionDetailView(inspectionId: $0) }
        .task { await load() }
    }

    private func load() async {
        loading = true
        jobs = (try? await auth.agenda(date: dateKey)) ?? []
        loading = false
    }
}

// MARK: - Staff: Reports (all inspections)

struct ReportsView: View {
    @EnvironmentObject var auth: AuthStore
    @EnvironmentObject var loc: Loc
    @State private var items: [InspectionSummary] = []
    @State private var loading = true

    var body: some View {
        List {
            if loading { ProgressView() }
            else if items.isEmpty { Text(loc.t("No inspections yet.")).foregroundStyle(.secondary) }
            else { ForEach(items) { job in NavigationLink(value: job.id) { JobRow(job: job) } } }
        }
        .navigationTitle(loc.t("Inspections"))
        .navigationDestination(for: String.self) { InspectionDetailView(inspectionId: $0) }
        .task {
            items = (try? await auth.inspections()) ?? []
            loading = false
        }
    }
}

struct JobRow: View {
    let job: InspectionSummary
    @EnvironmentObject var loc: Loc
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(job.property.client.name).font(.headline)
                Spacer()
                StatusPill(text: loc.t(statusLabel(job.myStatus ?? job.status)),
                           tone: (job.myStatus ?? job.status) == "SIGNED" ? .good : .brand)
            }
            Label(job.property.address, systemImage: "mappin.and.ellipse")
                .font(.subheadline).foregroundStyle(.secondary)
            if !job.assignments.isEmpty {
                Text(job.assignments.map { loc.t(disciplineLabel($0.discipline)) }.joined(separator: " · "))
                    .font(.caption).foregroundStyle(.secondary)
            }
        }.padding(.vertical, 2)
    }
}

enum PillTone { case brand, good, issue, neutral }
struct StatusPill: View {
    let text: String; var tone: PillTone = .brand
    var body: some View {
        Text(text).font(.caption2.bold()).foregroundStyle(.white)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(background).clipShape(.capsule)
    }
    @ViewBuilder private var background: some View {
        switch tone {
        case .brand: LinearGradient.brand
        case .good: Color.good
        case .issue: Color.issue
        case .neutral: Color.gray
        }
    }
}
