package test.check.inspections.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import kotlinx.coroutines.launch
import org.osmdroid.config.Configuration
import org.osmdroid.events.MapEventsReceiver
import org.osmdroid.tileprovider.tilesource.TileSourceFactory
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.MapEventsOverlay
import org.osmdroid.views.overlay.Marker
import test.check.inspections.data.*
import java.time.LocalDate

// MARK: New inspection — page 1 (customer + property + map)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NewInspectionScreen(backend: Backend, onAssign: (String) -> Unit, onBack: () -> Unit) {
    var name by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var address by remember { mutableStateOf("") }
    var propertyType by remember { mutableStateOf("APARTMENT") }
    var inspectionType by remember { mutableStateOf("pre-purchase") }
    var coords by remember { mutableStateOf<Pair<Double, Double>?>(null) }
    var showMap by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    if (showMap) {
        MapPicker(
            initial = coords ?: (33.3152 to 44.3661),
            onPick = { la, ln -> coords = la to ln; showMap = false },
            onClose = { showMap = false },
        )
        return
    }

    val valid = name.isNotBlank() && address.isNotBlank() && inspectionType.isNotBlank()

    Scaffold(topBar = {
        TopAppBar(
            title = { Text(tr("New Inspection")) },
            navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, null) } },
            actions = {
                TextButton(enabled = valid && !busy, onClick = {
                    busy = true; error = null
                    scope.launch {
                        try {
                            val r = backend.api.createDraft(
                                CreateDraftBody(
                                    customer = CustomerInput(name.trim(), phone.ifBlank { null }, email.ifBlank { null }),
                                    property = PropertyInput(address.trim(), propertyType, coords?.first, coords?.second),
                                    type = inspectionType.trim(),
                                )
                            )
                            onAssign(r.id)
                        } catch (e: Exception) { error = "Couldn't create the draft." }
                        busy = false
                    }
                }) { Text(if (busy) "…" else tr("Next")) }
            }
        )
    }) { pad ->
        Column(
            Modifier.padding(pad).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Text(tr("Customer"), fontWeight = FontWeight.Bold)
            OutlinedTextField(name, { name = it }, label = { Text(tr("Name")) }, singleLine = true, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(phone, { phone = it }, label = { Text(tr("Phone")) }, singleLine = true, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(email, { email = it }, label = { Text(tr("Email")) }, singleLine = true, modifier = Modifier.fillMaxWidth())

            Spacer(Modifier.height(4.dp))
            Text(tr("Property"), fontWeight = FontWeight.Bold)
            OutlinedTextField(address, { address = it }, label = { Text(tr("Address")) }, modifier = Modifier.fillMaxWidth())
            OutlinedButton(onClick = { showMap = true }, modifier = Modifier.fillMaxWidth()) {
                Icon(Icons.Default.LocationOn, null); Spacer(Modifier.width(6.dp))
                Text(if (coords == null) tr("Pick on map") else tr("Change location"))
            }
            coords?.let { Text(tr("📍 %.5f, %.5f").format(it.first, it.second), color = Color.Gray, style = MaterialTheme.typography.bodySmall) }

            EnumDropdown("Type", PROPERTY_TYPES, propertyType, ::propertyTypeLabel) { propertyType = it }
            OutlinedTextField(inspectionType, { inspectionType = it }, label = { Text(tr("Inspection type")) }, singleLine = true, modifier = Modifier.fillMaxWidth())
            error?.let { Text(it, color = IssueRed, style = MaterialTheme.typography.bodySmall) }
        }
    }
}

// MARK: Map picker (OpenStreetMap via osmdroid — no API key)

@Composable
fun MapPicker(initial: Pair<Double, Double>, onPick: (Double, Double) -> Unit, onClose: () -> Unit) {
    val context = LocalContext.current
    var lat by remember { mutableStateOf(initial.first) }
    var lng by remember { mutableStateOf(initial.second) }

    LaunchedEffect(Unit) {
        Configuration.getInstance().userAgentValue = context.packageName
    }

    Column(Modifier.fillMaxSize()) {
        Box(Modifier.weight(1f)) {
            AndroidView(factory = { ctx ->
                MapView(ctx).apply {
                    setTileSource(TileSourceFactory.MAPNIK)
                    setMultiTouchControls(true)
                    controller.setZoom(13.0)
                    controller.setCenter(GeoPoint(lat, lng))
                    val marker = Marker(this).apply { position = GeoPoint(lat, lng) }
                    overlays.add(marker)
                    val receiver = object : MapEventsReceiver {
                        override fun singleTapConfirmedHelper(p: GeoPoint?): Boolean {
                            p?.let { lat = it.latitude; lng = it.longitude; marker.position = it; invalidate() }
                            return true
                        }
                        override fun longPressHelper(p: GeoPoint?) = false
                    }
                    overlays.add(0, MapEventsOverlay(receiver))
                }
            }, modifier = Modifier.fillMaxSize())
        }
        Surface(tonalElevation = 3.dp) {
            Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(tr("Tap the map to drop a pin"), color = Color.Gray, style = MaterialTheme.typography.bodySmall)
                Text(tr("📍 %.5f, %.5f").format(lat, lng), fontWeight = FontWeight.SemiBold)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    TextButton(onClick = onClose) { Text(tr("Cancel")) }
                    Spacer(Modifier.weight(1f))
                    Button(onClick = { onPick(lat, lng) }) { Text(tr("Use this location")) }
                }
            }
        }
    }
}

