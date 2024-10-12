import { Book } from '@/model/book.ts'
import { User } from '@/model/user.ts'

export interface Rating
{
    id?: number
    rating?: number
    review?: string
    createTime?: string
    user?: User
    book?: Book
}
