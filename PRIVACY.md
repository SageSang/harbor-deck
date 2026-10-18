# HarborDeck Privacy Policy

Last updated: 2026-10-18

HarborDeck is a self-hosted navigation and bookmark application. Its browser extension connects to servers selected by the user. The application does not include advertising or analytics services and does not send bookmark data to the project maintainer.

## Data handled by the application and extension

- **Connection settings:** primary and fallback server URLs, capture API token, opening mode, and probe timeout are stored in this extension installation's `chrome.storage.local`. Legacy synchronized connection settings may be read once during migration. Later connection changes do not synchronize across devices. Language preferences use browser extension sync storage.
- **Bookmark capture:** opening the capture popup reads the active tab's title and URL to pre-fill the form. The extension can look up that URL on the configured server. Confirming a save sends the edited title, URLs, note, and selected scene/group placements to that server. The capture token is sent as an authentication header to the configured server.
- **Drafts and preferences:** unfinished capture forms, pending submission details, theme, and display preferences are stored locally so they can be restored. Draft content can include private URLs and notes. Browser-sync storage may still contain values saved by older releases; those copies follow the browser's own synchronization and removal behavior.
- **Address-resolution cache:** recent connection checks are cached to speed up selection between the configured addresses. This is separate from the bookmark snapshot below.
- **Persistent bookmark snapshots:** ordinary scenes, referenced bookmarks, quick records, group names/order, titles, primary and secondary URLs, notes, icons, timestamps, the signed-in username, source server address, and selected display/search/network-probe settings may be stored on the device. Web pages use that origin's `localStorage`; local extension pages use `chrome.storage.local`. These snapshots support fast startup and offline browsing/search. They do not include administrator password hashes, scene passwords/tokens, capture tokens, WebDAV credentials, or protected-scene content, even when a protected scene is unlocked. A bookmark also referenced by an ordinary scene remains part of that ordinary scene's snapshot.

The extension requests access to configured HarborDeck origins for health checks and application APIs. It does not request unrestricted access to arbitrary websites by default. The navigation page uses the browser's normal authentication cookies for its own server requests; the extension does not inspect unrelated sites' cookies, page bodies, passwords, browser-history lists, or other tabs' content. Input and paste events are handled locally for editing and to avoid interrupting new-tab input; they are not sent to the maintainer or used for tracking. Search submissions go to the search engine selected by the user, and opening a bookmark connects to its destination.

## Retention and clearing

Bookmark snapshots have no short automatic expiry. They remain until replaced or cleared. Successful online reads update them; a network failure preserves the last usable snapshot. Logout, a detected account/access change, or removing a configured source clears the relevant cached data. An offline page cannot immediately learn about a server-side permission change.

Use **Clear bookmark cache** in the navigation page to remove its snapshot. This does not delete server bookmarks, connection settings, or capture drafts; a later successful online read can create a new snapshot. Site data can also be removed through browser settings. Removing an extension installation removes its installation-local storage according to the browser's behavior. Address-resolution entries have a short validity window, which is distinct from physical removal of stored data. A capture draft is cleared after confirmed successful submission or when explicitly cleared.

## Export and backup files

The extension's settings transfer file contains saved addresses, opening/probe settings, language/theme preferences, collapsed scenes, unfinished drafts, and pending submission details. It excludes the API token, address-resolution caches, and bookmark snapshots. A `tokenOmitted` flag records whether a token was omitted, not its value. Protect the file because addresses and draft content may still be private, and remove it when no longer needed.

Server configuration and WebDAV backups are different from extension transfer files. Complete backups can contain all bookmarks, protected scenes, password hashes, and WebDAV credentials. The operator controls the backup destination, credentials, retention, and access. Web exports taken while scenes are locked are partial. Users control where downloaded export files are stored and shared.

## Self-hosted server and sharing

The server stores configuration, bookmarks, notes, scenes, and administrator data in the operator's configured directory. Administrator and scene passwords are hashed. Operators control access, reverse proxies, server logs, and backups. HarborDeck does not sell data or share it with advertising services. Use HTTPS on untrusted networks, keep the browser profile and backup files private, and do not publish configuration or integration tokens.

## Changes and contact

