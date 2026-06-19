import SwiftUI
import UIKit
import MapKit
import CoreLocation
import PencilKit

// MARK: - Photo annotation (draw on the photo to mark the issue)

/// Holds a captured/selected photo plus the check it belongs to, so it can be
/// carried into the annotation sheet.
struct PendingPhoto: Identifiable {
    let id = UUID()
    let image: UIImage
    let itemId: String
}

/// Show the photo with a transparent PencilKit canvas on top; flatten the
/// drawing onto the image and return JPEG. Drawing is optional — Save uploads
/// the photo as-is if nothing was drawn.
struct PhotoAnnotateView: View {
    let image: UIImage
    let onSave: (Data) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var canvas = PKCanvasView()
    @State private var displaySize: CGSize = .zero

    var body: some View {
        NavigationStack {
            GeometryReader { geo in
                let size = fitted(image.size, in: geo.size)
                ZStack {
                    Image(uiImage: image).resizable()
                        .frame(width: size.width, height: size.height)
                    AnnotateCanvas(canvas: canvas)
                        .frame(width: size.width, height: size.height)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .onAppear { displaySize = size }
            }
            .background(Color.black)
            .navigationTitle("Mark the issue")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Clear") { canvas.drawing = PKDrawing() }
                }
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Use photo") { save() }.bold()
                }
            }
        }
    }

    private func save() {
        let bounds = canvas.bounds.isEmpty ? CGRect(origin: .zero, size: displaySize) : canvas.bounds
        let renderer = UIGraphicsImageRenderer(size: bounds.size)
        let flattened = renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: bounds.size))
            canvas.drawing.image(from: bounds, scale: UIScreen.main.scale).draw(in: bounds)
        }
        if let data = flattened.jpegData(compressionQuality: 0.85) { onSave(data) }
        dismiss()
    }

    private func fitted(_ image: CGSize, in container: CGSize) -> CGSize {
        guard image.width > 0, image.height > 0, container.width > 0, container.height > 0 else { return container }
        let scale = min(container.width / image.width, container.height / image.height)
        return CGSize(width: image.width * scale, height: image.height * scale)
    }
}

private struct AnnotateCanvas: UIViewRepresentable {
    let canvas: PKCanvasView
    func makeUIView(context: Context) -> PKCanvasView {
        canvas.drawingPolicy = .anyInput
        canvas.tool = PKInkingTool(.pen, color: .systemRed, width: 8)
        canvas.backgroundColor = .clear
        canvas.isOpaque = false
        return canvas
    }
    func updateUIView(_ uiView: PKCanvasView, context: Context) {}
}

// MARK: - Camera capture (UIImagePickerController)

/// Live camera capture. The PhotosPicker handles the library; this handles the
/// camera, which UIKit still owns. Returns JPEG data via `onImage`.
struct CameraPicker: UIViewControllerRepresentable {
    var onImage: (Data) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let p = UIImagePickerController()
        p.sourceType = UIImagePickerController.isSourceTypeAvailable(.camera) ? .camera : .photoLibrary
        p.delegate = context.coordinator
        return p
    }
    func updateUIViewController(_ vc: UIImagePickerController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: CameraPicker
        init(_ parent: CameraPicker) { self.parent = parent }

        func imagePickerController(_ picker: UIImagePickerController,
                                   didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let img = info[.originalImage] as? UIImage,
               let data = img.jpegData(compressionQuality: 0.8) {
                parent.onImage(data)
            }
            parent.dismiss()
        }
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { parent.dismiss() }
    }
}

// MARK: - Map address picker (Baghdad default)

struct MapPickerView: View {
    var initial: CLLocationCoordinate2D?
    var onPick: (_ coordinate: CLLocationCoordinate2D, _ address: String?) -> Void
    @Environment(\.dismiss) private var dismiss

    /// Default view centers on Baghdad.
    static let baghdad = CLLocationCoordinate2D(latitude: 33.3152, longitude: 44.3661)

    @State private var camera: MapCameraPosition
    @State private var pin: CLLocationCoordinate2D
    @State private var address: String?
    @State private var resolving = false

    init(initial: CLLocationCoordinate2D? = nil,
         onPick: @escaping (CLLocationCoordinate2D, String?) -> Void) {
        self.initial = initial
        self.onPick = onPick
        let start = initial ?? Self.baghdad
        _camera = State(initialValue: .region(MKCoordinateRegion(
            center: start,
            span: MKCoordinateSpan(latitudeDelta: 0.06, longitudeDelta: 0.06))))
        _pin = State(initialValue: start)
    }

    var body: some View {
        NavigationStack {
            MapReader { proxy in
                Map(position: $camera) {
                    Marker("Selected", coordinate: pin).tint(.red)
                }
                .onTapGesture { point in
                    if let coord = proxy.convert(point, from: .local) {
                        pin = coord
                        Task { await reverse(coord) }
                    }
                }
            }
            .ignoresSafeArea(edges: .bottom)
            .safeAreaInset(edge: .bottom) {
                VStack(spacing: 8) {
                    if resolving {
                        ProgressView()
                    } else if let address {
                        Text(address).font(.footnote).multilineTextAlignment(.center)
                    } else {
                        Text("Tap the map to drop a pin").font(.footnote).foregroundStyle(.secondary)
                    }
                    Text(String(format: "%.5f, %.5f", pin.latitude, pin.longitude))
                        .font(.caption).foregroundStyle(.secondary)
                    Button {
                        onPick(pin, address); dismiss()
                    } label: {
                        Text("Use this location").bold().frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent).tint(.brandNavy)
                }
                .padding().frame(maxWidth: .infinity).background(.ultraThinMaterial)
            }
            .navigationTitle("Pick location")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
            .task { await reverse(pin) }
        }
    }

    private func reverse(_ c: CLLocationCoordinate2D) async {
        resolving = true
        let placemarks = try? await CLGeocoder()
            .reverseGeocodeLocation(CLLocation(latitude: c.latitude, longitude: c.longitude))
        if let p = placemarks?.first {
            address = [p.name, p.locality, p.administrativeArea, p.country]
                .compactMap { $0 }.joined(separator: ", ")
        }
        resolving = false
    }
}
