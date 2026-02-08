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
              <el-button
                type="primary"
                :loading="isAutoDetectLoading"
                @click="autoDetectPuppeteerExecutable"
                >自动检测</el-button
              >
              <el-button :style="{ marginLeft: 0 }" @click="chooseExecutableFile">浏览</el-button>
            </div>
          </el-form-item>
        </div>
        <div flex-1 of-auto font-size-14px line-height-1.5em>
          <div mt10px ml-auto mr-auto class="w-80%">
            <div>常见问题</div>
            <div class="faq-main">
              <details class="faq-item">
                <summary>不能自动检测到浏览器？</summary>
                <div class="faq-answer">
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
                        :loading="isAutoDetectLoading"
                        @click="autoDetectPuppeteerExecutable"
                        >自动检测</a
                      >按钮再次尝试。截至本程序开发时（2026.2.7）Google Chrome 最新版本为
                      144.0.7559.133
                      ，多数情况下本程序都可以正常工作，但由于浏览器会自动升级，版本不固定，可能存在<span
                        color-orange
                        >浏览器升级后某些功能不兼容导致本程序不能正确运行</span
                      >的问题。如果您确实遇到不能正常运行的问题，请<a
                        href="javascript:;"
                        @click="handleFeedbackClick"
                        >提交 Issue</a
                      >来反馈，同时请再尝试方案一。
                    </li>
                  </ul>
                </div>
              </details>
              <details class="faq-item">
                <summary>
                  如果我要自定义浏览器，那么可选择的浏览器有哪些？对于浏览器有什么要求？
                </summary>
                <div class="faq-answer">
                  <div>
                    截至本程序开发时（2026.2.7），已确定支持的各操作系统下的浏览器及版本包括：
                  </div>
                  <ul>
                    <li>
                      <div>macOS</div>
                      <ul>
                        <li>Google Chrome for Testing {{ EXPECT_CHROMIUM_BUILD_ID }}</li>
                        <li>Google Chrome 144.0.7559.133</li>
                        <li>Microsoft Edge 144.0.3719.115</li>
                      </ul>
                    </li>
                    <li>
                      <div>Windows</div>
                      <ul>
                        <li>Google Chrome for Testing {{ EXPECT_CHROMIUM_BUILD_ID }}</li>
                        <li>Google Chrome 144.0.7559.133</li>
                        <li>Microsoft Edge 144.0.3719.93</li>
                        <li>Opera 127.0.5778.14（基于 Chromium 143.0.7499.194）</li>
                        <li>Yandex Browser 25.12.3.1126 （基于 Chromium 142.0.7444.1126）</li>
                      </ul>
                    </li>
                    <li>
                      <div>Linux (Ubuntu)</div>
                      <ul>
                        <li>Google Chrome for Testing {{ EXPECT_CHROMIUM_BUILD_ID }}</li>
                      </ul>
                    </li>
                  </ul>
                  <div>
                    下列浏览器可以使用，但由于Chromium内核版本低于本程序设置的版本，可能存在潜在问题，不一定能完全支持所有功能，你可以尝试进行配置：
                  </div>
                  <ul>
                    <li>
                      <div>Windows</div>
                      <ul>
                        <li>360 安全浏览器 16.1.2552.64 （基于 Chromium 132.0.6834.83）</li>
                        <li>360 极速浏览器X 23.1.1187.64 （基于 Chromium 132.0.6805.0）</li>
                        <li>夸克 6.4.0.728 （基于 Chromium 130.0.6723.44）</li>
                      </ul>
                    </li>
                  </ul>
                  <div>下列浏览器经过测试已明确不可用：</div>
                  <ul>
                    <li>
                      <div>Windows</div>
                      <ul>
                        <li>QQ 浏览器 20.1.0 （基于 Chromium 116.0.5845.97）</li>
                        <li>搜狗高速浏览器 13.8 （基于 Chromium 116.0.5845.97）</li>
                        <li>猎豹浏览器（基于 Chromium 112.0.5615.138）</li>
                        <li>Brave 1.86.148 （基于 Chromium 144.0.7559.133）</li>
                      </ul>
                    </li>
                  </ul>
                  <div>
                    本程序目前仅支持 Chromium 内核浏览器，因此 Safari、Firefox、Windows Internet
                    Explorer、旧版 Microsoft Edge 等<span color-orange
                      >非Chromium内核浏览器无法使用</span
                    >；同时，对于 Chromium 内核浏览器，本程序<span color-orange
                      >仅支持
                      {{ EXPECT_CHROMIUM_BUILD_ID }}
                      或更高内核版本</span
                    >，你可以打开在你想要尝试的浏览器，访问 “chrome://version” 找到 ”用户代理“ /
                    ”User Agent“ 行来查看当前浏览器的内核版本。<br />
                    目前，大部分中国大陆厂商发布的基于Chromium内核的浏览器，均由于版本过低，不被本程序支持。
                  </div>
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
import { nextTick, ref } from 'vue'
import debounce from 'lodash/debounce'
import { ElMessage } from 'element-plus'
import { gtagRenderer as baseGtagRenderer } from '@renderer/utils/gtag'
import { EXPECT_CHROMIUM_BUILD_ID } from '../../../../common/constant'
import { sleep } from '@geekgeekrun/utils/sleep.mjs'
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

const isAutoDetectLoading = ref(false)
async function autoDetectPuppeteerExecutable() {
  isAutoDetectLoading.value = true
  await sleep(50)
  try {
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
    await nextTick()
    await formRef.value.validateField()
  } finally {
    isAutoDetectLoading.value = false
  }
}

async function chooseExecutableFile() {
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
  await nextTick()
  await formRef.value.validateField()
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
  const downloadedBrowserPath = await electron.ipcRenderer.invoke(
    'download-browser-with-downloader'
  )
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

.faq-main {
  .faq-item {
    summary {
      padding: 4px 0;
    }
    .faq-answer {
      color: #666;
      margin-left: 12px;
      ul {
        margin-top: 0;
        margin-bottom: 0;
        padding-left: 1em;
      }
    }
  }
}
</style>