This policy describes the current source. Older distributed releases may have a smaller feature set. Questions and changes can be discussed in the [project issue tracker](https://github.com/SageSang/harbor-deck/issues).

---

# HarborDeck 隐私政策

更新时间：2026-10-18

HarborDeck 是一个自托管导航与书签应用，浏览器扩展连接用户选择的服务器。应用不包含广告或分析服务，不向项目维护者发送书签数据。

## 应用与扩展处理的数据

- **连接设置：**主备服务地址、收藏 API Token、打开方式和探测时限保存在当前扩展安装的 `chrome.storage.local`。迁移时可能一次性读取旧的浏览器同步设置，后续连接修改不再跨设备同步。语言偏好使用浏览器扩展同步存储。
- **快捷收藏：**打开收藏弹窗时读取当前标签页标题和 URL 来预填表单，也可能向配置的服务器查询该 URL。确认保存后，将编辑后的标题、地址、备注和场景/分组位置发送到该服务器；收藏 Token 作为请求鉴权头发送。
- **草稿与偏好：**本地保留未完成收藏表单、待确认提交内容、主题与显示偏好，供重新打开后恢复；草稿可能包含私有地址和备注。旧版本写入浏览器同步存储的副本可能仍存在，其同步与删除遵循浏览器自身行为。
- **地址探测缓存：**缓存近期连接检查结果，加快主备地址选择，与下面的书签快照相互独立。
- **持久化书签快照：**本机可能保存普通场景、被引用的书签、快速记录、分组名称和顺序、标题、主备地址、备注、图标、时间戳、登录用户名、来源服务器地址，以及选定的显示、搜索和网络探针设置。普通网页使用当前来源的 `localStorage`，扩展本地页面使用 `chrome.storage.local`，用于快速启动和离线浏览、搜索。快照不包含管理员密码哈希、场景密码或令牌、收藏 Token、WebDAV 凭据，也不包含受保护场景内容，即使该场景已经解锁。书签同时被普通场景引用时，仍属于该普通场景的快照内容。

扩展会请求访问所配置的 HarborDeck 地址，以检测健康状态并调用应用接口，默认不请求无限制访问任意网站。导航页通过浏览器正常携带自身服务器的登录 Cookie；扩展不检查其他网站的 Cookie、网页正文、密码、完整浏览历史或其他标签页内容。输入和粘贴事件在本地用于编辑及防止新标签页跳转打断操作，不发送给维护者，也不用于跟踪。提交搜索会访问用户选择的搜索引擎，打开书签会访问对应目的地址。

## 保存期限与清理

书签快照没有短期自动过期机制，会保留到被替换或清除。在线读取成功后更新，网络失败时保留最近可用快照。退出登录、检测到账户或访问权限变化、移除已配置来源时，会清理对应缓存；离线页面无法即时获知服务器端的权限变化。

导航页的“清除书签缓存”可以移除对应快照，不会删除服务端书签、连接设置或收藏草稿；之后在线读取成功会重新建立快照。也可在浏览器设置中清除站点数据，卸载扩展时其安装本地存储按浏览器行为清理。地址探测结果有较短的有效期，失效与物理删除存储内容并非同一件事。收藏草稿在确认提交成功或用户明确清除后删除。

## 导出与备份文件

扩展设置迁移文件包含已保存的地址、打开方式、探测设置、语言和主题、折叠场景、未完成草稿及待确认提交内容；不包含 API Token、地址探测缓存或书签快照。`tokenOmitted` 只表示是否省略了 Token，不包含其值。地址与草稿仍可能是私有信息，应妥善保存，迁移后按需删除。

服务端配置与 WebDAV 备份不同于扩展迁移文件。完整备份可能包含全部书签、受保护场景、密码哈希和 WebDAV 凭据，由部署者控制备份目的地、凭据、保存期限与访问权限。场景锁定时网页导出的配置不完整。下载文件的存放与分享由用户自行控制。

## 自托管服务与共享

服务端在部署者配置的目录中保存配置、书签、备注、场景与管理员数据，管理员及场景密码以哈希保存。部署者负责访问控制、反向代理、服务日志与备份。HarborDeck 不出售数据，也不向广告服务分享数据。不可信网络中使用 HTTPS，保护浏览器用户配置和备份文件，不公开配置或接口 Token。

## 政策变更与联系

本政策描述当前源码；较早的分发版本可能尚不包含部分功能。疑问与修改可通过[项目问题反馈](https://github.com/SageSang/harbor-deck/issues)提出。
