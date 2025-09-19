const mysql = require('mysql2/promise')
const dotenv = require('dotenv')
const bcrypt = require('bcrypt')

dotenv.config()

// 全局连接池变量
let pool = null

// 创建连接池的函数
const createPool = (config = null) => {
    const dbConfig = config || {
        host: process.env.DB_HOST || '127.0.0.1',
        port: parseInt(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'infosphere'
    }

    return mysql.createPool({
        ...dbConfig,
        waitForConnections: true,
        timezone: '+08:00',
        dateStrings: true,
        connectionLimit: 20,
        acquireTimeout: 60000,
        timeout: 60000,
        reconnect: true,
        idleTimeout: 300000,
        queueLimit: 50
    })
}

// 初始化连接池（如果环境变量存在的话）
if (process.env.DB_HOST && process.env.DB_USER) {
    pool = createPool()
}

// 获取连接池
const getPool = () => {
    if (!pool) {
        throw new Error('数据库连接池未初始化，请先调用 updatePool() 方法')
    }
    return pool
}

// 更新连接池
const updatePool = (config = null) => {
    // 关闭旧的连接池
    if (pool) {
        pool.end().catch(err => {
            console.warn('关闭旧连接池时出错:', err.message)
        })
    }

    // 创建新的连接池
    pool = createPool(config)
    console.log('数据库连接池已更新')
    return pool
}

// 测试数据库连接
const testConnection = async (dbConfig = null) => {
    try {
        let config

        if (dbConfig) {
            config = {
                host: dbConfig.DB_HOST || '127.0.0.1',
                port: parseInt(dbConfig.DB_PORT) || 3306,
                user: dbConfig.DB_USER,
                password: dbConfig.DB_PASSWORD,
                database: dbConfig.DB_NAME
            }
        }
        else {
            config = {
                host: process.env.DB_HOST || '127.0.0.1',
                port: parseInt(process.env.DB_PORT) || 3306,
                user: process.env.DB_USER,
                password: process.env.DB_PASSWORD,
                database: process.env.DB_NAME
            }
        }

        const connection = await mysql.createConnection(config)
        await connection.end()
        return { result: true, message: '数据库连接成功' }
    }
    catch (error) {
        console.error('Database connection error:', error.message)
        return { result: false, message: error.message }
    }
}

// 初始化数据库数据表
const initializeDatabase = async (siteConfig, adminConfig) => {
    const fs = require('fs')
    const path = require('path')
    let connection

    try {
        // 确保连接池是最新的
        if (!pool) {
            updatePool()
        }

        connection = await getPool().getConnection()

        console.log('开始初始化数据库...')

        // 读取并执行 schema.sql 文件
        const schemaPath = path.join(__dirname, '../scripts/schema.sql')

        if (!fs.existsSync(schemaPath)) {
            throw new Error(`数据库脚本文件不存在: ${ schemaPath }`)
        }

        const schemaSql = fs.readFileSync(schemaPath, 'utf8')
        console.log('读取数据库脚本文件成功')

        // 分割SQL语句（按分号分割，过滤空语句）
        const statements = schemaSql
            .split(';')
            .map(stmt => stmt.trim())
            .filter(stmt => stmt.length > 0)

        console.log(`准备执行 ${ statements.length } 条SQL语句`)

        // 执行每条SQL语句
        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i]
            try {
                await connection.execute(statement)
                console.log(`✅ SQL语句 ${ i + 1 }/${ statements.length } 执行成功`)
            }
            catch (error) {
                console.error(`❌ SQL语句 ${ i + 1 } 执行失败:`, statement)
                throw error
            }
        }

        console.log('数据库表结构创建完成')

        // 插入管理员账户
        const User = require('../models/user')
        await User.create({
            username: adminConfig.admin_username,
            email: adminConfig.admin_email,
            password: adminConfig.admin_password,
            role: 'admin'
        })
        console.log('管理员账户创建完成')

        // 读取 package.json 获取版本号
        let version = '1.0.0' // 默认版本
        try {
            const packagePath = path.join(__dirname, '../../package.json')
            const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
            version = packageJson.version || '1.0.0'
        }
        catch (error) {
            console.warn('读取 package.json 版本失败，使用默认版本:', error.message)
        }

        const siteConfigs = [
            ['site_name', siteConfig.site_name, '站点名称'],
            ['site_description', siteConfig.site_description, '站点描述'],
            ['timezone', siteConfig.timezone, '时区设置'],
            ['installation_date', new Date().toISOString(), '安装日期'],
            ['version', version, '系统版本']
        ]

        const SiteConfig = require('../models/site-config')
        for (const [key, value, desc] of siteConfigs) {
            await SiteConfig.update(key, value, desc)
        }

        console.log('站点配置保存完成')
        console.log('数据库初始化完成')

        return { success: true, message: '数据库初始化成功' }

    }
    catch (error) {
        console.error('数据库初始化失败:', error)
        return { success: false, message: error.message }
    }
    finally {
        if (connection) {
            connection.release()
        }
    }
}

module.exports = {
    get pool() {
        return getPool()
    },
    getPool,
    updatePool,
    testConnection,
    initializeDatabase
}