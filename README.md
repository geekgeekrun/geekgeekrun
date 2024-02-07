# Geek Auto Start Chat With Boss - BossGeekGo

一款可以帮助你在Boss直聘上**自动批量开聊Boss**的辅助脚本，基于Puppeteer。

A helper lets you can start a batch of chat sessions with human recruiter on **Bosszhipin**, based on Puppeteer.

## 使用方式
1. 打开 Chrome / Edge，安装 EditThisCookie 扩展程序
2. 打开 [Boss直聘](https://www.zhipin.com) 网站，在浏览器右上角找到 EditThisCookie 扩展程序图标，并点击
3. 按下 EditThisCookie 扩展程序弹出气泡中的“导出Cookie”按钮（左数第三个按钮），此时将会把你在 Boss直聘 网站下所有Cookie复制到剪切板上
4. 打开本项目中 runtime/boss-cookies.mjs 目录，把刚刚复制的Cookie粘贴给cookies变量
5. 执行`npm start`，开始投递！祝新的一年，求职成功~
