package test.check.inspections.ui

import android.graphics.Bitmap
import android.graphics.Paint
import android.util.Base64
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import java.io.ByteArrayOutputStream

@Composable
fun SignatureDialog(onDismiss: () -> Unit, onSave: (String) -> Unit) {
    val strokes = remember { mutableStateListOf<MutableList<Offset>>() }
    var size by remember { mutableStateOf(IntSize.Zero) }

    Dialog(onDismissRequest = onDismiss) {
        Surface(shape = MaterialTheme.shapes.large) {
            Column(Modifier.padding(16.dp)) {
                Text("Sign", style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(12.dp))
                Canvas(
                    Modifier.fillMaxWidth().height(220.dp).background(Color.White)
                        .onSizeChanged { size = it }
                        .pointerInput(Unit) {
                            detectDragGestures(
                                onDragStart = { off -> strokes.add(mutableListOf(off)) },
                                onDrag = { change, _ -> strokes.lastOrNull()?.add(change.position); change.consume() }
                            )
                        }
                ) {
                    strokes.forEach { s ->
                        for (i in 1 until s.size) {
                            drawLine(Color.Black, s[i - 1], s[i], strokeWidth = 5f)
                        }
                    }
                }
                Spacer(Modifier.height(12.dp))
                Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                    TextButton(onClick = { strokes.clear() }) { Text("Clear") }
                    Spacer(Modifier.weight(1f))
                    TextButton(onClick = onDismiss) { Text("Cancel") }
                    Button(onClick = { onSave(rasterize(strokes, size)) },
                        enabled = strokes.isNotEmpty()) { Text("Save") }
                }
            }
        }
    }
}

private fun rasterize(strokes: List<List<Offset>>, size: IntSize): String {
    val w = if (size.width > 0) size.width else 600
    val h = if (size.height > 0) size.height else 220
    val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    val canvas = android.graphics.Canvas(bmp)
    canvas.drawColor(android.graphics.Color.WHITE)
    val paint = Paint().apply {
        color = android.graphics.Color.BLACK; strokeWidth = 5f; isAntiAlias = true
        style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND
    }
    strokes.forEach { s ->
        for (i in 1 until s.size) canvas.drawLine(s[i - 1].x, s[i - 1].y, s[i].x, s[i].y, paint)
    }
    val out = ByteArrayOutputStream()
    bmp.compress(Bitmap.CompressFormat.PNG, 100, out)
    return "data:image/png;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
}
