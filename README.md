# Geek Auto Start Chat With Boss - GeekGeekRun

一款可以帮助你在Boss直聘上**自动批量开聊Boss**的辅助脚本，基于Puppeteer。

A helper lets you can start a batch of chat sessions with human recruiter on **Bosszhipin**, based on Puppeteer.

## 使用方式
1. `pnpm i` 安装依赖
1. 打开 Chrome / Edge，安装 EditThisCookie 扩展程序
1. 打开 [Boss直聘](https://www.zhipin.com) 网站，在浏览器右上角找到 EditThisCookie 扩展程序图标，并点击
1. 按下 EditThisCookie 扩展程序弹出气泡中的“导出Cookie”按钮（左数第三个按钮），此时将会把你在 Boss直聘 网站下所有Cookie复制到剪切板上
1. 打开本项目中 config/boss.mjs 文件，把刚刚复制的 Cookie 粘贴给 cookies 变量
1. 执行`pnpm start`。开聊 Boss ！

祝求职成功~
