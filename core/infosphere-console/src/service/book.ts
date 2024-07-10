import { BaseService } from '@/service/base.ts'

const DEFAULT_PATH = '/api/v1/book'

class BookService
    extends BaseService
{
    constructor()
    {
        super(DEFAULT_PATH)
    }
}

export default new BookService()
