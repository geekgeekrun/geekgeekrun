<template>
  <el-dialog v-bind="$attrs" :close-on-click-modal="false" title="Boss直聘 Cookie助手" :width="600">
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
        <div>
          <details>
            <summary color-orange cursor-pointer>我已完成登录，但Cookie一直没出现？</summary>
            <div ml-2em>
              如果您确实已经在浏览器中看到您已登录了Boss直聘，请尝试按照如图所示方式复制Cookie：
              <figure></figure>
              然后粘贴您刚刚复制的内容到下方输入框。粘贴后，将
            </div>
          </details>
        </div>
      </li>
    </ol>
    <el-input
      v-model="collectedCookies"
      type="textarea"
      :autosize="{
        minRows: 4,
        maxRows: 10
      }"
      font-size-12px
    ></el-input>
    <el-alert v-if="!collectedCookies" :closable="false">正在等待登录……</el-alert>
  </el-dialog>
</template>

<script lang="ts" setup>
import { ref, onUnmounted, onMounted } from 'vue'
const props = defineProps({
  dispose: Function
})

const collectedCookies = ref('')

const handleCookieCollected = (_, payload) => {
  collectedCookies.value = JSON.stringify(payload.cookies, null, 2)
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

onMounted(() => {
  electron.ipcRenderer.once('BOSS_ZHIPIN_COOKIE_COLLECTED', handleCookieCollected)
})
onUnmounted(() => {
  electron.ipcRenderer.removeListener('BOSS_ZHIPIN_COOKIE_COLLECTED', handleCookieCollected)
})
</script>
