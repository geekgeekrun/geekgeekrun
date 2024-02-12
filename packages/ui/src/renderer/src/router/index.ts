import { defineComponent, h } from 'vue'
import { createRouter, createWebHashHistory, RouteRecordRaw } from 'vue-router'

const routes: Array<RouteRecordRaw> = [
  {
    path: '/',
    component: defineComponent({ setup: () => h('div') }),
    redirect: '/configuration',
    children: []
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
          title: '"geek auto start chat with boss" configuration'
        }
      }
    ]
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

router.afterEach((to) => {
  if (to.meta?.title) {
    document.title = `${to.meta.title} - BossGeekGo`
  } else {
    document.title = `BossGeekGo`
  }
})

export default router
