# Changelog

本文件用于在 `main` 分支记录每个正式版本的简洁更新说明。
Each release on `main` should add a short bilingual summary here.

## v1.4.1-web - 2026-08-02

### 中文
- 单个书签的右键菜单新增“复制书签”，可在预填原内容后创建独立副本。
- 副本会继承当前可管理场景中的分组位置，并自动生成不冲突的书签标识，避免覆盖原书签。

### English
- Added a Duplicate Bookmark action to the single-bookmark context menu with a prefilled creation form.
- Copies inherit manageable scene placements and receive a unique slug so the source bookmark is never overwritten.

## v1.4.0-web - 2026-08-02

### 中文
- 首页分组名称新增右键删除，可直接移除当前场景中的整个分组。
- 书签支持长按进入多选模式，并通过右键菜单批量删除当前场景中的书签引用。
- 删除分组或书签时会保留其他场景仍在使用的共享书签，只清理不再被任何场景引用的书签。
- 破坏性确认弹窗支持按 Enter 确认删除、按 Escape 取消。

### English
- Added group deletion from the home page through the group-name context menu.
- Added long-press bookmark selection and batch removal from the active scene.
- Preserved bookmarks still referenced by other scenes and removed only orphaned bookmarks.
- Added Enter-to-confirm and Escape-to-cancel keyboard handling for destructive confirmations.

## v1.3.0 - 2026-08-02

### 中文
- 新增可动态维护的多场景导航，每个场景独立管理分组与排序，同一书签可放入多个场景。
- 新增受密码保护的场景、浏览器会话解锁、服务端访问控制和失败限流。
- 新增按场景导入浏览器书签，并将嵌套文件夹按完整路径转换为一级分组。
- 新增从 GitHub Container Registry 拉取远端镜像的群晖 Container Manager 部署配置。

### English
- Added dynamic navigation scenes with independent groups and ordering, while allowing shared bookmarks across scenes.
- Added password-protected scenes with session-scoped unlocking, server-side authorization, and rate limiting.
- Added scene-targeted browser bookmark imports with nested folders flattened into full-path groups.
- Added Synology Container Manager deployment using a prebuilt GitHub Container Registry image.

## v1.2.6-web - 2026-03-30

### 中文
- 优化首页时钟布局，将年月日和星期移到时间右侧，并让整组内容保持水平居中。

### English
- Refined the home page clock layout by moving the date and weekday to the right of the time and centering them as one horizontal group.

## v1.2.5 - 2026-03-25

### 中文
- 修复 GitHub Release 发版流程，恢复正式版本时的发布说明生成步骤。
- 插件：恢复扩展打包与 GitHub Releases 附件发布链路，后续正式版会重新附带浏览器插件压缩包。
- 统一 GitHub Actions 的 Node.js 版本到 `24.14.0`，与本地开发环境保持一致。

### English
- Fixed the GitHub Release workflow so release notes are generated reliably during official releases.
- Extension: restored extension packaging and GitHub Releases asset publishing so future releases include the browser extension zip again.
- Unified the GitHub Actions Node.js version to `24.14.0` to match the local development environment.

## v1.2.4 - 2026-03-25

### 中文
- 统一网站标签页图标，改为新的品牌 logo。
- 插件补齐扩展图标集，并同步更新新标签页与设置页的页面图标。
- 插件：新增多尺寸品牌图标资源，确保浏览器扩展清单和打包产物使用一致图标。

### English
- Updated the web tab favicon to use the new brand logo.
- Added a full extension icon set and synced the new logo to the new tab and options page favicons.
- Extension: added multi-size brand icon assets so the manifest and packaged extension use the same branding consistently.

## v1.2.3-web - 2026-03-23

### 中文
- 新增独立的探测设置，可分别配置内外网健康检查地址，系统会自动补全固定的 `/api/health` 路径。
- 自动网络判断优先使用全局健康地址，未完整配置时会回退到首个书签的探测逻辑，顶部网络说明也同步更新。
- 新增和编辑书签时不再需要填写探测地址，书签配置项更精简。
- 中文书签名现在会自动生成更稳定的拼音标识，减少手动补 slug 的麻烦。

### English
- Added a dedicated probe settings section so LAN and WAN health check addresses can be configured separately, with the fixed `/api/health` path appended automatically.
- Automatic network detection now prefers the global health check addresses and falls back to the first bookmark probe when the probe setup is incomplete, with the top-bar help updated accordingly.
- Removed the probe URL field from bookmark creation and editing to keep bookmark configuration simpler.
- Chinese bookmark names now generate more stable pinyin slugs automatically, reducing the need to fill slugs manually.

## v1.2.2 - 2026-03-15

### 中文
- 优化首页书签卡片布局，桌面端会根据可用宽度更自然地保持单行排列。
- 改进较长书签名称的显示效果，减少拥挤和换行异常。
- 优化顶部网络模式说明弹层的桌面端显示，减少多余滚动并提升可读性。

### English
- Improved the homepage bookmark grid so desktop layouts keep single-row groups more naturally based on available width.
- Improved long bookmark name rendering to reduce cramped wrapping and overflow issues.
- Improved the desktop network mode help popover to reduce unnecessary scrolling and make it easier to read.

## Writing Rules

- 新版本写在最上方，按版本倒序排列。
- 每个版本同时提供中文和英文说明。
- 内容保持简洁，优先列出 2 到 5 条用户可感知的更新。
- 避免长段落、实现细节和空泛描述。
- 如果本次版本包含插件发布，应明确写出插件相关更新。

## Template

```md
## vX.Y.Z[-web|-extension] - YYYY-MM-DD

### 中文
- 更新点 1
- 更新点 2
- 插件：更新点 3

### English
- Update 1
- Update 2
- Extension: Update 3
```
