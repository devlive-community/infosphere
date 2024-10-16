import { createRouter, createWebHashHistory, RouteRecordRaw } from 'vue-router'
import { createDefaultRouter } from '@/router/default.ts'
import { useUserStore } from '@/stores/user.ts'
import NProgress from 'nprogress'
import 'nprogress/nprogress.css'

NProgress.configure({
    easing: 'ease',
    speed: 600,
    showSpinner: true,
    trickleSpeed: 200,
    minimum: 0.3
})

const routes: Array<RouteRecordRaw> = []

const router = createRouter({
    history: createWebHashHistory(),
    routes
})

createDefaultRouter(router)

router.beforeEach((to, from, next) => {
    NProgress.start()
    console.log(`from: ${ from.path }, to: ${ to.path }`)
    // 如果设置了标题，替换为当前访问的标题
    if (to.meta.title) {
        document.title = `${ to.meta.title as string } - InfoSphere`
    }

    const userStore = useUserStore()
    if (to.matched.some(record => record.meta.requiresAuth)) {
        if (!userStore.isLogin) {
            next('/common/403')
        }
        else {
            next()
        }
    }
    else {
        if (to.path === '/login' || to.path === '/register') {
            if (userStore.isLogin) {
                next({ path: '/common/logged' })
                return
            }
        }
        next()
    }
})

router.afterEach(() => NProgress.done())

export default router
