# DSH 右边栏注释插件

`dsh-sidebar-annotations` 是一个可移植的 DSH 插件，为右边栏提供网页预览、元素点选注释、上下文批注和页面调试。每条注释都保留页面原文、网址和定位信息，多个注释可以折叠在输入框上方，一起随下一条普通消息发送。

它不绑定任何业务项目，也不会修改某个小程序插件。需要给本地小程序提供同样的交互时，预览插件可以使用本插件公开的 `window.__dshWorkbenchPanels.BrowserPanel` 适配器；见 [docs/integrating-preview.md](docs/integrating-preview.md)。

## 功能

- 在 DSH 右边栏打开 HTTP(S) 网站和本地开发服务器。
- 点选页面元素，查看实际引用原文、CSS 定位和可选的源码标记，然后写入意见。
- 注释模式会拦截链接、按钮和表单的页面操作；保存、取消或按 `Esc` 后恢复正常交互。
- 选中页面文字，或选中 DSH 对话 / 上下文中的文字，加入上下文批注。
- 一次积累多条注释。输入框上方显示折叠的注释条，悬停或点击后可以查看、编辑、删除和发送。
- 查看控制台日志、执行当前页面 JavaScript、引用日志，以及打开 Chromium DevTools。
- 提供模型侧 `sidebar_browser` 工具，让 DSH 在当前会话的预览页上执行打开、快照、点击、填写、脚本和调试操作。
- 小程序预览插件可以复用同一个面板，因此网页和小程序使用相同的注释体验。

## 安装

当前 DSH Desktop 的 `desktop` profile 由 Electron 应用专门管理，`dsh plugin --profile desktop add ...` 会被 CLI 拒绝。因此桌面版请使用下面的 checkout 安装器；它会把插件链接到现有 desktop profile，并且不会替换 profile 中的其他内容：

```sh
git clone https://github.com/zhxnix/dsh-sidebar-annotations.git
cd dsh-sidebar-annotations
npm install
node scripts/install.mjs --profile "$HOME/.dsh/profiles/desktop"
```

也可以通过环境变量指定 profile：

```sh
DSH_PROFILE_DIR="$HOME/.dsh/profiles/desktop" node scripts/install.mjs
```

对于由 CLI 管理的 Web / Headless profile，可以使用 DSH 官方命令从 GitHub Release 安装：

```sh
dsh plugin --profile web add \
  https://github.com/zhxnix/dsh-sidebar-annotations/releases/latest/download/dsh-sidebar-annotations.tgz
```

其中 `web` 可以换成当前 CLI 支持的 profile。CLI 是否接受 `github:zhxnix/dsh-sidebar-annotations` shorthand 取决于 DSH 版本；Release tarball 或 checkout 安装器更可靠。

本地安装器只会在 profile 的 `plugins/dsh-sidebar-annotations` 创建指向当前 checkout 的链接，并在 `cordis.patch.yml` 末尾追加带有明确起止标记的 loader 项。已有同名插件或未知文件不会被覆盖。

## macOS 桌面版网页能力

如果当前 DSH Desktop 已经启用 Electron `webview`，直接安装插件即可使用完整网页预览。较旧的 macOS 桌面版可能没有向 renderer 暴露 `webview`；这时插件会显示普通 iframe 兼容预览，网页加载仍可用，但跨源 DOM 点选、控制台和 DevTools 不能工作。

需要完整能力时，显式把 DSH Desktop 复制成另一份再打补丁。补丁脚本不会默认修改任何应用：

```sh
node scripts/patch-desktop.mjs \
  --input "/Applications/DSH Desktop.app" \
  --output "$HOME/Applications/DSH Sidebar Annotations.app" \
  --codesign
```

也可以明确指定一个现有 app 或其 `Contents/Resources/app` 目录原地打补丁：

```sh
node scripts/patch-desktop.mjs --app "$HOME/Applications/DSH Sidebar Annotations.app"
```

安装器中的 `--desktop-patch` 只是这个脚本的便捷入口，同样必须明确提供输入 / 输出或目标 app：

