# 牛人快跑 - GeekGeekRun

一款可以帮助你在Boss直聘上**自动批量开聊Boss**的脚本，基于Puppeteer。

与每一位牛人站在一起

- 使命：帮你找到让你满意的工作
- 愿景：天下牛人都有满意的工作
- 价值观：PUA、压榨、克扣、降薪、欠薪、违法解除劳动合同，都给我去🐭

# GUI 版本
各行各业，无论你是小白还是大佬，都能通过几步简单的配置，快速开始求职！

## 系统要求
- 操作系统
    - 对于 Windows 操作系统：最低 Windows 10 1507（如果你的电脑是2016年后出厂的电脑，一般都可以使用）
    - 对于 macOS 操作系统：最低 macOS Big Sur（如果你的电脑是2020年后出厂的电脑，一般都可以使用）

## 安装方式
- Windows
    1. 打开 https://github.com/geekgeekrun/geekgeekrun/releases ，下载最新发行版安装包（文件名后缀`.exe`）
    2. 双击安装包，即可开始安装
    3. 安装完成后，程序将自动启动，并引导你为初次使用进行一些配置

- macOS
    1. 打开 https://github.com/geekgeekrun/geekgeekrun/releases ，下载最新发行版安装包（文件名后缀`.dmg`）
    2. 双击安装包，将打开安装包窗口
    3. 将`GeekGeekRun`拖拽到`Applications`（`应用程序`）文件夹上，复制过程结束后，即安装完成
    4. 安装完成后，进入`Applications`（`应用程序`）文件夹，双击`GeekGeekRun`来启动，接下来程序将引导你为初次使用进行一些配置

# CLI 版本
## 使用方式
1. `pnpm i` 安装依赖
1. 打开 Chrome / Edge，安装 EditThisCookie 扩展程序
1. 打开 [Boss直聘](https://www.zhipin.com) 网站，在浏览器右上角找到 EditThisCookie 扩展程序图标，并点击
1. 按下 EditThisCookie 扩展程序弹出气泡中的“导出Cookie”按钮（左数第三个按钮），此时将会把你在 Boss直聘 网站下所有Cookie复制到剪切板上
1. 打开本项目中 config/boss.mjs 文件，把刚刚复制的 Cookie 粘贴给 cookies 变量
1. 执行`pnpm start`。开聊 Boss ！

祝求职成功~
