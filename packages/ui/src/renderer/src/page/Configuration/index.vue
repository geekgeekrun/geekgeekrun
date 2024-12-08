<template>
  <div class="flex h100vh">
    <div class="flex flex-col w160px pt30px pl30px aside-nav of-hidden">
      <div class="nav-list flex-1 of-auto">
        <RouterLink to="./GeekAutoStartChatWithBoss">Boss炸弹</RouterLink>
        <RouterLink to="./ReadNoReplyReminder">已读不回提醒器</RouterLink>
        <hr />
        <a href="javascript:void(0)" @click="handleLaunchBossSite">
          手动逛Boss<el-icon><TopRight /></el-icon>
        </a>
        <hr />
        <RouterLink to="./StartChatRecord">开聊记录</RouterLink>
        <RouterLink to="./MarkAsNotSuitRecord">标记不合适记录</RouterLink>
        <RouterLink to="./JobLibrary">职位库</RouterLink>
        <RouterLink to="./BossLibrary">Boss库</RouterLink>
        <RouterLink to="./CompanyLibrary">公司库</RouterLink>
      </div>
      <div class="pt-16px pb-16px flex-0 font-size-12px">
        <div>当前版本: {{ buildInfo.version }}({{ buildInfo.buildVersion }})</div>
        <div class="feedback-area flex flex-items-center mt-8px">
          <el-button type="text" size="small" @click="handleGotoProjectPageClick"
            >项目首页</el-button
          >
          |
          <el-button type="text" size="small" @click="handleFeedbackClick">反馈问题</el-button>
        </div>
      </div>
    </div>
    <RouterView v-slot="{ Component }" class="flex-1">
      <KeepAlive>
        <component :is="Component" />
      </KeepAlive>
    </RouterView>
  </div>
</template>

<script lang="ts" setup>
import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElIcon } from 'element-plus'
import { TopRight } from '@element-plus/icons-vue'
import useBuildInfo from '@renderer/hooks/useBuildInfo'
import { debounce } from 'lodash-es'
const router = useRouter()
const unmountedCbs: Array<InstanceType<typeof Function>> = []
onUnmounted(() => {
  while (unmountedCbs.length) {
    const fn = unmountedCbs.shift()!
    try {
      fn()
    } catch {}
  }
})
const goToCheckBossZhipinCookieFile = () => router.replace('/cookieAssistant')
onMounted(() => {
  electron.ipcRenderer.on('check-boss-zhipin-cookie-file', goToCheckBossZhipinCookieFile)
})
onUnmounted(() => {
  electron.ipcRenderer.removeListener(
    'check-boss-zhipin-cookie-file',
    goToCheckBossZhipinCookieFile
  )
})
;(async () => {
  const checkDependenciesResult = await electron.ipcRenderer.invoke('check-dependencies')
  if (Object.values(checkDependenciesResult).includes(false)) {
    router.replace('/')
    return
  }

  const isCookieFileValid = await electron.ipcRenderer.invoke('check-boss-zhipin-cookie-file')
  if (!isCookieFileValid) {
    router.replace('/cookieAssistant')
    return
  }
})()

const { buildInfo } = useBuildInfo()
const getIssueUrlWithBody = (issueBody: string = '') => {
  const baseUrl = `https://github.com/geekgeekrun/geekgeekrun/issues/new`
  issueBody = issueBody || ''
  if (!issueBody || !issueBody.trim()) {
    return baseUrl
  }
  const urlObj = new URL(baseUrl)
  urlObj.searchParams.append('body', issueBody)

  return urlObj.toString()
}
const handleFeedbackClick = () => {
  electron.ipcRenderer.send(
    'open-external-link',
    getIssueUrlWithBody(`\n\n\n-----
版本号：${buildInfo.value.version}(${buildInfo.value.buildVersion})
提交：${buildInfo.value.buildHash.substring(0, 6)}`)
  )
}
const handleGotoProjectPageClick = () => {
  electron.ipcRenderer.send('open-external-link', 'https://github.com/geekgeekrun/geekgeekrun')
}

const handleLaunchBossSite = debounce(
  async () => {
    return await electron.ipcRenderer.invoke('open-site-with-boss-cookie', {
      url: `https://www.zhipin.com/`
    })
  },
  1000,
  { leading: true, trailing: false }
)
</script>

<style lang="scss" scoped>
.aside-nav {
  background-image: linear-gradient(45deg, #eaf4f1, #dcf6f2);
  .nav-list {
    > a {
      display: flex;
      align-items: center;
      height: 2.5em;
      box-sizing: border-box;
      padding-left: 2em;
      &.router-link-active {
        background-color: #fff;
        font-weight: 700;
        color: #2faa9e;
        border-radius: 9999px 0 0 9999px;
      }
    }
    > hr {
      border: 0 solid;
      height: 1px;
      background-color: #b3c8c3;
      margin-top: 0;
      margin-bottom: 0;
      width: 140px;
      margin-right: 0;
    }
  }
  .feedback-area {
    :deep(.el-button) {
      height: fit-content;
      padding: 0;
      margin-left: 0;
    }
  }
}
</style>
