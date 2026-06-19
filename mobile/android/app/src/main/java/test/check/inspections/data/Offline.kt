package test.check.inspections.data

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.util.Base64
import kotlinx.coroutines.flow.MutableStateFlow
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.Buffer
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException

/** Live online/offline state from the system default network. */
class ConnectivityMonitor(context: Context) {
    val online = MutableStateFlow(true)

    init {
        val cm = context.getSystemService(ConnectivityManager::class.java)
        online.value = cm?.activeNetwork != null
        cm?.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) { online.value = true }
            override fun onLost(network: Network) { online.value = false }
            override fun onUnavailable() { online.value = false }
        })
    }
}

/** Persisted queue of writes that couldn't reach the server (replayed on reconnect). */
class OutboxStore(context: Context) {
    data class Op(val method: String, val url: String, val contentType: String?, val bodyB64: String?)

    private val file = File(context.filesDir, "outbox.json")
    val count = MutableStateFlow(all().size)

    @Synchronized fun all(): MutableList<Op> {
        if (!file.exists()) return mutableListOf()
        return try {
            val arr = JSONArray(file.readText())
            MutableList(arr.length()) { i ->
                val o = arr.getJSONObject(i)
                Op(
                    o.getString("method"), o.getString("url"),
                    if (o.isNull("contentType")) null else o.getString("contentType"),
                    if (o.isNull("bodyB64")) null else o.getString("bodyB64"),
                )
            }
        } catch (e: Exception) { mutableListOf() }
    }

    @Synchronized private fun save(ops: List<Op>) {
        val arr = JSONArray()
        ops.forEach { op ->
            arr.put(JSONObject().apply {
                put("method", op.method); put("url", op.url)
                put("contentType", op.contentType); put("bodyB64", op.bodyB64)
            })
        }
        file.writeText(arr.toString())
        count.value = ops.size
    }

    @Synchronized fun add(op: Op) { val l = all(); l.add(op); save(l) }
    @Synchronized fun removeFirst() { val l = all(); if (l.isNotEmpty()) { l.removeAt(0); save(l) } }
}

/** Only field writes are safe to replay blind (they return no body the UI needs). */
private fun Request.isReplayableWrite(): Boolean {
    val p = url.encodedPath
    return when {
        method == "PATCH" && p.contains("/items/") -> true
        method == "POST" && p.endsWith("/sign") -> true
        method == "POST" && p.endsWith("/photos") -> true
        method == "DELETE" && p.contains("/photos/") -> true
        else -> false
    }
}

private fun Request.toOp(): OutboxStore.Op {
    val bytes = body?.let { val b = Buffer(); it.writeTo(b); b.readByteArray() }
    return OutboxStore.Op(
        method, url.toString(), body?.contentType()?.toString(),
        bytes?.let { Base64.encodeToString(it, Base64.NO_WRAP) },
    )
}

/** Queue a failing field-write while offline and return a synthetic success. */
class OfflineWriteInterceptor(private val outbox: OutboxStore) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val req = chain.request()
        if (!req.isReplayableWrite()) return chain.proceed(req)
        return try {
            chain.proceed(req)
        } catch (e: IOException) {
            outbox.add(req.toOp())
            Response.Builder()
                .request(req).protocol(Protocol.HTTP_1_1)
                .code(202).message("Queued offline")
                .body(ByteArray(0).toResponseBody(null))
                .build()
        }
    }
}

/** Make GET responses cacheable so they can be served offline. */
val CacheableGetInterceptor = Interceptor { chain ->
    val res = chain.proceed(chain.request())
    if (chain.request().method == "GET") {
        res.newBuilder().removeHeader("Pragma").removeHeader("Cache-Control")
            .header("Cache-Control", "public, max-age=86400").build()
    } else res
}

/**
 * GET cache policy: when online always revalidate against the server (fresh data,
 * and the response refreshes the cache); when offline serve straight from cache.
 */
fun cachePolicyInterceptor(online: () -> Boolean) = Interceptor { chain ->
    var req = chain.request()
    if (req.method == "GET") {
        req = req.newBuilder().cacheControl(
            if (online()) CacheControl.Builder().noCache().build() else CacheControl.FORCE_CACHE
        ).build()
    }
    chain.proceed(req)
}

/** Rebuild a stored request for replay. */
fun OutboxStore.Op.toRequest(): Request {
    val rb = bodyB64?.let { Base64.decode(it, Base64.NO_WRAP).toRequestBody(contentType?.toMediaTypeOrNull()) }
    return Request.Builder().url(url).method(method, rb).build()
}
