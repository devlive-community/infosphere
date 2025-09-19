const express = require('express')
const { asyncHandler } = require('../middleware/async-handler')
const router = express.Router()
const crypto = require('crypto')
const path = require('path')
const fs = require('fs')
const { createInstallationChecker } = require('../middleware/installation-checker')
const { testConnection, initializeDatabase } = require('../tools/db')

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

router.get('/', installChecker.preventReinstall(), asyncHandler(async (req, res) => {
    res.render('pages/setup/install', {
        title: '系统安装配置',
        secret: crypto.randomBytes(24).toString('hex').toUpperCase()
    })
}))

router.post('/', installChecker.preventReinstall(), asyncHandler(async (req, res) => {
    const {
        DB_HOST,
        DB_PORT,
        DB_NAME,
        DB_USER,
        DB_PASSWORD,
        APP_SECRET,
        TIMEZONE,
        site_name,
        site_description,
        admin_username,
        admin_email,
        admin_password,
        admin_password_confirm
    } = req.body

    // 验证必填字段
    if (!site_name || !site_description || !DB_HOST || !DB_PORT || !DB_NAME || !DB_USER || !admin_username || !admin_email || !admin_password) {
        req.flash('error', '请填写所有必需字段')
        return res.redirect('/setup')
    }

    // 验证密码确认
    if (admin_password !== admin_password_confirm) {
        req.flash('error', '两次密码不匹配')
        return res.redirect('/setup')
    }

    // 验证数据库连接
    const response = await testConnection({DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME })
    if (!response.result) {
        try {
            const envPath = path.resolve('.env')
            if (fs.existsSync(envPath)) {
                fs.unlinkSync(envPath)
                console.log('.env 文件已删除')
            }
        } catch (deleteError) {
            console.error('删除 .env 文件失败:', deleteError)
        }

        req.flash('error', `数据库连接失败，请检查相关配置\n${response.message}`)
        return res.redirect('/setup')
    }

    // 创建 .env 文件内容
    const envContent = `# 应用配置
APP_SECRET=${ APP_SECRET }
NODE_ENV=production
PORT=6969

# 数据库配置
DB_HOST=${ DB_HOST }
DB_PORT=${ DB_PORT }
DB_NAME=${ DB_NAME }
DB_USER=${ DB_USER }
DB_PASSWORD=${ DB_PASSWORD || '' }

# 时区配置
TZ=${ TIMEZONE }

# 安装状态
INSTALLED=true
`

    // 写入 .env 文件
    const envPath = path.resolve('.env')
    fs.writeFileSync(envPath, envContent)

    // 重新加载环境变量
    require('dotenv').config()

    // 加载数据库/数据表
    const siteConfig = {
        site_name,
        site_description,
        timezone: TIMEZONE
    }

    const adminConfig = {
        admin_username,
        admin_email,
        admin_password
    }

    const initResult = await initializeDatabase(siteConfig, adminConfig)

    if (!initResult.success) {
        try {
            const envPath = path.resolve('.env')
            if (fs.existsSync(envPath)) {
                fs.unlinkSync(envPath)
                console.log('.env 文件已删除')
            }
        } catch (deleteError) {
            console.error('删除 .env 文件失败:', deleteError)
        }

        req.flash('error', '数据库初始化失败：' + initResult.message)
        return res.redirect('/setup')
    }

    res.locals.site = {
        site_name: site_name,
        site_description: site_description,
        admin_username: admin_username,
        timezone: 'Asia/Shanghai'
    }
    res.render('pages/setup/success', { title: '系统安装完成' })
}))

module.exports = router