// MARK: Assign team — page 2 (date + inspectors per discipline)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AssignTeamScreen(backend: Backend, id: String, onDone: () -> Unit, onBack: () -> Unit) {
    var inspectors by remember { mutableStateOf<List<UserRef>>(emptyList()) }
    var date by remember { mutableStateOf(LocalDate.now().toString()) }
    val picked = remember { mutableStateMapOf<String, String>() } // discipline -> inspectorId
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        inspectors = try { backend.api.users().filter { it.role == "INSPECTOR" } } catch (e: Exception) { emptyList() }
    }

    Scaffold(topBar = {
        TopAppBar(
            title = { Text(tr("Assign Team")) },
            navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, null) } },
            actions = {
                TextButton(enabled = !busy, onClick = {
                    busy = true; error = null
                    scope.launch {
                        try {
                            val assignments = picked.filterValues { it.isNotBlank() }
                                .map { (d, i) -> AssignInput(d, i) }
                            backend.api.assignTeam(id, AssignTeamBody(scheduledAt = date, assignments = assignments))
                            onDone()
                        } catch (e: Exception) { error = "Couldn't save the assignment." }
                        busy = false
                    }
                }) { Text(if (busy) tr("Saving…") else tr("Save")) }
            }
        )
    }) { pad ->
        Column(
            Modifier.padding(pad).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(tr("Schedule"), fontWeight = FontWeight.Bold)
            OutlinedTextField(date, { date = it }, label = { Text(tr("Date (YYYY-MM-DD)")) }, singleLine = true, modifier = Modifier.fillMaxWidth())

            Text(tr("Assign inspectors"), fontWeight = FontWeight.Bold)
            DISCIPLINES.forEach { d ->
                val options = inspectors.filter { it.discipline == d }
                InspectorDropdown(disciplineLabel(d), options, picked[d]) { picked[d] = it ?: "" }
            }
            Text(tr("Pick an inspector for each discipline you need. Leave others empty."),
                color = Color.Gray, style = MaterialTheme.typography.bodySmall)
            error?.let { Text(it, color = IssueRed, style = MaterialTheme.typography.bodySmall) }
        }
    }
}

