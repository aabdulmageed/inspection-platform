import SwiftUI
import CoreLocation

let kDisciplines = ["CIVIL", "ELECTRICAL", "PLUMBING", "PEST_OTHER"]
let kPropertyTypes = ["APARTMENT", "HOUSE"]

func propertyTypeLabel(_ t: String) -> String {
    ["APARTMENT": "Apartment", "HOUSE": "House"][t] ?? t
}

private func dayKey(_ date: Date) -> String {
    let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; f.timeZone = TimeZone(identifier: "UTC")
    return f.string(from: date)
}

// MARK: - New inspection (Page 1: customer & property → draft)

/// Two-page flow mirroring the web: enter the customer/property here, then move
/// to the assign-team page. Presented as a sheet; calls `onDone` after assigning.
struct NewInspectionFlow: View {
    let onDone: () -> Void
    @EnvironmentObject var auth: AuthStore
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var phone = ""
    @State private var email = ""
    @State private var address = ""
    @State private var propertyType = "APARTMENT"
    @State private var inspectionType = "pre-purchase"
    @State private var coords: CLLocationCoordinate2D?
    @State private var showMap = false
    @State private var draftId: String?
    @State private var busy = false
    @State private var error: String?

    private var valid: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty &&
        !address.trimmingCharacters(in: .whitespaces).isEmpty &&
        !inspectionType.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Customer") {
                    TextField("Name", text: $name)
                    TextField("Phone", text: $phone).keyboardType(.phonePad)
                    TextField("Email", text: $email)
                        .textInputAutocapitalization(.never).keyboardType(.emailAddress)
                }
                Section("Property") {
                    TextField("Address", text: $address)
                    Button {
                        showMap = true
                    } label: {
                        Label(coords == nil ? "Pick on map" : "Change location", systemImage: "mappin.and.ellipse")
                    }
                    if let coords {
                        Text(String(format: "📍 %.5f, %.5f", coords.latitude, coords.longitude))
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    Picker("Type", selection: $propertyType) {
                        ForEach(kPropertyTypes, id: \.self) { Text(propertyTypeLabel($0)).tag($0) }
                    }
                    TextField("Inspection type", text: $inspectionType)
                }
                if let error { Text(error).foregroundStyle(.red).font(.footnote) }
            }
            .navigationTitle("New Inspection")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(busy ? "…" : "Next") { Task { await createDraft() } }
                        .disabled(!valid || busy)
                }
            }
            .navigationDestination(item: $draftId) { id in
                AssignTeamView(inspectionId: id, customerName: name) {
                    dismiss(); onDone()
                }
            }
            .sheet(isPresented: $showMap) {
                MapPickerView(initial: coords) { coord, addr in
                    coords = coord
                    if let addr, address.trimmingCharacters(in: .whitespaces).isEmpty { address = addr }
                }
            }
        }
    }

    private func createDraft() async {
        busy = true; error = nil
        do {
            draftId = try await auth.createDraft(
                customerName: name, phone: phone, email: email,
                address: address, propertyType: propertyType,
                inspectionType: inspectionType,
                latitude: coords?.latitude, longitude: coords?.longitude)
        } catch {
            self.error = "Couldn't create the draft. \(error.localizedDescription)"
        }
        busy = false
    }
}

// MARK: - Assign team (Page 2: date + inspectors per discipline)

/// Reused for both the new-inspection flow and re-assigning an existing draft.
struct AssignTeamView: View {
    let inspectionId: String
    var customerName: String? = nil
    let onDone: () -> Void

