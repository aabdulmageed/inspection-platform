package test.check.inspections.ui

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.FileProvider
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.ByteArrayOutputStream
import java.io.File

/** Temp file + content Uri the camera app can write the full-resolution photo to. */
fun createCameraUri(context: Context): Uri {
    val file = File.createTempFile("capture_", ".jpg", context.cacheDir)
    return FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
}

/** Decode and downscale to a max edge so drawing stays smooth and uploads stay small.
 *  Full-res camera photos (12 MP+) make the annotate canvas lag badly. */
fun decodeBitmap(context: Context, uri: Uri): Bitmap? {
    val raw = context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it) } ?: return null
    val maxEdge = 1600
    val longest = maxOf(raw.width, raw.height)
    if (longest <= maxEdge) return raw
    val scale = maxEdge.toFloat() / longest
    val scaled = Bitmap.createScaledBitmap(raw, (raw.width * scale).toInt(), (raw.height * scale).toInt(), true)
    if (scaled != raw) raw.recycle()
    return scaled
}

fun bitmapToPart(bmp: Bitmap): MultipartBody.Part {
    val out = ByteArrayOutputStream()
    bmp.compress(Bitmap.CompressFormat.JPEG, 85, out)
    val body = out.toByteArray().toRequestBody("image/jpeg".toMediaType())
    return MultipartBody.Part.createFormData("file", "photo.jpg", body)
}

/**
 * Full-screen editor: show the photo and let the inspector draw red strokes to
 * mark the issue, then flatten the drawing onto the bitmap and return it.
 */
@Composable
fun AnnotateOverlay(bitmap: Bitmap, onCancel: () -> Unit, onSave: (Bitmap) -> Unit) {
    // Inner lists are SnapshotStateList so adding points during a drag triggers
    // the Canvas to redraw live (a plain MutableList isn't observed by Compose).
    val strokes = remember { mutableStateListOf<androidx.compose.runtime.snapshots.SnapshotStateList<Offset>>() }
    var canvasSize by remember { mutableStateOf(IntSize.Zero) }
    val ratio = bitmap.width.toFloat() / bitmap.height.toFloat()

    // Full-screen overlay (not a Dialog — dialogs aren't reliably full-screen on
    // Android, which cut off the buttons). systemBarsPadding keeps the bottom row
    // above the nav bar.
    Box(Modifier.fillMaxSize().background(Color.Black).systemBarsPadding()) {
        Column(Modifier.fillMaxSize()) {
                BoxWithConstraints(
                    Modifier.fillMaxWidth().weight(1f).padding(8.dp),
                    contentAlignment = Alignment.Center
                ) {
                    val density = LocalDensity.current
                    val maxWpx = with(density) { maxWidth.toPx() }
                    val maxHpx = with(density) { maxHeight.toPx() }
                    // Fit the bitmap inside the available area, preserving its ratio.
                    val dispW = if (maxWpx / maxHpx > ratio) maxHpx * ratio else maxWpx
                    val dispH = if (maxWpx / maxHpx > ratio) maxHpx else maxWpx / ratio
                    // The image box is sized to the EXACT displayed rect, so the
                    // drawing canvas overlays the photo 1:1 (no letterbox drift).
                    Box(Modifier.size(with(density) { dispW.toDp() }, with(density) { dispH.toDp() })) {
                        androidx.compose.foundation.Image(
                            bitmap = bitmap.asImageBitmap(), contentDescription = null,
                            contentScale = ContentScale.FillBounds, modifier = Modifier.fillMaxSize()
                        )
                        Canvas(
                            Modifier.fillMaxSize()
                                .onSizeChanged { canvasSize = it }
                                .pointerInput(Unit) {
                                    detectDragGestures(
                                        onDragStart = { strokes.add(mutableStateListOf(it)) },
                                        onDrag = { change, _ -> strokes.lastOrNull()?.add(change.position); change.consume() }
                                    )
                                }
                        ) {
                            strokes.forEach { s ->
                                for (i in 1 until s.size) drawLine(Color.Red, s[i - 1], s[i], strokeWidth = 10f)
                            }
                        }
                    }
                }
                Row(Modifier.fillMaxWidth().background(Color(0xFF1A1A1A)).padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically) {
                    TextButton(onClick = { strokes.clear() }) { Text(tr("Clear"), color = Color.White) }
                    Spacer(Modifier.weight(1f))
                    TextButton(onClick = onCancel) { Text(tr("Cancel"), color = Color.White) }
                    Button(onClick = { onSave(flatten(bitmap, strokes, canvasSize)) }) { Text(tr("Use photo")) }
                }
            }
        }
}

/** Bake the on-screen strokes (canvas coords) onto a copy of the original bitmap. */
private fun flatten(src: Bitmap, strokes: List<List<Offset>>, canvas: IntSize): Bitmap {
    val out = src.copy(Bitmap.Config.ARGB_8888, true)
    if (canvas.width == 0 || canvas.height == 0) return out
    // Independent X/Y scales: maps canvas coords → bitmap coords correctly even
    // if the canvas isn't a perfect ratio match.
    val sx = out.width.toFloat() / canvas.width.toFloat()
    val sy = out.height.toFloat() / canvas.height.toFloat()
    val c = android.graphics.Canvas(out)
    val paint = android.graphics.Paint().apply {
        color = android.graphics.Color.RED
        strokeWidth = 10f * sx
        isAntiAlias = true
        style = android.graphics.Paint.Style.STROKE
        strokeCap = android.graphics.Paint.Cap.ROUND
        strokeJoin = android.graphics.Paint.Join.ROUND
    }
    strokes.forEach { s ->
        for (i in 1 until s.size) {
            c.drawLine(s[i - 1].x * sx, s[i - 1].y * sy, s[i].x * sx, s[i].y * sy, paint)
        }
    }
    return out
}
