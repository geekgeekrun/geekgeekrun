import { createRouter, createWebHashHistory, RouteRecordRaw } from 'vue-router'
import BootstrapSplash from '@renderer/page/BootstrapSplash/index.vue'

const routes: Array<RouteRecordRaw> = [
  {
    path: '/cookieAssistant',
    component: () => import('@renderer/page/CookieAssistant/index.vue'),
    meta: {
      title: 'Cookie 助手'
    }
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
        path: 'prepareRun',
        component: () => import('@renderer/page/GeekAutoStartChatWithBoss/PrepareRun.vue'),
        meta: {
          title: 'BOSS炸弹 正在预热'
        }
      },
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
    meta: {
      title: '薪想事成'
    },
    children: [
      {
        path: '/downloadingDependencies',
        component: () => import('@renderer/page/BootstrapSplash/page/DownloadingDependencies.vue'),
        meta: {
          title: '正在下载浏览器'
        },
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
