import { User } from '@/model/user.ts'

export interface Book
{
    id?: number
    name?: string
    cover?: string
    identify?: string
    description?: string
    visibility?: boolean | string
    createTime?: string
    updateTime?: string
    user?: User
}
