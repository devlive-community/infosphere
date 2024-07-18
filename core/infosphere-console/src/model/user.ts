export interface User
{
    id?: number
    username?: string
    aliasName?: string
    password?: string
    newPassword?: string
    confirmPassword?: string
    email?: string
    signature?: string
    avatar?: string
}

export interface Auth
{
    token: string
    type: string
    id: number
    username: string
}
