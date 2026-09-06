package org.devlive.infosphere

import android.content.Context
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
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
private enum class Screen { Server, Login, Books, Reader }

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
                screen = Screen.Reader
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
        Screen.Reader -> selectedBook?.let { book ->
            ReaderScreen(book = book, onBack = { screen = Screen.Books })
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

private data class BookRow(val id: Long, val title: String, val description: String, val views: Int, val author: String)

private fun JSONObject.toBookRow(): BookRow = BookRow(
    id = optLong("id"),
    title = optString("title", "未命名"),
    description = optString("description", "暂无简介"),
    views = optInt("view_count", 0),
    author = optJSONObject("user")?.optString("username", "") ?: "",
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

    suspend fun loadBooks(title: String) {
        try {
            books = withContext(Dispatchers.IO) { Api.books(mine = user != null, title = title) }.map { it.toBookRow() }
        } catch (e: Exception) {
            error = e.message ?: "加载失败"
            books = emptyList()
        }
    }

    LaunchedEffect(user) {
        loadBooks("")
        if (user != null) {
            try {
                unread = withContext(Dispatchers.IO) { Api.unreadCount() }.toInt()
            } catch (_: Exception) {
            }
        }
    }

    // 搜索防抖：输入停顿 300ms 后按关键词拉取
    LaunchedEffect(keyword) {
        if (user != null || keyword.isNotEmpty()) {
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
        when {
            books == null -> Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            error.isNotEmpty() -> Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                Text(error, color = MaterialTheme.colorScheme.error)
            }
            books!!.isEmpty() -> Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                Text("暂无书籍", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            else -> Column(modifier = Modifier.fillMaxSize().padding(padding)) {
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

    if (showNotifications) {
        NotificationsSheet(
            onDismiss = { showNotifications = false },
            onAllRead = { unread = 0 },
        )
    }
}

private data class ChapterRow(val id: Long, val title: String, val slug: String, val level: Int)

private fun flattenChapters(array: JSONArray, level: Int = 0): List<ChapterRow> {
    val rows = mutableListOf<ChapterRow>()
    for (i in 0 until array.length()) {
        val node = array.optJSONObject(i) ?: continue
        rows.add(ChapterRow(node.optLong("id"), node.optString("title"), node.optString("slug"), level))
        node.optJSONArray("children")?.let { rows.addAll(flattenChapters(it, level + 1)) }
    }
    return rows
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ReaderScreen(book: BookRow, onBack: () -> Unit) {
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
                        Text(content.ifEmpty { "（空文档）" }, fontSize = 15.sp, lineHeight = 24.sp)
                    }
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
                                scope.launch {
                                    try {
                                        val doc = withContext(Dispatchers.IO) {
                                            Api.document(book.id, chapter.slug)
                                        }
                                        current = chapter to doc.optString("content", "")
                                    } catch (e: Exception) {
                                        error = e.message ?: "读取失败"
                                    }
                                }
                            },
                        )
                    }
                }
            }
        }
    }
}
