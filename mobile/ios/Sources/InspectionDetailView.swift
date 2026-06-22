import SwiftUI
import PhotosUI

struct InspectionDetailView: View {
    let inspectionId: String
    @EnvironmentObject var auth: AuthStore
    @EnvironmentObject var loc: Loc
    @State private var detail: InspectionDetail?
    @State private var activeRoomId: String?
    @State private var signing = false
    @State private var photoItem: PhotosPickerItem?
    @State private var photoTargetItemId: String?
    @State private var showCamera = false
    @State private var cameraTargetItemId: String?
    @State private var pending: PendingPhoto?   // photo awaiting annotation + upload
    @State private var showAddRoom = false
    @State private var newRoomName = ""
    @State private var showAddCheck = false
    @State private var addCheckRoomId: String?
    @State private var newCheckName = ""
    @State private var newCheckDiscipline = "CIVIL"

    private var role: String { auth.user?.role ?? "" }
    private var isInspector: Bool { role == "INSPECTOR" }
    private var locked: Bool { detail.map { $0.status == "COMPLETED" || $0.status == "REPORTED" } ?? false }
    private var canApprove: Bool {
        guard let d = detail, !locked else { return false }
        return role == "ADMIN" || (role == "MANAGER" && d.status == "IN_REVIEW")
    }
    /// This inspector is on the team (matched by discipline), or the user is staff.
    private var assignedMe: Bool { detail?.assignments.contains { $0.discipline == auth.user?.discipline } ?? false }
    private var canContribute: Bool { !locked && (role == "ADMIN" || role == "MANAGER" || (isInspector && assignedMe)) }

    /// Inspectors see only their discipline's checks.
    private var visibleRooms: [Room] {
        guard let d = detail else { return [] }
        guard isInspector, let disc = auth.user?.discipline else { return d.rooms }
        return d.rooms.compactMap { room in
            let items = room.items.filter { $0.discipline == disc }
            return items.isEmpty ? nil : Room(id: room.id, name: room.name, items: items)
        }
    }
    private var activeRoom: Room? { visibleRooms.first { $0.id == activeRoomId } ?? visibleRooms.first }

