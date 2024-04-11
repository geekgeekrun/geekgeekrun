# 牛人快跑 - GeekGeekRun

一款可以帮助你在Boss直聘上**自动批量开聊Boss**的脚本，基于Puppeteer。

与每一位牛人站在一起

- 使命：帮你找到让你满意的工作
- 愿景：天下牛人都有满意的工作
- 价值观：不接受职场中PUA、克扣、降薪、欠薪、违法解除劳动合同等一切压榨牛人的行为

# GUI 版本
各行各业，无论你是小白还是大佬，都能通过几步简单的配置，快速开始求职！

## 系统要求
- 处理器
    - x86_64 架构
    - 其他架构（例如：ARM（例如：Apple Silicon）），可能支持；请自行 clone 本项目进行构建

- 操作系统
    - 对于 Windows：最低 Windows 10 1507（如果你的电脑是2016年后出厂的电脑，一般都可以使用）
    - 对于 Linux：支持包含桌面环境的 Ubuntu 20.04、Fedora 39；暂未测试更早前的操作系统
    - 对于 macOS：支持 Sonoma 14.0；暂未测试更早前的操作系统
    - 对于其他操作系统，可能支持；请自行 clone 本项目进行构建；运行时需要包含桌面环境

## 安装方式
- Windows
    1. 打开 https://github.com/geekgeekrun/geekgeekrun/releases ，下载最新发行版安装包（文件名后缀`.exe`）
    1. 双击安装包，即可开始安装
    1. 安装完成后，程序将自动启动，并引导你为初次使用进行一些配置

- Linux
    1. 打开 https://github.com/geekgeekrun/geekgeekrun/releases ，下载最新发行版安装包（文件名后缀`.deb` / `.rpm`）
    1. 使用 `dpkg` / `rpm` 进行配置
    1. 从桌面启动；启动后，将引导你为初次使用进行一些配置

- macOS 及其他操作系统
    1. 确保你已经安装 Git、Node.js 18+、pnpm 8.6.9+
    1. `git clone https://github.com/geekgeekrun/geekgeekrun.git` 本项目到本地
    1. 进入相对于项目根目录的 `./packages/ui` 目录，执行 `pnpm i`
    1. 根据平台，执行 `pnpm run build:win` / `pnpm run build:mac` / `pnpm run build:linux`
    1. 进入 `dist` 目录，你将可以看到构建完成的安装程序 / 程序包；根据你所使用的平台通用的程序安装方式，进行安装
    1. 从桌面启动；启动后，将引导你为初次使用进行一些配置

# CLI 版本
## 使用方式
1. 确保你已经安装 Node.js 18+、pnpm 8.6.9+
1. `pnpm i` 安装依赖
1. 打开 Chrome / Edge，安装 EditThisCookie 扩展程序
1. 打开 [Boss直聘](https://www.zhipin.com) 网站，在浏览器右上角找到 EditThisCookie 扩展程序图标，并点击
1. 按下 EditThisCookie 扩展程序弹出气泡中的“导出Cookie”按钮（左数第三个按钮），此时将会把你在 Boss直聘 网站下所有Cookie复制到剪切板上
1. 打开本项目中 config/boss.mjs 文件，把刚刚复制的 Cookie 粘贴给 cookies 变量
1. 执行`pnpm start`。开聊 Boss ！

祝求职成功~
