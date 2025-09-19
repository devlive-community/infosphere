const express = require('express')
const { asyncHandler } = require('../middleware/async-handler')
const router = express.Router()
const User = require('../models/user')

router.get('/login', asyncHandler(async (req, res) => {
    res.render('pages/user/login')
}))

router.post('/login', asyncHandler(async (req, res, next) => {
    const { username, password, remember_me } = req.body

    try {
        const user = await User.login(username, password)

        req.login(user, (err) => {
            if (err) {
                return next(err)
            }

            if (remember_me) {
                req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000
            }

            const redirectUrl = req.session.redirectUrl || '/'
            delete req.session.redirectUrl
            return res.redirect(redirectUrl)
        })
    }
    catch (error) {
        req.flash('error', error.message)
        return res.redirect('/auth/login')
    }
}))

router.get('/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) {
            return next(err)
        }
        req.session.destroy((err) => {
            if (err) {
                console.error('销毁会话错误:', err)
            }
            res.redirect('/')
        })
    })
})

module.exports = router