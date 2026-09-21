package org.devlive.infosphere

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * InfoSphere API 客户端（OkHttp + org.json，零额外依赖）
 */
object Api {
    var baseUrl: String = ""
        private set

    private var token: String? = null

    private val client = OkHttpClient.Builder()
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    private val jsonMedia = "application/json; charset=utf-8".toMediaType()

    fun configure(url: String) {
        baseUrl = url.trimEnd('/')
    }

    fun setToken(value: String?) {
        token = value
    }

    class ApiException(message: String, val status: Int) : Exception(message)

    private fun request(method: String, path: String, body: JSONObject? = null): JSONObject {
        val builder = Request.Builder()
            .url("$baseUrl/api/v1$path")
        if (token != null) {
            builder.addHeader("Authorization", "Bearer $token")
        }
        if (body != null) {
            builder.method(method, body.toString().toRequestBody(jsonMedia))
        } else if (method != "GET") {
            builder.method(method, ByteArray(0).toRequestBody(null))
        }
        client.newCall(builder.build()).execute().use { resp ->
            val text = resp.body?.string() ?: "{}"
            val payload = JSONObject(text)
            if (!resp.isSuccessful || payload.optBoolean("success", false).not()) {
                throw ApiException(payload.optString("message", "请求失败 (${resp.code})"), resp.code)
            }
            return payload
        }
    }

    // ---------- 认证 ----------

    fun login(username: String, password: String): Pair<JSONObject, String> {
        val payload = request("POST", "/auth/login", JSONObject().put("username", username).put("password", password))
        val data = payload.getJSONObject("data")
        return data.getJSONObject("user") to data.getString("token")
    }

    fun me(): JSONObject = request("GET", "/auth/me").getJSONObject("data")

    // ---------- 书籍 ----------

    fun books(page: Int = 1, mine: Boolean = false, title: String = ""): List<JSONObject> {
        val query = buildString {
            append("/books?page=$page&page_size=20")
            if (mine) append("&mine=true")
            if (title.isNotBlank()) append("&title=").append(java.net.URLEncoder.encode(title.trim(), "UTF-8"))
        }
        val payload = request("GET", query)
        val items = payload.getJSONObject("data").getJSONArray("items")
        return (0 until items.length()).map { items.getJSONObject(it) }
    }

    fun unreadCount(): Long =
        request("GET", "/notifications?page=1&per_page=1").getJSONObject("data").getLong("unread_count")

    fun notifications(page: Int = 1): Pair<List<JSONObject>, Long> {
        val data = request("GET", "/notifications?page=$page&per_page=20").getJSONObject("data")
        val items = data.getJSONArray("notifications")
        val list = (0 until items.length()).map { items.getJSONObject(it) }
        return list to data.getLong("unread_count")
    }

    fun markAllNotificationsRead(): Long {
        val payload = request("POST", "/notifications/read", JSONObject().put("all", true))
        return payload.getJSONObject("data").getLong("unread_count")
    }

    fun book(id: Long): JSONObject = request("GET", "/books/$id").getJSONObject("data")

    fun favorites(page: Int = 1): Pair<List<JSONObject>, Int> {
        val payload = request("GET", "/users/me/reactions?type=favorite&page=$page&page_size=20")
        val data = payload.getJSONObject("data")
        val items = data.getJSONArray("items")
        val list = (0 until items.length()).mapNotNull { items.getJSONObject(it).optJSONObject("book") }
        return list to data.optInt("total", list.size)
    }

    fun comments(docId: Long): JSONArray =
        request("GET", "/documents/$docId/comments").getJSONArray("data")

    fun addComment(docId: Long, content: String): JSONObject =
        request("POST", "/documents/$docId/comments", JSONObject().put("content", content))

    fun isLoggedIn(): Boolean = token != null

    fun documentById(id: Long): JSONObject =
        request("GET", "/documents/$id").getJSONObject("data")

    fun createDocument(bookId: Long, title: String, content: String, status: String): JSONObject {
        val payload = request("POST", "/books/$bookId/documents",
            JSONObject().put("title", title).put("content", content).put("status", status))
        return payload.getJSONObject("data")
    }

    fun updateDocument(id: Long, title: String, content: String, status: String): JSONObject {
        val payload = request("PUT", "/documents/$id",
            JSONObject().put("title", title).put("content", content).put("status", status))
        return payload.getJSONObject("data")
    }

    /** 上传图片，返回可访问的 URL（本地驱动为相对地址 /uploads/...） */
    fun uploadImage(fileName: String, bytes: ByteArray): String {
        val ext = fileName.substringAfterLast('.', "png").lowercase()
        val media = when (ext) {
            "jpg", "jpeg" -> "image/jpeg"
            "gif" -> "image/gif"
            "webp" -> "image/webp"
            "svg" -> "image/svg+xml"
            else -> "image/png"
        }.toMediaType()
        val body = MultipartBody.Builder().setType(MultipartBody.FORM)
            .addFormDataPart("file", fileName, bytes.toRequestBody(media))
            .build()
        val builder = Request.Builder().url("$baseUrl/api/v1/upload").post(body)
        if (token != null) builder.addHeader("Authorization", "Bearer $token")
        client.newCall(builder.build()).execute().use { resp ->
            val text = resp.body?.string() ?: "{}"
            val payload = JSONObject(text)
            if (!resp.isSuccessful || payload.optBoolean("success", false).not()) {
                throw ApiException(payload.optString("message", "上传失败 (${resp.code})"), resp.code)
            }
            return payload.getJSONObject("data").getString("url")
        }
    }

    fun documents(bookId: Long): JSONArray =
        request("GET", "/books/$bookId/documents").getJSONArray("data")

    fun document(bookId: Long, slug: String): JSONObject =
        request("GET", "/books/$bookId/documents/slug/$slug").getJSONObject("data")

    // ---------- 探索 ----------

    fun latest(): List<JSONObject> {
        val items = request("GET", "/explore/latest").getJSONArray("data")
        return (0 until items.length()).map { items.getJSONObject(it) }
    }
}
