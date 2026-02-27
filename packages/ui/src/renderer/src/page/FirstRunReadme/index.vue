<template>
  <div ref="componentRootEl" class="first-run-readme">
    <div class="first-run-readme__inner-outer">
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
              本程序从某种程度上说属于辅助工具，与<el-link
                color-blue
                @click.stop.prevent="
                  () => {
                    electron.ipcRenderer.send(
                      'open-external-link',
                      'https://about.zhipin.com/agreement/'
                    )
                    gtagRenderer('view_boss_agreement_clicked')
                  }
                "
                >《BOSS直聘用户协议》</el-link
              >（2023年3月版）相关条款相违背，您在注册BOSS直聘时已签署过这一条款；根据该条款
              <i>七、用户的平台使用义务</i>、<i>八、违约责任</i>
              章节，如果一些非正常用户行为被风控监测到，您需要承受包括不仅限于<b class="color-red"
                >账号被强制退出登录、账号被限制使用、账号被封禁</b
              >等对您不利的风险；因此使用本程序即意味着<b class="color-red">您愿意接受以上风险</b
              >，且如果相关风险发生，<b class="color-red">您需要自行承担相关后果，本程序不负责</b>。
            </ElCheckbox>
            <ElCheckbox :label="1" :class="[unreadItemsAfterClickSubmit[1] ? 'unread' : '']">
              本程序需要存储您的登录凭据，即Cookie，来模拟您在BOSS直聘上开聊BOSS的行为；本程序仅会把您的Cookie存储在本地，并在您访问BOSS直聘时将其传输到BOSS直聘，<b
                class="color-red"
                >不会泄露给第三方</b
              >，也不会进行除自动开聊BOSS以外的行为；<b class="color-red">请勿向他人泄漏您的Cookie</b
              >。
            </ElCheckbox>
            <ElCheckbox :label="2" :class="[unreadItemsAfterClickSubmit[2] ? 'unread' : '']">
              本程序会通过尽可能模仿用户行为来规避相关风险，但并不能保证可以完全规避。建议您使用本程序时<b
                class="color-red"
                >注意节制</b
              >，建议当天开聊次数用尽后，隔几天再使用。建议您<b class="color-red"
                >注册一个本程序专用的新的BOSS直聘账号</b
              >进行求职。
            </ElCheckbox>
            <ElCheckbox :label="3" :class="[unreadItemsAfterClickSubmit[3] ? 'unread' : '']">
              本程序原理是模拟用户在BOSS直聘网页上，寻找关键元素并进行点击操作；BOSS直聘网站经常<b>发生改版</b>，且有可能<b>包含A/B实验</b>，这将导致本程序相关脚本失效（典型表现为本程序运行到某一步骤后，<b
                class="color-red"
                >浏览器重复“闪退、重新启动”</b
              >）。如果您在使用过程中遇上程序未按照预期执行的情况，请点击程序左下角进行反馈。
            </ElCheckbox>
            <ElCheckbox :label="4" :class="[unreadItemsAfterClickSubmit[4] ? 'unread' : '']">
              您所在公司可能会采购上网行为监控工具或网关（例如奇安信、深信服、绿盟等厂商的产品），对您的计算机终端或网络进行<b
                color-red
                >监控</b
              >，从而<b color-red>审计、跟踪</b>您的行为；您的上级/IT/HR
              可能会获取到监控数据，从而了解团队成员离职倾向。如果您不希望您的上级/IT/HR
              了解到您正在求职，建议您<b color-red
                >不要在您所在公司提供的计算机终端或网络上使用本程序</b
              >。
            </ElCheckbox>
            <ElCheckbox :label="5" :class="[unreadItemsAfterClickSubmit[5] ? 'unread' : '']">
              本程序尊重您的隐私，<b color-red
                >不会上报能够识别出您身份的信息、不会参与任何钓鱼活动、不会向您所在公司及您的上级/IT/HR报告您的求职行为、不会向猎头公司泄露您的信息</b
              >。但由于本程序开源，<b color-red
                >任何人均可更改本程序源码并重新发布，这一过程中其它开发者是可以加入恶意程序的，因此请从你信任的源下载本程序</b
              >。
            </ElCheckbox>

            <ElCheckbox :label="6" :class="[unreadItemsAfterClickSubmit[6] ? 'unread' : '']">
              本程序<b class="color-red">没有内置任何付费功能</b>，<b class="color-red"
                >下载、使用是免费的</b
              >，任何人可以<b class="color-red">免费获得、免费使用</b>。<b class="color-red"
                >作者没有利用本程序赚到过任何收入</b
              >。如果您是从GitHub以外的地方付费后“购买”的本程序，或您被提示“必须付费后才能使用本程序”，<b
                class="color-red"
                >那您大概率被骗了</b
              >，或者<b class="color-red">您下载到了本程序修改版</b>。<b class="color-red"
                >本程序对此概不负责，请勿找作者商讨退款、售后事宜，相关事宜请咨询卖方</b
              >。
            </ElCheckbox>
            <ElCheckbox :label="7" :class="[unreadItemsAfterClickSubmit[7] ? 'unread' : '']">
              本程序<b class="color-red">不对您的求职过程与结果负责</b
              >，为您开聊的职位均在BOSS直聘上发布，职位信息真实性由BOSS直聘负责；请<b
                class="color-red"
                >自行甄别为您开聊的公司、认真决定是否参加面试、慎重选择Offer</b
              >。
            </ElCheckbox>
            <ElCheckbox :label="8" :class="[unreadItemsAfterClickSubmit[8] ? 'unread' : '']">
              请在BOSS直聘上自行<b class="color-red">屏蔽您不期望投递的公司</b
              >；如果您不希望您当前公司其它具有招聘账号的员工看到您在BOSS直聘上活跃，请<b
                class="color-red"
                >在BOSS直聘上屏蔽当前公司及与之关联的公司</b
              >。
            </ElCheckbox>
            <ElCheckbox :label="9" :class="[unreadItemsAfterClickSubmit[9] ? 'unread' : '']">
              本程序经历过了多次测试，理论上来说大部分情况下可以正常运行，但可能也会出现测试用例覆盖不到位，导致程序不按预期运行的情况；如果您有顾虑，建议通过
              VMware Workstation / Fusion、Oracle VirtualBox、Microsoft Hyper-V
              等虚拟化技术运行本程序。如果您在使用过程中遇上程序未按照预期执行的情况，请点击程序左下角进行反馈。
            </ElCheckbox>
          </ElCheckboxGroup>
        </article>
      </div>
    </div>
    <footer pt10px pb10px>
      <div flex flex-justify-end w-880px ml-auto mr-auto>
        <el-button type="text" @click="handleCancel">退出程序</el-button>
        <el-button type="primary" @click="handleSubmit"
          >我已经阅读，并接受上方所提及的相关风险，并决定继续使用本程序</el-button
        >
      </div>
    </footer>
  </div>
