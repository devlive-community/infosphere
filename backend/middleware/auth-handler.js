const ensureAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next()
    }

    req.session.returnTo = req.originalUrl
    req.flash('error', '请登录以访问此页面')
    res.redirect('/auth/login')
}

module.exports = { ensureAuthenticated }