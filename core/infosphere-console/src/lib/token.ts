import { Auth } from '@/model/user.ts'
import { useUserStore } from '@/stores/user.ts'

const TOKEN = 'Token'

export class TokenUtils
{
    /**
     * Get the authenticated user from local storage.
     *
     * @return {Auth | undefined} The authenticated user object or undefined if not found.
     */
    public static getAuthUser(): Auth | undefined
    {
        try {
            return JSON.parse(localStorage.getItem(TOKEN) || '{}') as Auth
        }
        catch (error) {
            console.error(error)
            return undefined
        }
    }

    public static setAuthUser(auth: Auth): void
    {
        localStorage.setItem(TOKEN, JSON.stringify(auth))
    }

    public static removeAuthUser(): void
    {
        localStorage.removeItem(TOKEN)
    }

    public static getToken(): String
    {
        return TOKEN
    }

    public static isTokenValid(token: string): boolean
    {
        if (token) {
            const payload = JSON.parse(atob(token.split('.')[1]))
            const expiry = payload.exp
            const now = Math.floor(Date.now() / 1000)
            return expiry > now
        }
        return true
    }

    /**
     * 用户是否登录
     */
    public static isLoggedIn(): boolean
    {
        const userStore = useUserStore()
        return userStore.isLogin
    }
}
