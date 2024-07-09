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
                meta: {
                    title: '首页'
                },
                component: () => import('@/views/pages/index/IndexHome.vue')
            },
            {
                name: 'login',
                path: 'login',
                meta: {
                    title: '登录'
                },
                component: () => import('@/views/pages/login/LoginHome.vue')
            },
            {
                name: 'register',
                path: 'register',
                meta: {
                    title: '注册'
                },
                component: () => import('@/views/pages/login/RegisterHome.vue')
            }
        ]
    })
}

export {
    createDefaultRouter
}
