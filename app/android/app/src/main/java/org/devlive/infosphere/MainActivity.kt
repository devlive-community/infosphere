package org.devlive.infosphere

import android.content.Context
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import coil.compose.AsyncImage
import com.mikepenz.markdown.m3.Markdown
import androidx.compose.foundation.clickable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val prefs = getSharedPreferences("infosphere", Context.MODE_PRIVATE)
        prefs.getString("server_url", null)?.let { Api.configure(it) }
        prefs.getString("token", null)?.let { Api.setToken(it) }

        setContent {
            MaterialTheme(colorScheme = lightColorScheme()) {
                App(prefs)
            }
        }
    }
}

/** 屏幕状态机：服务器配置 → 登录 → 书籍列表 → 阅读器 */
private enum class Screen { Server, Login, Books, Detail, Reader, Editor }

@Composable
private fun App(prefs: android.content.SharedPreferences) {
    var screen by remember {
        mutableStateOf(if (Api.baseUrl.isEmpty()) Screen.Server else Screen.Login)
    }
    var user by remember { mutableStateOf<JSONObject?>(null) }
    var selectedBook by remember { mutableStateOf<BookRow?>(null) }

    when (screen) {
        Screen.Server -> ServerScreen { url ->
            prefs.edit().putString("server_url", url).apply()
            screen = Screen.Login
        }
        Screen.Login -> LoginScreen(
            onLoggedIn = { u, token ->
                user = u
                prefs.edit().putString("token", token).apply()
                screen = Screen.Books
            },
            onSkip = { screen = Screen.Books },
        )
        Screen.Books -> BooksScreen(
            user = user,
            onOpenBook = { book ->
                selectedBook = book
                screen = Screen.Detail
            },
            onLogout = {
                Api.setToken(null)
                prefs.edit().remove("token").apply()
                screen = Screen.Login
            },
            onChangeServer = {
                prefs.edit().remove("server_url").apply()
                screen = Screen.Server
            },
        )
        Screen.Detail -> selectedBook?.let { book ->
            DetailScreen(
                book = book,
                isAuthor = user?.optLong("id") == book.authorId,
                onBack = { screen = Screen.Books },
                onStartReading = { screen = Screen.Reader },
                onEdit = { screen = Screen.Editor },
            )
        }
        Screen.Editor -> selectedBook?.let { book ->
            EditorScreen(book = book, onBack = { screen = Screen.Detail })
        }
        Screen.Reader -> selectedBook?.let { book ->
            ReaderScreen(book = book, prefs = prefs, onBack = { screen = Screen.Detail })
        }
    }
}

@Composable
private fun ServerScreen(onConnected: (String) -> Unit) {
    var url by remember { mutableStateOf("") }
    var status by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    Surface(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier.fillMaxSize().padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text("InfoSphere", fontSize = 28.sp, modifier = Modifier.padding(bottom = 4.dp))
            Text("输入服务器地址以接入", fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(32.dp))
            OutlinedTextField(
                value = url,
                onValueChange = { url = it },
                label = { Text("例如 http://192.168.1.10:6969") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(16.dp))
            Button(
                onClick = {
                    loading = true
                    status = ""
                    scope.launch {
                        try {
                            val normalized = withContext(Dispatchers.IO) {
                                val trimmed = url.trim().trimEnd('/')
                                if (trimmed.startsWith("http")) trimmed else "http://" + trimmed
                            }
                            Api.configure(normalized)
                            Api.latest() // 探活
                            onConnected(normalized)
                        } catch (e: Exception) {
                            status = e.message ?: "连接失败"
                            loading = false
                        }
                    }
                },
                enabled = !loading && url.isNotBlank(),
                modifier = Modifier.fillMaxWidth(),
            ) { Text(if (loading) "连接中…" else "连 接") }
            if (status.isNotEmpty()) {
                Spacer(Modifier.height(12.dp))
                Text(status, color = MaterialTheme.colorScheme.error, fontSize = 13.sp)
            }
        }
    }
}

