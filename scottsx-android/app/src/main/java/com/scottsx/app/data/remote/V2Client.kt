package com.scottsx.app.data.remote

import com.scottsx.app.data.Session
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

/**
 * Stage 5 — REST client for the Firebase-backed backend.
 *
 * Talks to /api/v1/{auth/firebase, ai/v2, settings/v2, memory/v2,
 * chat/v2, products/v2, sellers/v2} using the HS256 JWT from
 * [Session.token] as a Bearer token. All calls are best-effort
 * and return null/empty on failure so the UI never crashes.
 */
object V2Client {

    private const val TAG = "V2Client"

    // Default backend base URL — override at runtime via setBaseUrl().
    private const val DEFAULT_BASE_URL = "http://10.0.2.2:3001"
    @Volatile private var baseUrlOverride: String? = null
    fun setBaseUrl(url: String) { baseUrlOverride = url }

    /** Base URL — same as the existing RemoteAssistantClient. */
    private val baseUrl: String get() = DEFAULT_BASE_URL

    private suspend fun <T> apiCall(
        method: String,
        path: String,
        body: JSONObject? = null,
        parse: (JSONObject) -> T,
    ): T? = withContext(Dispatchers.IO) {
        try {
            val url = java.net.URL(baseUrl.trimEnd('/') + path)
            val conn = url.openConnection() as java.net.HttpURLConnection
            conn.requestMethod = method
            conn.connectTimeout = 6000
            conn.readTimeout = 12000
            conn.setRequestProperty("Accept", "application/json")
            Session.tokenOrNull()?.let { conn.setRequestProperty("Authorization", "Bearer $it") }
            if (body != null) {
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            }
            val code = conn.responseCode
            if (code !in 200..299) {
                android.util.Log.w(TAG, "$method $path -> $code")
                return@withContext null
            }
            val text = conn.inputStream.bufferedReader().use { it.readText() }
            if (text.isBlank()) null else parse(JSONObject(text))
        } catch (t: Throwable) {
            android.util.Log.w(TAG, "$method $path failed: ${t.message}")
            null
        }
    }

    private suspend fun <T> apiCallArray(
        method: String,
        path: String,
        body: JSONObject? = null,
        parse: (JSONArray) -> T,
    ): T? = withContext(Dispatchers.IO) {
        try {
            val url = java.net.URL(baseUrl.trimEnd('/') + path)
            val conn = url.openConnection() as java.net.HttpURLConnection
            conn.requestMethod = method
            conn.connectTimeout = 6000
            conn.readTimeout = 12000
            conn.setRequestProperty("Accept", "application/json")
            Session.tokenOrNull()?.let { conn.setRequestProperty("Authorization", "Bearer $it") }
            if (body != null) {
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            }
            val code = conn.responseCode
            if (code !in 200..299) {
                android.util.Log.w(TAG, "$method $path -> $code")
                return@withContext null
            }
            val text = conn.inputStream.bufferedReader().use { it.readText() }
            if (text.isBlank()) null else parse(JSONArray(text))
        } catch (t: Throwable) {
            android.util.Log.w(TAG, "$method $path failed: ${t.message}")
            null
        }
    }

    // ----------------------------------------------------------------
    // AI
    // ----------------------------------------------------------------

    data class AiReply(val text: String, val provider: String)

    suspend fun ask(message: String, screen: String? = null): AiReply? =
        apiCall(
            method = "POST",
            path = "/api/v1/ai/v2/ask",
            body = JSONObject().apply {
                put("message", message)
                if (screen != null) put("context", JSONObject().put("screen", screen))
            },
            parse = { o ->
                AiReply(
                    text = o.optString("reply"),
                    provider = o.optJSONObject("sources")?.optString("aiProvider") ?: "",
                )
            },
        )

    // ----------------------------------------------------------------
    // Memory signals — fire and forget from anywhere
    // ----------------------------------------------------------------

    suspend fun recordSignal(kind: String, value: String) {
        try {
            apiCall(
                method = "POST",
                path = "/api/v1/memory/v2/ai/signal",
                body = JSONObject().apply {
                    put("kind", kind)
                    put("value", value)
                },
                parse = { o -> o.optBoolean("ok", false) },
            )
        } catch (_: Throwable) { }
    }

    suspend fun clearAiMemory(): Boolean =
        apiCall(
            method = "POST",
            path = "/api/v1/memory/v2/ai/clear",
            body = null,
            parse = { o -> o.optBoolean("ok", false) },
        ) ?: false

