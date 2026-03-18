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
      title: 'BOSS登录助手'
    }
  },
  {
    path: '/browserAssistant',
    component: () => import('@renderer/page/BrowserAssistant/index.vue'),
    meta: {
      title: '浏览器助手'
    }
  },
  {
    path: '/browserAutoFind',
    component: () => import('@renderer/page/BrowserAutoFind/index.vue'),
    meta: {
      title: '浏览器助手 - 自动查找浏览器'
    }
  },
  {
    path: '/browserDownloadProgress',
    component: () => import('@renderer/page/BrowserDownloadProgress/index.vue'),
    meta: {
      title: '正在下载浏览器'
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
      title: '已读不回自动复聊 大语言模型测试'
    }
  },
  {
    path: '/commonJobConditionConfig',
    component: () => import('@renderer/page/CommonJobConditionConfig/index.vue'),
    meta: {
      title: '公共职位筛选条件'
    }
  },
  {
    path: '/main-layout',
    component: () => import('@renderer/page/MainLayout/index.vue'),
    redirect: () => {
      const lastPath = localStorage.getItem('geekgeekrun_last_main_layout_path')
      return lastPath || '/main-layout/GeekAutoStartChatWithBoss'
    },
    children: [
      {
        path: 'taskManager',
        component: () => import('@renderer/page/MainLayout/TaskManager.vue'),
        meta: {
          title: '任务管理'
        }
      },
      {
        path: 'GeekAutoStartChatWithBoss',
        component: () => import('@renderer/page/MainLayout/GeekAutoStartChatWithBoss/index.vue'),
        meta: {
          title: '自动开聊'
        }
      },
      {
        path: 'ReadNoReplyReminder',
        component: () => import('@renderer/page/MainLayout/ReadNoReplyReminder.vue'),
        meta: {
          title: '已读不回自动复聊'
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
          title: 'BOSS库'
        }
      },
      {
        path: 'CompanyLibrary',
        component: () => import('@renderer/page/MainLayout/CompanyLibrary.vue'),
        meta: {
          title: '公司库'
        }
      },
      {
        name: 'BossJobConfig',
        path: 'BossJobConfig',
        component: () => import('@renderer/page/MainLayout/BossJobConfig/index.vue'),
        meta: {
          title: '职位配置'
        }
      },
      {
        name: 'BossAutoBrowseAndChat',
        path: 'BossAutoBrowseAndChat',
        component: () => import('@renderer/page/MainLayout/BossAutoBrowseAndChat/index.vue'),
        meta: {
          title: '推荐牛人 - 自动开聊'
        }
      },
      {
        name: 'BossChatPage',
        path: 'BossChatPage',
        component: () => import('@renderer/page/MainLayout/BossChatPage/index.vue'),
        meta: {
          title: '沟通'
        }
      },
      {
        name: 'BossAutoSequence',
        path: 'BossAutoSequence',
        component: () => import('@renderer/page/MainLayout/BossAutoSequence/index.vue'),
        meta: {
          title: '自动顺序执行'
        }
      },
      {
        name: 'WebhookIntegration',
        path: 'WebhookIntegration',
        component: () => import('@renderer/page/MainLayout/WebhookIntegration/index.vue'),
        meta: {
          title: 'Webhook / 外部集成'
        }
      },
      {
        name: 'BossDebugTool',
        path: 'BossDebugTool',
        component: () => import('@renderer/page/MainLayout/BossDebugTool/index.vue'),
        meta: {
          title: '招聘端调试工具'
        }
      },
      {
        name: 'BossLlmConfig',
        path: 'BossLlmConfig',
        component: () => import('@renderer/page/MainLayout/BossLlmConfig/index.vue'),
        meta: {
          title: '招聘端大语言模型配置'
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
          title: '自动开聊 正在预热'
        }
      },
      {
        path: 'runningStatus',
        component: () => import('@renderer/page/GeekAutoStartChatWithBoss/RunningStatus.vue'),
        meta: {
          title: '自动开聊 正在为你开聊BOSS'
        }
      },
      {
        path: 'runningStatusForReadNoReplyReminder',
        component: () =>
          import(
            '@renderer/page/GeekAutoStartChatWithBoss/RunningStatusForReadNoReplyReminder.vue'
          ),
        meta: {
          title: '已读不回自动复聊 正在为你开聊BOSS'
        }
      }
    ]
  },
  {
    path: '/',
    component: BootstrapSplash,
    meta: {
      title: '你的职场大机密'
    }
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
