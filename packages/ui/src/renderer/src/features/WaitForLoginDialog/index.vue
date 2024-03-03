<template>
  <el-dialog
    v-bind="$attrs"
    :close-on-click-modal="false"
    title="Boss直聘 Cookie助手"
    :width="720"
    top="20px"
    lock-scroll
  >
    <el-alert type="warning" title="需要获取您的Boss直聘Cookie才能继续">
      由于您是首次使用本程序，或者您之前使用的Boss直聘账号登录状态失效，因此您需要重新获取登录凭证。
    </el-alert>
    <div ml1em mt1em>
      如果您了解Cookie如何获取Cookie：请打开您已登录过Boss直聘的浏览器，使用
      <a
        color-blue
        decoration-none
        href="javascript:void(0)"
        @click.prevent="handleEditThisCookieExtensionStoreLinkClick"
        >EditThisCookie 扩展程序/插件</a
      >
      进行复制，然后粘贴在下方输入框中。<br />
      格式为被序列化为JSON的数组，不含两侧引号。
    </div>
    <br />
    <div ml1em>如果您不了解相关概念，请按照以下步骤进行操作：</div>
    <ol lh-2em mt-0>
      <li>
        <el-button size="small" type="primary" font-size-inherit @click="handleClickLaunchLogin"
          >点击此处</el-button
        >
        启动浏览器
      </li>
      <li>按照正常流程，通过 <b>短信验证码/二维码/微信小程序</b> 登录您的Boss直聘账号</li>
      <li>
        如果流程顺利，登录后预计5-10秒内，您将可以在下方输入框看到您的Cookie
        <details>
          <summary color-orange cursor-pointer>我已完成登录，但Cookie一直没出现？</summary>
          <div ml-2em max-h-200px of-auto>
            如果您确实已经在打开浏览器中看到您已登录了Boss直聘，请尝试按照如图所示方式复制Cookie：
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
        ></el-input>
        <el-alert
          v-if="!formContent.collectedCookies"
          :closable="false"
          title="正在等待登录……"
        ></el-alert>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button type="primary" @click="handleSubmit">确定</el-button>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>
import { ElForm, ElMessage } from 'element-plus';
import { ref, onUnmounted, onMounted } from 'vue'
const props = defineProps({
  dispose: Function
})

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
          return
        }

        const allExpectKeySet = new Set([
          'name',
          'value',
          'domain',
          'path',
          'secure',
          'session',
          'httpOnly'
        ])
        if (
          !Array.isArray(arr) ||
          !arr.length ||
          !(
            arr.length > 0 &&
            arr.some((it) => {
              const currentOwnedKeySet = new Set(Object.keys(it))
              if (currentOwnedKeySet.size < allExpectKeySet.size) {
                return false
              }

              const allExpectKeyArr = [...allExpectKeySet]
              for (let i = 0; i < allExpectKeyArr.length; i++) {
                if (!currentOwnedKeySet.has(allExpectKeyArr[i])) {
                  return false
                }
              }
              return true
            })
          )
        ) {
          cb(new Error(`Cookie格式无效 - 部分字段缺失；建议使用EditThisCookie扩展程序进行复制。`))
          return
        }
        cb()
      }
    }
  ]
}

const handleCookieCollected = (_, payload) => {
  formContent.value.collectedCookies = JSON.stringify(payload.cookies, null, 2)
}

const handleClickLaunchLogin = () => {
  electron.ipcRenderer.send('launch-bosszhipin-login-page-with-preload-extension')
}

const handleEditThisCookieExtensionStoreLinkClick = () => {
  electron.ipcRenderer.send(
    'open-external-link',
    'https://chromewebstore.google.com/detail/editthiscookie/fngmhnnpilhplaeedifhccceomclgfbg'
  )
}

const handleSubmit = async () => {
  await formRef.value!.validate()
  await electron.ipcRenderer.invoke('write-storage-file', {
    fileName: 'boss-cookies.json',
    data: formContent.value.collectedCookies
  })
  ElMessage.success('Boss直聘 Cookie 保存成功')
  props.dispose()
}

onMounted(() => {
  electron.ipcRenderer.once('BOSS_ZHIPIN_COOKIE_COLLECTED', handleCookieCollected)
})
onUnmounted(() => {
  electron.ipcRenderer.removeListener('BOSS_ZHIPIN_COOKIE_COLLECTED', handleCookieCollected)
})
</script>

<style lang="scss">
.cookie-form.el-form {
  .el-form-item__error--inline {
    margin-left: 0;
    margin-top: 10px;
  }
}
</style>
