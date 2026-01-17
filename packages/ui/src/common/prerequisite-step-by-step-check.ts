export const getAutoStartChatSteps = () => [{
  id: 'worker-launch',
  describe: '启动子进程',
},
// {
//   id: 'basic-cookie-check',
//   describe: 'Cookie 格式检查',
// },
{
  id: 'puppeteer-executable-check',
  describe: 'Puppeteer 可执行程序检查',
},
{
  id: 'login-status-check',
  describe: '登录状态检查',
}
]