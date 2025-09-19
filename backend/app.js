const express = require('express')
const http = require('http')
const path = require('path')
const bodyParser = require('body-parser')
const flash = require('connect-flash')
const session = require('express-session')
const { createInstallationChecker } = require('./middleware/installation-checker')

const app = express()
const server = http.createServer(app)
const PORT = process.env.PORT || 6969

// 配置视图
app.set('view engine', 'ejs')
app.set('views', path.join(__dirname, '../frontend/views'))
app.set('trust proxy', 1)

// 配置中间件
app.use(bodyParser.json({ limit: '10mb' }))
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }))
app.use(express.static(path.join(__dirname, '../frontend/public')))

// 配置 session
app.use(session({
    secret: process.env.SESSION_SECRET || 'InfoSphere-Secret-Key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: 'lax'
    }
}))
app.use(flash())

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
app.use(installChecker.middleware())

// 模板基础信息中间件
app.use(require('./middleware/template-inject'))

// 注册路由
app.use('/', require('./routes/index'))

// 启动服务
server.listen(PORT, () => {
    console.log(`🚀 服务运行在 http://localhost:${ PORT }`)
})