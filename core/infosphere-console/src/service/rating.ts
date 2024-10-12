import { BaseService } from '@/service/base.ts'
import { Pagination, Response } from '@/model/response.ts'
import { HttpUtils } from '@/lib/http.ts'

const DEFAULT_PATH = '/api/v1/rating'

class RatingService
    extends BaseService
{
    constructor()
    {
        super(DEFAULT_PATH)
    }

    getByBookIdentify(identify: string, configure: Pagination): Promise<Response>
    {
        return new HttpUtils().get(`${ DEFAULT_PATH }/${ identify }`, configure)
    }
}

export default new RatingService()
