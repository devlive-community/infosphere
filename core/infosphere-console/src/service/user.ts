import { User } from '@/model/user.ts'
import { HttpUtils } from '@/lib/http.ts'
import { Response } from '@/model/response.ts'

const DEFAULT_PATH = '/api/v1/user'

class UserService
{
    login(configure: User): Promise<Response>
    {
        return new HttpUtils().post(`${ DEFAULT_PATH }/signin`, configure)
    }

    getInfo(): Promise<Response>
    {
        return new HttpUtils().get(`${ DEFAULT_PATH }/info`)
    }
}

export default new UserService()
