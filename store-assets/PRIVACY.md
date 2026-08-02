# Privacy Policy — HarborDeck

_Last updated: 2026-08-03_

## English

HarborDeck is a self-hosted navigation page and optional Chrome extension. It replaces the browser new-tab page with a navigation page and can choose between a user-configured primary and secondary address.

### Data collection

The extension has no analytics, advertising, telemetry, or developer-hosted account. It does not collect, sell, or share personal data.

### Data stored in the browser

The following values are stored locally by Chrome:

- The primary URL, secondary URL, open mode, probe timeout, and optional integration token in `chrome.storage.sync`.
- The selected extension language in `chrome.storage.sync`.
- A short-lived (10-second) reachability result in `chrome.storage.local`.

The reachability cache contains only the two configured addresses, the selected address, the reason, and a timestamp. It never contains bookmark records or the server's `config.json`. Editing a bookmark on the server therefore cannot be undone or hidden by this cache.

### Network requests

The extension sends lightweight `GET` requests only to the `/api/health` endpoint of addresses entered by the user, to decide which address is reachable. In the popup, it may call the user's own HarborDeck server to list available scene groups and add the current page when the user submits the form. No request is sent to the developer, an analytics provider, or an unrelated third party.

### Permissions

- `storage`: save settings, language, and the short-lived reachability cache.
- `permissions`: request host access for the specific origins entered by the user.
- Host access is not requested for all sites up front; it is requested only when needed to probe the configured origin.

HTTP is supported because self-hosted services on a local network often use HTTP. HTTPS is supported as well.

### Contact

Open an issue at [SageSang/harbor-deck](https://github.com/SageSang/harbor-deck).

## 中文

HarborDeck 是一个自托管导航页和可选的 Chrome 扩展。扩展会把新标签页替换成导航页，并在用户配置的主地址和备用地址之间选择可访问的地址。

### 数据收集

扩展没有统计、广告、遥测或开发者托管账号，不会收集、出售或分享个人数据。

### 浏览器本地保存

- 主地址、备用地址、打开方式、检测超时时间和可选的集成 Token 保存在 `chrome.storage.sync`。
- 扩展语言保存在 `chrome.storage.sync`。
- 最近一次地址检测结果只在 `chrome.storage.local` 保留 10 秒。

这个短期缓存只记录配置地址、实际选择的地址、判断原因和时间戳，不包含书签定义，也不包含服务器的 `config.json`。因此编辑或新增书签不会因为扩展缓存而消失。

### 网络请求

扩展只会向用户自己填写的地址发送 `/api/health` 检测请求。使用扩展弹窗添加当前网页时，还会向用户自己的 HarborDeck 服务读取可用场景并提交书签。不会向开发者、统计服务或其他无关第三方发送数据。

### 权限

- `storage`：保存设置、语言和短期地址检测缓存。
- `permissions`：只为用户填写的具体来源申请主机访问权限。
- 不会预先申请所有网站权限，只在检测配置地址时按需申请。

HTTP 和 HTTPS 都支持；HTTP 主要用于局域网自托管服务。

### 联系方式

请在 [SageSang/harbor-deck](https://github.com/SageSang/harbor-deck) 提交 Issue。
