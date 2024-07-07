import { Router } from 'vue-router'
import LayoutContainer from '@/views/layouts/basic/LayoutContainer.vue'

const createDefaultRouter = (router: Router): void => {
    router.addRoute({
        path: '/',
        name: 'home',
        redirect: '/index',
        component: LayoutContainer,
        children: [
            {
                name: 'index',
                path: 'index',
                component: () => import('@/views/pages/index/IndexHome.vue')
            }
        ]
    })
}

export {
    createDefaultRouter
}
