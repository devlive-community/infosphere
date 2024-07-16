import { User } from '@/model/user.ts'
import { Book } from '@/model/book.ts'

export interface Document
{
    id?: number
    name?: string
    identify?: string
    content?: string
    editor?: string
    sorting?: number
    createTime?: string
    updateTime?: string
    children?: Array<Document>
    parent?: number
    user?: User
    book?: Book
}
