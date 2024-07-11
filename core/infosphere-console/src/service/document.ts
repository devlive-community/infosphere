import { BaseService } from '@/service/base.ts'
import { HttpUtils } from '@/lib/http.ts'
import { Response } from '@/model/response.ts'

const DEFAULT_PATH = '/api/v1/document'

class DocumentService
    extends BaseService
{
    constructor()
    {
        super(DEFAULT_PATH)
    }

    getByIdentify(identify: string): Promise<Response>
    {
        return new HttpUtils().get(`${ DEFAULT_PATH }/${ identify }`)
    }

    getCatalogByBook(bookIdentify: string): Promise<Response>
    {
        return new HttpUtils().get(`${ DEFAULT_PATH }/catalog/${ bookIdentify }`)
    }
}

export default new DocumentService()
