/**
 * 404 错误处理中间件
 * 当没有匹配的路由时调用
 */
const handle404 = (req, res, next) => {
    res.status(404).render('pages/error/global', {
        title: '页面未找到',
        error: {
            status: 404,
            title: '页面未找到',
            message: '您请求的页面不存在或已被移除。'
        },
        user: req.user || null
    })
}

/**
 * 全局错误处理中间件
 * 处理应用中的所有错误
 */
const handleError = (err, req, res, next) => {
    console.error('服务器错误:', err.stack)

    // 如果响应已经发送，交给默认的Express错误处理器
    if (res.headersSent) {
        return next(err)
    }

    // 确定错误状态码
    const status = err.status || err.statusCode || 500

    // 500错误直接渲染独立页面
    if (status >= 500) {
        return res.status(500).render('pages/error/500', {
            title: '服务器错误',
            error: {
                status: 500,
                message: '服务器错误',
                stack: process.env.NODE_ENV === 'development' ? err.stack : null
            }
        })
    }

    // 其他错误使用通用错误页面
    let message = '发生了错误'
    let title = '错误'

    if (status === 400) {
        title = '请求错误'
        message = '请求参数有误'
    }
    else if (status === 401) {
        title = '未授权访问'
        message = '请先登录系统'
    }
    else if (status === 403) {
        title = '权限不足'
        message = '您没有访问此资源的权限'
    }
    else if (status === 404) {
        title = '页面未找到'
        message = '您请求的页面不存在'
    }

    res.status(status).render('pages/error', {
        title: title,
        error: {
            status: status,
            title: title,
            message: message
        },
        user: req.user || null
    })
}

module.exports = {
    handle404,
    handleError
}