import { createRouter, createWebHashHistory, RouteRecordRaw } from 'vue-router'
import BootstrapSplash from '@renderer/page/BootstrapSplash/index.vue'
import { gtagRenderer } from '@renderer/utils/gtag'

const routes: Array<RouteRecordRaw> = [
  {
    path: '/first-run-readme',
    component: () => import('@renderer/page/FirstRunReadme/index.vue'),
    meta: {
      title: '初次使用必读'
    }
  },
  {
    path: '/cookieAssistant',
    component: () => import('@renderer/page/CookieAssistant/index.vue'),
    meta: {
      title: 'Cookie 助手'
    }
  },
  {
    path: '/llmConfig',
    component: () => import('@renderer/page/LlmConfig/index.vue'),
    meta: {
      title: '大语言模型设置'
    }
  },
  {
    path: '/resumeEditor',
    component: () => import('@renderer/page/ResumeEditor/index.vue'),
    meta: {
      title: '简历编辑'
    }
  },
  {
    path: '/readNoReplyReminderLlmMock',
    component: () => import('@renderer/page/ReadNoReplyReminderLlmMock/index.vue'),
    meta: {
      title: '已读不回提醒器 大语言模型测试'
    }
  },
  {
    path: '/main-layout',
    component: () => import('@renderer/page/MainLayout/index.vue'),
    redirect: '/main-layout/GeekAutoStartChatWithBoss',
    children: [
      {
        path: 'GeekAutoStartChatWithBoss',
        component: () => import('@renderer/page/MainLayout/GeekAutoStartChatWithBoss.vue'),
        meta: {
          title: 'BOSS炸弹'
        }
      },
      {
        path: 'ReadNoReplyReminder',
        component: () => import('@renderer/page/MainLayout/ReadNoReplyReminder.vue'),
        meta: {
          title: '已读不回提醒器'
        }
      },
      {
        path: 'StartChatRecord',
        component: () => import('@renderer/page/MainLayout/StartChatRecord.vue'),
        meta: {
          title: '开聊记录'
        }
      },
      {
        path: 'MarkAsNotSuitRecord',
        component: () => import('@renderer/page/MainLayout/MarkAsNotSuitRecord.vue'),
        meta: {
          title: '标记不合适记录'
        }
      },
      {
        path: 'JobLibrary',
        component: () => import('@renderer/page/MainLayout/JobLibrary.vue'),
        meta: {
          title: '职位库'
        }
      },
      {
        path: 'BossLibrary',
        component: () => import('@renderer/page/MainLayout/BossLibrary.vue'),
        meta: {
          title: 'Boss库'
        }
      },
      {
        path: 'CompanyLibrary',
        component: () => import('@renderer/page/MainLayout/CompanyLibrary.vue'),
        meta: {
          title: '公司库'
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
      },
      {
        path: 'runningStatusForReadNoReplyReminder',
        component: () =>
          import(
            '@renderer/page/GeekAutoStartChatWithBoss/RunningStatusForReadNoReplyReminder.vue'
          ),
        meta: {
          title: '已读不回提醒器 正在为你开聊BOSS'
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
          title: '正在下载核心组件'
        }
      }
    ]
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

router.afterEach((to, from) => {
  if (to.meta?.title) {
    document.title = `${to.meta.title} - GeekGeekRun 牛人快跑`
  } else {
    document.title = `GeekGeekRun 牛人快跑`
  }
  gtagRenderer('router_path_changed', {
    from_path: from.fullPath,
    to_path: to.fullPath
  })
  gtagRenderer('page_view', {
    page_location: location.href,
    page_title: document.title
  })
})

export default router
