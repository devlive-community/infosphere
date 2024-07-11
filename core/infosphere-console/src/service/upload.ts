import { BaseService } from '@/service/base.ts'
import { HttpUtils } from '@/lib/http.ts'
import { Response } from '@/model/response.ts'

const DEFAULT_PATH = '/api/v1/upload'

class UploadService
    extends BaseService
{
    constructor()
    {
        super(DEFAULT_PATH)
    }

    upload(configure: any): Promise<Response>
    {
        return new HttpUtils().upload(`${ DEFAULT_PATH }`, configure)
    }
}

export default new UploadService()
