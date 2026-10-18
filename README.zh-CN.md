<p align="center"><img src="extension/public/icons/icon-128.png" width="88" alt="HarborDeck 标志"></p>
<h1 align="center">HarborDeck</h1>
<p align="center"><strong>可接入 AI 的自托管书签管理，让收藏与数据由你掌握。</strong></p>
<p align="center">本地部署 · 多场景导航 · AI 管理 API · Chrome / Edge 扩展</p>
<p align="center"><a href="README.md">English</a> · <a href="https://github.com/SageSang/harbor-deck/releases">下载与发布</a> · <a href="docs/bookmark-management-api.md">管理 API</a> · <a href="PRIVACY.md">隐私政策</a></p>

把日常网站、学习资料和自托管服务，收进一个属于自己的起始页。HarborDeck 可以运行在本机、NAS 或自己的服务器上，用场景与分组管理书签，用浏览器扩展随手收藏，也能通过开放 API 接入你选择的 AI 工具，辅助整理不断增长的收藏。

无需注册托管平台账号，配置保存在自己挂载的目录中。应用面向单个管理员，提供整站登录、场景密码、备份与导出；是否接入 AI、把哪些数据交给外部工具，由你决定。

## 网页端：从首页到书签整理

打开网页，就能搜索常用网站、切换场景，按分组进入自己的收藏。为同一个服务配置内外网地址，在家和外出时都保留熟悉的入口。

![HarborDeck 网页首页：场景、搜索与分组导航](docs/screenshots/web-home-2026-10.png)

| 能力           | 可以怎样使用                                                                                                   |
| -------------- | -------------------------------------------------------------------------------------------------------------- |
| 场景与分组     | 把工作、学习、家庭服务和个人收藏分开组织，按自己的习惯调整分组及书签顺序。                                     |
| 共享书签       | 同一书签可以引用到多个场景，每个场景归属一个分组；修改书签内容会同步影响它的所有引用。                         |
| 搜索与键盘操作 | 按名称、地址或备注筛选当前场景；使用内置或自定义搜索引擎，方向键浏览，`/` 聚焦搜索，Alt+Shift+方向键切换场景。 |
| 内外网主备地址 | 为服务设置两个地址并配置 LAN/WAN 探针；也可从书签菜单明确打开或复制某个地址。                                  |
| 快速记录       | 先收集、后整理。收件箱支持搜索、编辑备注与批量归组；转换遇到内容冲突时保留记录，由你决定如何处理。             |
| 书签整理与迁移 | 编辑、复制、拖拽、多选与跨场景放置；导入浏览器书签 HTML，嵌套文件夹保留为路径分组，也可导出浏览器可用的 HTML。 |
| 外观与备份     | 霜白、午夜、余烬三种皮肤，中英文界面；配置导出、WebDAV 定时或手动备份。                                        |

<table>
<tr><th width="50%">分组管理</th><th width="50%">快速记录</th></tr>
<tr><td><img src="docs/screenshots/web-groups-2026-10.png" alt="网页端分组管理：创建、重命名与调整顺序"></td><td><img src="docs/screenshots/web-quick-records-2026-10.png" alt="网页端快速记录：搜索、编辑与批量归组"></td></tr>
<tr><td>按场景维护分组，随时调整名称和顺序。</td><td>先留下链接，再集中整理到合适的分组。</td></tr>
</table>

<details>
<summary>查看网页端网络切换：自动检测、局域网与外网</summary>

配置探测地址后自动判断网络，也可手动选择局域网或外网，决定书签使用主地址还是切换地址。

![HarborDeck 网页端网络模式与主备地址切换说明](docs/screenshots/web-network-2026-10.png)

</details>

<details>
<summary>查看网页端系统设置：主题、语言与打开方式</summary>

调整网页主题、界面语言，以及单击和中键打开书签的方式。这是网页端设置；扩展的服务器连接设置见下方独立展示区。

![HarborDeck 网页端外观、语言与打开方式设置](docs/screenshots/appearance-settings-2026-10.png)

</details>

## 浏览器扩展：收藏与新标签页

Chrome 和 Edge 扩展把 HarborDeck 带进日常浏览：工具栏弹窗负责收藏当前网页，新标签页负责打开导航。使用本地页面模式时，扩展自带前端，连接失败仍可浏览和搜索普通场景缓存，恢复连接后原位更新。

下面两张图分别是**扩展收藏弹窗**和**扩展配置页**。配置页用于连接自己的 HarborDeck 服务，与上方网页端的外观设置分开管理。

<table>
<tr><th width="32%">扩展收藏弹窗</th><th width="68%">扩展配置页</th></tr>
<tr><td valign="top"><img src="docs/screenshots/extension-capture-2026-10.png" alt="浏览器扩展收藏弹窗：编辑链接并选择场景与分组"></td><td valign="top"><img src="docs/screenshots/extension-settings-2026-10.png" alt="浏览器扩展配置：主备服务地址、接口 Token、打开方式与访问授权"></td></tr>
<tr><td>编辑标题、主备 URL 和备注，选择目标场景与分组后保存。</td><td>设置服务地址、收藏 Token、打开方式和访问权限。连接配置保存在当前设备。</td></tr>
</table>

