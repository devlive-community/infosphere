package org.devlive.infosphere

import okhttp3.MediaType.Companion.toMediaType
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

    fun books(page: Int = 1, mine: Boolean = false): List<JSONObject> {
        val payload = request("GET", "/books?page=$page&page_size=20${if (mine) "&mine=true" else ""}")
        val items = payload.getJSONObject("data").getJSONArray("items")
        return (0 until items.length()).map { items.getJSONObject(it) }
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
