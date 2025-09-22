const express = require('express')
const http = require('http')
const path = require('path')
const bodyParser = require('body-parser')
const multer = require('multer')
const flash = require('connect-flash')
const session = require('express-session')
const MySQLStore = require('express-mysql-session')(session)
const passport = require('passport')
const LocalStrategy = require('passport-local').Strategy
const methodOverride = require('method-override')
const socketIo = require('socket.io')
const marked = require('./lib/extension/marked/marked')
const { createInstallationChecker } = require('./middleware/installation-checker')
const { handle404, handleError } = require('./middleware/error-handlers')
const { initializeSocketHandlers } = require('./middleware/socket-handler')

const app = express()

// Socket.IO
const server = http.createServer(app)
const io = socketIo(server)
app.set('io', io)

initializeSocketHandlers(io)

const PORT = process.env.PORT || 6969

// 配置视图
app.set('view engine', 'ejs')
app.set('views', path.join(__dirname, '../frontend/views'))
app.set('trust proxy', 1)

// 配置中间件
app.use(bodyParser.json({ limit: '10mb' }))
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }))
// 处理 multipart/form-data
const storage = multer.memoryStorage() // 使用内存存储，直接传给七牛云
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
        files: 5
    }
})
app.use((req, res, next) => {
    const contentType = req.headers['content-type']
    if (contentType && contentType.includes('multipart/form-data')) {
        upload.any()(req, res, next) // 接受任何字段的任何文件
    }
    else {
        next()
    }
})

app.use(express.static(path.join(__dirname, '../frontend/public')))

// 转换 _method 为指定请求
app.use(methodOverride(function (req, res) {
    if (req.body && typeof req.body === 'object' && '_method' in req.body) {
        const method = req.body._method
        delete req.body._method
        return method
    }
}))

// 应用安装中间件
const installChecker = createInstallationChecker({
    envPath: '.env',
    setupRoute: '/setup',
    excludeRoutes: [
        '/setup',
        '/css/*',
        '/js/*',
        '/images/*'
    ]
})

// 检查是否已安装，决定是否初始化数据库连接
const isInstalled = installChecker.isInstalled()
let sessionStore
let User = null // 延迟加载用户模型

if (isInstalled) {
    try {
        const { getPool } = require('./tools/db')
        const pool = getPool()
        sessionStore = new MySQLStore({}, pool)
        User = require('./models/user') // 假设有 User.findById / User.login
        console.log('数据库连接池已初始化')
    }
    catch (error) {
        console.error('初始化数据库连接失败:', error.message)
        // 使用内存存储作为后备
        sessionStore = null
    }
}

// 配置 session
const sessionConfig = {
    secret: process.env.SESSION_SECRET || 'InfoSphere-Secret-Key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: 'lax'
    }
}

// 只有在已安装且数据库连接成功时才使用MySQL存储
if (sessionStore) {
    sessionConfig.store = sessionStore
}

app.use(session(sessionConfig))
app.use(flash())

// ==================== Passport 配置 ====================
if (isInstalled && User) {
    app.use(passport.initialize())
    app.use(passport.session())

    passport.serializeUser((user, done) => {
        done(null, user.id) // 存入 session
    })

    passport.deserializeUser(async (id, done) => {
        try {
            const user = await User.findById(id)
            done(null, user)
        }
        catch (err) {
            done(err)
        }
    })

    passport.use(new LocalStrategy(
        { usernameField: 'username', passwordField: 'password' },
        async (username, password, done) => {
            try {
                const user = await User.login(username, password)
                if (!user) {
                    return done(null, false, { message: '用户名或密码错误' })
                }
                return done(null, user)
            }
            catch (err) {
                return done(err)
            }
        }
    ))
}

// 应用安装检查中间件
app.use(installChecker.middleware())

// 模板基础信息中间件
app.use(require('./middleware/template-inject'))

// 注册路由
app.use('/', require('./routes/index'))

// 错误处理中间件
app.use(handle404)
app.use(handleError)

// 启动服务
server.listen(PORT, () => {
    console.log(`🚀 服务运行在 http://localhost:${ PORT }`)
    if (isInstalled) {
        console.log('✅ 系统已安装，数据库连接正常')
    }
    else {
        console.log('⚠️  系统未安装，请访问 /setup 进行安装')
    }
})