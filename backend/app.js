const express = require('express')
const http = require('http')
const path = require('path')
const bodyParser = require('body-parser')
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

// 创建安装检查中间件
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

// 应用安装检查中间件
app.use(installChecker.middleware())

// 注册路由
app.use('/', require('./routes/index'))

// 启动服务
server.listen(PORT, () => {
    console.log(`🚀 服务运行在 http://localhost:${ PORT }`)
})