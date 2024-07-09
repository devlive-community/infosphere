export interface User
{
    id?: number
    username?: string
    password?: string
    email?: string
}

export interface Auth
{
    token: string
    type: string
    id: number
    username: string
}