    // ----------------------------------------------------------------
    // Settings
    // ----------------------------------------------------------------

    data class Settings(
        val theme: String,
        val language: String,
        val notificationsEnabled: Boolean,
        val notificationSound: Boolean,
        val locationSharing: String,
        val privacyShowReceipts: Boolean,
        val privacyShowTransactions: Boolean,
        val aiPersonalizationEnabled: Boolean,
        val preferredLanguage: String,
        val preferredCurrency: String,
    )

    suspend fun loadSettings(): Settings? =
        apiCall(
            method = "GET",
            path = "/api/v1/settings/v2",
            body = null,
            parse = { o ->
                Settings(
                    theme = o.optString("theme", "system"),
                    language = o.optString("language", "en"),
                    notificationsEnabled = o.optBoolean("notificationsEnabled", true),
                    notificationSound = o.optBoolean("notificationSound", true),
                    locationSharing = o.optString("locationSharing", "approximate"),
                    privacyShowReceipts = o.optBoolean("privacyShowReceipts", true),
                    privacyShowTransactions = o.optBoolean("privacyShowTransactions", true),
                    aiPersonalizationEnabled = o.optBoolean("aiPersonalizationEnabled", true),
                    preferredLanguage = o.optString("preferredLanguage", "en"),
                    preferredCurrency = o.optString("preferredCurrency", "UGX"),
                )
            },
        )

    suspend fun saveSettings(patch: JSONObject): Boolean =
        apiCall(
            method = "PUT",
            path = "/api/v1/settings/v2",
            body = patch,
            parse = { o -> o.optBoolean("ok", false) },
        ) ?: false

    // ----------------------------------------------------------------
    // Nearby sellers — returns JSON array
    // ----------------------------------------------------------------

    data class NearbySeller(
        val sellerId: String,
        val storeName: String,
        val lat: Double,
        val lng: Double,
        val city: String?,
        val address: String?,
        val rating: Double,
        val distanceKm: Double,
        val products: List<NearbyProduct>,
    )

    data class NearbyProduct(
        val id: String,
        val title: String,
        val priceMinor: Long,
        val image: String?,
        val stock: Int,
        val rating: Double,
        val category: String?,
    )

    suspend fun nearbySellers(
        lat: Double,
        lng: Double,
        radiusKm: Double = 25.0,
        category: String? = null,
        minPrice: Long? = null,
        maxPrice: Long? = null,
        limit: Int = 40,
    ): List<NearbySeller> {
        val qs = buildString {
            append("?lat=").append(lat)
            append("&lng=").append(lng)
            append("&radiusKm=").append(radiusKm)
            if (category != null) append("&category=").append(java.net.URLEncoder.encode(category, "UTF-8"))
            if (minPrice != null) append("&minPrice=").append(minPrice)
            if (maxPrice != null) append("&maxPrice=").append(maxPrice)
            append("&limit=").append(limit)
        }
        val arr = apiCallArray(
            method = "GET",
            path = "/api/v1/sellers/v2/nearby$qs",
            body = null,
            parse = { it },
        ) ?: return emptyList()
        return (0 until arr.length()).mapNotNull { i ->
            val r = arr.optJSONObject(i) ?: return@mapNotNull null
            val prods = r.optJSONArray("products")
            val products = if (prods != null) (0 until prods.length()).mapNotNull { j ->
                val p = prods.optJSONObject(j) ?: return@mapNotNull null
                NearbyProduct(
                    id = p.optString("id"),
                    title = p.optString("title"),
                    priceMinor = p.optLong("price", 0L),
                    image = p.optString("image").takeIf { it.isNotBlank() },
                    stock = p.optInt("stock", 0),
                    rating = p.optDouble("rating", 0.0),
                    category = p.optString("category").takeIf { it.isNotBlank() },
                )
            } else emptyList()
            NearbySeller(
                sellerId = r.optString("seller_id"),
                storeName = r.optString("store_name"),
                lat = r.optDouble("lat", 0.0),
                lng = r.optDouble("lng", 0.0),
                city = r.optString("city").takeIf { it.isNotBlank() },
                address = r.optString("address").takeIf { it.isNotBlank() },
                rating = r.optDouble("rating", 0.0),
                distanceKm = r.optDouble("distance_km", Double.MAX_VALUE),
                products = products,
            )
        }
    }