    @EnvironmentObject var auth: AuthStore
    @State private var inspectors: [UserRef] = []
    @State private var date = Date()
    @State private var picked: [String: String] = [:]   // discipline -> inspectorId
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        Form {
            if let customerName {
                Section { Text(customerName).font(.headline) }
            }
            Section("Schedule") {
                DatePicker("Date", selection: $date, displayedComponents: .date)
            }
            Section("Assign inspectors") {
                ForEach(kDisciplines, id: \.self) { d in
                    Picker(disciplineLabel(d), selection: Binding(
                        get: { picked[d] ?? "" },
                        set: { picked[d] = $0 })) {
                        Text("— none —").tag("")
                        ForEach(inspectors.filter { $0.discipline == d }) { i in
                            Text(i.name).tag(i.id)
                        }
                    }
                }
                Text("Pick an inspector for each discipline you need. Leave others as none.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            if let error { Text(error).foregroundStyle(.red).font(.footnote) }
        }
        .navigationTitle("Assign Team")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button(busy ? "Saving…" : "Save") { Task { await save() } }
                    .disabled(busy)
            }
        }
        .task {
            inspectors = ((try? await auth.users()) ?? []).filter { $0.role == "INSPECTOR" }
        }
    }

    private func save() async {
        busy = true; error = nil
        let assignments = picked
            .filter { !$0.value.isEmpty }
            .map { (discipline: $0.key, inspectorId: $0.value) }
        do {
            try await auth.assignTeam(inspectionId, scheduledAt: dayKey(date), assignments: assignments)
            onDone()
        } catch {
            self.error = "Couldn't save the assignment. \(error.localizedDescription)"
        }
        busy = false
    }
}

// MARK: - Users / team management

struct UsersView: View {
    @EnvironmentObject var auth: AuthStore
    @State private var users: [UserRef] = []
    @State private var loading = true
    @State private var showAdd = false

    private var canAdd: Bool { auth.user?.role == "ADMIN" }

    var body: some View {
        List {
            if loading {
                ProgressView()
            } else {
                ForEach(users) { u in
                    VStack(alignment: .leading, spacing: 3) {
                        HStack {
                            Text(u.name).font(.headline)
                            Spacer()
                            StatusPill(text: u.role.capitalized,
                                       tone: u.role == "ADMIN" ? .issue : u.role == "MANAGER" ? .brand : .neutral)
                        }
                        Text(u.email).font(.subheadline).foregroundStyle(.secondary)
                        if let d = u.discipline { Text(disciplineLabel(d)).font(.caption).foregroundStyle(.secondary) }
                    }.padding(.vertical, 2)
                }
            }
        }
        .navigationTitle("Team")
        .toolbar {
            if canAdd {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showAdd = true } label: { Image(systemName: "person.badge.plus") }
                }
            }
        }
        .sheet(isPresented: $showAdd) { AddUserView { Task { await load() } } }
        .task { await load() }
    }

    private func load() async {
        loading = true
        users = (try? await auth.users()) ?? []
        loading = false
    }
}

struct AddUserView: View {
    let onDone: () -> Void
    @EnvironmentObject var auth: AuthStore
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var role = "INSPECTOR"
    @State private var discipline = "CIVIL"
    @State private var busy = false
    @State private var error: String?

    private var valid: Bool {
        !name.isEmpty && email.contains("@") && password.count >= 6
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Account") {
                    TextField("Name", text: $name)
                    TextField("Email", text: $email)
                        .textInputAutocapitalization(.never).keyboardType(.emailAddress)
                    SecureField("Password (min 6)", text: $password)
                }
                Section("Role") {
                    Picker("Role", selection: $role) {
                        Text("Inspector").tag("INSPECTOR")
                        Text("Manager").tag("MANAGER")
                        Text("Admin").tag("ADMIN")
                    }
                    if role == "INSPECTOR" {
                        Picker("Discipline", selection: $discipline) {
                            ForEach(kDisciplines, id: \.self) { Text(disciplineLabel($0)).tag($0) }
                        }
                    }
                }
                if let error { Text(error).foregroundStyle(.red).font(.footnote) }
            }
            .navigationTitle("Add User")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(busy ? "…" : "Create") { Task { await create() } }
                        .disabled(!valid || busy)
                }
            }
        }
    }

    private func create() async {
        busy = true; error = nil
        do {
            try await auth.createUser(name: name, email: email, password: password,
                                      role: role, discipline: role == "INSPECTOR" ? discipline : nil)
            dismiss(); onDone()
        } catch {
            self.error = "Couldn't create the user. \(error.localizedDescription)"
        }
        busy = false
    }
}
