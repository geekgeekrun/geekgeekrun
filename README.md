# 牛人快跑 - GeekGeekRun

一款可以帮助你在Boss直聘上**自动批量开聊Boss**的脚本，基于Puppeteer。

与每一位牛人站在一起

- 使命：帮你找到让你满意的工作
- 愿景：天下牛人都有满意的工作

# GUI 版本
各行各业，无论你是小白还是大佬，都能通过几步简单的配置，快速开始求职！

## 系统要求
- 操作系统及处理器
    - Windows（x86_64）：最低 Windows 10 1507（如果你的电脑是2016年后出厂、默认安装 Window 10 的电脑，一般都可以使用）
    - Linux（x86_64）：支持包含默认桌面环境的 Ubuntu 20.04；暂未测试其它 Linux 发行版及桌面环境
    - macOS（Apple Silicon、x86_64）：支持 Sonoma 14.0；暂未测试更早前的操作系统

## 安装方式
- Windows
    1. 打开 https://github.com/geekgeekrun/geekgeekrun/releases ，下载最新发行版安装包（文件名后缀`.exe`）
    1. 双击安装包，即可开始安装
    1. 安装完成后，程序将自动启动，并引导你为初次使用进行一些配置

- Linux
    1. 打开 https://github.com/geekgeekrun/geekgeekrun/releases ，下载最新发行版安装包（文件名后缀`.deb`）
    1. 使用 `dpkg` 进行配置
    1. 从桌面启动；启动后，将引导你为初次使用进行一些配置

- macOS
    1. 打开 https://github.com/geekgeekrun/geekgeekrun/releases ，根据处理器架构，下载最新发行版安装包（文件名后缀`.dmg`）
    1. 双击以挂载dmg文件，然后将应用程序图标拽入Application文件夹
    1. 进入Application文件夹；由于发行包无签名，因此不能直接通过双击运行（直接双击将提示`“GeekGeekRun”已损坏，无法打开。 你应该将它移到废纸篓。`），您需要在终端中依次执行如下命令以解决此问题，详情请百度搜索
        ```sh
        sudo spctl --master-disable
        xattr -cr /Applications/GeekGeekRun.app
        ```
    1. 双击应用程序图标以启动程序；启动后，将引导你为初次使用进行一些配置
<!-- 
# CLI 版本
## 使用方式
1. 确保你已经安装 Node.js 18+、pnpm 8.6.9+
1. `pnpm i` 安装依赖
1. 打开 Chrome / Edge，安装 EditThisCookie 扩展程序
1. 打开 [Boss直聘](https://www.zhipin.com) 网站，在浏览器右上角找到 EditThisCookie 扩展程序图标，并点击
1. 按下 EditThisCookie 扩展程序弹出气泡中的“导出Cookie”按钮（左数第三个按钮），此时将会把你在 Boss直聘 网站下所有Cookie复制到剪切板上
1. 打开 `~/.geekgeekrun/storage/boss-cookies.json` 文件（如果没有相关路径请自行创建），把文件清空，并粘贴刚刚复制的 Cookie
1. 执行`pnpm start`。开聊 Boss ！
-->

祝求职成功~