@Composable
private fun LoginScreen(onLoggedIn: (JSONObject, String) -> Unit, onSkip: () -> Unit) {
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var error by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    Surface(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier.fillMaxSize().padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text("登录 InfoSphere", fontSize = 24.sp, modifier = Modifier.padding(bottom = 28.dp))
            OutlinedTextField(value = username, onValueChange = { username = it },
                label = { Text("用户名") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(value = password, onValueChange = { password = it },
                label = { Text("密码") }, singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(20.dp))
            Button(
                onClick = {
                    loading = true
                    error = ""
                    scope.launch {
                        try {
                            val (user, token) = withContext(Dispatchers.IO) { Api.login(username, password) }
                            onLoggedIn(user, token)
                        } catch (e: Exception) {
                            error = e.message ?: "登录失败"
                            loading = false
                        }
                    }
                },
                enabled = !loading && username.isNotBlank() && password.isNotBlank(),
                modifier = Modifier.fillMaxWidth(),
            ) { Text(if (loading) "登录中…" else "登 录") }
            TextButton(onClick = onSkip) { Text("先逛逛（游客浏览）") }
            if (error.isNotEmpty()) {
                Spacer(Modifier.height(8.dp))
                Text(error, color = MaterialTheme.colorScheme.error, fontSize = 13.sp)
            }
        }
    }
}

private data class BookRow(
    val id: Long,
    val title: String,
    val description: String,
    val views: Int,
    val author: String,
    val authorId: Long,
)

private fun JSONObject.toBookRow(): BookRow = BookRow(
    id = optLong("id"),
    title = optString("title", "未命名"),
    description = optString("description", "暂无简介"),
    views = optInt("view_count", 0),
    author = optJSONObject("user")?.optString("username", "") ?: "",
    authorId = optJSONObject("user")?.optLong("id") ?: 0,
)

private data class NotificationRow(val id: Long, val title: String, val readAt: String?, val createdAt: String)

private fun JSONObject.toNotificationRow(): NotificationRow = NotificationRow(
    id = optLong("id"),
    title = optString("title"),
    readAt = if (isNull("read_at")) null else optString("read_at"),
    createdAt = optString("created_at"),
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun NotificationsSheet(
    onDismiss: () -> Unit,
    onAllRead: () -> Unit,
) {
    var items by remember { mutableStateOf<List<NotificationRow>?>(null) }
    var error by remember { mutableStateOf("") }
    var marking by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        try {
            items = withContext(Dispatchers.IO) { Api.notifications().first }.map { it.toNotificationRow() }
        } catch (e: Exception) {
            error = e.message ?: "加载失败"
            items = emptyList()
        }
    }

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("通知", fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
            TextButton(onClick = {
                marking = true
                scope.launch {
                    try {
                        withContext(Dispatchers.IO) { Api.markAllNotificationsRead() }
                        items = items?.map { it.copy(readAt = it.readAt ?: "now") }
                        onAllRead()
                    } catch (_: Exception) {
                    } finally {
                        marking = false
                    }
                }
            }) { Text(if (marking) "处理中…" else "全部已读") }
        }
        when {
            items == null -> Box(Modifier.fillMaxWidth().height(160.dp), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            error.isNotEmpty() -> Box(Modifier.fillMaxWidth().height(120.dp), contentAlignment = Alignment.Center) {
                Text(error, color = MaterialTheme.colorScheme.error)
            }
            items!!.isEmpty() -> Box(Modifier.fillMaxWidth().height(120.dp), contentAlignment = Alignment.Center) {
                Text("暂无通知", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            else -> LazyColumn(modifier = Modifier.fillMaxWidth().padding(bottom = 24.dp)) {
                items(items!!) { n ->
                    ListItem(
                        headlineContent = {
                            Text(
                                n.title,
                                fontSize = 14.sp,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis,
                                fontWeight = if (n.readAt == null) FontWeight.Medium else FontWeight.Normal,
                            )
                        },
                        supportingContent = { Text(n.createdAt.take(16).replace('T', ' '), fontSize = 12.sp) },
                        leadingContent = {
                            if (n.readAt == null) {
                                Box(Modifier.size(8.dp).background(MaterialTheme.colorScheme.primary, CircleShape))
                            }
                        },
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun BooksScreen(
    user: JSONObject?,
    onOpenBook: (BookRow) -> Unit,
    onLogout: () -> Unit,
    onChangeServer: () -> Unit,
) {
    var books by remember { mutableStateOf<List<BookRow>?>(null) }
    var error by remember { mutableStateOf("") }
    var keyword by remember { mutableStateOf("") }
    var unread by remember { mutableIntStateOf(0) }
    var showNotifications by remember { mutableStateOf(false) }
    var shelf by remember { mutableStateOf("mine") } // mine | favorites

    suspend fun loadBooks(title: String) {
        try {
            books = withContext(Dispatchers.IO) { Api.books(mine = user != null, title = title) }.map { it.toBookRow() }
        } catch (e: Exception) {
            error = e.message ?: "加载失败"
            books = emptyList()
        }
    }

    LaunchedEffect(user, shelf) {
        error = ""
        if (shelf == "favorites" && user != null) {
            try {
                books = withContext(Dispatchers.IO) { Api.favorites().first }.map { it.toBookRow() }
            } catch (e: Exception) {
                error = e.message ?: "加载失败"
                books = emptyList()
            }
            return@LaunchedEffect
        }
        loadBooks(keyword)
        if (user != null) {
            try {
                unread = withContext(Dispatchers.IO) { Api.unreadCount() }.toInt()
            } catch (_: Exception) {
            }
        }
    }

    // 搜索防抖：输入停顿 300ms 后按关键词拉取（收藏书架不走标题搜索）
    LaunchedEffect(keyword) {
        if (shelf == "mine" && (user != null || keyword.isNotEmpty())) {
            kotlinx.coroutines.delay(300)
            loadBooks(keyword)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("我的知识库") },
                actions = {
                    TextButton(onClick = onChangeServer) { Text("切换服务器") }
                    if (user != null) {
                        BadgedBox(badge = { if (unread > 0) Badge { Text(if (unread > 99) "99+" else unread.toString()) } }) {
                            IconButton(onClick = { showNotifications = true }) {
                                Text("🔔", fontSize = 18.sp)
                            }
                        }
                        TextButton(onClick = onLogout) { Text("退出") }
                    }
                },
            )
        },
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
        if (user != null) {
            Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp)) {
                listOf("mine" to "我的书籍", "favorites" to "收藏").forEach { (key, label) ->
                    TextButton(onClick = { shelf = key }) {
                        Text(
                            label,
                            fontSize = 14.sp,
                            fontWeight = if (shelf == key) FontWeight.SemiBold else FontWeight.Normal,
                            color = if (shelf == key) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
        when {
            books == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            error.isNotEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(error, color = MaterialTheme.colorScheme.error)
            }
            books!!.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(if (shelf == "favorites") "还没有收藏的书籍" else "暂无书籍", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            else -> Column(modifier = Modifier.fillMaxSize()) {
                if (shelf == "mine") {
                    OutlinedTextField(
                        value = keyword,
                        onValueChange = { keyword = it },
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                        placeholder = { Text("搜索书籍标题") },
                        singleLine = true,
                        trailingIcon = {
                            if (keyword.isNotEmpty()) {
                                Text(
                                    "清空",
                                    fontSize = 13.sp,
                                    color = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.padding(horizontal = 12.dp).clickable { keyword = "" },
                                )
                            }
                        },
                    )
                }
                LazyColumn(modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
                    items(books!!) { book ->
                        Card(
                            onClick = { onOpenBook(book) },
                            modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
                        ) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Text(book.title, fontSize = 16.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Spacer(Modifier.height(4.dp))
                                Text(book.description, fontSize = 13.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 2, overflow = TextOverflow.Ellipsis)
                                Spacer(Modifier.height(6.dp))
                                Text("浏览 ${book.views} · ${book.author}", fontSize = 12.sp,
                                    color = MaterialTheme.colorScheme.outline)
                            }
                        }
                    }
                }
            }
        }
        }
    }

    if (showNotifications) {
        NotificationsSheet(
            onDismiss = { showNotifications = false },
            onAllRead = { unread = 0 },
        )
    }
}

private data class ChapterRow(val id: Long, val title: String, val slug: String, val level: Int)

private data class CommentRow(val id: Long, val author: String, val content: String, val createdAt: String, val depth: Int)

private fun flattenComments(arr: JSONArray): List<CommentRow> {
    val out = mutableListOf<CommentRow>()
    fun walk(node: JSONObject, depth: Int) {
        out += CommentRow(
            id = node.optLong("id"),
            author = node.optJSONObject("user")?.optString("username", "") ?: "",
            content = node.optString("content"),
            createdAt = node.optString("created_at"),
            depth = depth,
        )
        val replies = node.optJSONArray("replies")
        if (replies != null) for (i in 0 until replies.length()) walk(replies.getJSONObject(i), depth + 1)
    }
    for (i in 0 until arr.length()) walk(arr.getJSONObject(i), 0)
    return out
}

@Composable
private fun CommentsSection(docId: Long) {
    var items by remember(docId) { mutableStateOf<List<CommentRow>?>(null) }
    var input by remember { mutableStateOf("") }
    var posting by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    suspend fun load() {
        try {
            items = withContext(Dispatchers.IO) { flattenComments(Api.comments(docId)) }
        } catch (e: Exception) {
            error = e.message ?: "评论加载失败"
            items = emptyList()
        }
    }
    LaunchedEffect(docId) { load() }

    Column(modifier = Modifier.fillMaxWidth().padding(top = 24.dp)) {
        Text("评论", fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(10.dp))
        if (Api.isLoggedIn()) {
            Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = input,
                    onValueChange = { input = it },
                    modifier = Modifier.weight(1f),
                    placeholder = { Text("说点什么…", fontSize = 13.sp) },
                    minLines = 1,
                    maxLines = 4,
                )
                Button(
                    onClick = {
                        if (input.isNotBlank()) {
                            posting = true
                            scope.launch {
                                try {
                                    withContext(Dispatchers.IO) { Api.addComment(docId, input.trim()) }
                                    input = ""
                                    load()
                                } catch (e: Exception) {
                                    error = e.message ?: "发表失败"
                                } finally {
                                    posting = false
                                }
                            }
                        }
                    },
                    enabled = !posting && input.isNotBlank(),
                ) { Text(if (posting) "…" else "发表") }
            }
        } else {
            Text("登录后可参与评论", fontSize = 13.sp, color = MaterialTheme.colorScheme.outline)
        }
        if (error.isNotEmpty()) {
            Spacer(Modifier.height(8.dp))
            Text(error, fontSize = 13.sp, color = MaterialTheme.colorScheme.error)
        }
        Spacer(Modifier.height(8.dp))
        when {
            items == null -> Box(Modifier.fillMaxWidth().height(60.dp), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            items!!.isEmpty() -> Text("还没有评论", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            else -> Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                items!!.forEach { c ->
                    Column(modifier = Modifier.fillMaxWidth().padding(start = (c.depth * 20).dp)) {
                        Text(
                            listOf(c.author.ifEmpty { "匿名" }, c.createdAt.take(10)).joinToString(" · "),
                            fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Text(c.content, fontSize = 14.sp, lineHeight = 21.sp)
                    }
                }
            }
        }
    }
}

private fun flattenChapters(array: JSONArray, level: Int = 0): List<ChapterRow> {
    val rows = mutableListOf<ChapterRow>()
    for (i in 0 until array.length()) {
        val node = array.optJSONObject(i) ?: continue
        rows.add(ChapterRow(node.optLong("id"), node.optString("title"), node.optString("slug"), level))
        node.optJSONArray("children")?.let { rows.addAll(flattenChapters(it, level + 1)) }
    }
    return rows
}

private data class BookDetail(
    val id: Long,
    val title: String,
    val description: String,
    val cover: String,
    val author: String,
    val tags: List<String>,
    val views: Int,
)

private fun JSONObject.toBookDetail(): BookDetail = BookDetail(
    id = optLong("id"),
    title = optString("title", "未命名"),
    description = optString("description", "暂无简介"),
    cover = optString("cover_image"),
    author = optJSONObject("user")?.optString("username", "") ?: "",
    tags = optJSONArray("tags")?.let { arr -> (0 until arr.length()).map { arr.getJSONObject(it).optString("name") } } ?: emptyList(),
    views = optInt("view_count", 0),
)

private fun coverUrl(cover: String): String? = when {
    cover.isBlank() -> null
    cover.startsWith("http") -> cover
    else -> Api.baseUrl + cover
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DetailScreen(
    book: BookRow,
    isAuthor: Boolean,
    onBack: () -> Unit,
    onStartReading: () -> Unit,
    onEdit: () -> Unit,
) {
    var detail by remember { mutableStateOf<BookDetail?>(null) }
    var error by remember { mutableStateOf("") }

    LaunchedEffect(book.id) {
        try {
            detail = withContext(Dispatchers.IO) { Api.book(book.id).toBookDetail() }
        } catch (e: Exception) {
            error = e.message ?: "加载失败"
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(detail?.title ?: book.title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                navigationIcon = {
                    TextButton(onClick = onBack) { Text("返回") }
                },
            )
        },
    ) { padding ->
        val d = detail
        when {
            d == null -> Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                if (error.isEmpty()) CircularProgressIndicator() else Text(error, color = MaterialTheme.colorScheme.error)
            }
            else -> Column(
                modifier = Modifier.fillMaxSize().padding(padding)
                    .verticalScroll(rememberScrollState()).padding(20.dp),
            ) {
                AsyncImage(
                    model = coverUrl(d.cover),
                    contentDescription = d.title,
                    modifier = Modifier.fillMaxWidth().height(190.dp).background(
                        MaterialTheme.colorScheme.surfaceVariant, MaterialTheme.shapes.medium,
                    ),
                    contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                )
                Spacer(Modifier.height(16.dp))
                Text(d.title, fontSize = 22.sp, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(6.dp))
                Text(
                    listOfNotNull(d.author.ifEmpty { null }, "浏览 ${d.views}").joinToString(" · "),
                    fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (d.tags.isNotEmpty()) {
                    Spacer(Modifier.height(10.dp))
                    androidx.compose.foundation.layout.Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        d.tags.take(5).forEach { tag ->
                            Surface(shape = MaterialTheme.shapes.small, color = MaterialTheme.colorScheme.secondaryContainer) {
                                Text(tag, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp))
                            }
                        }
                    }
                }
                Spacer(Modifier.height(14.dp))
                Text(d.description, fontSize = 15.sp, lineHeight = 23.sp)
                Spacer(Modifier.height(28.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Button(onClick = onStartReading, modifier = Modifier.weight(1f).height(48.dp)) {
                        Text("开始阅读")
                    }
                    if (isAuthor) {
                        OutlinedButton(onClick = onEdit, modifier = Modifier.weight(1f).height(48.dp)) {
                            Text("编辑章节")
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun EditorScreen(book: BookRow, onBack: () -> Unit) {
    var chapters by remember { mutableStateOf<List<ChapterRow>?>(null) }
    var selected by remember { mutableStateOf<ChapterRow?>(null) }
    var title by remember { mutableStateOf("") }
    var content by remember { mutableStateOf("") }
    var status by remember { mutableStateOf("draft") }
    var saving by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf("") }
    var error by remember { mutableStateOf("") }
    var showChapterPicker by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    suspend fun loadChapters() {
        chapters = withContext(Dispatchers.IO) { flattenChapters(Api.documents(book.id)) }
    }
    LaunchedEffect(book.id) {
        try {
            loadChapters()
        } catch (e: Exception) {
            error = e.message ?: "目录加载失败"
        }
    }

    val imagePicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) {
            scope.launch {
                try {
                    val bytes = withContext(Dispatchers.IO) {
                        context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                    } ?: return@launch
                    val name = "android-${System.currentTimeMillis()}.png"
                    val url = withContext(Dispatchers.IO) { Api.uploadImage(name, bytes) }
                    content += "\n![图片]($url)\n"
                    message = "图片已插入"
                } catch (e: Exception) {
                    error = e.message ?: "上传失败"
                }
            }
        }
    }

    fun save() {
        if (title.isBlank()) {
            error = "请填写章节标题"
            return
        }
        saving = true
        error = ""
        scope.launch {
            try {
                val doc = withContext(Dispatchers.IO) {
                    selected?.let { Api.updateDocument(it.id, title.trim(), content, status) }
                        ?: Api.createDocument(book.id, title.trim(), content, status)
                }
                loadChapters()
                selected = chapters?.find { it.id == doc.optLong("id") }
                message = "已保存"
            } catch (e: Exception) {
                error = e.message ?: "保存失败"
            } finally {
                saving = false
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (selected == null) "新建章节" else "编辑章节") },
                navigationIcon = { TextButton(onClick = onBack) { Text("返回") } },
                actions = { TextButton(onClick = { showChapterPicker = true }) { Text("章节") } },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding)
                .verticalScroll(rememberScrollState()).padding(20.dp),
        ) {
            Text(
                book.title,
                fontSize = 13.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = title,
                onValueChange = { title = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("章节标题") },
                singleLine = true,
            )
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("draft" to "草稿", "published" to "已发布").forEach { (key, label) ->
                    Surface(
                        shape = MaterialTheme.shapes.small,
                        color = if (status == key) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
                        onClick = { status = key },
                    ) {
                        Text(
                            label,
                            fontSize = 13.sp,
                            color = if (status == key) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
                        )
                    }
                }
                Spacer(Modifier.weight(1f))
                TextButton(onClick = { imagePicker.launch("image/*") }) { Text("插入图片") }
            }
            if (message.isNotEmpty()) {
                Spacer(Modifier.height(8.dp))
                Text(message, fontSize = 13.sp, color = MaterialTheme.colorScheme.primary)
            }
            if (error.isNotEmpty()) {
                Spacer(Modifier.height(8.dp))
                Text(error, fontSize = 13.sp, color = MaterialTheme.colorScheme.error)
            }
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = content,
                onValueChange = { content = it },
                modifier = Modifier.fillMaxWidth().height(360.dp),
                label = { Text("正文（Markdown）") },
            )
            Spacer(Modifier.height(20.dp))
            Button(onClick = { save() }, enabled = !saving, modifier = Modifier.fillMaxWidth().height(48.dp)) {
                Text(if (saving) "保存中…" else "保存")
            }
        }
    }

    if (showChapterPicker) {
        ModalBottomSheet(onDismissRequest = { showChapterPicker = false }) {
            Text("选择章节", fontSize = 16.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(horizontal = 20.dp))
            Spacer(Modifier.height(8.dp))
            ListItem(
                headlineContent = { Text("＋ 新建章节", fontWeight = FontWeight.Medium) },
                modifier = Modifier.fillMaxWidth().clickable {
                    selected = null; title = ""; content = ""; status = "draft"
                    showChapterPicker = false
                },
            )
            (chapters ?: emptyList()).forEach { chapter ->
                ListItem(
                    headlineContent = { Text("　".repeat(chapter.level) + chapter.title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                    modifier = Modifier.fillMaxWidth().clickable {
                        scope.launch {
                            try {
                                val doc = withContext(Dispatchers.IO) { Api.documentById(chapter.id) }
                                selected = chapter
                                title = doc.optString("title")
                                content = doc.optString("content")
                                status = doc.optString("status", "draft")
                                message = ""
                                error = ""
                                showChapterPicker = false
                            } catch (e: Exception) {
                                error = e.message ?: "读取失败"
                            }
                        }
                    },
                )
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ReaderScreen(book: BookRow, prefs: android.content.SharedPreferences, onBack: () -> Unit) {
    var chapters by remember { mutableStateOf<List<ChapterRow>?>(null) }
    var current by remember { mutableStateOf<Pair<ChapterRow, String>?>(null) }
    var error by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    LaunchedEffect(book) {
        try {
            val tree = withContext(Dispatchers.IO) { Api.documents(book.id) }
            chapters = flattenChapters(tree)
        } catch (e: Exception) {
            error = e.message ?: "加载章节失败"
        }
    }

    // 章节内容离线缓存：加载成功即写入，网络失败时回退缓存
    suspend fun loadChapter(chapter: ChapterRow) {
        val cacheKey = "${book.id}:${chapter.slug}"
        try {
            val content = withContext(Dispatchers.IO) { Api.document(book.id, chapter.slug) }
            current = chapter to content.optString("content")
            prefs.edit().putString("doc_cache_$cacheKey", content.optString("content")).apply()
        } catch (e: Exception) {
            val cached = prefs.getString("doc_cache_$cacheKey", null)
            if (cached != null) {
                current = chapter to cached
            } else {
                error = e.message ?: "加载章节失败"
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(current?.first?.title ?: book.title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                navigationIcon = {
                    TextButton(onClick = { if (current != null) current = null else onBack() }) {
                        Text(if (current != null) "目录" else "返回")
                    }
                },
            )
        },
    ) { padding ->
        when {
            error.isNotEmpty() -> Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                Text(error, color = MaterialTheme.colorScheme.error)
            }
            current != null -> {
                val (chapter, content) = current!!
                Column(
                    modifier = Modifier.fillMaxSize().padding(padding)
                        .verticalScroll(rememberScrollState()).padding(20.dp),
                ) {
                    Text(chapter.title, fontSize = 22.sp)
                    Spacer(Modifier.height(16.dp))
                    SelectionContainer {
                        if (content.isEmpty()) {
                            Text("（空文档）", fontSize = 15.sp)
                        } else {
                            Markdown(content, modifier = Modifier.fillMaxWidth())
                        }
                    }
                    CommentsSection(docId = chapter.id)
                }
            }
            else -> LazyColumn(modifier = Modifier.fillMaxSize().padding(padding)) {
                val list = chapters
                if (list == null) {
                    item {
                        Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator()
                        }
                    }
                } else if (list.isEmpty()) {
                    item {
                        Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                            Text("本书暂无章节", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                } else {
                    items(list) { chapter ->
                        ListItem(
                            headlineContent = {
                                Text(
                                    "　".repeat(chapter.level) + chapter.title,
                                    maxLines = 1, overflow = TextOverflow.Ellipsis,
                                )
                            },
                            modifier = Modifier.fillMaxWidth().clickable {
                                scope.launch { loadChapter(chapter) }
                            },
                        )
                    }
                }
            }
        }
    }
}
