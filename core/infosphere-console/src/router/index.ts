import { createRouter, createWebHashHistory, RouteRecordRaw } from 'vue-router'
import { createDefaultRouter } from '@/router/default.ts'

const routes: Array<RouteRecordRaw> = []

const router = createRouter({
    history: createWebHashHistory(),
    routes
})

createDefaultRouter(router)

export default router
