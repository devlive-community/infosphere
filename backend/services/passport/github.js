const passport = require('passport')
const User = require('../../models/user')
const avatarUploader = require('../../services/upload/avatar')

if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    const GitHubStrategy = require('passport-github2').Strategy

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
                token_expires_at: null
            }

            const userData = {
                username: profile.username,
                email: authData.provider_email,
                avatar: profile.photos && profile.photos.length > 0 ? profile.photos[0].value : null
            }

            // 您的现有逻辑...
            let user = await User.findByProvider('github', profile.id)

            if (user) {
                await User.updateLastLogin(user.id)
                await User.updateAuthTokens(user.id, 'github', {
                    access_token: accessToken,
                    refresh_token: refreshToken,
                    token_expires_at: null
                })

                if (userData.avatar && userData.avatar !== user.avatar) {
                    await User.update(user.id, { avatar: userData.avatar })
                }
            }
            else {
                if (userData.email) {
                    const existingUser = await User.findByEmail(userData.email)
                    if (existingUser) {
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
                        user = await User.createWithAuth(userData, authData)
                    }
                }
                else {
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

    console.log('GitHub OAuth 已启用')
}
else {
    console.log('GitHub OAuth 未配置，已禁用')
}

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