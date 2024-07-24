import { User } from '@/model/user.ts'

export interface Follow
{
    id?: number
    identify?: string
    type?: string
    createTime?: string
    user?: User
}
