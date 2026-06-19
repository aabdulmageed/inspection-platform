package test.check.inspections.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import android.graphics.Bitmap
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.ui.platform.LocalContext
import coil.compose.AsyncImage
import kotlinx.coroutines.launch
import test.check.inspections.data.*

val Navy = Color(0xFF134486)
val Green = Color(0xFF39B045)
val IssueRed = Color(0xFFC0392B)

fun brandColors() = lightColorScheme(primary = Navy, secondary = Green)

internal val DISCIPLINES = listOf("CIVIL", "ELECTRICAL", "PLUMBING", "PEST_OTHER")
internal val PROPERTY_TYPES = listOf("APARTMENT", "HOUSE")
internal fun propertyTypeLabel(t: String) = when (t) { "APARTMENT" -> "Apartment"; "HOUSE" -> "House"; else -> t }

internal fun disciplineLabel(d: String) = when (d) {
    "CIVIL" -> "Civil"; "ELECTRICAL" -> "Electrical"; "PLUMBING" -> "Plumbing"; "PEST_OTHER" -> "Pest / Other"; else -> d
}
internal fun statusLabel(s: String) = when (s) {
    "DRAFT" -> "Draft"; "IN_PROGRESS" -> "In progress"; "IN_REVIEW" -> "In review"
    "COMPLETED" -> "Completed"; "REPORTED" -> "Reported"; "PENDING" -> "Pending"; "SIGNED" -> "Signed"; else -> s
}

// MARK: Login
@Composable
fun LoginScreen(backend: Backend) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    Column(
        Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Icon(Icons.Default.Home, null, tint = Navy, modifier = Modifier.size(48.dp))
        Text("CHECK House Inspections", color = Color.Gray, modifier = Modifier.padding(bottom = 24.dp))
        Text("Sign in", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold,
            modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(email, { email = it }, label = { Text("Email") },
            keyboardOptions = KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Email),
            singleLine = true, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(password, { password = it }, label = { Text("Password") },
            visualTransformation = PasswordVisualTransformation(), singleLine = true, modifier = Modifier.fillMaxWidth())
        error?.let { Text(it, color = IssueRed, style = MaterialTheme.typography.bodySmall) }
        Spacer(Modifier.height(12.dp))
        Button(
            onClick = {
                busy = true; error = null
                scope.launch {
                    try { backend.login(email.trim(), password) }
                    catch (e: Exception) { error = "Invalid email or password" }
                    busy = false
                }
            },
            enabled = !busy && email.isNotBlank() && password.isNotBlank(),
            modifier = Modifier.fillMaxWidth()
        ) { Text(if (busy) "Signing in…" else "Sign in") }
        Text("Demo: admin@check.test / password123", style = MaterialTheme.typography.bodySmall,
            color = Color.Gray, modifier = Modifier.padding(top = 8.dp))
    }
}

// MARK: Home (My Day for inspectors, Reports for staff)
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    backend: Backend,
    onNew: () -> Unit = {},
    onUsers: () -> Unit = {},
    onOpen: (String) -> Unit,
) {
    val user by backend.user.collectAsState()
    val isInspector = user?.role == "INSPECTOR"
    val isStaff = user?.role == "ADMIN" || user?.role == "MANAGER"
    var items by remember { mutableStateOf<List<InspectionSummary>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        loading = true
        items = try {
            if (isInspector) {
                val today = java.time.LocalDate.now().toString()
                backend.api.agenda(today)
            } else backend.api.inspections()
        } catch (e: Exception) { emptyList() }
        loading = false
    }

    Scaffold(topBar = {
        TopAppBar(
            title = { Text(if (isInspector) "My Day" else "Inspections") },
            navigationIcon = {
                if (isStaff) IconButton(onClick = onUsers) { Icon(Icons.Default.Group, "Team") }
            },
            actions = {
                if (isStaff) IconButton(onClick = onNew) { Icon(Icons.Default.Add, "New inspection") }
                TextButton(onClick = { scope.launch { backend.logout() } }) { Text("Log out") }
            }
        )
    }) { pad ->
        Column(Modifier.padding(pad).fillMaxSize()) {
            SyncBanner(backend)
            if (loading) {
                Box(Modifier.fillMaxSize(), Alignment.Center) { CircularProgressIndicator() }
            } else {
                LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(12.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    if (items.isEmpty()) item { Text("Nothing to show.", color = Color.Gray) }
                    items(items) { job -> JobCard(job) { onOpen(job.id) } }
                }
            }
        }
    }
}

