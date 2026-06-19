package test.check.inspections

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.compose.*
import test.check.inspections.data.Backend
import test.check.inspections.ui.*

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val backend = Backend(applicationContext)
        setContent { MaterialTheme(colorScheme = brandColors()) { App(backend) } }
    }
}

@Composable
fun App(backend: Backend) {
    var restored by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { backend.restore(); restored = true }
    val user by backend.user.collectAsState()

    if (!restored) {
        Box(Modifier.fillMaxSize(), contentAlignment = androidx.compose.ui.Alignment.Center) { CircularProgressIndicator() }
        return
    }

    if (user == null) {
        LoginScreen(backend)
    } else {
        val nav = rememberNavController()
        NavHost(navController = nav, startDestination = "home") {
            composable("home") {
                HomeScreen(
                    backend,
                    onNew = { nav.navigate("new") },
                    onUsers = { nav.navigate("users") },
                    onOpen = { id -> nav.navigate("detail/$id") },
                )
            }
            composable("detail/{id}") { entry ->
                DetailScreen(backend, entry.arguments?.getString("id") ?: "") { nav.popBackStack() }
            }
            composable("new") {
                NewInspectionScreen(
                    backend,
                    onAssign = { id -> nav.navigate("assign/$id") { popUpTo("home") } },
                    onBack = { nav.popBackStack() },
                )
            }
            composable("assign/{id}") { entry ->
                AssignTeamScreen(
                    backend, entry.arguments?.getString("id") ?: "",
                    onDone = { nav.popBackStack("home", inclusive = false) },
                    onBack = { nav.popBackStack() },
                )
            }
            composable("users") { UsersScreen(backend) { nav.popBackStack() } }
        }
    }
}