截图由维护者提供，保留原图中的遮挡处理；不同发行版本的界面可能略有差异。源码中的新功能与修复，需要对应版本正式发布后才会进入分发镜像或扩展包。

### 安装与连接

从现有 [Chrome 应用商店](https://chromewebstore.google.com/detail/mlnpanpmgplmlangfnokhelkhkfcpine)或 [Edge 扩展商店](https://microsoftedge.microsoft.com/addons/detail/ogjfbhbheifoaidpfdbcbcbgfiblmnik)安装，也可从 [Releases](https://github.com/SageSang/harbor-deck/releases)下载对应安装包。商店审核和更新进度可能晚于 GitHub 发布。

1. 填写 HarborDeck 主地址及可选备用地址，并授予对应地址的访问权限。
2. 使用本地新标签页，或明确选择直接跳转到服务器。连接设置仅属于当前安装，不在设备之间同步覆盖。
3. 导航页面使用管理员账号登录；工具栏收藏还需填写服务器配置的搜索/收藏 Token。
4. 打开收藏弹窗，编辑标题、主备地址和备注，搜索目标场景/分组，或先保存为快速记录。

Chrome、Edge 使用不同的包和身份。手动安装选择对应解压包，`-store.zip` 用于商店提交。更新时优先沿用已有安装；需要更换安装身份时先导出、再导入设置与草稿，迁移文件不含 Token，需要重新填写。

详细说明见[扩展设置与恢复](docs/extension-local-settings-and-recovery.md)、[安装包身份](docs/extension-identities.md)和[本地缓存行为](docs/bookmark-cache.md)。

## AI 接入：让收藏也能被工具整理

HarborDeck 提供面向 AI 与自动化的 HTTP 管理 API 和 OpenAPI 描述。你可以让具备 HTTP 调用能力的 AI 客户端或脚本读取书签、整理分组、更新标题与备注，或把快速记录归入已有场景。AI 来自你选择的工具，HarborDeck 本身不内置大模型或聊天助手。

例如，可以给接入后的 AI 工具这样的任务：

> 查看 Home 场景的快速记录，按现有分组提出归组建议，保留原始链接和备注。先预演并列出变更，等我确认后再执行。

推荐的接入流程：

1. 配置独立的 `HARBORDECK_BOOKMARK_MANAGEMENT_TOKEN`，使用至少 32 字符的随机值；未配置时管理 API 关闭。
2. 让工具按 [OpenAPI 描述](docs/bookmark-management-openapi.yaml)调用 `/api/management/v1`，通过专用请求头传递 Token，先读取当前状态和版本。
3. 写入前用 `X-HarborDeck-Dry-Run: true` 预演。所有写请求都需携带 `If-Match`；数据已变化时拒绝覆盖，工具应重新读取并规划。

| 接口       | 权限与用途                                                                                          | 文档                                                                                           |
| ---------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 搜索与收藏 | `X-HarborDeck-Search-Token`，仅访问未保护场景，适合 uTools、启动器及快捷收藏。                      | [集成 API](docs/api.md)                                                                        |
| 书签管理   | `X-HarborDeck-Management-Token`，可管理全部场景中的分组、书签、位置和快速记录，支持版本检查与预演。 | [管理 API](docs/bookmark-management-api.md) · [OpenAPI](docs/bookmark-management-openapi.yaml) |

管理 Token 可以绕过管理员登录和场景密码，读取及修改受保护场景中的书签；它不能管理场景定义、账号密码、系统设置或 WebDAV。仅向需要这些权限的工具提供管理 Token，与收藏 Token 分开保管。配置文件和 Token 不应提交到 Git。

自托管让书签存储由你控制；如果接入云端 AI，工具发送给模型的内容仍可能离开本机，处理范围取决于所选工具与配置。

## 用 Docker 部署

镜像支持 `linux/amd64` 和 `linux/arm64`，可使用 Docker Compose 或群晖 Container Manager，宿主机无需安装 Node.js。

创建 `compose.yaml`：

```yaml
services:
  harbor-deck:
    image: ghcr.io/sagesang/harbor-deck:1.4.28
    container_name: harbor-deck
    restart: unless-stopped
    ports:
      - '127.0.0.1:8080:80'
    environment:
      NODE_ENV: production
      PORT: '80'
      CONFIG_DIR: /app/config
      TZ: Asia/Shanghai
    volumes:
      - ./config:/app/config
    security_opt:
      - no-new-privileges:true
```

```bash
docker compose up -d
```

在 Docker 宿主机打开 `http://localhost:8080`，创建管理员账号。其他设备访问时，配置 HTTPS 反向代理，或明确绑定到可信局域网接口；默认回环绑定不能被其他电脑直接访问。反向代理若运行在另一个容器里，需要使用共享 Docker 网络等可达上游，该容器里的 `127.0.0.1` 不代表宿主机。

群晖可以把 `./config` 换成 `/volume1/docker/harbor-deck/config` 等持久目录，容器内路径保持 `/app/config`。[仓库 Compose 文件](docker-compose.yml)还提供健康检查和可选集成配置。

### 版本与升级

当前示例固定到已发布的**服务端 1.4.28**；**扩展 1.4.29** 为独立发布。扩展或源码包版本更高，不代表存在同版本 Docker 镜像，升级前请查看对应组件的[发布说明](https://github.com/SageSang/harbor-deck/releases)。

升级前备份完整配置挂载目录并记录原镜像版本。修改镜像标签，执行 `docker compose pull` 和 `docker compose up -d`，保留原配置挂载、接口 Token 和自定义端口映射。服务重启后需重新登录并解锁场景。`latest` 会随服务端发布移动；拉取固定标签不会自动切换到其他版本。

### 可选环境变量

| 变量                                   | 用途                                                                        |
| -------------------------------------- | --------------------------------------------------------------------------- |
| `HARBORDECK_SEARCH_TOKEN`              | 为普通场景的快捷搜索和收藏接口设置 Token。                                  |
| `HARBORDECK_BOOKMARK_MANAGEMENT_TOKEN` | 启用 AI/自动化管理，使用独立的至少 32 字符随机 Token；留空关闭。            |
| `HARBORDECK_TRUST_PROXY`               | 可信代理 IP/CIDR，默认 `loopback,linklocal,uniquelocal`，按实际代理链设置。 |
| `HARBORDECK_TRUSTED_EXTENSION_IDS`     | 额外允许内嵌的扩展身份，标准 HarborDeck Chrome/Edge 身份已内置。            |
| `HARBORDECK_WEBDAV_TIMEOUT_MS`         | 每个 WebDAV 请求的完整超时，默认 `15000`，范围 `100`–`300000` 毫秒。        |

## 数据由你掌握

整站由管理员登录保护，密码场景提供额外的可见性边界。主动共享到普通场景的书签，也会在该普通场景可见。

网页通过 `localStorage`，扩展通过 `chrome.storage.local` 保存普通场景的展示快照，其中包含显示的链接和备注，因此浏览器用户配置也应视为私有数据。受保护场景即使解锁也不进入快照。离线快照不代替备份或编辑权限：编辑需要最新在线配置，离线写入不会排队补发。退出或检测到权限丢失时清除相关缓存；离线设备无法即时获知远端权限变化。

完整备份使用 WebDAV。场景处于锁定状态时，网页导出的配置仅包含可访问数据。恢复会替换当前配置，使用旧备份前先备份现状。存储范围、保存期限与迁移文件说明见[隐私政策](PRIVACY.md)。

## 本地开发

使用 Node.js 24 与 npm：

```bash
npm ci
npm run dev
```

网页位于 `http://localhost:3000`，API 位于 `http://localhost:3001`。开发数据默认保存到 `./config`，测试时请通过 `CONFIG_DIR` 指定隔离目录。

```bash
npm test
npm run lint
npm run build
npm run build:extension
npm run package:extension
EXTENSION_BROWSER=edge npm run build:extension
EXTENSION_BROWSER=edge npm run package:extension
```

技术栈为 React、TypeScript、Vite、Tailwind CSS、Fastify 和 Zod。发布标签 `vX.Y.Z-web` 仅发布服务端，`vX.Y.Z-extension` 仅发布扩展，无后缀 `vX.Y.Z` 发布两者。生成安装包不会自动提交商店，详见[发布说明](release-notes/README.md)。

<details>
<summary>维护者的长期上下文</summary>

个人背景、历史决策、核验状态和待补事项统一维护在 [Sidney Vault](obsidian://open?vault=sidney-vault&file=20-Areas%2F%E8%BD%AF%E4%BB%B6%E9%A1%B9%E7%9B%AE%E7%BB%B4%E6%8A%A4%2F%E5%AE%9E%E4%BD%93%2FHarborDeck%2F%E6%96%87%E6%A1%A3%2F%E8%83%8C%E6%99%AF%E5%AE%9E%E7%8E%B0%E4%B8%8E%E5%8E%86%E5%8F%B2)。本仓库保留代码、使用说明与开发契约；不再复制个人维护日志。未接入该 Vault 的协作者仍可直接使用本文档。

</details>

## 许可与来源

HarborDeck 使用 [Apache-2.0 许可证](LICENSE)，起源于 [Goalonez/smart-harbor](https://github.com/Goalonez/smart-harbor)。感谢原作者与贡献者提供的基础。HarborDeck 持续围绕多场景书签整理、浏览器集成和自托管使用发展。
