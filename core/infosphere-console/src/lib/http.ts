import axios from 'axios'
import router from '@/router'
import { Response } from '@/model/response'
import { TokenUtils } from '@/lib/token'
import { Auth } from '@/model/user.ts'
import { useToast } from '@/components/ui/toast'

axios.defaults.headers.post['Access-Control-Allow-Origin'] = '*'
const { toast } = useToast()

export class HttpUtils
{
    private readonly configure

    constructor()
    {
        if (process.env.NODE_ENV === 'development') {
            axios.defaults.baseURL = 'http://localhost:9099'
        }
        else {
            axios.defaults.baseURL = window.location.protocol + '//' + window.location.hostname + (window.location.port ? ':' + window.location.port : '')
        }

        const auth: Auth | undefined = TokenUtils.getAuthUser()
        if (auth) {
            this.configure = {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `${ auth.type } ${ auth.token }`
                },
                cancelToken: undefined,
                params: undefined
            }
        }

        this.setupInterceptors()
    }

    // 检查 Token 是否有效
    private setupInterceptors()
    {
        axios.interceptors
             .request
             .use((config) => {
                     const auth: Auth | undefined = TokenUtils.getAuthUser()
                     if (auth) {
                         if (!TokenUtils.isTokenValid(auth.token)) {
                             TokenUtils.removeAuthUser()
                             router.push(`/common/403`)
                         }
                         else {
                             config.headers['Authorization'] = `${ auth.type } ${ auth.token }`
                         }
                     }
                     return config
                 },
                 (error) => {
                     return Promise.reject(error)
                 }
             )
    }

    handlerSuccessful(result: any): Response
    {
        const data = result.data
        let messageData = data.message
        if (data.message instanceof Array) {
            const messages: string[] = []
            data.message.forEach((element: { field: string; message: string }) => {
                messages.push(element.field + ': ' + element.message)
            })
            messageData = messages.join('\r\n')
        }
        const response: Response = {
            code: data.code,
            data: data.data,
            message: messageData,
            status: data.status
        }

        // If the authorization key does not match, clear the local token reload page
        if (response.code === 403) {
            router.push(`/common/403`)
        }
        if (response.code === 5000) {
            this.handlerMessage(response.message as string)
        }
        return response
    }

    handlerFailed(error: any): Response
    {
        const response: Response = {
            code: 0,
            message: error.message,
            status: false
        }
        if (error.code === 'ERR_NETWORK') {
            router.push('/common/502')
        }
        return response
    }

    get(url: string, params?: any): Promise<Response>
    {
        return new Promise((resolve) => {
            if (this.configure) {
                this.configure.params = params
            }
            axios.get(url, this.configure)
                 .then(result => {
                     resolve(this.handlerSuccessful(result))
                 }, error => {
                     this.handlerMessage(error.message)
                     resolve(this.handlerFailed(error))
                 })
        })
    }

    post(url: string, data = {}, cancelToken?: any): Promise<Response>
    {
        return new Promise((resolve) => {
            if (this.configure) {
                this.configure.cancelToken = cancelToken
            }
            axios.post(url, data, this.configure)
                 .then(result => {
                     resolve(this.handlerSuccessful(result))
                 }, error => {
                     this.handlerMessage(error.message)
                     resolve(this.handlerFailed(error))
                 })
        })
    }

    upload(url: string, data = {}, cancelToken?: any): Promise<Response>
    {
        return new Promise((resolve) => {
            if (this.configure) {
                this.configure.cancelToken = cancelToken
                this.configure.headers['Content-Type'] = 'multipart/form-data'
            }
            axios.post(url, data, this.configure)
                 .then(result => {
                     resolve(this.handlerSuccessful(result))
                 }, error => {
                     this.handlerMessage(error.message)
                     resolve(this.handlerFailed(error))
                 })
        })
    }

    put(url: string, data = {}): Promise<Response>
    {
        return new Promise((resolve) => {
            axios.put(url, data, this.configure)
                 .then(result => {
                     resolve(this.handlerSuccessful(result))
                 }, error => {
                     this.handlerMessage(error.message)
                     resolve(this.handlerFailed(error))
                 })
        })
    }

    delete(url: string): Promise<Response>
    {
        return new Promise((resolve) => {
            axios.delete(url, this.configure)
                 .then(result => {
                     resolve(this.handlerSuccessful(result))
                 }, error => {
                     this.handlerMessage(error.message)
                     resolve(this.handlerFailed(error))
                 })
        })
    }

    private handlerMessage(message: string)
    {
        toast({
            description: message,
            variant: 'destructive'
        })
    }

    getAxios()
    {
        return axios
    }
}
