const express = require('express')
const { asyncHandler } = require('../middleware/async-handler')
const router = express.Router()
const User = require('../models/user')
const githubPassport = require('../services/passport/github')

router.get('/login', asyncHandler(async (req, res) => {
    if (req.user) {
        return res.render('pages/user/already-logged-in', {
            user: req.user
        })
    }

    const error = req.query.error
    let errorMessage
    switch (error) {
        case 'github_auth_failed':
            errorMessage = 'GitHub 身份验证失败'
            break
        case 'github_login_failed':
            errorMessage = 'GitHub 登录失败'
            break
        case 'auth_failed':
            errorMessage = '身份验证失败'
            break
        case 'login_failed':
            errorMessage = '登录失败'
            break
        default:
            errorMessage = ''
    }
    req.flash('error', errorMessage)

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

router.get('/github', githubPassport.authenticate('github', {
    scope: ['user:email']
}))

router.get('/github/callback',
    githubPassport.authenticate('github', { failureRedirect: '/auth/login?error=github_auth_failed' }),
    async (req, res) => {
        try {
            // 检查是否是绑定操作的结果
            if (req.user && typeof req.user === 'object') {
                // 检查绑定错误
                if (req.user.bindingError) {
                    if (req.user.bindingError === 'github_already_linked') {
                        req.flash('error', '该 GitHub 账号已被其他用户绑定')
                        return res.redirect('/user/security')
                    }
                    if (req.user.bindingError === 'already_linked_self') {
                        req.flash('error', '您已经绑定了该 GitHub 账号')
                        return res.redirect('/user/security')
                    }
                }

                // 检查绑定成功
                if (req.user.bindingSuccess) {
                    try {
                        await User.addAuthentication(req.user.id, req.user.authData)
                        req.flash('success', 'GitHub 账号绑定成功')
                    }
                    catch (error) {
                        console.error('绑定GitHub失败:', error)
                        req.flash('error', '绑定失败: ' + error.message)
                    }
                    return res.redirect('/user/security')
                }
            }

            // 正常登录流程
            if (req.user && req.user.id) {
                await User.updateLastLogin(req.user.id)
            }

            const returnTo = req.session.returnTo || '/'
            delete req.session.returnTo
            res.redirect(returnTo)
        }
        catch (error) {
            console.error('GitHub callback error:', error)
            res.redirect('/auth/login?error=github_login_failed')
        }
    }
)

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