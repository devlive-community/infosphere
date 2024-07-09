import { defineStore } from 'pinia'
import { User } from '@/model/user.ts'
import { TokenUtils } from '@/lib/token.ts'
import UserService from '@/service/user.ts'

export const useUserStore = defineStore({
    id: 'user',
    state: () => ({
        info: null as User | null,
        isLogin: TokenUtils.getAuthUser()?.token !== undefined
    }),
    actions: {
        async fetchUserInfo()
        {
            if (this.isLogin) {
                const response = await UserService.getInfo()
                if (response.status) {
                    this.info = response.data
                    this.isLogin = true
                }
                else {
                    this.info = null
                    this.isLogin = false
                }
            }
        },
        logout()
        {
            TokenUtils.removeAuthUser()
            this.info = null
            this.isLogin = false
        }
    }
})
