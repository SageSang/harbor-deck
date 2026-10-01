# 书签本地缓存与弱网展示（1.4.22）

网页成功登录并读取导航后，自动保存普通场景实际引用的书签、快速记录、分组及顺序。下一次打开时先显示本地只读副本，成功联网后更新；失败保留旧副本，明确删除或空列表会替换旧内容。

网页使用 localStorage，扩展使用 chrome.storage.local，共用快照格式与筛选规则。只保留各地址的一份副本，不同步到浏览器账号、不保存历史，不保存登录凭据、Token、密码或密码保护场景。内外网地址分开，不自动合并实例。图标使用本地默认符号，不等待外部图片。

## 使用与升级

- 网页程序已经加载时，鉴权或初次导航请求慢、失败或断网，均可显示已有普通书签；完整页已打开时，后台请求失败不会整体替换已有列表。可继续搜索、打开主备链接。
- 扩展新标签页有缓存时不等待地址探测，直接显示本地列表；后台网页就绪后，无操作时可以进入完整页，已经搜索或操作时保留本地视图。点击“进入完整页面”会传递搜索词和选中的普通场景。
- 内嵌和直达模式均支持新缓存交接。首次没有缓存时仍需成功在线加载一次。直达模式会先尝试交接快照，再进入正常网页；旧网页没有交接协议时，最多等待5秒后继续原打开路径。
- 网页和扩展都需要更新才能建立扩展副本。服务端仍兼容旧扩展；新扩展遇到旧网页可以继续打开，但不能从旧网页建立新快照。
- 本次同时修正HTML入口304重新验证响应的内嵌策略，避免重复打开时被浏览器禁止加载；普通页面和其他路径继续禁止内嵌。

网页本身仍从服务端加载。本次没有Service Worker/PWA，不能承诺普通HTTP网页在服务器完全不可达时重新启动；扩展自己的页面和已存副本可离线打开。书签列表离线可看不代表目标网站可离线访问。

## 刷新、清理与数据保护

打开、网络恢复和手动刷新触发更新，没有轮询或无限重试。读取包含响应体解析在内最多5秒，独立于扩展地址探测时限。修改请求不使用读超时策略，避免把不确定的写入当作失败自动重试；明确离线时直接拒绝，不排队自动补交。

缓存格式或内容无效时忽略。存储被禁用、空间不足或写入失败时不阻塞正常页面和登录，也不清空旧有效副本。登录检查尚未完成或网络失败时，本机普通副本可只读查看；明确未登录、拒绝访问、退出或换账号时清理副本，并拒绝旧请求写回。清理动作不会删除草稿、连接设置或服务端数据。普通HTTP局域网地址不依赖secure-context-only随机UUID接口。

“清除书签缓存”位于本地列表、网页下方以及扩展完整页的导航帮助中。扩展修改地址会移除不再配置的地址副本，停止旧页面继续交接。清理后可以通过重新在线打开或主动刷新建立新快照。

离线时无法实时得知远端删除或权限变化。密码场景本来就不落盘；原本普通的场景在其他设备被加密时，要等联网确认后才能移除本机旧副本。共享设备应主动退出或清理副本。缓存不作为备份或管理员权限凭证。

## 回退与验证

回退不需要转换服务端数据，旧版本忽略新增缓存键；可以先清理缓存。保留真实配置和编辑草稿，按既有升级说明处理扩展身份变化。当前未修改生产容器或日常浏览器安装。

验证结果见 [本次验证记录](bookmark-cache-validation-2026-10-01.md)。Linux隔离Chromium中的检查不能替代Mac真机、Microsoft Edge本体和生产HTTPS反代验收。

## English summary

Version 1.4.22 adds one local read-only snapshot per address, shared validation, a web startup fallback, and an extension-local bookmark list. Only ordinary referenced bookmarks and quick records are saved. Protected scenes, credentials and tokens are excluded. Successful reads replace the snapshot; network errors retain it. Cached navigation supports search, scene selection and primary/secondary links; edits remain online operations without an offline replay queue.

Update both the web application and extension to create extension snapshots. Older counterparts retain normal opening behavior but do not implement the bridge. The extension does not require an API token for this feature. Direct web visits still need their application resources to load; no Service Worker or PWA is added. Clearing snapshots leaves drafts, connection settings and server data intact. Release packages do not imply a store submission or production deployment.
