import { User } from '@/model/user.ts'
import { HttpUtils } from '@/lib/http.ts'
import { Pagination, Response } from '@/model/response.ts'
import { BaseService } from '@/service/base.ts'

const DEFAULT_PATH = '/api/v1/user'

class UserService
    extends BaseService
{
    constructor()
    {
        super(DEFAULT_PATH)
    }

    login(configure: User): Promise<Response>
    {
        return new HttpUtils().post(`${ DEFAULT_PATH }/signin`, configure)
    }

    register(configure: User): Promise<Response>
    {
        return new HttpUtils().post(`${ DEFAULT_PATH }/register`, configure)
    }

    getInfo(): Promise<Response>
    {
        return new HttpUtils().get(`${ DEFAULT_PATH }/info`)
    }

    getByUsername(username: string): Promise<Response>
    {
        return new HttpUtils().get(`${ DEFAULT_PATH }/info/${ username }`)
    }

    changePassword(configure: User): Promise<Response>
    {
        return new HttpUtils().put(`${ DEFAULT_PATH }/change/password`, configure)
    }

    getByUsernameAndFollowed(username: string, configure: Pagination): Promise<Response>
    {
        return new HttpUtils().get(`${ DEFAULT_PATH }/followed/${ username }`, configure)
    }

    getByUsernameAndFans(username: string, configure: Pagination): Promise<Response>
    {
        return new HttpUtils().get(`${ DEFAULT_PATH }/fans/${ username }`, configure)
    }
}

export default new UserService()
