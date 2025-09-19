const express = require('express')
const { ensureAuthenticated } = require('../middleware/auth-handler')
const User = require('../models/user')
const { asyncHandler } = require('../middleware/async-handler')
const router = express.Router()

router.get('/profile', ensureAuthenticated, asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id)

    res.render('pages/user/profile', {
        title: '用户信息',
        user
    })
}))

router.put('/profile', ensureAuthenticated, asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id)
    if (!user) {
        req.flash('error', '用户不存在')
        return res.redirect('/user/profile')
    }

    await User.update(req.user.id, req.body)
    req.flash('success', '用户信息更新成功')
    return res.redirect('/user/profile')
}))

router.get('/security', ensureAuthenticated, asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id)

    res.render('pages/user/security', {
        title: '安全信息',
        user
    })
}))

router.put('/security', ensureAuthenticated, asyncHandler(async (req, res, next) => {
    const user = await User.findById(req.user.id)
    if (!user) {
        req.flash('error', '用户不存在')
        return res.redirect('/user/security')
    }

    const { old_password, new_password, confirm_password } = req.body

    if (new_password !== confirm_password) {
        req.flash('error', '两次输入的密码不一致')
        return res.redirect('/user/security')
    }

    if (!await User.verifyPassword(old_password, user.password)) {
        req.flash('error', '旧密码错误')
        return res.redirect('/user/security')
    }

    if (await User.updatePassword(user.id, new_password)) {
        req.logout((err) => {
            if (err) {
                return next(err)
            }
            req.flash('success', '密码更新成功，请重新登录！')
            res.redirect('/auth/login')
        })
    }
    else {
        req.flash('error', '密码更新失败')
        return res.redirect('/user/security')
    }
}))

module.exports = router