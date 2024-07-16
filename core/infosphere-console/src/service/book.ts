import { BaseService } from '@/service/base.ts'
import { HttpUtils } from '@/lib/http.ts'
import { Response } from '@/model/response.ts'

const DEFAULT_PATH = '/api/v1/book'

class BookService
    extends BaseService
{
    constructor()
    {
        super(DEFAULT_PATH)
    }

    getByIdentify(identify: string): Promise<Response>
    {
        return new HttpUtils().get(`${ DEFAULT_PATH }/info/${ identify }`)
    }

    getCatalogByBook(bookIdentify: string): Promise<Response>
    {
        return new HttpUtils().get(`${ DEFAULT_PATH }/catalog/${ bookIdentify }`)
    }

    getLatest(top: number): Promise<Response>
    {
        return new HttpUtils().get(`${ DEFAULT_PATH }/latest/${ top }`)
    }
}

export default new BookService()
