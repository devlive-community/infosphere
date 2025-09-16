const fs = require('fs')
const path = require('path')

/**
 * 安装检测中间件
 * 检查 .env 配置文件是否存在及配置是否完整
 * 如果未安装则跳转到 /setup 路由
 */
class InstallationChecker {
    constructor(options = {}) {
        // 配置选项
        this.options = {
            envPath: options.envPath || '.env',
            setupRoute: options.setupRoute || '/setup',
            requiredEnvVars: options.requiredEnvVars || [],
            excludeRoutes: options.excludeRoutes || ['/setup', '/api/setup'],
            checkDatabase: options.checkDatabase || false,
            ...options
        }

        this.isInstalled = null // 缓存安装状态
    }

    /**
     * 检查 .env 文件是否存在
     */
    checkEnvFile() {
        try {
            const envPath = path.resolve(this.options.envPath)
            return fs.existsSync(envPath)
        }
        catch (error) {
            console.error('检查 .env 文件时出错:', error)
            return false
        }
    }

    /**
     * 检查必需的环境变量
     */
    checkRequiredEnvVars() {
        if (this.options.requiredEnvVars.length === 0) {
            return true
        }

        for (const varName of this.options.requiredEnvVars) {
            if (!process.env[varName] || process.env[varName].trim() === '') {
                console.log(`缺少必需的环境变量: ${ varName }`)
                return false
            }
        }
        return true
    }

    /**
     * 检查数据库连接
     */
    async checkDatabase() {
        if (!this.options.checkDatabase) {
            return true
        }

        try {
            if (this.options.databaseChecker && typeof this.options.databaseChecker === 'function') {
                return await this.options.databaseChecker()
            }
            return true
        }
        catch (error) {
            console.error('数据库连接检查失败:', error)
            return false
        }
    }

    /**
     * 执行完整的安装检查
     */
    async performInstallationCheck() {
        // 检查 .env 文件
        if (!this.checkEnvFile()) {
            return false
        }

        // 检查必需环境变量
        if (!this.checkRequiredEnvVars()) {
            return false
        }

        // 检查数据库连接
        return await this.checkDatabase()
    }

    /**
     * 检查路由是否应该被排除
     */
    shouldExcludeRoute(path) {
        return this.options.excludeRoutes.some(route => {
            if (route.endsWith('*')) {
                // 支持通配符匹配
                return path.startsWith(route.slice(0, -1))
            }
            return path === route || path.startsWith(route + '?')
        })
    }

    /**
     * 中间件函数
     */
    middleware() {
        return async (req, res, next) => {
            // 如果是被排除的路由，直接跳过检查
            if (this.shouldExcludeRoute(req.path)) {
                return next()
            }

            // 如果已经缓存了安装状态且为已安装，直接跳过
            if (this.isInstalled === true) {
                return next()
            }

            try {
                // 执行安装检查
                const installationStatus = await this.performInstallationCheck()

                if (!installationStatus) {
                    // 未安装，缓存状态并跳转到设置页面
                    this.isInstalled = false

                    return res.redirect(this.options.setupRoute)
                }
                else {
                    // 已安装，缓存状态
                    this.isInstalled = true
                    return next()
                }
            }
            catch (error) {
                console.error('安装检查中间件出错:', error)

                return res.redirect(this.options.setupRoute)
            }
        }
    }

    /**
     * 重置安装状态缓存（在完成安装后调用）
     */
    resetCache() {
        this.isInstalled = null
    }

    /**
     * 手动设置安装状态
     */
    setInstallationStatus(status) {
        this.isInstalled = status
    }
}

function createInstallationChecker(options = {}) {
    const checker = new InstallationChecker(options)
    return {
        middleware: checker.middleware.bind(checker),
        resetCache: checker.resetCache.bind(checker),
        setInstallationStatus: checker.setInstallationStatus.bind(checker),
        checkStatus: checker.performInstallationCheck.bind(checker)
    }
}

module.exports = {
    InstallationChecker,
    createInstallationChecker
}