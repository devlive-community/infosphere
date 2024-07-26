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
    avatar?: string,
    isFollowed?: boolean
    createTime?: string
    updateTime?: string
}

export interface Auth
{
    token: string
    type: string
    id: number
    username: string
}
