<template>
  <div class="cookie-assistant-page">
    <div ml1em mt1em mb1em font-size-16px>BOSS登录助手</div>
    <el-alert v-if="cookieInvalid" type="warning" :closable="false">
      由于您是首次使用本程序，或者您之前使用的BOSS直聘账号登录状态失效，因此您需要重新获取登录凭证
    </el-alert>
    <div ml1em mt1em line-height-normal>
      如果您了解如何获取Cookie、了解有效的Cookie格式，可以直接在下方输入框中进行编辑。由于手动编辑较为麻烦，建议您打开已登录过BOSS直聘的浏览器，使用<a
        class="color-blue! decoration-none"
        href="javascript:void(0)"
        @click.prevent="handleEditThisCookieExtensionStoreLinkClick"
      >
        EditThisCookie 扩展程序 </a
      >复制Cookie，然后粘贴在下方输入框中。文本格式为被序列化为JSON的数组，不含两侧引号。
    </div>
    <br />
    <div ml1em line-height-normal>
      如果您不了解Cookie相关概念，或者期望操作简单一些，请按照以下步骤进行操作：
    </div>
    <ol lh-2em mt-0>
      <li>
        <el-button size="small" type="primary" font-size-inherit @click="handleClickLaunchLogin"
          >点击此处</el-button
        >
        启动浏览器
      </li>
      <li>按照正常流程，通过 <b>短信验证码/二维码/微信小程序</b> 登录您的BOSS直聘账号</li>
      <li>接下来将自动进行一些页面跳转，最终将会停留在首页</li>
      <li>
        登录后预计5-10秒内（具体取决于您的网速），您的Cookie将被自动填入下方输入框。
        <details>
          <summary color-orange cursor-pointer>我已完成登录，但Cookie一直没出现？</summary>
          <div ml-2em max-h-200px of-auto>
            如果您确实已经在打开浏览器中看到您已登录了BOSS直聘，请尝试按照如图所示方式复制Cookie：
            <figure>
              <figcaption>依次点击浏览器右上角“扩展程序”图标、“EditThisCookie”图标</figcaption>
              <img block max-w-full src="./resources/copy-cookie-step-1.png" />
            </figure>
            <figure>
              <figcaption>点击“EditThisCookie”弹出框中的“Export”按钮</figcaption>
              <img block max-w-full src="./resources/copy-cookie-step-2.png" />
            </figure>
            <figure>
              <figcaption>在下方输入框执行粘贴操作。</figcaption>
            </figure>
          </div>
        </details>
      </li>
    </ol>
    <el-form
      ref="formRef"
      inline-message
      :model="formContent"
      label-position="top"
      :rules="formRules"
      class="cookie-form"
    >
      <el-form-item prop="collectedCookies" mb-0>
        <el-input
          v-model="formContent.collectedCookies"
          type="textarea"
          :autosize="{
            minRows: 10,
            maxRows: 10
          }"
          font-size-12px
          @input="hasUserMutateInput = true"
        ></el-input>
        <el-alert
          v-if="loginCookieWaitingStatus === LOGIN_COOKIE_WAITING_STATUS.WAITING_FOR_LOGIN"
          :closable="false"
          >正在等待登录……</el-alert
        >
        <el-alert
          v-if="loginCookieWaitingStatus === LOGIN_COOKIE_WAITING_STATUS.COOKIE_COLLECTED"
          :closable="false"
          type="success"
          >已获取到Cookie<template v-if="hasUserMutateInput"
            >；看起来您似乎正在尝试手动输入Cookie？<el-button
              size="small"
              type="primary"
              font-size-inherit
              @click="
                () => {
                  gtagRenderer('replace_inputted_cookie_by_collected')
                  fillCollectedCookie()
                }
              "
              >使用获取到的Cookie</el-button
            ></template
          ></el-alert
        >
      </el-form-item>
    </el-form>
    <footer flex mt20px pb20px flex-justify-end>
      <el-button @click="handleCancel">取消</el-button>
      <el-button type="primary" @click="handleSubmit">确定</el-button>
    </footer>
  </div>
</template>

<script lang="ts" setup>
import { ElForm, ElMessage } from 'element-plus'
import { ref, onUnmounted, onMounted } from 'vue'
import { checkCookieListFormat } from '../../../../common/utils/cookie'
import { useRouter } from 'vue-router'
import { gtagRenderer as baseGtagRenderer } from '@renderer/utils/gtag'

const gtagRenderer = (name, params?: object) => {
  return baseGtagRenderer(name, {
    scene: 'cookie-assistant',
    ...params
  })
}
const router = useRouter()
const cookieInvalid = ref(false)

enum LOGIN_COOKIE_WAITING_STATUS {
  INIT,
  WAITING_FOR_LOGIN,
  COOKIE_COLLECTED
}
const loginCookieWaitingStatus = ref(LOGIN_COOKIE_WAITING_STATUS.INIT)

