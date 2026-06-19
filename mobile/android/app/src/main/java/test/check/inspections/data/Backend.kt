package test.check.inspections.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import test.check.inspections.BuildConfig
import java.io.File
import java.io.IOException

private val Context.dataStore by preferencesDataStore("auth")
private val K_ACCESS = stringPreferencesKey("access")
private val K_REFRESH = stringPreferencesKey("refresh")
private val K_USER = stringPreferencesKey("user")

/** Auth + networking singleton. Online-first. */
class Backend(private val context: Context) {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    val user = MutableStateFlow<AuthUser?>(null)

    @Volatile private var access: String? = null
    @Volatile private var refresh: String? = null

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val connectivity = ConnectivityMonitor(context)
    private val outbox = OutboxStore(context)

    /** Observed by the UI for the offline / pending-sync banner. */
    val online: StateFlow<Boolean> = connectivity.online
    val pendingCount: StateFlow<Int> = outbox.count

    private val authInterceptor = Interceptor { chain ->
        val req = chain.request().newBuilder()
        access?.let { req.header("Authorization", "Bearer $it") }
        chain.proceed(req.build())
    }
    private val refreshAuthenticator = object : Authenticator {
        override fun authenticate(route: Route?, response: Response): Request? {
            if (responseCount(response) >= 2) return null
            val rt = refresh ?: return null
            return try {
                val r = kotlinx.coroutines.runBlocking { plainApi.refresh(RefreshBody(rt)) }
                persist(r)
                response.request.newBuilder().header("Authorization", "Bearer ${r.accessToken}").build()
            } catch (e: Exception) { null }
        }
    }

    // A bare client (no auth) used for login + refresh.
    private val plainApi: Api = retrofit(OkHttpClient.Builder().build())

    // Client used to replay queued writes — auth, but no offline-queue interceptor.
    private val replayClient: OkHttpClient by lazy {
        OkHttpClient.Builder().addInterceptor(authInterceptor).authenticator(refreshAuthenticator).build()
    }

    // The authenticated client: token + refresh, GET disk-cache, and offline write queue.
    private val authedApi: Api by lazy {
        val client = OkHttpClient.Builder()
            .cache(Cache(File(context.cacheDir, "http_cache"), 25L * 1024 * 1024))
            .addInterceptor(authInterceptor)
            .addInterceptor(cachePolicyInterceptor { connectivity.online.value })
            .addInterceptor(OfflineWriteInterceptor(outbox))
            .addNetworkInterceptor(CacheableGetInterceptor)
            .authenticator(refreshAuthenticator)
            .build()
        retrofit(client)
    }

    init {
        // Flush the outbox whenever we transition back online.
        scope.launch {
            connectivity.online.drop(1).collect { isOnline -> if (isOnline) flushOutbox() }
        }
    }

    /** Replay queued writes oldest-first; drop poison (4xx), stop on connectivity loss. */
    suspend fun flushOutbox() {
        if (!connectivity.online.value) return
        for (op in outbox.all()) {
            try {
                replayClient.newCall(op.toRequest()).execute().use { r ->
                    if (r.isSuccessful || r.code in 400..499) outbox.removeFirst() else return
                }
            } catch (e: IOException) { return }
        }
    }

    private fun retrofit(client: OkHttpClient): Api {
        val media = "application/json".toMediaType()
        return Retrofit.Builder()
            .baseUrl(BuildConfig.API_BASE_URL)
            .client(client)
            .addConverterFactory(json.asConverterFactory(media))
            .build()
            .create(Api::class.java)
    }

    private fun responseCount(response: Response): Int {
        var r: Response? = response; var c = 1
        while (r?.priorResponse != null) { c++; r = r.priorResponse }
        return c
    }

    suspend fun restore() {
        val prefs = context.dataStore.data.first()
        access = prefs[K_ACCESS]; refresh = prefs[K_REFRESH]
        prefs[K_USER]?.let { user.value = runCatching { json.decodeFromString<AuthUser>(it) }.getOrNull() }
    }

    private fun persist(r: LoginResponse) {
        access = r.accessToken; refresh = r.refreshToken; user.value = r.user
        kotlinx.coroutines.runBlocking {
            context.dataStore.edit {
                it[K_ACCESS] = r.accessToken; it[K_REFRESH] = r.refreshToken
                it[K_USER] = json.encodeToString(AuthUser.serializer(), r.user)
            }
        }
    }

    suspend fun login(email: String, password: String) = persist(plainApi.login(LoginBody(email, password)))

    suspend fun logout() {
        access = null; refresh = null; user.value = null
        context.dataStore.edit { it.clear() }
    }

    val api: Api get() = authedApi
}
