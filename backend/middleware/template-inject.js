/**
 * 模板注入中间件
 * 为所有模板提供通用的局部变量
 */
const moment = require('moment')
const SiteConfig = require('../models/site-configs')

const templateInject = async (req, res, next) => {
    try {
        // 用户认证信息
        res.locals.user = req.user || null
        res.locals.isAuthenticated = !!req.user

        res.locals.site = await SiteConfig.findAll()

        // 当前路径
        res.locals.activePath = req.originalUrl

        // Flash 消息处理
        const success = req.flash('success')
        const error = req.flash('error')
        res.locals.success = success.length > 0 ? success : null
        res.locals.error = error.length > 0 ? error : null

        // 第三方
        res.locals.moment = moment

        next()
    }
    catch (err) {
        next(err)
    }
}

module.exports = templateInject