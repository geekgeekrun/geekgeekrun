<template>
  <div class="group-item">
    <div class="group-title">招聘BOSS</div>
    <div flex flex-col class="link-list">
      <RouterLink :to="{ name: 'BossJobConfig' }">
        职位配置
      </RouterLink>
      <RouterLink :to="{ name: 'BossAutoBrowseAndChat' }">
        推荐牛人 - 自动开聊
      </RouterLink>
      <RouterLink :to="{ name: 'BossChatPage' }">
        沟通
      </RouterLink>
      <RouterLink :to="{ name: 'BossAutoSequence' }">
        自动顺序执行
      </RouterLink>
      <RouterLink :to="{ name: 'WebhookIntegration' }">
        Webhook / 外部集成
      </RouterLink>
      <a href="javascript:void(0)" @click="handleClickRecruiterLogin">
        编辑登录凭据<TopRight w-1em h-1em mr10px />
      </a>
      <a href="javascript:void(0)" @click="handleLaunchRecruiterBossSite">
        手动逛逛<TopRight w-1em h-1em mr10px />
      </a>
      <RouterLink :to="{ name: 'BossDebugTool' }">
        招聘端调试工具
      </RouterLink>
      <RouterLink :to="{ name: 'BossLlmConfig' }">
        配置大语言模型
      </RouterLink>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ElMessage, ElMessageBox } from 'element-plus'
import { debounce } from 'lodash'
import { TopRight } from '@element-plus/icons-vue'
import { gtagRenderer } from '@renderer/utils/gtag'

const handleClickRecruiterLogin = async () => {
  try {
    await ElMessageBox.confirm(
      'BOSS 直聘的招聘端和求职端是两个独立身份。请在接下来的登录页面中，确保以「招聘者」身份登录（即登录后能看到"推荐牛人"等招聘功能）。',
      '注意：使用招聘端账号登录',
      {
        confirmButtonText: '我知道了，去登录',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    await electron.ipcRenderer.invoke('login-with-cookie-assistant')
    ElMessage({ type: 'success', message: '登录凭据保存成功' })
  } catch {
    //
  }
}

const handleLaunchRecruiterBossSite = debounce(
  async () => {
    gtagRenderer('launch_recruiter_boss_site_clicked')
    return await electron.ipcRenderer.invoke('open-site-with-boss-cookie', {
      url: `https://www.zhipin.com/web/chat/recommend`
    })
  },
  1000,
  { leading: true, trailing: false }
)

</script>

<style scoped lang="scss" src="./style.scss"></style>
