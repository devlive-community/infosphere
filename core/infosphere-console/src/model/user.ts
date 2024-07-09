export interface User
{
    id?: number
    username?: string
    aliasName?: string
    password?: string
    email?: string
    signature?: string
}

export interface Auth
{
    token: string
    type: string
    id: number
    username: string
}
