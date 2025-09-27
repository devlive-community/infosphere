const express = require('express')
const { asyncHandler } = require('../middleware/async-handler')
const router = express.Router()
const User = require('../models/user')
const githubPassport = require('../services/passport/github')
const { ensureAuthenticated, ensureOwnerOrAdmin } = require('../middleware/auth-handler')

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

            const returnTo = req.session.returnTo || req.session.originalUrl || '/'
            delete req.session.returnTo
            delete req.session.originalUrl
            res.redirect(returnTo)
        }
        catch (error) {
            console.error('GitHub callback error:', error)
            res.redirect('/auth/login?error=github_login_failed')
        }
    }
)

router.delete('/unlink/:provider', ensureAuthenticated, asyncHandler(async (req, res) => {
    const { provider } = req.params
    const userId = req.user.id

    try {
        // 检查用户是否绑定了该第三方账号
        const authentications = await User.getAuthentications(userId)
        const targetAuth = authentications.find(auth => auth.provider === provider)

        if (!targetAuth) {
            req.flash('error', `未找到绑定的 ${ provider } 账号`)
            return res.redirect('/user/security')
        }

        // 检查是否是唯一登录方式
        const user = await User.findForAuth(req.user.username || req.user.email)
        if ((!user.password || user.password === '') && authentications.length === 1) {
            req.flash('error', '这是您唯一的登录方式，请先设置密码后再解绑')
            return res.redirect('/user/security')
        }

        await User.removeAuthentication(userId, provider)
        req.flash('success', `${ provider.toUpperCase() } 账号解绑成功`)

    }
    catch (error) {
        console.error(`Unlink ${ provider } error:`, error)
        req.flash('error', error.message || `解绑 ${ provider } 账号失败`)
    }

    res.redirect('/user/security')
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