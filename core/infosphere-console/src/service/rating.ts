import { BaseService } from '@/service/base.ts'

const DEFAULT_PATH = '/api/v1/rating'

class RatingService
    extends BaseService
{
    constructor()
    {
        super(DEFAULT_PATH)
    }
}

export default new RatingService()