</template>

<script lang="ts" setup>
import { ElCheckbox, ElCheckboxGroup, ElMessage } from 'element-plus'
import { ref, onMounted, onBeforeMount } from 'vue'
import { gtagRenderer as baseGtagRenderer } from '@renderer/utils/gtag'
import { sleep } from '@geekgeekrun/utils/sleep.mjs'

const gtagRenderer = (name, params?: object) => {
  return baseGtagRenderer(name, {
    scene: 'first-run-agreement',
    ...params
  })
}
const electron = window.electron

const readmeItemCheckStatusList = ref<number[]>([])

const handleCancel = async () => {
  gtagRenderer('cancel_clicked')
  await sleep(500)
  window.close()
}

const unreadItemsAfterClickSubmit = ref<Record<number, true>>({})
const handleSubmit = () => {
  gtagRenderer('submit_clicked')
  const COUNT = 10
  if (readmeItemCheckStatusList.value.length !== COUNT) {
    gtagRenderer('agreement_not_finish_read_tip_displayed')
    ElMessage.warning({
      message: `您还有${COUNT - readmeItemCheckStatusList.value.length}条没有读完，读完就打勾标记一下吧`,
      grouping: true
    })
    unreadItemsAfterClickSubmit.value = {}
    for (let i = 0; i < COUNT; i++) {
      if (!readmeItemCheckStatusList.value.includes(i)) {
        unreadItemsAfterClickSubmit.value[i] = true
      }
    }
    return
  }
  electron.ipcRenderer.send('first-launch-notice-approve')
  gtagRenderer('submit_done')
}
const handleReadmeItemCheckStatusListChange = (value: number[]) => {
  value.forEach((it) => {
    if (unreadItemsAfterClickSubmit.value[it]) {
      delete unreadItemsAfterClickSubmit.value[it]
    }
  })
}
const componentRootEl = ref<HTMLElement>()
</script>

<style lang="scss" scoped>
.first-run-readme {
  box-sizing: border-box;
  width: 100vw;
  height: 100vh;
  overflow: auto;
  user-select: none;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  .first-run-readme__inner-outer {
    flex: 1;
    overflow: auto;
  }
  .first-run-readme__inner {
    width: 880px;
    margin: 0 auto;
    padding-top: 30px;
    padding-bottom: 30px;
    .readme-title {
    }
    .readme-desc {
      margin-top: 10px;
      font-size: 14px;
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
          margin-top: 5px;
        }
        &.is-checked .el-checkbox__label {
          color: unset;
          opacity: 0.6;
        }
      }
    }
  }
  footer {
    flex: 0;
    background-color: #f0f0f0;
  }
}
</style>
