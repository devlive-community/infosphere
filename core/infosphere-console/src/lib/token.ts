import { Auth } from '@/model/user.ts'

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
            return undefined
        }
    }

    public static setAuthUser(auth: Auth): void
    {
        localStorage.setItem(TOKEN, JSON.stringify(auth))
    }

    public static getToken(): String
    {
        return TOKEN
    }
}
