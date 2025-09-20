/**
 * 模板注入中间件
 * 为所有模板提供通用的局部变量
 */
const moment = require('moment')
const SiteConfig = require('../models/site-config')

const templateInject = async (req, res, next) => {
    try {
        // 用户认证信息
        res.locals.user = req.user || req.session.user || null
        res.locals.isAuthenticated = !!req.user || !!req.session.user

        // 站点配置 - 检查系统是否已安装
        try {
            // 检查是否已安装（通过环境变量或其他方式）
            if (process.env.INSTALLED === 'true') {
                res.locals.site = await SiteConfig.findAll()
            }
            else {
                // 未安装状态，提供默认配置
                res.locals.site = {
                    site_name: '系统安装中...',
                    site_description: '',
                    timezone: 'Asia/Shanghai'
                }
            }
        }
        catch (error) {
            console.warn('获取站点配置失败:', error.message)
            // 数据库连接失败或未初始化，使用默认配置
            res.locals.site = {
                site_name: '系统配置中...',
                site_description: '',
                timezone: 'Asia/Shanghai'
            }
        }

        // 当前路径
        res.locals.activePath = req.originalUrl

        // Flash 消息处理
        const success = req.flash('success')
        const error = req.flash('error')
        res.locals.success = success.length > 0 ? success : null
        res.locals.error = error.length > 0 ? error : null
        const customSuccess = req.flash('customSuccess')
        const customError = req.flash('customError')
        res.locals.customSuccess = customSuccess.length > 0 ? customSuccess : null
        res.locals.customError = customError.length > 0 ? customError : null

        // 第三方
        res.locals.moment = moment
        res.locals.enableGitHub = (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET)

        next()
    }
    catch (err) {
        next(err)
    }
}

module.exports = templateInject