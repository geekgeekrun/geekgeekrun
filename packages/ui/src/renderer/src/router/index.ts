import { defineComponent, h } from 'vue'
import { createRouter, createWebHashHistory, RouteRecordRaw } from 'vue-router'
import BootstrapSplash from '@renderer/page/BootstrapSplash/index.vue'

const routes: Array<RouteRecordRaw> = [
  {
    path: '/cookieAssistant',
    component: () => import('@renderer/page/CookieAssistant/index.vue')
  },
  {
    path: '/configuration',
    component: () => import('@renderer/page/Configuration/index.vue'),
    redirect: '/configuration/GeekAutoStartChatWithBoss',
    children: [
      {
        path: 'GeekAutoStartChatWithBoss',
        component: () => import('@renderer/page/Configuration/GeekAutoStartChatWithBoss.vue'),
        meta: {
          title: '"BOSS炸弹" 设置'
        }
      }
    ]
  },
  {
    path: '/geekAutoStartChatWithBoss',
    component: () => import('@renderer/page/GeekAutoStartChatWithBoss/index.vue'),
    children: [
      {
        path: 'runningStatus',
        component: () => import('@renderer/page/GeekAutoStartChatWithBoss/RunningStatus.vue'),
        meta: {
          title: 'BOSS炸弹 正在为你开聊BOSS'
        }
      }
    ]
  },
  {
    path: '/',
    component: BootstrapSplash,
    children: [
      // {
      //   path: '/',
      //   component: () => defineComponent({ setup: () => () => h('div') })
      // },
      {
        path: '/downloadingDependencies',
        component: () => import('@renderer/page/BootstrapSplash/page/DownloadingDependencies.vue')
      }
    ]
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

router.afterEach((to) => {
  if (to.meta?.title) {
    document.title = `${to.meta.title} - GeekGeekRun`
  } else {
    document.title = `GeekGeekRun`
  }
})

export default router