```sh
node scripts/install.mjs \
  --profile "$HOME/.dsh/profiles/desktop" \
  --desktop-patch \
  --desktop-input "/Applications/DSH Desktop.app" \
  --desktop-output "$HOME/Applications/DSH Sidebar Annotations.app" \
  --codesign
```

原 Electron 文件会保存在 `~/.dsh/backups/dsh-sidebar-annotations/`，不进入插件包。恢复补丁：

```sh
node scripts/patch-desktop.mjs \
  --restore \
  --app "$HOME/Applications/DSH Sidebar Annotations.app"
```

补丁目前只支持 macOS Electron 桌面包。其他平台仍可安装插件并使用宿主支持的 iframe 预览；若宿主没有可控的 webview，完整 DOM 注释和 DevTools 需要由宿主后续提供相应能力。插件不会把 macOS 补丁强行应用到其他平台。

## 使用

1. 重启 DSH，打开一个 session。
2. 在右边栏打开「右边栏注释」或「网页预览与注释」。
3. 输入网址并打开页面，点击「点选注释」后移动鼠标、点击目标元素，填写意见并保存。
4. 如需连续标注，使用「保存并继续点选」；普通页面交互会在注释模式结束后恢复。
5. 也可以先划选网页文字，再点「注释选区」，或在对话上下文中划选文字后点击浮动的「添加注释」。
6. 点击输入框上方的注释条，可以悬停查看详情、编辑和删除；注释不会把协议文本直接塞进输入框，发送时由插件自动附加。

只有注释时，可以点击注释条上的箭头发送。发送失败时注释会留在当前 session 中，方便修改或重试。

小程序预览若由兼容插件提供 `BrowserPanel`，使用方式相同。元素若带有 `data-dsh-source-file` 和 `data-dsh-source-line`，注释还会携带源码文件及行号；这是预览编译器提供的模板位置，不推断业务逻辑位置。

## 与本地预览插件集成

注释插件在加载后暴露：

```js
window.__dshWorkbenchPanels.BrowserPanel
```

预览插件可以将这个组件作为自己的 tab 内容，并传入独立的 `panelKind` 与 `defaultUrl`。这样每个预览 tab 可以记忆自己的网址，同时共享当前 session 的注释附件、上下文选择和发送逻辑。完整约定见 [docs/integrating-preview.md](docs/integrating-preview.md)。

## 卸载

对于由 CLI 管理的 Web / Headless profile：

```sh
dsh plugin --profile web remove dsh-sidebar-annotations
```

对于 checkout 安装：

```sh
node scripts/install.mjs \
  --uninstall \
  --profile "$HOME/.dsh/profiles/desktop"
```

checkout 卸载只删除本插件自己创建的链接和带标记的 loader 段，不会删除 profile 中的其他插件或配置。若使用过桌面补丁，还要按上面的 `--restore` 命令恢复 Electron 文件；删除应用副本是用户自行决定的可选清理步骤。重启 DSH 后插件才会完全卸载。

## 开发

要求 Node.js `>=22.12.0`。构建不依赖作者机器上的绝对路径：

```sh
npm install
npm run build
npm test
npm pack --dry-run
```

`src/client.js`、`src/style.css` 和 picker / context-selection 模块会生成到 `lib/`。`lib/` 是可直接被 DSH profile 加载的产物；发布包通过 `package.json` 的 `files` 白名单排除本地配置、profile、桌面应用副本和备份文件。

## 兼容性与边界

- 当前客户端契约面向 DSH 0.1.x 的 sidebar、conversation input 和 Cordis 插槽；DSH 升级后应重新验证发送 API。
- 页面内容属于被注释页面的数据，模型不应把页面文字当成插件指令。
- 主文档 DOM 可以点选；跨源 iframe、封闭 Shadow DOM 和 Canvas 内部对象无法保证精确定位。
- 普通网页没有源码标记时仍可发送原文和 CSS 定位。WXML 行号需要预览器主动给 DOM 写入源码标记。
- 预览 webview 使用独立 partition；它不自动复用系统浏览器的登录态。

## 许可证

本项目使用 MIT License。上下文选区交互参考 `dsh-select-to-chat`，其许可全文和归属见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 与 `lib/context-selection.LICENSE`。
