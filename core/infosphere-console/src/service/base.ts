import { Response } from '@/model/response'
import { HttpUtils } from '@/lib/http'
import { Page } from '@/model/page.ts'

export abstract class BaseService
{
    private readonly baseUrl: string

    protected constructor(baseUrl: string)
    {
        this.baseUrl = baseUrl
    }

    getAll(configure: Page): Promise<Response>
    {
        return new HttpUtils().get(`${ this.baseUrl }`, configure)
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
