const ensureAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next()
    }

    req.session.returnTo = req.originalUrl
    req.flash('error', '请登录以访问此页面')
    res.redirect('/auth/login')
}

const ensureOwnerOrAdmin = (req, res, next) => {
    const targetUserId = req.params.id || req.body.userId
    const currentUserId = req.user.id

    if (targetUserId === currentUserId.toString() || req.user.role === 'admin') {
        return next()
    }

    req.flash('error', '您没有权限执行此操作')
    return res.redirect('/user/profile')
}

module.exports = { ensureAuthenticated, ensureOwnerOrAdmin }