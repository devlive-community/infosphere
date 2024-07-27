import { User } from '@/model/user.ts'
import { HttpUtils } from '@/lib/http.ts'
import { Pagination, Response } from '@/model/response.ts'

const DEFAULT_PATH = '/api/v1/user'

class UserService
{
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

    save(configure: User): Promise<Response>
    {
        return new HttpUtils().post(`${ DEFAULT_PATH }`, configure)
    }

    changePassword(configure: User): Promise<Response>
    {
        return new HttpUtils().put(`${ DEFAULT_PATH }/change/password`, configure)
    }

    getByUsernameAndFollowed(username: string, configure: Pagination): Promise<Response>
    {
        return new HttpUtils().get(`${ DEFAULT_PATH }/followed/${ username }`, configure)
    }
}

export default new UserService()