    suspend fun updateSellerLocation(
        lat: Double,
        lng: Double,
        city: String? = null,
        address: String? = null,
    ): Boolean =
        apiCall(
            method = "POST",
            path = "/api/v1/sellers/v2/update-location",
            body = JSONObject().apply {
                put("lat", lat)
                put("lng", lng)
                if (city != null) put("city", city)
                if (address != null) put("address", address)
            },
            parse = { o -> o.optBoolean("ok", false) },
        ) ?: false

    // ----------------------------------------------------------------
    // Chat v2 — typed write-through + Firestore mirror
    // ----------------------------------------------------------------

    data class ChatMessage(
        val id: String,
        val conversationId: String,
        val senderUid: String,
        val recipientUid: String?,
        val content: String,
        val role: String,
        val attachmentUrl: String?,
        val attachmentMime: String?,
        val threadParentId: String?,
        val createdAt: String,
    )

    suspend fun sendMessage(
        conversationId: String,
        content: String,
        attachmentUrl: String? = null,
        attachmentMime: String? = null,
        threadParentId: String? = null,
        productId: String? = null,
        productTitle: String? = null,
        productImageUrl: String? = null,
    ): ChatMessage? =
        apiCall(
            method = "POST",
            path = "/api/v1/chat/v2/messages",
            body = JSONObject().apply {
                put("conversationId", conversationId)
                put("content", content)
                if (attachmentUrl != null) put("attachmentUrl", attachmentUrl)
                if (attachmentMime != null) put("attachmentMime", attachmentMime)
                if (threadParentId != null) put("threadParentId", threadParentId)
                if (productId != null) put("productId", productId)
                if (productTitle != null) put("productTitle", productTitle)
                if (productImageUrl != null) put("productImageUrl", productImageUrl)
            },
            parse = { o ->
                ChatMessage(
                    id = o.optString("id"),
                    conversationId = o.optString("conversationId"),
                    senderUid = o.optString("senderUid"),
                    recipientUid = o.optString("recipientUid").takeIf { it.isNotBlank() },
                    content = o.optString("content"),
                    role = o.optString("role"),
                    attachmentUrl = o.optString("attachmentUrl").takeIf { it.isNotBlank() },
                    attachmentMime = o.optString("attachmentMime").takeIf { it.isNotBlank() },
                    threadParentId = o.optString("threadParentId").takeIf { it.isNotBlank() },
                    createdAt = o.optString("createdAt"),
                )
            },
        )

    data class ChatUploadHandle(
        val uploadUrl: String,
        val gsPath: String,
        val publicUrl: String,
        val messageId: String,
        val expiresAt: Long,
    )

    suspend fun requestChatUploadUrl(
        conversationId: String,
        mime: String,
        ext: String,
    ): ChatUploadHandle? =
        apiCall(
            method = "POST",
            path = "/api/v1/chat/v2/upload-url",
            body = JSONObject().apply {
                put("conversationId", conversationId)
                put("mime", mime)
                put("ext", ext)
            },
            parse = { o ->
                ChatUploadHandle(
                    uploadUrl = o.optString("uploadUrl"),
                    gsPath = o.optString("gsPath"),
                    publicUrl = o.optString("publicUrl"),
                    messageId = o.optString("messageId"),
                    expiresAt = o.optLong("expiresAt", 0L),
                )
            },
        )

    // ----------------------------------------------------------------
    // Product image upload (seller)
    // ----------------------------------------------------------------

    data class ProductImageUploadHandle(
        val uploadUrl: String,
        val gsPath: String,
        val publicUrl: String,
        val expiresAt: Long,
    )

    suspend fun requestProductImageUploadUrl(
        productId: String,
        mime: String,
        ext: String,
    ): ProductImageUploadHandle? =
        apiCall(
            method = "POST",
            path = "/api/v1/products/v2/upload-image-url",
            body = JSONObject().apply {
                put("productId", productId)
                put("mime", mime)
                put("ext", ext)
            },
            parse = { o ->
                ProductImageUploadHandle(
                    uploadUrl = o.optString("uploadUrl"),
                    gsPath = o.optString("gsPath"),
                    publicUrl = o.optString("publicUrl"),
                    expiresAt = o.optLong("expiresAt", 0L),
                )
            },
        )

    suspend fun setProductImage(productId: String, gsPath: String): Boolean =
        apiCall(
            method = "POST",
            path = "/api/v1/products/v2/$productId/set-image",
            body = JSONObject().put("gsPath", gsPath),
            parse = { o -> o.optBoolean("ok", false) },
        ) ?: false
}
