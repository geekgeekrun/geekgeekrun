<template>
  <div class="h-screen of-hidden flex flex-col flex-items-center flex-justify-between">
    <div flex-1 of-hidden w-full>
      <el-form ref="formRef" :model="formData" :rules="rules" flex flex-col of-hidden h-full>
        <div class="bg-#f6f6f6" flex-0>
          <el-form-item
            class="w-80%"
            label="浏览器可执行文件路径"
            prop="browserPath"
            pt50px
            pb50px
            ml-auto
            mr-auto
            mb-0
          >
            <div flex flex-1>
              <el-input v-model="formData.browserPath" />
              <el-button type="primary" @click="autoDetectPuppeteerExecutable">自动检测</el-button>
              <el-button :style="{ marginLeft: 0 }" @click="browserExecutableFile">浏览</el-button>
            </div>
          </el-form-item>
        </div>
        <div flex-1 of-auto font-size-14px line-height-1.5em>
          <div mt10px ml-auto mr-auto class="w-80%">
            <div>常见问题</div>
            <div>
              <details>
                <summary>不能自动检测到浏览器？</summary>
                <div ml12px class="color-#666">
                  请尝试如下方案之一来处理：
                  <ul pl1em m0>
                    <li>
                      方案一：通过本程序下载 Google Chrome for Testing
                      {{ EXPECT_CHROMIUM_BUILD_ID }} -
                      <a href="javascript:;" @click="handleClickLaunchBrowserDownloader">点击此处</a
                      >即可下载；这个浏览器仅供本程序使用，不会影响到当前 Google Chrome
                      安装。本程序开发过程中主要是使用这个浏览器测试的，<span color-orange
                        >可以保证兼容性</span
                      >。网络波动，有一定概率下载失败；如多次尝试后确实不能下载成功，请尝试方案二。<span
                        color-orange
                        >（推荐）</span
                      >
                    </li>
                    <li>
                      方案二：手动安装 Google Chrome 最新版本 -
                      <a href="javascript:;" @click="handleOpenChromeDownloadPage">点击此处</a>打开
                      Google Chrome
                      官方网站，找到浏览器下载页面来下载安装程序。下载完毕后，执行安装程序。安装完成后，点击上方<a
                        href="javascript:;"
                        @click="autoDetectPuppeteerExecutable"
                        >自动检测</a
                      >按钮再次尝试。目前（2026.2.7）已知 Chrome 最新版本为 144.0.7559.133
                      ，多数情况下本程序都可以正常工作，但由于浏览器会自动升级，版本不固定，可能存在<span color-orange
                        >浏览器升级后某些功能不兼容导致本程序不能正确运行</span
                      >的问题。您可以<a href="javascript:;" @click="handleFeedbackClick"
                        >提交 Issue</a
                      >来反馈新版本浏览器不能正常运行的问题，同时请再尝试方案一。
                    </li>
                  </ul>
                </div>
              </details>
            </div>
          </div>
        </div>
      </el-form>
    </div>
    <div class="bg-#f8f8f8 pb10px pt10px w-full flex-0">
      <div
        :style="{
          display: 'flex',
          justifyContent: 'end',
          width: '80%',
          margin: '0 auto',
          paddingLeft: '',
          paddingRight: ''
        }"
      >
        <el-button @click="handleCancel">取消</el-button>
        <el-button type="primary" @click="handleSave">确定</el-button>
      </div>
    </div>
  </div>
  <!-- <div class="h60px mt14px">
      <RouterView
        class="h100%"
        :dependencies-status="checkDependenciesResult"
        :process-waitee="downloadProcessWaitee"
      ></RouterView>
    </div> -->
</template>

<script lang="ts" setup>
import { useRouter } from 'vue-router'
import { ref } from 'vue'
import debounce from 'lodash/debounce'
import { ElMessage } from 'element-plus'
import { gtagRenderer as baseGtagRenderer } from '@renderer/utils/gtag'
import { EXPECT_CHROMIUM_BUILD_ID } from '../../../../common/constant'

const { ipcRenderer } = electron
useRouter()
// const checkDependenciesResult = ref({})
// const downloadProcessWaitee = ref(null)

const gtagRenderer = (name, params?: object) => {
  return baseGtagRenderer(name, {
    scene: 'cookie-assistant',
    ...params
  })
}

const handleOpenChromeDownloadPage = debounce(
  async () => {
    gtagRenderer('open_chrome_download_page_clicked')
    ipcRenderer.send('open-external-link', 'https://www.google.cn/chrome/')
  },
  1000,
  { leading: true, trailing: false }
)

const formData = ref({
  browserPath: ''
})

const rules = {
  browserPath: {
    validator: async (_, value, callback) => {
      if (!value?.trim()) {
        callback(new Error('请输入浏览器可执行文件路径'))
        return
      }
      const err = await ipcRenderer.invoke('check-executable-file', value)
      if (err) {
        callback(err?.message ?? '文件无效 - 未知原因')
      } else {
        callback()
      }
    },
    trigger: 'blur'
  }
}

async function autoDetectPuppeteerExecutable() {
  const result = await ipcRenderer.invoke('get-any-available-puppeteer-executable', {
    ignoreCached: true,
    noSave: true
  })
  if (!result) {
    ElMessage({
      message: '未检测到可用浏览器的可执行文件',
      type: 'warning',
      grouping: true
    })
    return
  }
  formData.value.browserPath = result.executablePath
  ElMessage({
    message: '已找到可用浏览器，可执行文件路径已填入输入框',
    type: 'success',
    grouping: true
  })
}

async function browserExecutableFile() {
  const chooseResult = await ipcRenderer.invoke('choose-file', {
    fileChooserConfig: {
      properties: ['openFile', 'treatPackageAsDirectory'],
      filters: [
        {
          name: '可执行文件',
          extensions: (await ipcRenderer.invoke('get-os-platform')) === 'win32' ? ['exe'] : ['']
        },
        { name: '所有文件', extensions: ['*'] }
      ]
    }
  })
  if (chooseResult.canceled || !chooseResult.filePaths?.length) {
    return
  }
  formData.value.browserPath = chooseResult.filePaths[0]
}

ipcRenderer.invoke('get-last-used-and-available-browser').then((res) => {
  formData.value.browserPath = res?.executablePath ?? ''
})
function handleCancel() {
  gtagRenderer('cancel_clicked')
  window.close()
}
const formRef = ref()
async function handleSave() {
  await formRef.value.validate()
  await ipcRenderer.invoke('save-last-used-and-available-browser-info', {
    executablePath: formData.value.browserPath,
    browser: ''
  })
  await ipcRenderer.send('browser-config-saved')
}
const handleFeedbackClick = () => {
  gtagRenderer('goto_feedback_for_ba_clicked')
  electron.ipcRenderer.send('send-feed-back-to-github-issue')
}
const handleClickLaunchBrowserDownloader = async () => {
  gtagRenderer('launch_browser_downloader_clicked')
  const downloadedBrowserPath = await electron.ipcRenderer.invoke('download-browser-with-downloader')
  if (downloadedBrowserPath) {
    formData.value.browserPath = downloadedBrowserPath
    ElMessage({
      message: '浏览器下载成功，可执行文件路径已填入输入框',
      type: 'success',
      grouping: true
    })
  }
}
</script>

<style lang="scss" scoped>
a:link,
a:visited,
a:hover,
a:active {
  color: #409eff;
}
</style>
