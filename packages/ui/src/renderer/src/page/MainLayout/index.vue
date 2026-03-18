<template>
  <div class="flex h100vh of-hidden">
    <div class="flex flex-col min-w200px w200px pt16px pl30px aside-nav of-hidden">
      <!-- 身份切换 -->
      <div class="identity-switcher">
        <el-segmented
          v-model="identityMode"
          :options="identityOptions"
          size="small"
          block
          @change="handleIdentityChange"
        />
      </div>

      <div class="nav-list flex-1 of-auto pl20px ml--20px mt12px">
        <RouterLink v-show="false" to="./TaskManager">任务管理</RouterLink>
        <template v-if="identityMode === 'geek'">
          <BossPart />
          <hr class="group-divider" />
          <RunDataRecordPart />
        </template>
        <template v-else>
          <RecruiterPart />
        </template>
        <hr class="group-divider" />
        <GlobalConfigPart
          :show-job-condition="identityMode === 'geek'"
          :show-llm-config="identityMode === 'geek'"
        />
      </div>
      <div class="pt-16px pb-16px flex-0 font-size-12px">
        <div v-if="identityMode === 'recruiter'" class="recruiter-tools">
          <span class="recruiter-tools__log-level">
            日志级别
            <el-select
              v-model="recruiterLogLevel"
              size="small"
              class="recruiter-tools__log-level-select"
              @change="handleRecruiterLogLevelChange"
            >
              <el-option label="info" value="info" />
              <el-option label="debug" value="debug" />
              <el-option label="warn" value="warn" />
              <el-option label="error" value="error" />
            </el-select>
          </span>
          <el-button
            type="text"
            size="small"
            :class="{ active: logPanelOpen }"
            class="tool-btn"
            @click="toggleLogPanel"
          >运行日志</el-button>
          |
          <el-button type="text" size="small" class="tool-btn" @click="handleToggleDevTools">调试工具</el-button>
        </div>
        <div v-if="updateStore.availableNewRelease" mb16px>
          <div
            :style="{
              display: 'flex',
              alignItems: 'center'
            }"
          >
            最新版本: {{ updateStore.availableNewRelease.releaseVersion }}
            <img
              h12px
              ml10px
              :style="{
                filter: `saturate(1.5) brightness(1.5)`,
                transform: `translateY(-10px)`
              }"
              src="./resources/new.gif"
            />
          </div>
          <div class="update-button-area flex flex-items-center mt-8px">
            <el-button type="text" size="small" @click="handleDownloadNewReleaseClick"
              >从GitHub下载</el-button
            >
            |
            <el-button type="text" size="small" @click="handleViewNewReleaseClick"
              >了解更新内容</el-button
            >
          </div>
        </div>
        <div>
          <div>当前版本: {{ buildInfo.version }}({{ buildInfo.buildVersion }})</div>
          <div class="feedback-button-area flex flex-items-center mt-8px">
            <el-button type="text" size="small" @click="handleGotoProjectPageClick"
              >项目首页</el-button
            >
            |
            <el-button type="text" size="small" @click="handleFeedbackClick">反馈问题</el-button>
          </div>
        </div>
      </div>
    </div>
    <div class="router-view-wrap">
      <RouterView v-slot="{ Component }" class="flex-1 of-hidden">
        <KeepAlive>
          <component :is="Component" />
        </KeepAlive>
      </RouterView>
    </div>
    <div
      v-show="logPanelOpen && identityMode === 'recruiter'"
      class="log-panel"
      :style="{ width: logPanelWidth + 'px' }"
    >
      <div class="log-panel-resizer" @mousedown="startResize" />
      <div class="log-panel-header">
        <span>运行日志</span>
        <button class="log-clear-btn" @click="workerLogs = []">清空</button>
      </div>
      <div ref="logScrollRef" class="log-panel-body">
        <div v-if="!workerLogs.length" class="log-empty">暂无日志</div>
        <div v-for="(line, i) in workerLogs" :key="i" class="log-line">{{ line }}</div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { nextTick, ref, watch, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import useBuildInfo from '@renderer/hooks/useBuildInfo'
import { gtagRenderer } from '@renderer/utils/gtag'
import { useUpdateStore, useTaskManagerStore } from '../../store/index'
import BossPart from './LeftNavBar/BossPart.vue'
import RecruiterPart from './LeftNavBar/RecruiterPart.vue'
import GlobalConfigPart from './LeftNavBar/GlabalConfigPart.vue'
import RunDataRecordPart from './LeftNavBar/RunDataRecordPart.vue'

const router = useRouter()
const route = useRoute()

const RECRUITER_ROUTES = [
  'BossJobConfig',
  'BossAutoBrowseAndChat',
  'BossChatPage',
  'BossAutoSequence',
  'WebhookIntegration',
  'BossDebugTool',
  'BossLlmConfig'
]

function getIdentityFromRoute(routeName: string | null | symbol): 'geek' | 'recruiter' {
  if (typeof routeName === 'string' && RECRUITER_ROUTES.includes(routeName)) {
    return 'recruiter'
  }
  return 'geek'
}

const identityMode = ref<'geek' | 'recruiter'>(getIdentityFromRoute(route.name))
const identityOptions = [
  { label: '找工作', value: 'geek' },
  { label: '招人才', value: 'recruiter' }
]

watch(
  () => route.name,
  (name) => {
    identityMode.value = getIdentityFromRoute(name)
  }
)

watch(
  () => route.path,
  (path) => {
    if (path.startsWith('/main-layout/')) {
      localStorage.setItem('geekgeekrun_last_main_layout_path', path)
    }
  },
  { immediate: true }
)

function handleIdentityChange(val: string) {
  gtagRenderer('identity_mode_changed', { val })
  if (val === 'geek') {
    router.replace('/main-layout/GeekAutoStartChatWithBoss')
  } else {
    router.replace('/main-layout/BossAutoBrowseAndChat')
  }
}

const { buildInfo } = useBuildInfo()
const handleFeedbackClick = () => {
  gtagRenderer('goto_feedback_clicked')
  electron.ipcRenderer.send('send-feed-back-to-github-issue')
}
const handleGotoProjectPageClick = () => {
  gtagRenderer('goto_project_github_clicked')
  electron.ipcRenderer.send('open-external-link', 'https://github.com/geekgeekrun/geekgeekrun')
}

const updateStore = useUpdateStore()
function handleDownloadNewReleaseClick() {
  gtagRenderer('click_download_release_form_nav')
  electron.ipcRenderer.send('open-external-link', updateStore.availableNewRelease!.assetUrl)
}
function handleViewNewReleaseClick() {
  gtagRenderer('click_view_release_form_nav')
  electron.ipcRenderer.send('open-external-link', updateStore.availableNewRelease!.releasePageUrl)
}

const taskManagerStore = useTaskManagerStore()
void taskManagerStore

// --- 招聘端日志面板 ---
const RECRUITER_WORKER_IDS = [
  'bossRecommendMain',
  'bossChatPageMain',
  'bossAutoBrowseAndChatMain',
  'syncBossJobList'
]
const LOG_PANEL_STORAGE_KEY = 'geekgeekrun_log_panel_open'
const LOG_PANEL_WIDTH_KEY = 'geekgeekrun_log_panel_width'
const MAX_LOG_LINES = 500

const logPanelOpen = ref(localStorage.getItem(LOG_PANEL_STORAGE_KEY) !== 'false')
const logPanelWidth = ref(Number(localStorage.getItem(LOG_PANEL_WIDTH_KEY)) || 300)
const workerLogs = ref<string[]>([])
const logScrollRef = ref<HTMLElement | null>(null)

function toggleLogPanel() {
  logPanelOpen.value = !logPanelOpen.value
  localStorage.setItem(LOG_PANEL_STORAGE_KEY, String(logPanelOpen.value))
}

const DEVTOOLS_STORAGE_KEY = 'geekgeekrun_devtools_open'
const devToolsOpen = ref(false)

function handleToggleDevTools() {
  electron.ipcRenderer.send('toggle-devtools')
  devToolsOpen.value = !devToolsOpen.value
  localStorage.setItem(DEVTOOLS_STORAGE_KEY, String(devToolsOpen.value))
}

// 招聘端日志级别（推荐页 / 沟通页 / Webhook 等共用，存于 boss-recruiter.json）
const recruiterLogLevel = ref<string>('info')
async function loadRecruiterLogLevel() {
  try {
    const result = await electron.ipcRenderer.invoke('fetch-boss-recruiter-config-file-content')
    const config = result?.config?.['boss-recruiter.json'] || {}
    recruiterLogLevel.value = config.logLevel ?? 'info'
  } catch {
    //
  }
}
function handleRecruiterLogLevelChange(val: string) {
  electron.ipcRenderer.invoke('save-boss-recruiter-config', JSON.stringify({ logLevel: val }))
}
watch(
  () => identityMode.value,
  (mode) => {
    if (mode === 'recruiter') loadRecruiterLogLevel()
  },
  { immediate: true }
)
onMounted(() => {
  if (identityMode.value === 'recruiter') loadRecruiterLogLevel()
  if (localStorage.getItem(DEVTOOLS_STORAGE_KEY) === 'true') {
    devToolsOpen.value = true
    electron.ipcRenderer.send('toggle-devtools')
  }
})

function startResize(e: MouseEvent) {
  const startX = e.clientX
  const startWidth = logPanelWidth.value
  document.body.style.userSelect = 'none'
  const onMove = (ev: MouseEvent) => {
    const delta = startX - ev.clientX
    logPanelWidth.value = Math.max(160, Math.min(800, startWidth + delta))
  }
  const onUp = () => {
    document.body.style.userSelect = ''
    localStorage.setItem(LOG_PANEL_WIDTH_KEY, String(logPanelWidth.value))
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

watch(
  () => workerLogs.value.length,
  () => {
    if (!logPanelOpen.value) return
    nextTick(() => {
      if (logScrollRef.value) {
        logScrollRef.value.scrollTop = logScrollRef.value.scrollHeight
      }
    })
  }
)

const { ipcRenderer } = electron
ipcRenderer.on('worker-to-gui-message', (_, { data }) => {
  if (data.type === 'worker-log' && RECRUITER_WORKER_IDS.includes(data.workerId)) {
    const time = new Date().toLocaleTimeString()
    workerLogs.value.push(`[${time}] ${data.message}`)
    if (workerLogs.value.length > MAX_LOG_LINES) {
      workerLogs.value.shift()
    }
  }
})
</script>

<style lang="scss" scoped>
.aside-nav {
  background-image: linear-gradient(45deg, #eaf4f1, #dcf6f2);

  .identity-switcher {
    padding-right: 20px;
  }

  .nav-list {
    hr.group-divider {
      width: 100%;
      border: 0 solid;
      height: 1px;
      background-color: #b3c8c3;
      margin-top: 4px;
      margin-bottom: 4px;
      margin-right: 0;
    }
  }
  .feedback-button-area,
  .update-button-area,
  .recruiter-tools {
    :deep(.el-button) {
      height: fit-content;
      padding: 0;
      margin-left: 0;
    }
  }
  .recruiter-tools {
    margin-bottom: 8px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
    .recruiter-tools__log-level {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-right: 4px;
      .recruiter-tools__log-level-select {
        width: 88px;
      }
    }
    :deep(.tool-btn.active) {
      color: #32726c;
      font-weight: 600;
    }
  }
}
.router-view-wrap {
  display: flex;
  flex: 1;
  min-width: 0;
  height: 100%;
  box-shadow: -4px 1px 20px rgb(50 114 108 / 29%);
}

.log-panel {
  flex-shrink: 0;
  position: relative;
  display: flex;
  flex-direction: column;
  border-left: 1px solid #dce8e6;
  background: #f8fdfb;
  height: 100%;
  overflow: hidden;

  .log-panel-resizer {
    position: absolute;
    left: 0;
    top: 0;
    width: 4px;
    height: 100%;
    cursor: ew-resize;
    z-index: 1;
    &:hover {
      background: #b3c8c3;
    }
  }

  .log-panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    font-size: 12px;
    font-weight: 600;
    color: #32726c;
    border-bottom: 1px solid #dce8e6;
    flex-shrink: 0;

    .log-clear-btn {
      padding: 1px 8px;
      font-size: 11px;
      border: 1px solid #b3c8c3;
      border-radius: 3px;
      background: transparent;
      color: #666;
      cursor: pointer;
      &:hover {
        background: #dcf6f2;
      }
    }
  }

  .log-panel-body {
    flex: 1;
    overflow-y: auto;
    padding: 6px 8px;

    .log-empty {
      font-size: 11px;
      color: #aaa;
      text-align: center;
      margin-top: 20px;
    }

    .log-line {
      font-size: 11px;
      font-family: monospace;
      color: #444;
      line-height: 1.6;
      word-break: break-all;
      border-bottom: 1px solid #eef4f2;
      padding: 1px 0;
    }
  }
}
</style>
