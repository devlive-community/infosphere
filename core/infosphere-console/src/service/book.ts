import { BaseService } from '@/service/base.ts'
import { HttpUtils } from '@/lib/http.ts'
import { Pagination, Response } from '@/model/response.ts'

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

    getNewest(configure: Pagination): Promise<Response>
    {
        return new HttpUtils().get(`${ DEFAULT_PATH }/newest`, configure)
    }

    getHottest(configure: Pagination): Promise<Response>
    {
        return new HttpUtils().get(`${ DEFAULT_PATH }/hottest`, configure)
    }

    getByUsername(username: string, configure: Pagination): Promise<Response>
    {
        return new HttpUtils().get(`${ DEFAULT_PATH }/user/${ username }`, configure)
    }

    getByUsernameAndFollowed(username: string, configure: Pagination): Promise<Response>
    {
        return new HttpUtils().get(`${ DEFAULT_PATH }/followed/${ username }`, configure)
    }

    access(identify: string): Promise<Response>
    {
        return new HttpUtils().post(`${ DEFAULT_PATH }/access/${ identify }`)
    }

    getAllAccessByBook(identify: string, configure: Pagination): Promise<Response>
    {
        return new HttpUtils().get(`${ DEFAULT_PATH }/access/${ identify }`, configure)
    }
}

export default new BookService()