@Composable
private fun JobCard(job: InspectionSummary, onClick: () -> Unit) {
    Card(onClick = onClick, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(job.property.client.name, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                Pill(statusLabel(job.myStatus ?: job.status), if ((job.myStatus ?: job.status) == "SIGNED") Green else Navy)
            }
            Text(job.property.address, color = Color.Gray, style = MaterialTheme.typography.bodyMedium)
            if (job.assignments.isNotEmpty())
                Text(job.assignments.joinToString(" · ") { disciplineLabel(it.discipline) },
                    color = Color.Gray, style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun Pill(text: String, color: Color) {
    Surface(color = color, shape = MaterialTheme.shapes.small) {
        Text(text, color = Color.White, style = MaterialTheme.typography.labelSmall,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp))
    }
}

/** Offline / pending-sync strip. Hidden when online with an empty outbox. */
@Composable
fun SyncBanner(backend: Backend) {
    val online by backend.online.collectAsState()
    val pending by backend.pendingCount.collectAsState()
    val scope = rememberCoroutineScope()
    if (online && pending == 0) return
    val text = when {
        !online && pending > 0 -> "Offline · $pending change${if (pending == 1) "" else "s"} will sync"
        !online -> "Offline · showing saved data"
        else -> "Syncing $pending pending change${if (pending == 1) "" else "s"}…"
    }
    Surface(color = if (online) Navy else IssueRed, modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.padding(horizontal = 14.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(text, color = Color.White, style = MaterialTheme.typography.labelMedium, modifier = Modifier.weight(1f))
            if (online && pending > 0) {
                TextButton(onClick = { scope.launch { backend.flushOutbox() } }) {
                    Text("Sync now", color = Color.White, style = MaterialTheme.typography.labelMedium)
                }
            }
        }
    }
}

// MARK: Detail
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DetailScreen(backend: Backend, id: String, onBack: () -> Unit) {
    val user by backend.user.collectAsState()
    var detail by remember { mutableStateOf<InspectionDetail?>(null) }
    var activeRoom by remember { mutableStateOf<String?>(null) }
    var signing by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    // Photo capture → annotate → upload
    var pendingBitmap by remember { mutableStateOf<Bitmap?>(null) }
    var photoItemId by remember { mutableStateOf<String?>(null) }
    var cameraUri by remember { mutableStateOf<Uri?>(null) }

    suspend fun reload() { detail = try { backend.api.inspection(id) } catch (e: Exception) { detail } }
    // Optimistic local status edit so offline changes don't blink back.
    fun patchStatus(itemId: String, s: String) {
        val cur = detail ?: return
        detail = cur.copy(rooms = cur.rooms.map { r ->
            r.copy(items = r.items.map { if (it.id == itemId) it.copy(status = s) else it })
        })
    }
    fun removePhotoLocal(photoId: String) {
        val cur = detail ?: return
        detail = cur.copy(rooms = cur.rooms.map { r ->
            r.copy(items = r.items.map { it.copy(photos = it.photos.filter { p -> p.id != photoId }) })
        })
    }

    val cameraLauncher = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        if (ok) cameraUri?.let { pendingBitmap = decodeBitmap(context, it) }
    }
    val galleryLauncher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        uri?.let { pendingBitmap = decodeBitmap(context, it) }
    }

    LaunchedEffect(id) { reload() }

    val d = detail
    Scaffold(topBar = {
        TopAppBar(title = { Text("Inspection") },
            navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, null) } })
    }) { pad ->
        if (d == null) { Box(Modifier.fillMaxSize().padding(pad), Alignment.Center) { CircularProgressIndicator() }; return@Scaffold }

        val locked = d.status == "COMPLETED" || d.status == "REPORTED"
        val isInspector = user?.role == "INSPECTOR"
        val canApprove = !locked && (user?.role == "ADMIN" || (user?.role == "MANAGER" && d.status == "IN_REVIEW"))
        val rooms = if (isInspector) d.rooms.map { r -> r.copy(items = r.items.filter { it.discipline == user?.discipline }) }
            .filter { it.items.isNotEmpty() } else d.rooms
        val room = rooms.firstOrNull { it.id == activeRoom } ?: rooms.firstOrNull()

        Column(Modifier.padding(pad).fillMaxSize().verticalScroll(rememberScrollState()).padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)) {

            Card { Column(Modifier.padding(14.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(d.property.client.name, style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                    Pill(statusLabel(d.status), Navy)
                }
                Text(d.property.address, color = Color.Gray)
                if (locked) Text("🔒 Approved & locked", color = Green, fontWeight = FontWeight.Bold)
            } }

            // Room chips
            if (rooms.isNotEmpty()) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.horizontalScroll(rememberScrollState())) {
                    rooms.forEach { r ->
                        FilterChip(selected = room?.id == r.id, onClick = { activeRoom = r.id }, label = { Text(r.name) })
                    }
                }
            }

            // Active room items
            room?.let { rm ->
                Text(rm.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                rm.items.forEach { item ->
                    val editable = !locked && (!isInspector || user?.discipline == item.discipline)
                    Card { Column(Modifier.padding(12.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(item.component, fontWeight = FontWeight.SemiBold)
                                Text(disciplineLabel(item.discipline), color = Color.Gray, style = MaterialTheme.typography.labelSmall)
                            }
                            StatusMenu(item.status, editable) { s ->
                                patchStatus(item.id, s)
                                scope.launch {
                                    try { backend.api.updateItem(item.id, UpdateItemBody(status = s)) } catch (_: Exception) {}
                                    if (backend.online.value) reload()
                                }
                            }
                        }
                        if (item.photos.isNotEmpty()) {
                            Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                item.photos.take(4).forEach { p ->
                                    Box {
                                        AsyncImage(model = p.url, contentDescription = null, modifier = Modifier.size(64.dp))
                                        if (editable) {
                                            Surface(
                                                color = IssueRed, shape = androidx.compose.foundation.shape.CircleShape,
                                                modifier = Modifier.align(Alignment.TopEnd).size(20.dp)
                                                    .clickable {
                                                        removePhotoLocal(p.id)
                                                        scope.launch {
                                                            try { backend.api.deletePhoto(p.id) } catch (_: Exception) {}
                                                            if (backend.online.value) reload()
                                                        }
                                                    }
                                            ) {
                                                Icon(Icons.Default.Close, "Remove photo", tint = Color.White,
                                                    modifier = Modifier.padding(2.dp))
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        if (editable) {
                            Row(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                TextButton(onClick = {
                                    photoItemId = item.id
                                    val uri = createCameraUri(context); cameraUri = uri; cameraLauncher.launch(uri)
                                }) { Icon(Icons.Default.PhotoCamera, null); Spacer(Modifier.width(4.dp)); Text("Take photo") }
                                TextButton(onClick = {
                                    photoItemId = item.id; galleryLauncher.launch("image/*")
                                }) { Icon(Icons.Default.Photo, null); Spacer(Modifier.width(4.dp)); Text("Choose") }
                            }
                        }
                    } }
                }
            }

            // Signatures
            Text("Signatures", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            d.assignments.forEach { a ->
                val signed = d.signatures.any { it.discipline == a.discipline }
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(disciplineLabel(a.discipline), fontWeight = FontWeight.SemiBold)
                        Text(a.inspector.name, color = Color.Gray, style = MaterialTheme.typography.bodySmall)
                    }
                    when {
                        signed -> Icon(Icons.Default.CheckCircle, null, tint = Green)
                        isInspector && user?.discipline == a.discipline && !locked ->
                            Button(onClick = { signing = true }) { Text("Sign") }
                        else -> Pill(statusLabel(a.status), Color.Gray)
                    }
                }
            }
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text("Manager approval", fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                when {
                    d.signatures.any { it.isManager } -> Icon(Icons.Default.CheckCircle, null, tint = Green)
                    canApprove -> Button(onClick = { signing = true }) { Text("Approve & sign") }
                    else -> Pill(statusLabel(d.status), Color.Gray)
                }
            }
        }

        if (signing) {
            SignatureDialog(onDismiss = { signing = false }) { dataUri ->
                signing = false
                scope.launch {
                    try { backend.api.sign(id, SignBody(dataUri)) } catch (_: Exception) {}
                    if (backend.online.value) reload()
                }
            }
        }

        pendingBitmap?.let { bmp ->
            AnnotateOverlay(bitmap = bmp, onCancel = { pendingBitmap = null }) { flattened ->
                val target = photoItemId
                pendingBitmap = null
                if (target != null) scope.launch {
                    try { backend.api.uploadPhoto(target, bitmapToPart(flattened)) } catch (_: Exception) {}
                    if (backend.online.value) reload()
                }
            }
        }
    }
}

@Composable
private fun StatusMenu(status: String?, enabled: Boolean, onPick: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    val label = when (status) { "GOOD" -> "Good"; "ISSUE" -> "Issue"; "NA" -> "N/A"; else -> "—" }
    Box {
        TextButton(onClick = { if (enabled) open = true }, enabled = enabled) {
            Text(label, color = if (status == "ISSUE") IssueRed else if (status == "GOOD") Green else Color.Unspecified,
                fontWeight = FontWeight.Bold)
        }
        DropdownMenu(open, { open = false }) {
            listOf("GOOD" to "Good", "ISSUE" to "Issue", "NA" to "N/A").forEach { (v, t) ->
                DropdownMenuItem(text = { Text(t) }, onClick = { open = false; onPick(v) })
            }
        }
    }
}

