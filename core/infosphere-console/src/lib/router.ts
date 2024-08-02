import { useRouter } from 'vue-router'

export class RouterUtils
{
    static getParams(key: string)
    {
        const router = useRouter()
        const params = router.currentRoute.value.params
        return params[key] as string
    }
}
