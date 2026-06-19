import SwiftUI
import PencilKit

/// Draw a signature; returns a PNG data URI to upload.
struct SignatureView: View {
    let title: String
    let onSave: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var canvas = PKCanvasView()

    var body: some View {
        NavigationStack {
            VStack {
                SignatureCanvas(canvas: canvas)
                    .frame(height: 240)
                    .background(.white)
                    .clipShape(.rect(cornerRadius: 12))
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(.gray.opacity(0.3)))
                    .padding()
                Spacer()
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Clear") { canvas.drawing = PKDrawing() } }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Save") {
                        let rect = canvas.bounds.isEmpty ? CGRect(x: 0, y: 0, width: 600, height: 240) : canvas.bounds
                        let img = canvas.drawing.image(from: rect, scale: 2)
                        if let data = img.pngData() {
                            onSave("data:image/png;base64," + data.base64EncodedString())
                        }
                        dismiss()
                    }.bold()
                }
            }
        }
    }
}

private struct SignatureCanvas: UIViewRepresentable {
    let canvas: PKCanvasView
    func makeUIView(context: Context) -> PKCanvasView {
        canvas.drawingPolicy = .anyInput
        canvas.tool = PKInkingTool(.pen, color: .black, width: 3)
        canvas.backgroundColor = .white
        return canvas
    }
    func updateUIView(_ uiView: PKCanvasView, context: Context) {}
}
