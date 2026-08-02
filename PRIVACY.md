# HarborDeck Privacy Policy

Last updated: 2026-08-03

HarborDeck is a self-hosted navigation and bookmark application. The HarborDeck browser extension is designed to connect to a HarborDeck server selected by the user. It does not send data to the HarborDeck project maintainer, advertising networks, or analytics providers.

## Information handled by the browser extension

The extension handles the following information only to provide its navigation and bookmark features:

- **Configuration:** the HarborDeck primary URL, fallback URL, API token, opening mode, probe timeout, and language. These values are stored in Chrome extension storage. The API token is sent only as an authentication header to the HarborDeck server configured by the user.
- **Current tab metadata:** when the user explicitly opens the add-bookmark popup, the extension reads the active tab's title and URL to pre-fill the form. The user can edit these values before submitting them.
- **Bookmark details:** after the user confirms an add-bookmark action, the extension sends the title, primary URL, optional secondary URL, optional note, and selected scene/group placements to the configured HarborDeck server. An existing-bookmark lookup may use the current URL to pre-fill already saved information.
- **Extension preferences:** the extension stores a short-lived address-resolution cache, an unfinished add-bookmark draft, the selected language, and collapsed scene state so the interface can be restored after reopening.

The extension may request access to the configured HarborDeck origins to check `/api/health` and call the bookmark APIs. It does not request or use unrestricted access to arbitrary websites by default.

## Information the extension does not collect

The extension does not read page bodies, form fields, cookies, passwords, browser history lists, visit times, or content from other tabs. It does not collect or transmit browsing activity, clicks, keystrokes, location, communications, health information, financial information, or personal identity information. It may listen locally for input or paste events only to prevent a new-tab redirect from interrupting an action; those events are not stored or sent anywhere. It does not include remote executable code.

## Self-hosted server data

The HarborDeck server stores the configuration, scenes, groups, bookmarks, notes, and administrator account data in the storage directory chosen by the operator. Scene and administrator passwords are stored as hashes. The server operator controls the server, backups, logs, retention, and access permissions. The extension does not upload this data to the HarborDeck project maintainer.

## Sharing and retention

HarborDeck does not sell user data or share it with third parties for advertising or unrelated purposes. Data remains in the user's browser storage or on the user's configured server until the user removes it or the server operator's retention policy removes it. The extension's address-resolution cache is short-lived, and an unfinished popup draft is cleared after a successful submission or when the user clears it.

## Security

Users should protect their HarborDeck server and API token, use HTTPS when accessing the service over an untrusted network, and avoid publishing configuration files or tokens. No online service can guarantee absolute security, so users remain responsible for their deployment and backups.

## Changes and contact

This policy may be updated when HarborDeck's data handling changes. The project source and issue tracker are available at <https://github.com/SageSang/harbor-deck>.

---

# HarborDeck 隐私政策

更新时间：2026-08-03

HarborDeck 是一个自托管导航和书签应用。浏览器扩展只连接用户自行配置的 HarborDeck 服务，不会把数据发送给项目维护者、广告平台或分析服务。

## 扩展处理的信息

扩展仅为导航和书签功能处理以下信息：

- **配置数据：** HarborDeck 主地址、备用地址、接口 Token、打开方式、探测超时时间和语言，保存在 Chrome 扩展存储中。接口 Token 只会作为请求鉴权头发送到用户自行配置的 HarborDeck 服务。
- **当前标签页信息：** 用户主动打开“添加书签”弹窗时，扩展读取当前标签页的标题和 URL，用于预填表单，用户可以在提交前修改。
- **书签信息：** 用户确认添加后，扩展会把标题、主地址、可选备用地址、可选备注以及选中的场景/分组发送到用户配置的 HarborDeck 服务。扩展也可能使用当前 URL 查询已有书签，以便回填已经保存的信息。
- **扩展偏好：** 扩展会保存短期地址探测缓存、未提交的添加书签草稿、语言和场景折叠状态，以便重新打开后恢复界面。

扩展可能请求访问用户配置的 HarborDeck 地址，用于检测 `/api/health`、读取场景和调用书签接口；默认不会无限制访问任意网站。

## 扩展不会收集的信息

扩展不会读取网页正文、表单内容、Cookie、密码、完整浏览历史、访问时间或其他标签页内容，也不会收集或上传浏览行为、点击、键盘输入、位置、通讯、健康、财务或个人身份信息。扩展可能在本地监听输入或粘贴事件，以避免新标签页跳转打断用户操作；这些事件不会保存或发送。扩展不包含远程可执行代码。

## 自托管服务中的数据

HarborDeck 服务会在部署者选择的配置目录中保存场景、分组、书签、备注和管理员账号数据。管理员密码和场景密码以哈希形式保存。服务器运营者负责服务器、备份、日志、保存期限和访问权限管理。扩展不会把这些数据上传给 HarborDeck 项目维护者。

## 共享和保存期限

HarborDeck 不出售用户数据，也不会为了广告或无关目的向第三方共享用户数据。数据会保存在用户的浏览器存储或用户配置的服务中，直到用户删除或服务器运营者按其策略清理。扩展的地址探测缓存保存时间很短；添加书签成功后，未完成的弹窗草稿会被清除。

## 安全

请妥善保护 HarborDeck 服务和接口 Token；在不受信任的网络中访问时建议使用 HTTPS，并避免公开配置文件或 Token。用户需要自行负责部署安全和备份。

## 政策变更与联系

如果 HarborDeck 的数据处理方式发生变化，本政策会同步更新。项目源码和问题反馈地址：<https://github.com/SageSang/harbor-deck>。
