import { Response } from '@/model/response'
import { HttpUtils } from '@/lib/http'

export abstract class BaseService
{
    private readonly baseUrl: string

    protected constructor(baseUrl: string)
    {
        this.baseUrl = baseUrl
    }

    /**
     * 保存或者更新数据，如果数据中 id>0 则更新，否则保存
     * @param configure
     */
    saveOrUpdate(configure: any): Promise<Response>
    {
        if (configure['id'] > 0) {
            return new HttpUtils().put(this.baseUrl, configure)
        }
        else {
            return new HttpUtils().post(this.baseUrl, configure)
        }
    }

    deleteById(id: number): Promise<Response>
    {
        return new HttpUtils().delete(`${ this.baseUrl }/${ id }`)
    }
}
