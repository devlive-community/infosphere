import { createRouter, createWebHashHistory, RouteRecordRaw } from 'vue-router'
import { createDefaultRouter } from '@/router/default.ts'
import { useUserStore } from '@/stores/user.ts'

const routes: Array<RouteRecordRaw> = []

const router = createRouter({
    history: createWebHashHistory(),
    routes
})

createDefaultRouter(router)

router.beforeEach((to, from, next) => {
    console.log(`from: ${ from.path }, to: ${ to.path }`)
    // 如果设置了标题，替换为当前访问的标题
    if (to.meta.title) {
        document.title = `${ to.meta.title as string } - InfoSphere`
    }

    const userStore = useUserStore()
    if (to.path === '/login' || to.path === '/register') {
        if (userStore.isLogin) {
            next({ path: '/common/logged' })
            return
        }
    }

    next()
})

export default router
