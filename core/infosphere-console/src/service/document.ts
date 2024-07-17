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

    getByIdentify(identify: string, withChildren?: boolean): Promise<Response>
    {
        return new HttpUtils().get(`${ DEFAULT_PATH }/info/${ identify }`, { withChildren })
    }

    deleteByIdentify(identify: string): Promise<Response>
    {
        return new HttpUtils().delete(`${ DEFAULT_PATH }/${ identify }`)
    }
}

export default new DocumentService()