const formRef = ref<InstanceType<typeof ElForm>>()
const formContent = ref({
  collectedCookies: ''
})

const formRules = {
  collectedCookies: [
    {
      required: true,
      message: '请输入Cookie'
    },
    {
      trigger: 'blur',
      validator(rule, val, cb) {
        let arr
        try {
          arr = JSON.parse(val)
        } catch (err) {
          cb(
            new Error(
              `JSON格式无效 - 存在语法错误: ${err.message}；建议使用EditThisCookie扩展程序进行复制。`
            )
          )
          gtagRenderer('wrong_cookie_format_json_syntax_error')
          return
        }

        if (!checkCookieListFormat(JSON.parse(formContent.value.collectedCookies))) {
          cb(new Error(`Cookie格式无效 - 部分字段缺失；建议使用EditThisCookie扩展程序进行复制。`))
          gtagRenderer('wrong_cookie_format_field_loss')
          return
        }
        cb()
      }
    }
  ]
}

const hasUserMutateInput = ref(false)
const collectedCookie = ref()
const handleCookieCollected = (_, payload) => {
  loginCookieWaitingStatus.value = LOGIN_COOKIE_WAITING_STATUS.COOKIE_COLLECTED
  collectedCookie.value = payload.cookies
  if (!hasUserMutateInput.value) {
    fillCollectedCookie()
    gtagRenderer('cookie_collected_and_auto_filled')
  } else {
    gtagRenderer('cookie_collected_after_changed_input')
  }
}
const fillCollectedCookie = () => {
  if (loginCookieWaitingStatus.value !== LOGIN_COOKIE_WAITING_STATUS.COOKIE_COLLECTED) {
    return
  }
  formContent.value.collectedCookies = JSON.stringify(collectedCookie.value, null, 2)
  hasUserMutateInput.value = false
}

const handleClickLaunchLogin = () => {
  gtagRenderer('launch_login_button_clicked')
  electron.ipcRenderer.send('launch-bosszhipin-login-page-with-preload-extension')
  loginCookieWaitingStatus.value = LOGIN_COOKIE_WAITING_STATUS.WAITING_FOR_LOGIN
}

const handleEditThisCookieExtensionStoreLinkClick = () => {
  gtagRenderer('etc_extension_link_clicked')
  electron.ipcRenderer.send(
    'open-external-link',
    'https://chromewebstore.google.com/detail/editthiscookie-v3/ojfebgpkimhlhcblbalbfjblapadhbol'
  )
}

const handleCancel = () => {
  gtagRenderer('cancel_clicked')
  window.close()
}
const handleSubmit = async () => {
  gtagRenderer('save_clicked')
  await formRef.value!.validate()
  await electron.ipcRenderer.invoke('write-storage-file', {
    fileName: 'boss-cookies.json',
    data: formContent.value.collectedCookies
  })
  ElMessage.success('BOSS直聘 Cookie 保存成功')
  gtagRenderer('save_cookie_done')

  window.electron.ipcRenderer.send('cookie-saved')
}

const handleBossZhipinLoginPageClosed = () => {
  if (loginCookieWaitingStatus.value === LOGIN_COOKIE_WAITING_STATUS.WAITING_FOR_LOGIN) {
    loginCookieWaitingStatus.value = LOGIN_COOKIE_WAITING_STATUS.INIT
  }
}

onMounted(() => {
  gtagRenderer('cookie_assistant_mounted')
})
onMounted(async () => {
  electron.ipcRenderer.once('BOSS_ZHIPIN_COOKIE_COLLECTED', handleCookieCollected)
  electron.ipcRenderer.on('BOSS_ZHIPIN_LOGIN_PAGE_CLOSED', handleBossZhipinLoginPageClosed)

  const cookieFileContent = await electron.ipcRenderer.invoke('read-storage-file', {
    fileName: 'boss-cookies.json'
  })
  if (checkCookieListFormat(cookieFileContent)) {
    formContent.value.collectedCookies = JSON.stringify(cookieFileContent, null, 2)
  } else {
    cookieInvalid.value = true
  }
})
onUnmounted(() => {
  electron.ipcRenderer.removeListener('BOSS_ZHIPIN_COOKIE_COLLECTED', handleCookieCollected)
  electron.ipcRenderer.removeListener(
    'BOSS_ZHIPIN_LOGIN_PAGE_CLOSED',
    handleBossZhipinLoginPageClosed
  )
  electron.ipcRenderer.send('kill-bosszhipin-login-page-with-preload-extension')
})
</script>

<style lang="scss" scoped>
.cookie-assistant-page {
  max-width: 640px;
  margin: 0 auto;
  font-size: 14px;
}
</style>

<style lang="scss">
.cookie-form.el-form {
  .el-form-item__error--inline {
    margin-left: 0;
    margin-top: 10px;
  }
}
</style>