// MARK: Users / team

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun UsersScreen(backend: Backend, onBack: () -> Unit) {
    val user by backend.user.collectAsState()
    val canAdd = user?.role == "ADMIN"
    var users by remember { mutableStateOf<List<UserRef>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var showAdd by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    suspend fun load() {
        loading = true
        users = try { backend.api.users() } catch (e: Exception) { emptyList() }
        loading = false
    }
    LaunchedEffect(Unit) { load() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(tr("Team")) },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, null) } },
                actions = { if (canAdd) IconButton(onClick = { showAdd = true }) { Icon(Icons.Default.PersonAdd, "Add user") } }
            )
        }
    ) { pad ->
        if (loading) {
            Box(Modifier.fillMaxSize().padding(pad), Alignment.Center) { CircularProgressIndicator() }
        } else {
            LazyColumn(Modifier.padding(pad).fillMaxSize(), contentPadding = PaddingValues(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(users) { u ->
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(12.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(u.name, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                                val tone = when (u.role) { "ADMIN" -> IssueRed; "MANAGER" -> Navy; else -> Color.Gray }
                                Surface(color = tone, shape = MaterialTheme.shapes.small) {
                                    Text(u.role.lowercase().replaceFirstChar { it.uppercase() }, color = Color.White,
                                        style = MaterialTheme.typography.labelSmall,
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp))
                                }
                            }
                            Text(u.email, color = Color.Gray, style = MaterialTheme.typography.bodySmall)
                            u.discipline?.let { Text(disciplineLabel(it), color = Color.Gray, style = MaterialTheme.typography.labelSmall) }
                        }
                    }
                }
            }
        }
    }

    if (showAdd) {
        AddUserDialog(backend, onDismiss = { showAdd = false }) {
            showAdd = false; scope.launch { load() }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddUserDialog(backend: Backend, onDismiss: () -> Unit, onCreated: () -> Unit) {
    var name by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var role by remember { mutableStateOf("INSPECTOR") }
    var discipline by remember { mutableStateOf("CIVIL") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val valid = name.isNotBlank() && email.contains("@") && password.length >= 6

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(tr("Add User")) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(name, { name = it }, label = { Text(tr("Name")) }, singleLine = true)
                OutlinedTextField(email, { email = it }, label = { Text(tr("Email")) }, singleLine = true)
                OutlinedTextField(password, { password = it }, label = { Text(tr("Password (min 6)")) }, singleLine = true)
                EnumDropdown("Role", listOf("INSPECTOR", "MANAGER", "ADMIN"), role,
                    { it.lowercase().replaceFirstChar { c -> c.uppercase() } }) { role = it }
                if (role == "INSPECTOR") {
                    EnumDropdown("Discipline", DISCIPLINES, discipline, ::disciplineLabel) { discipline = it }
                }
                error?.let { Text(it, color = IssueRed, style = MaterialTheme.typography.bodySmall) }
            }
        },
        confirmButton = {
            TextButton(enabled = valid && !busy, onClick = {
                busy = true; error = null
                scope.launch {
                    try {
                        backend.api.createUser(CreateUserBody(name.trim(), email.trim(), password, role,
                            if (role == "INSPECTOR") discipline else null))
                        onCreated()
                    } catch (e: Exception) { error = "Couldn't create the user." }
                    busy = false
                }
            }) { Text(if (busy) "…" else tr("Create")) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(tr("Cancel")) } }
    )
}

// MARK: Small dropdown helpers

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun EnumDropdown(label: String, options: List<String>, selected: String, display: (String) -> String, onSelect: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(expanded = open, onExpandedChange = { open = it }) {
        OutlinedTextField(
            value = display(selected), onValueChange = {}, readOnly = true, label = { Text(label) },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(open) },
            modifier = Modifier.menuAnchor().fillMaxWidth()
        )
        ExposedDropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            options.forEach { o ->
                DropdownMenuItem(text = { Text(display(o)) }, onClick = { onSelect(o); open = false })
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun InspectorDropdown(label: String, options: List<UserRef>, selectedId: String?, onSelect: (String?) -> Unit) {
    var open by remember { mutableStateOf(false) }
    val selectedName = options.firstOrNull { it.id == selectedId }?.name ?: "— none —"
    ExposedDropdownMenuBox(expanded = open, onExpandedChange = { open = it }) {
        OutlinedTextField(
            value = selectedName, onValueChange = {}, readOnly = true, label = { Text(label) },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(open) },
            modifier = Modifier.menuAnchor().fillMaxWidth()
        )
        ExposedDropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            DropdownMenuItem(text = { Text(tr("— none —")) }, onClick = { onSelect(null); open = false })
            options.forEach { u ->
                DropdownMenuItem(text = { Text(u.name) }, onClick = { onSelect(u.id); open = false })
            }
        }
    }
}
