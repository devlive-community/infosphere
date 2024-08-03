import { Router } from 'vue-router'
import LayoutContainer from '@/views/layouts/basic/LayoutContainer.vue'
import SettingContainer from '@/views/layouts/setting/SettingContainer.vue'
import DynamicContainer from '@/views/layouts/book/DynamicContainer.vue'
import InfoContainer from '@/views/layouts/user/InfoContainer.vue'

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
                meta: { title: '首页' },
                component: () => import('@/views/pages/index/IndexHome.vue')
            },
            {
                name: 'Explore',
                path: 'explore',
                meta: { title: '探索' },
                component: () => import('@/views/pages/explore/ExploreHome.vue')
            },
            {
                name: 'Login',
                path: 'login',
                meta: { title: '登录' },
                component: () => import('@/views/pages/user/LoginHome.vue')
            },
            {
                name: 'Register',
                path: 'register',
                meta: { title: '注册' },
                component: () => import('@/views/pages/user/RegisterHome.vue')
            }
        ]
    })

    router.addRoute({
        path: '/common',
        name: 'common',
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
            },
            {
                name: 'NotFound',
                path: '404',
                meta: { title: '页面不存在' },
                component: () => import('@/views/pages/common/NotFoundHome.vue')
            },
            {
                name: 'BadGateway',
                path: '502',
                meta: { title: '服务不可用' },
                component: () => import('@/views/pages/common/BadGatewayHome.vue')
            }
        ]
    })

    router.addRoute({
        path: '/setting',
        name: 'setting',
        redirect: '/setting/index',
        component: SettingContainer,
        children: [
            {
                name: 'SettingIndex',
                path: 'index',
                meta: { title: '基本信息', requiresAuth: true },
                component: () => import('@/views/pages/user/SettingHome.vue')
            },
            {
                name: 'SettingPassword',
                path: 'password',
                meta: { title: '修改密码', requiresAuth: true },
                component: () => import('@/views/pages/user/SettingPassword.vue')
            }
        ]
    })

    router.addRoute({
        path: '/book',
        name: 'book',
        redirect: '/book/index',
        component: DynamicContainer,
        children: [
            {
                name: 'BookIndex',
                path: 'index',
                meta: { title: '我的书籍', requiresAuth: true },
                component: () => import('@/views/pages/book/BookHome.vue')
            },
            {
                name: 'BookPublic',
                path: 'public',
                meta: { title: '公开书籍', requiresAuth: true },
                component: () => import('@/views/pages/book/BookPublic.vue')
            },
            {
                name: 'BookPrivate',
                path: 'private',
                meta: { title: '私有书籍', requiresAuth: true },
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
                path: 'setting/summary/:identify?',
                meta: { title: '书籍摘要', requiresAuth: true },
                component: () => import('@/views/pages/book/BookSummary.vue')
            },
            {
                name: 'BookSetting',
                path: 'setting/:identify?',
                meta: { title: '书籍设置', requiresAuth: true },
                component: () => import('@/views/pages/book/BookSetting.vue')
            },
            {
                name: 'BookStatus',
                path: 'setting/status/:identify?',
                meta: { title: '书籍状态', requiresAuth: true },
                component: () => import('@/views/pages/book/BookStatus.vue')
            },
            {
                name: 'BookWriter',
                path: 'writer/:identify?/:documentIdentify?',
                meta: { title: '书籍写作', requiresAuth: true },
                component: () => import('@/views/pages/book/BookWriter.vue')
            },
            {
                name: 'BookReader',
                path: 'reader/:bookIdentify?/:documentIdentify?',
                meta: { title: '阅读书籍' },
                component: () => import('@/views/pages/book/BookReader.vue')
            },
            {
                name: 'BookFollowed',
                path: 'followed',
                meta: { title: '我的关注', requiresAuth: true },
                component: () => import('@/views/pages/book/BookFollowed.vue')
            },
            {
                name: 'BookAccess',
                path: 'access/:identify?',
                meta: { title: '书籍访问记录', requiresAuth: true },
                component: () => import('@/views/pages/book/BookAccess.vue')
            },
            {
                name: 'BookFollow',
                path: 'follow/:identify?',
                meta: { title: '已关注用户列表' },
                component: () => import('@/views/pages/book/BookFollow.vue')
            }
        ]
    })

    router.addRoute({
        path: '/user',
        name: 'User',
        component: InfoContainer,
        children: [
            {
                name: 'UserHome',
                path: ':username?',
                meta: { title: '个人主页' },
                component: () => import('@/views/pages/user/UserHome.vue')
            },
            {
                name: 'UserFollowBook',
                path: ':username/follow/books',
                meta: { title: '关注列表 (书籍)' },
                component: () => import('@/views/pages/user/FollowBookHome.vue')
            },
            {
                name: 'UserFollowUser',
                path: ':username/follow/users',
                meta: { title: '关注列表 (用户)' },
                component: () => import('@/views/pages/user/FollowUserHome.vue')
            },
            {
                name: 'UserFans',
                path: ':username/fans',
                meta: { title: '粉丝列表' },
                component: () => import('@/views/pages/user/FansHome.vue')
            }
        ]
    })
}

export {
    createDefaultRouter
}
