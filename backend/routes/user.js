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

module.exports = router