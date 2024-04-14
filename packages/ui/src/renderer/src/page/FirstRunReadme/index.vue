<template>
  <div class="first-run-readme">
    <div class="first-run-readme__inner">
      <div class="readme-title">欢迎使用GeekGeekRun！祝您求职顺利~</div>
      <div class="readme-desc">
        如下是使用必读，请您逐条阅读；如果已经了解且接受，请在每一条前面打勾
      </div>
      <article class="readme-article">
        <ElCheckboxGroup
          v-model="readmeItemCheckStatusList"
          @change="handleReadmeItemCheckStatusListChange"
        >
          <ElCheckbox :label="0" :class="[unreadItemsAfterClickSubmit[0] ? 'unread' : '']">
            本程序从某种程度上说属于辅助工具，是与<el-link
              @click="
                electron.ipcRenderer.send(
                  'open-external-link',
                  'https://about.zhipin.com/agreement/'
                )
              "
              >《Boss直聘用户协议》</el-link
            >
            相关条款相违背的；
            根据该条款，如果一些非正常用户行为被风控监测到，您需要承受包括不仅限于<b
              class="color-red"
              >账号被强制退出登录</b
            >、<b class="color-red">账号被限制使用</b>、<b class="color-red">账号被封禁</b
            >等对您不利的风险；因此使用本程序即意味着<b class="color-red">您愿意接受以上风险</b
            >，且如果相关风险发生，<b class="color-red">您需要自行承担相关后果</b>，<b
              class="color-red"
              >本程序不负责</b
            >。
          </ElCheckbox>
          <ElCheckbox :label="1" :class="[unreadItemsAfterClickSubmit[1] ? 'unread' : '']">
            本程序会通过尽可能模仿用户行为来规避相关风险，但并不能保证可以完全规避。建议您使用本程序时<b
              class="color-red"
              >注意节制</b
            >，建议当天开聊次数用尽后，隔几天再使用。建议您<b class="color-red"
              >注册一个本程序专用的新的Boss直聘账号</b
            >进行求职。
          </ElCheckbox>
          <ElCheckbox :label="2" :class="[unreadItemsAfterClickSubmit[2] ? 'unread' : '']">
            本程序原理是模拟用户在Boss直聘网页上进行点击操作；Boss网站每过一段时间会发生改版，这可能会导致本程序相关脚本失效，此时您可以点击程序左下角进行反馈。
          </ElCheckbox>
          <ElCheckbox :label="3" :class="[unreadItemsAfterClickSubmit[3] ? 'unread' : '']">
            本程序需要存储您的登录凭据，即Cookie，来模拟您在Boss直聘上开聊Boss的行为；本程序仅会把您的Cookie存储在本地，并在您访问Boss直聘时将其传输到Boss直聘，<b
              class="color-red"
              >不会泄露给第三方</b
            >，也不会进行除自动开聊Boss以外的行为；<b class="color-red">请勿向他人泄漏您的Cookie</b
            >。
          </ElCheckbox>
          <ElCheckbox :label="4" :class="[unreadItemsAfterClickSubmit[4] ? 'unread' : '']">
            本程序不包含任何用于统计用户行为、上报程序错误的组件，<b class="color-red"
              >不会上报您的隐私（诸如求职期望、开聊记录等），也不会向您的雇主报告您的求职行为</b
            >；如果您在使用过程中遇上程序错误，您可以点击程序左下角进行反馈。
          </ElCheckbox>
          <ElCheckbox :label="5" :class="[unreadItemsAfterClickSubmit[5] ? 'unread' : '']">
            <b class="color-red">本程序不对您的求职过程与结果负责</b
            >，为您开聊的职位均在由Boss直聘为您推送的推荐职位中出现过；请<b class="color-red"
              >自行甄别为您开聊的公司、认真决定是否参加面试、慎重选择Offer</b
            >。
          </ElCheckbox>
          <ElCheckbox :label="6" :class="[unreadItemsAfterClickSubmit[6] ? 'unread' : '']">
            请在Boss直聘上<b class="color-red">屏蔽您不期望投递的公司</b>。
          </ElCheckbox>
        </ElCheckboxGroup>
      </article>
      <footer flex mt20px pb20px flex-justify-end>
        <el-button type="text" @click="handleCancel">退出程序</el-button>
        <el-button type="primary" @click="handleSubmit"
          >我已经阅读，并接受上方所提及的相关风险</el-button
        >
      </footer>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ElCheckbox, ElCheckboxGroup, ElMessage } from 'element-plus'
import { ref } from 'vue'
const electron = window.electron

const readmeItemCheckStatusList = ref<number[]>([])

const handleCancel = () => {
  electron.ipcRenderer.invoke('exit-app-immediately')
}

const unreadItemsAfterClickSubmit = ref<Record<number, true>>({})
const handleSubmit = () => {
  const COUNT = 7
  if (readmeItemCheckStatusList.value.length !== COUNT) {
    ElMessage.warning(
      `您还有${COUNT - readmeItemCheckStatusList.value.length}条没有读完，读完就打勾标记一下吧`
    )
    unreadItemsAfterClickSubmit.value = {}
    for (let i = 0; i < COUNT; i++) {
      if (!readmeItemCheckStatusList.value.includes(i)) {
        unreadItemsAfterClickSubmit.value[i] = true
      }
    }
    return
  }
  electron.ipcRenderer.invoke('first-launch-notice-approve')
}
const handleReadmeItemCheckStatusListChange = (value: number[]) => {
  value.forEach((it) => {
    if (unreadItemsAfterClickSubmit.value[it]) {
      delete unreadItemsAfterClickSubmit.value[it]
    }
  })
}
</script>

<style lang="scss" scoped>
.first-run-readme {
  max-width: 640px;
  margin: 0 auto;
  height: 100vh;
  box-sizing: border-box;
  &__inner {
    padding-top: 30px;
    .readme-title {
    }
    .readme-desc {
      margin-top: 10px;
    }
    .readme-article {
      margin-top: 10px;
      :deep(.el-checkbox) {
        height: fit-content;
        align-items: flex-start;
        margin-right: 0;
        padding-left: 8px;
        border-left: 4px solid transparent;
        &.unread {
          border-left-color: #f77a36;
          background-color: #fff5df;
        }
        .el-checkbox__input {
          margin-top: 3px;
        }
        .el-checkbox__label {
          line-height: 1.5em;
          white-space: normal;
        }
        & + .el-checkbox {
          margin-top: 8px;
        }
        &.is-checked .el-checkbox__label {
          color: unset;
          opacity: 0.6;
        }
      }
    }
  }
}
</style>
