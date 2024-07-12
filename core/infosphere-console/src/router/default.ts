import { Router } from 'vue-router'
import LayoutContainer from '@/views/layouts/basic/LayoutContainer.vue'
import SettingContainer from '@/views/layouts/setting/SettingContainer.vue'
import { useUserStore } from '@/stores/user.ts'
import DynamicContainer from '@/views/layouts/book/DynamicContainer.vue'

const createDefaultRouter = (router: Router): void => {
    router.addRoute({
        path: '/',
        name: 'home',
        redirect: '/index',
        component: LayoutContainer,
        children: [
            {
                name: 'Index',
                path: 'index',
                meta: {
                    title: '首页'
                },
                component: () => import('@/views/pages/index/IndexHome.vue')
            },
            {
                name: 'Explore',
                path: 'explore',
                meta: {
                    title: '探索'
                },
                component: () => import('@/views/pages/explore/ExploreHome.vue')
            },
            {
                name: 'Login',
                path: 'login',
                meta: {
                    title: '登录'
                },
                component: () => import('@/views/pages/user/LoginHome.vue')
            },
            {
                name: 'Register',
                path: 'register',
                meta: {
                    title: '注册'
                },
                component: () => import('@/views/pages/user/RegisterHome.vue')
            }
        ]
    })

    router.addRoute({
        path: '/common',
        name: 'common',
        redirect: '/common/not_network',
        component: LayoutContainer,
        children: [
            {
                name: 'Logged',
                path: 'logged',
                meta: {
                    title: '用户已经登录'
                },
                component: () => import('@/views/pages/common/LoggedHome.vue')
            },
            {
                name: 'Authorized',
                path: '403',
                meta: {
                    title: '无权访问'
                },
                component: () => import('@/views/pages/common/AuthorizedHome.vue')
            }
        ]
    })

    router.addRoute({
        path: '/setting',
        name: 'setting',
        redirect: '/setting/index',
        component: SettingContainer,
        beforeEnter: (to, from, next) => {
            console.log(`from: ${ from.path }, to: ${ to.path }`)
            const userStore = useUserStore()
            if (!userStore.isLogin) {
                next('/common/403')
            }
            else {
                next()
            }
        },
        children: [
            {
                name: 'SettingIndex',
                path: 'index',
                meta: {
                    title: '基本信息'
                },
                component: () => import('@/views/pages/user/SettingHome.vue')
            },
            {
                name: 'SettingPassword',
                path: 'password',
                meta: {
                    title: '修改密码'
                },
                component: () => import('@/views/pages/user/SettingPassword.vue')
            }
        ]
    })

    router.addRoute({
        path: '/book',
        name: 'book',
        redirect: '/book/index',
        component: DynamicContainer,
        beforeEnter: (to, from, next) => {
            console.log(`from: ${ from.path }, to: ${ to.path }`)
            const userStore = useUserStore()
            if (!userStore.isLogin) {
                next('/common/403')
            }
            else {
                next()
            }
        },
        children: [
            {
                name: 'BookIndex',
                path: 'index',
                meta: { title: '我的书籍' },
                component: () => import('@/views/pages/book/BookHome.vue')
            },
            {
                name: 'BookPublic',
                path: 'public',
                meta: { title: '公开书籍' },
                component: () => import('@/views/pages/book/BookPublic.vue')
            },
            {
                name: 'BookPrivate',
                path: 'private',
                meta: { title: '私有书籍' },
                component: () => import('@/views/pages/book/BookPrivate.vue')
            },
            {
                name: 'BookInfo',
                path: 'info/:identify?',
                meta: { title: '书籍详情' },
                component: () => import('@/views/pages/book/BookInfo.vue')
            },
            {
                name: 'BookSummary',
                path: 'summary/:identify?',
                meta: { title: '书籍摘要' },
                component: () => import('@/views/pages/book/BookSummary.vue')
            },
            {
                name: 'BookSetting',
                path: 'setting/:identify?',
                meta: { title: '书籍设置' },
                component: () => import('@/views/pages/book/BookSetting.vue')
            },
            {
                name: 'BookWriter',
                path: 'writer/:identify?',
                meta: { title: '书籍写作' },
                component: () => import('@/views/pages/book/BookWriter.vue')
            },
            {
                name: 'BookReader',
                path: 'reader/:bookIdentify?/:documentIdentify?',
                meta: { title: '阅读书籍' },
                component: () => import('@/views/pages/book/BookReader.vue')
            }
        ]
    })
}

export {
    createDefaultRouter
}