    var body: some View {
        Group {
            if let d = detail {
                List {
                    headerSection(d)
                    signaturesSection(d)
                    if let room = activeRoom { roomSection(room) }
                }
            } else {
                ProgressView()
            }
        }
        .navigationTitle(loc.t("Inspection"))
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .sheet(isPresented: $signing) {
            SignatureView(title: loc.t("Sign")) { uri in Task { await sign(uri) } }
        }
        .fullScreenCover(isPresented: $showCamera) {
            CameraPicker { data in
                guard let img = UIImage(data: data), let itemId = cameraTargetItemId else { return }
                // Let the camera cover finish dismissing before presenting the annotator.
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                    pending = PendingPhoto(image: img, itemId: itemId)
                }
            }.ignoresSafeArea()
        }
        .fullScreenCover(item: $pending) { p in
            PhotoAnnotateView(image: p.image) { data in
                Task { try? await auth.uploadPhoto(itemId: p.itemId, jpeg: data); await reloadIfOnline() }
            }
        }
        .onChange(of: photoItem) { _, newVal in
            guard let newVal, let itemId = photoTargetItemId else { return }
            Task {
                if let data = try? await newVal.loadTransferable(type: Data.self),
                   let img = UIImage(data: data) {
                    pending = PendingPhoto(image: img, itemId: itemId)
                }
                photoItem = nil
            }
        }
        .alert(loc.t("Add room"), isPresented: $showAddRoom) {
            TextField(loc.t("Room name"), text: $newRoomName)
            Button(loc.t("Add")) { Task { await addRoom() } }
            Button(loc.t("Cancel"), role: .cancel) { newRoomName = "" }
        }
        .sheet(isPresented: $showAddCheck) {
            NavigationStack {
                Form {
                    TextField(loc.t("Check name"), text: $newCheckName)
                    if !isInspector {
                        Picker(loc.t("Discipline"), selection: $newCheckDiscipline) {
                            ForEach(kDisciplines, id: \.self) { Text(loc.t(disciplineLabel($0))).tag($0) }
                        }
                    }
                }
                .navigationTitle(loc.t("Add check"))
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button(loc.t("Cancel")) { showAddCheck = false; newCheckName = "" }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button(loc.t("Add")) { Task { await addCheck() } }
                            .disabled(newCheckName.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }
            }
        }
    }

    // MARK: Sections

    @ViewBuilder private func headerSection(_ d: InspectionDetail) -> some View {
        Section {
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(d.property.client.name).font(.title3.bold())
                    Spacer()
                    StatusPill(text: loc.t(statusLabel(d.status)))
                }
                Label(d.property.address, systemImage: "mappin.and.ellipse")
                    .font(.subheadline).foregroundStyle(.secondary)
                if locked {
                    Label(loc.t("Approved & locked"), systemImage: "lock.fill")
                        .font(.caption.bold()).foregroundStyle(Color.good)
                }
            }
            // Room picker
            if !visibleRooms.isEmpty {
                Picker(loc.t("Room"), selection: Binding(get: { activeRoom?.id ?? "" }, set: { activeRoomId = $0 })) {
                    ForEach(visibleRooms) { Text($0.name).tag($0.id) }
                }.pickerStyle(.menu)
            }
            if canContribute {
                Button { newRoomName = ""; showAddRoom = true } label: {
                    Label(loc.t("Add room"), systemImage: "plus.circle").font(.subheadline)
                }
            }
        }
    }

    @ViewBuilder private func roomSection(_ room: Room) -> some View {
        Section(room.name) {
            ForEach(room.items) { item in itemRow(item) }
            if canContribute {
                Button {
                    addCheckRoomId = room.id; newCheckName = ""; showAddCheck = true
                } label: {
                    Label(loc.t("Add check"), systemImage: "plus.circle").font(.subheadline)
                }
            }
        }
    }

    @ViewBuilder private func itemRow(_ item: Item) -> some View {
        let editable = !locked && (!isInspector || auth.user?.discipline == item.discipline)
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                VStack(alignment: .leading) {
                    Text(item.component).font(.subheadline.bold())
                    Text(loc.t(disciplineLabel(item.discipline))).font(.caption2).foregroundStyle(.secondary)
                }
                Spacer()
                Menu {
                    ForEach(["", "GOOD", "ISSUE", "NA"], id: \.self) { s in
                        Button(s.isEmpty ? "—" : loc.t(statusLabelItem(s))) { Task { await setStatus(item, s) } }
                    }
                } label: {
                    Text(item.status.map { loc.t(statusLabelItem($0)) } ?? "—")
                        .font(.caption.bold())
                        .foregroundStyle(item.status == "ISSUE" ? Color.issue : item.status == "GOOD" ? Color.good : Color.primary)
                }.disabled(!editable)
            }
            if editable {
                TextField(loc.t("Add a note…"), text: Binding(
                    get: { item.note ?? "" },
                    set: { newVal in updateLocalNote(item.id, newVal) }
                ), onCommit: { Task { await saveNote(item) } })
                .font(.subheadline).textFieldStyle(.roundedBorder)
            } else if let note = item.note, !note.isEmpty {
                Text(note).font(.subheadline).foregroundStyle(.secondary)
            }
            if !item.photos.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(alignment: .top, spacing: 10) { ForEach(item.photos) { p in
                        VStack(alignment: .leading, spacing: 4) {
                            ZStack(alignment: .topTrailing) {
                                AsyncImage(url: URL(string: p.url)) { img in img.resizable().scaledToFill() } placeholder: { Color.gray.opacity(0.2) }
                                    .frame(width: 96, height: 72).clipShape(.rect(cornerRadius: 8))
                                if editable {
                                    Button { Task { await deletePhoto(p.id) } } label: {
                                        Image(systemName: "xmark.circle.fill")
                                            .font(.system(size: 18))
                                            .foregroundStyle(.white, Color.issue)
                                    }
                                    .offset(x: 6, y: -6)
                                }
                            }
                            if editable {
                                TextField(loc.t("Photo note…"), text: Binding(
                                    get: { p.note ?? "" },
                                    set: { newVal in updateLocalPhotoNote(p.id, newVal) }
                                ), onCommit: { Task { await savePhotoNote(p.id) } })
                                .font(.caption).textFieldStyle(.roundedBorder).frame(width: 96)
                            } else if let n = p.note, !n.isEmpty {
                                Text(n).font(.caption).foregroundStyle(.secondary).frame(width: 96, alignment: .leading)
                            }
                        }
                    } }
                    .padding(.top, 6)
                }
            }
            if editable {
                HStack(spacing: 16) {
                    Button {
                        cameraTargetItemId = item.id; showCamera = true
                    } label: {
                        Label(loc.t("Take photo"), systemImage: "camera.fill").font(.caption.bold())
                    }.buttonStyle(.plain).foregroundStyle(Color.brandNavy)
                    PhotosPicker(selection: $photoItem, matching: .images) {
                        Label(loc.t("Choose photo"), systemImage: "photo.on.rectangle").font(.caption.bold())
                    }.simultaneousGesture(TapGesture().onEnded { photoTargetItemId = item.id })
                }
            }
        }.padding(.vertical, 2)
    }

    @ViewBuilder private func signaturesSection(_ d: InspectionDetail) -> some View {
        Section(loc.t("Signatures")) {
            ForEach(d.assignments) { a in
                let sig = d.signatures.first { $0.discipline == a.discipline }
                HStack {
                    VStack(alignment: .leading) {
                        Text(loc.t(disciplineLabel(a.discipline))).font(.subheadline.bold())
                        Text(a.inspector.name).font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    if sig != nil {
                        Image(systemName: "checkmark.seal.fill").foregroundStyle(Color.good)
                    } else if isInspector && auth.user?.discipline == a.discipline && !locked {
                        Button(loc.t("Sign")) { signing = true }.buttonStyle(.borderedProminent).tint(.brandNavy)
                    } else {
                        StatusPill(text: loc.t(statusLabel(a.status)), tone: .neutral)
                    }
                }
            }
            // Manager / admin approval
            HStack {
                Text(loc.t("Manager approval")).font(.subheadline.bold())
                Spacer()
                if d.signatures.contains(where: { $0.isManager }) {
                    Image(systemName: "checkmark.seal.fill").foregroundStyle(Color.good)
                } else if canApprove {
                    Button(loc.t("Approve & sign")) { signing = true }.buttonStyle(.borderedProminent).tint(.brandNavy)
                } else {
                    StatusPill(text: loc.t(statusLabel(d.status)), tone: .neutral)
                }
            }
        }
    }

    // MARK: Actions

    private func statusLabelItem(_ s: String) -> String {
        ["GOOD": "Good", "ISSUE": "Issue", "NA": "N/A"][s] ?? s
    }

    private func load() async { detail = try? await auth.inspection(inspectionId) }
    /// Avoid clobbering optimistic edits with a stale cached copy while offline.
    private func reloadIfOnline() async { if auth.online { await load() } }

    private func addRoom() async {
        let name = newRoomName.trimmingCharacters(in: .whitespaces)
        newRoomName = ""
        guard !name.isEmpty else { return }
        try? await auth.addRoom(inspectionId: inspectionId, name: name)
        await load()
    }
    private func addCheck() async {
        guard let roomId = addCheckRoomId else { return }
        let comp = newCheckName.trimmingCharacters(in: .whitespaces)
        guard !comp.isEmpty else { return }
        showAddCheck = false; newCheckName = ""; addCheckRoomId = nil
        try? await auth.addCheck(roomId: roomId, component: comp,
                                 discipline: isInspector ? nil : newCheckDiscipline)
        await load()
    }

    private func setStatus(_ item: Item, _ status: String) async {
        updateLocalStatus(item.id, status)              // optimistic
        try? await auth.updateItem(item.id, status: status, note: nil)
        await reloadIfOnline()
    }
    private func updateLocalStatus(_ itemId: String, _ status: String) {
        guard var d = detail else { return }
        d.rooms = d.rooms.map { room in
            var r = room; r.items = r.items.map { var it = $0; if it.id == itemId { it.status = status.isEmpty ? nil : status }; return it }; return r
        }
        detail = d
    }
    private func updateLocalNote(_ itemId: String, _ note: String) {
        guard var d = detail else { return }
        d.rooms = d.rooms.map { room in
            var r = room; r.items = r.items.map { var it = $0; if it.id == itemId { it.note = note }; return it }; return r
        }
        detail = d
    }
    private func saveNote(_ item: Item) async {
        let current = detail?.rooms.flatMap(\.items).first { $0.id == item.id }?.note
        try? await auth.updateItem(item.id, status: nil, note: current ?? "")
    }
    private func updateLocalPhotoNote(_ photoId: String, _ note: String) {
        guard var d = detail else { return }
        d.rooms = d.rooms.map { room in
            var r = room
            r.items = r.items.map { var it = $0; it.photos = it.photos.map { var p = $0; if p.id == photoId { p.note = note }; return p }; return it }
            return r
        }
        detail = d
    }
    private func savePhotoNote(_ photoId: String) async {
        let current = detail?.rooms.flatMap(\.items).flatMap(\.photos).first { $0.id == photoId }?.note
        try? await auth.updatePhotoNote(photoId, note: current ?? "")
    }
    private func sign(_ uri: String) async {
        try? await auth.sign(inspectionId, imageDataURI: uri)
        await reloadIfOnline()
    }
    private func deletePhoto(_ photoId: String) async {
        removeLocalPhoto(photoId)               // optimistic
        try? await auth.deletePhoto(photoId)
        await reloadIfOnline()
    }
    private func removeLocalPhoto(_ photoId: String) {
        guard var d = detail else { return }
        d.rooms = d.rooms.map { room in
            var r = room
            r.items = r.items.map { var it = $0; it.photos = it.photos.filter { $0.id != photoId }; return it }
            return r
        }
        detail = d
    }
}
