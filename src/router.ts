import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router'

import PageLayout from '@/layouts/PageLayout.vue'
import Index from '@/views/Index.vue'
import { authGuard } from '@/router/authGuard'

export const routes: RouteRecordRaw[] = [
  { path: '/demo', redirect: { name: 'Index' } },
  // 常规页面需要放在 PageLayout 的 children 中，以显示公共布局
  {
    path: '/',
    name: 'PageLayout',
    component: PageLayout,
    children: [
      {
        path: 'login',
        name: 'Login',
        component: () => import('@/views/Login.vue'),
      },
      {
        path: 'register',
        name: 'Register',
        component: () => import('@/views/Login.vue'),
      },
      {
        path: 'forgot-password',
        name: 'ForgotPassword',
        component: () => import('@/views/Login.vue'),
      },
      {
        path: '',
        name: 'Index',
        component: Index,
      },
      {
        path: 'rooms',
        name: 'RoomList',
        component: () => import('@/views/RoomList.vue'),
        meta: { requiresAuth: true },
      },
      {
        path: 'account',
        name: 'UserCenter',
        component: () => import('@/views/UserCenter.vue'),
        meta: { requiresAuth: true },
      },
    ],
  },
  // 游戏页面独立于公共布局之外，显示不同的界面
  {
    path: '/game/:roomId',
    name: 'Game',
    component: () => import('@/views/Game.vue'),
    meta: {
      requiresAuth: true,
    },
  },
  {
    path: '/login/callback',
    name: 'LoginCallback',
    component: () => import('@/views/LoginCallback.vue'),
  },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(_to, _from, savedPosition) {
    return savedPosition ?? { top: 0 }
  },
})

router.beforeEach(authGuard)
