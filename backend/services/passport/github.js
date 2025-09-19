const passport = require('passport')
const GitHubStrategy = require('passport-github2').Strategy
const User = require('../../models/user')
const avatarUploader = require('../../services/upload/avatar')

passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: process.env.GITHUB_CALLBACK_URL || 'http://localhost:6969/auth/github/callback'
}, async (accessToken, refreshToken, profile, done) => {
    try {
        const authData = {
            provider: 'github',
            provider_id: profile.id,
            provider_username: profile.username,
            provider_email: profile.emails && profile.emails.length > 0 ? profile.emails[0].value : null,
            access_token: accessToken,
            refresh_token: refreshToken,
            token_expires_at: null // GitHub tokens don't expire
        }

        const userData = {
            username: profile.username,
            email: authData.provider_email,
            avatar: profile.photos && profile.photos.length > 0 ? profile.photos[0].value : null
        }

        // 尝试通过 GitHub 提供程序查找现有用户
        let user = await User.findByProvider('github', profile.id)

        if (user) {
            // 更新上次登录和令牌
            await User.updateLastLogin(user.id)
            await User.updateAuthTokens(user.id, 'github', {
                access_token: accessToken,
                refresh_token: refreshToken,
                token_expires_at: null
            })

            // 根据需要更新用户信息
            if (userData.avatar && userData.avatar !== user.avatar) {
                await User.update(user.id, { avatar: userData.avatar })
            }
        }
        else {
            // 检查用户是否存在来自其他提供商的相同电子邮件
            if (userData.email) {
                const existingUser = await User.findByEmail(userData.email)
                if (existingUser) {
                    // 用户存在相同的电子邮件，链接 GitHub 帐户
                    try {
                        user = await User.addAuthentication(existingUser.id, authData)
                        await User.updateLastLogin(existingUser.id)
                    }
                    catch (error) {
                        if (error.message.includes('already linked')) {
                            return done(null, false, { message: 'github_already_linked' })
                        }
                        throw error
                    }
                }
                else {
                    // 使用 GitHub 身份验证创建新用户
                    user = await User.createWithAuth(userData, authData)
                }
            }
            else {
                // 未提供电子邮件，无论如何创建用户
                user = await User.createWithAuth(userData, authData)
            }
        }

        if (userData.avatar && userData.avatar.startsWith('http')) {
            avatarUploader.addTask({
                userId: user.id,
                provider_id: profile.id,
                provider: 'github',
                username: userData.username,
                avatar: userData.avatar
            })
        }

        return done(null, user)
    }
    catch (error) {
        console.error('GitHub passport error:', error)
        return done(error, null)
    }
}))

passport.serializeUser((user, done) => {
    done(null, user.id)
})

passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id)
        done(null, user)
    }
    catch (error) {
        console.error('Passport deserialize error:', error)
        done(error, null)
    }
})

module.exports = passport