import { User } from '@/model/user.ts'

export interface Access
{
    id?: number
    device?: string
    client?: string
    address?: string
    agent?: string
    location?: string
    duration?: number
    createTime?: string
    user?: User
}
