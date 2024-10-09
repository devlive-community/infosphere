import { User } from '@/model/user.ts'
import { Field } from '@/model/field.ts'

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
    documentCount?: number
    visitorCount?: number
    isFollowed?: boolean
    state?: string
    originate?: Field
    language?: string
    user?: User
}
