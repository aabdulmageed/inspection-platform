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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
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

// Fully specify the scheme so Material 3 doesn't tint surfaces purple — neutral
// greys + brand accents, matching the iOS look.
fun brandColors() = lightColorScheme(
    primary = Navy,
    onPrimary = Color.White,
    secondary = Green,
    onSecondary = Color.White,
    background = Color(0xFFF2F3F5),          // ~ iOS systemGroupedBackground
    onBackground = Color(0xFF1A1A1A),
    surface = Color.White,
    onSurface = Color(0xFF1A1A1A),
    surfaceVariant = Color(0xFFECEEF1),      // neutral card / field background
    onSurfaceVariant = Color(0xFF45484C),
    secondaryContainer = Color(0xFFD8E6FB),  // selected chip: light navy (not purple)
    onSecondaryContainer = Navy,
    outline = Color(0xFFC4C8CD),
    error = IssueRed,
    onError = Color.White,
)

internal val DISCIPLINES = listOf("CIVIL", "ELECTRICAL", "PLUMBING", "PEST_OTHER")
internal val PROPERTY_TYPES = listOf("APARTMENT", "HOUSE")
internal fun propertyTypeLabel(t: String) = Loc.str(when (t) { "APARTMENT" -> "Apartment"; "HOUSE" -> "House"; else -> t })

