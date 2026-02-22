<template>
  <div class="flex h100vh">
    <div class="flex flex-col min-w200px w200px pt30px pl30px aside-nav of-hidden">
      <div class="nav-list flex-1 of-auto pl20px ml--20px">
        <RouterLink v-show="false" to="./TaskManager">任务管理</RouterLink>
        <BossPart />
        <hr class="group-divider" />
        <GlobalConfigPart />
        <hr class="group-divider" />
        <RunDataRecordPart />
      </div>
      <div class="pt-16px pb-16px flex-0 font-size-12px">
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
  </div>
</template>

<script lang="ts" setup>
import { useRouter } from 'vue-router'
import useBuildInfo from '@renderer/hooks/useBuildInfo'
import { gtagRenderer } from '@renderer/utils/gtag'
import { useUpdateStore, useTaskManagerStore } from '../../store/index'
import BossPart from './LeftNavBar/BossPart.vue'
import GlobalConfigPart from './LeftNavBar/GlabalConfigPart.vue'
import RunDataRecordPart from './LeftNavBar/RunDataRecordPart.vue'

useRouter()

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
</script>

<style lang="scss" scoped>
.aside-nav {
  background-image: linear-gradient(45deg, #eaf4f1, #dcf6f2);
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
  .update-button-area {
    :deep(.el-button) {
      height: fit-content;
      padding: 0;
      margin-left: 0;
    }
  }
}
.router-view-wrap {
  display: flex;
  flex: 1;
  height: 100%;
  box-shadow: -4px 1px 20px rgb(50 114 108 / 29%);
}
</style>
