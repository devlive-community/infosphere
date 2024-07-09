import { createRouter, createWebHashHistory, RouteRecordRaw } from 'vue-router'
import { createDefaultRouter } from '@/router/default.ts'

const routes: Array<RouteRecordRaw> = []

const router = createRouter({
    history: createWebHashHistory(),
    routes
})

createDefaultRouter(router)

router.beforeEach((to, from, next) => {
    // 如果设置了标题，替换为当前访问的标题
    if (to.meta.title) {
        document.title = to.meta.title as string
    }
    next()
})

export default router