internal fun disciplineLabel(d: String) = Loc.str(when (d) {
    "CIVIL" -> "Civil"; "ELECTRICAL" -> "Electrical"; "PLUMBING" -> "Plumbing"; "PEST_OTHER" -> "Pest / Other"; else -> d
})
internal fun statusLabel(s: String) = Loc.str(when (s) {
    "DRAFT" -> "Draft"; "IN_PROGRESS" -> "In progress"; "IN_REVIEW" -> "In review"
    "COMPLETED" -> "Completed"; "REPORTED" -> "Reported"; "PENDING" -> "Pending"; "SIGNED" -> "Signed"; else -> s
})

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
        Text(tr("CHECK House Inspections"), color = Color.Gray, modifier = Modifier.padding(bottom = 24.dp))
        Text(tr("Sign in"), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold,
            modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(email, { email = it }, label = { Text(tr("Email")) },
            keyboardOptions = KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Email),
            singleLine = true, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(password, { password = it }, label = { Text(tr("Password")) },
            visualTransformation = PasswordVisualTransformation(), singleLine = true, modifier = Modifier.fillMaxWidth())
        error?.let { Text(it, color = IssueRed, style = MaterialTheme.typography.bodySmall) }
        Spacer(Modifier.height(12.dp))
        Button(
            onClick = {
                busy = true; error = null
                scope.launch {
                    try { backend.login(email.trim(), password) }
                    catch (e: Exception) { error = Loc.str("Invalid email or password") }
                    busy = false
                }
            },
            enabled = !busy && email.isNotBlank() && password.isNotBlank(),
            modifier = Modifier.fillMaxWidth()
        ) { Text(if (busy) tr("Signing in…") else tr("Sign in")) }
        Text(tr("Demo: admin@check.test / password123"), style = MaterialTheme.typography.bodySmall,
            color = Color.Gray, modifier = Modifier.padding(top = 8.dp))
        LanguageToggle()
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
            title = { Text(if (isInspector) tr("My Day") else tr("Inspections")) },
            navigationIcon = {
                if (isStaff) IconButton(onClick = onUsers) { Icon(Icons.Default.Group, "Team") }
            },
            actions = {
                val ctx = LocalContext.current
                // Compact language switch so the bar isn't crowded.
                TextButton(onClick = { Loc.toggle(ctx) }) { Text(if (Loc.lang == "ar") "EN" else "ع") }
                if (isStaff) IconButton(onClick = onNew) { Icon(Icons.Default.Add, "New inspection") }
                TextButton(onClick = { scope.launch { backend.logout() } }) { Text(tr("Log out")) }
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
                    if (items.isEmpty()) item { Text(tr("Nothing to show."), color = Color.Gray) }
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
                    Text(tr("Sync now"), color = Color.White, style = MaterialTheme.typography.labelMedium)
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
    var showAddRoom by remember { mutableStateOf(false) }
    var showAddCheck by remember { mutableStateOf(false) }
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
    fun patchPhotoNoteLocal(photoId: String, note: String) {
        val cur = detail ?: return
        detail = cur.copy(rooms = cur.rooms.map { r ->
            r.copy(items = r.items.map { it.copy(photos = it.photos.map { p -> if (p.id == photoId) p.copy(note = note) else p }) })
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
        TopAppBar(title = { Text(tr("Inspection")) },
            navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, null) } })
    }) { pad ->
        if (d == null) { Box(Modifier.fillMaxSize().padding(pad), Alignment.Center) { CircularProgressIndicator() }; return@Scaffold }

        val locked = d.status == "COMPLETED" || d.status == "REPORTED"
        val isInspector = user?.role == "INSPECTOR"
        val canApprove = !locked && (user?.role == "ADMIN" || (user?.role == "MANAGER" && d.status == "IN_REVIEW"))
        val assignedMe = d.assignments.any { it.discipline == user?.discipline }
        val canContribute = !locked && (user?.role == "ADMIN" || user?.role == "MANAGER" || (isInspector && assignedMe))
        // Show every room (rooms are property-wide), keeping only this inspector's
        // own-discipline checks inside each — so a room they/another discipline
        // just created stays visible and they can add their checks to it.
        val rooms = if (isInspector) d.rooms.map { r -> r.copy(items = r.items.filter { it.discipline == user?.discipline }) }
            else d.rooms
        val room = rooms.firstOrNull { it.id == activeRoom } ?: rooms.firstOrNull()

        Box(Modifier.fillMaxSize()) {
        Column(Modifier.padding(pad).fillMaxSize().verticalScroll(rememberScrollState()).padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)) {

            Card { Column(Modifier.padding(14.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(d.property.client.name, style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                    Pill(statusLabel(d.status), Navy)
                }
                Text(d.property.address, color = Color.Gray)
                if (locked) Text(tr("🔒 Approved & locked"), color = Green, fontWeight = FontWeight.Bold)
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
            if (canContribute) {
                TextButton(onClick = { showAddRoom = true }) {
                    Icon(Icons.Default.Add, null); Spacer(Modifier.width(4.dp)); Text(tr("Add room"))
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
                            Row(
                                Modifier.padding(top = 8.dp).horizontalScroll(rememberScrollState()),
                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                item.photos.forEach { p ->
                                    Column(Modifier.width(96.dp)) {
                                        Box {
                                            AsyncImage(
                                                model = p.url, contentDescription = null,
                                                modifier = Modifier.size(width = 96.dp, height = 72.dp)
                                                    .clip(androidx.compose.foundation.shape.RoundedCornerShape(8.dp))
                                            )
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
                                        if (editable) {
                                            var noteText by remember(p.id, p.note) { mutableStateOf(p.note ?: "") }
                                            OutlinedTextField(
                                                value = noteText,
                                                onValueChange = { noteText = it },
                                                placeholder = { Text(tr("Photo note…"), style = MaterialTheme.typography.bodySmall) },
                                                textStyle = MaterialTheme.typography.bodySmall,
                                                singleLine = true,
                                                modifier = Modifier.width(96.dp).padding(top = 4.dp)
                                                    .onFocusChanged { f ->
                                                        if (!f.isFocused && noteText != (p.note ?: "")) {
                                                            patchPhotoNoteLocal(p.id, noteText)
                                                            scope.launch {
                                                                try { backend.api.updatePhotoNote(p.id, UpdatePhotoBody(noteText)) } catch (_: Exception) {}
                                                            }
                                                        }
                                                    }
                                            )
                                        } else if (!p.note.isNullOrEmpty()) {
                                            Text(
                                                p.note!!, style = MaterialTheme.typography.bodySmall, color = Color.Gray,
                                                modifier = Modifier.width(96.dp).padding(top = 4.dp)
                                            )
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
                                }) { Icon(Icons.Default.PhotoCamera, null); Spacer(Modifier.width(4.dp)); Text(tr("Take photo")) }
                                TextButton(onClick = {
                                    photoItemId = item.id; galleryLauncher.launch("image/*")
                                }) { Icon(Icons.Default.Photo, null); Spacer(Modifier.width(4.dp)); Text(tr("Choose")) }
                            }
                        }
                    } }
                }
                if (canContribute) {
                    TextButton(onClick = { showAddCheck = true }) {
                        Icon(Icons.Default.Add, null); Spacer(Modifier.width(4.dp)); Text(tr("Add check"))
                    }
                }
            }

            // Signatures
            Text(tr("Signatures"), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
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
                            Button(onClick = { signing = true }) { Text(tr("Sign")) }
                        else -> Pill(statusLabel(a.status), Color.Gray)
                    }
                }
            }
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(tr("Manager approval"), fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                when {
                    d.signatures.any { it.isManager } -> Icon(Icons.Default.CheckCircle, null, tint = Green)
                    canApprove -> Button(onClick = { signing = true }) { Text(tr("Approve & sign")) }
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

        if (showAddRoom) {
            var name by remember { mutableStateOf("") }
            AlertDialog(
                onDismissRequest = { showAddRoom = false },
                title = { Text(tr("Add room")) },
                text = { OutlinedTextField(name, { name = it }, label = { Text(tr("Room name")) }, singleLine = true) },
                confirmButton = {
                    TextButton(enabled = name.isNotBlank(), onClick = {
                        val n = name.trim(); showAddRoom = false
                        scope.launch {
                            try { backend.api.addRoom(id, AddRoomBody(n)) } catch (_: Exception) {}
                            if (backend.online.value) reload()
                        }
                    }) { Text(tr("Add")) }
                },
                dismissButton = { TextButton(onClick = { showAddRoom = false }) { Text(tr("Cancel")) } }
            )
        }

        if (showAddCheck) {
            val targetRoom = room?.id
            var comp by remember { mutableStateOf("") }
            var disc by remember { mutableStateOf("CIVIL") }
            var discOpen by remember { mutableStateOf(false) }
            AlertDialog(
                onDismissRequest = { showAddCheck = false },
                title = { Text(tr("Add check")) },
                text = {
                    Column {
                        OutlinedTextField(comp, { comp = it }, label = { Text(tr("Check name")) }, singleLine = true)
                        if (!isInspector) {
                            Spacer(Modifier.height(8.dp))
                            Box {
                                OutlinedButton(onClick = { discOpen = true }) { Text(disciplineLabel(disc)) }
                                DropdownMenu(expanded = discOpen, onDismissRequest = { discOpen = false }) {
                                    DISCIPLINES.forEach { dd ->
                                        DropdownMenuItem(text = { Text(disciplineLabel(dd)) }, onClick = { disc = dd; discOpen = false })
                                    }
                                }
                            }
                        }
                    }
                },
                confirmButton = {
                    TextButton(enabled = comp.isNotBlank() && targetRoom != null, onClick = {
                        val c = comp.trim(); showAddCheck = false
                        scope.launch {
                            try { backend.api.addCheck(targetRoom!!, AddItemBody(c, if (isInspector) null else disc)) } catch (_: Exception) {}
                            if (backend.online.value) reload()
                        }
                    }) { Text(tr("Add")) }
                },
                dismissButton = { TextButton(onClick = { showAddCheck = false }) { Text(tr("Cancel")) } }
            )
        }
        }
    }
}

@Composable
private fun StatusMenu(status: String?, enabled: Boolean, onPick: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    val label = Loc.str(when (status) { "GOOD" -> "Good"; "ISSUE" -> "Issue"; "NA" -> "N/A"; else -> "—" })
    Box {
        TextButton(onClick = { if (enabled) open = true }, enabled = enabled) {
            Text(label, color = if (status == "ISSUE") IssueRed else if (status == "GOOD") Green else Color.Unspecified,
                fontWeight = FontWeight.Bold)
        }
        DropdownMenu(open, { open = false }) {
            listOf("GOOD" to "Good", "ISSUE" to "Issue", "NA" to "N/A").forEach { (v, t) ->
                DropdownMenuItem(text = { Text(tr(t)) }, onClick = { open = false; onPick(v) })
            }
        }
    }
}

