const express = require('express')
const { asyncHandler } = require('../middleware/async-handler')
const router = express.Router()
const User = require('../models/user')

router.get('/login', asyncHandler(async (req, res) => {
    res.render('pages/user/login')
}))

router.post('/login', asyncHandler(async (req, res) => {
    const { username, password, remember_me } = req.body

    try {
        const user = await User.login(username, password)

        // 设置用户session
        if (user) {
            req.session.user = user
        }

        // 处理"记住我"功能
        if (remember_me) {
            req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000
        }

        const redirectUrl = req.session.redirectUrl || '/'
        delete req.session.redirectUrl
        res.redirect(redirectUrl)
    }
    catch (error) {
        req.flash('error', error.message)
        return res.redirect('/auth/login')
    }
}))

module.exports = router