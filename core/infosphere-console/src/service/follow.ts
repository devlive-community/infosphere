import { BaseService } from '@/service/base.ts'
import { HttpUtils } from '@/lib/http.ts'
import { Follow } from '@/model/follow.ts'
import { Response } from '@/model/response.ts'

const DEFAULT_PATH = '/api/v1/follow'

class FollowService
    extends BaseService
{
    constructor()
    {
        super(DEFAULT_PATH)
    }

    delete(configure: Follow): Promise<Response>
    {
        return new HttpUtils().put(DEFAULT_PATH, configure)
    }
}

export default new FollowService()
