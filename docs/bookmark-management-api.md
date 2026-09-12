# HarborDeck 书签管理 API

本文档描述 `/api/management/v1` 的部署、安全边界、并发协议和完整接口契约。该 API 面向 AI 与自动化脚本，仅管理分组、书签、位置顺序和快速记录。

## 1. 安全边界

管理 API 使用独立环境变量 `HARBORDECK_BOOKMARK_MANAGEMENT_TOKEN`。它与浏览器扩展使用的 `HARBORDECK_SEARCH_TOKEN` 完全分离，也不接受管理员 Cookie、场景 Token、URL 参数或 JSON 字段作为替代鉴权。

持有管理 Token 的调用方可以绕过管理员登录与场景密码，读取和修改所有受保护场景中的书签、URL、备注及快速记录。它不能：

- 创建、删除、复制、重命名或排序场景；
- 读取、设置或清除管理员密码和场景密码；
- 读取或修改 WebDAV、备份、主题、搜索引擎、网络探测或浏览器本地偏好；
- 读取搜索 Token、管理 Token 或任何密码哈希；
- 导入、导出或恢复整站 JSON。

管理 Token 泄露等同于全部书签隐私和整理权限泄露。部署 YAML 应限制为仅宿主机管理员可读，公网访问必须经过 HTTPS 反向代理，容器端口应保持绑定到 `127.0.0.1`。

## 2. 部署配置

直接在 Compose YAML 中配置，无需新增配置文件、scope 或 secrets 解析器：

```yaml
services:
  harbor-deck:
    image: ghcr.io/sagesang/harbor-deck:1.4.17
    ports:
      - '127.0.0.1:8080:80'
    environment:
      NODE_ENV: production
      PORT: '80'
      CONFIG_DIR: /app/config
      HARBORDECK_SEARCH_TOKEN: '现有低权限搜索Token'
      HARBORDECK_BOOKMARK_MANAGEMENT_TOKEN: '替换为至少32位的密码学随机字符串'
```

可用以下命令生成 48 字节随机 Token，然后把输出直接写入 YAML：

```bash
openssl rand -base64 48
```

规则：

- 未配置、空值或少于 32 个字符时，全部管理接口返回 `503 MANAGEMENT_API_DISABLED`。
- 请求 Token 缺失或不匹配时返回 `401 INVALID_MANAGEMENT_TOKEN`。
- 服务端分别对配置值和请求值计算 SHA-256，再恒定时间比较摘要。
- 修改部署 YAML 后重启容器即可轮换或撤销 Token。
- Token Header 已加入日志脱敏，不会通过 API 返回。

## 3. 通用调用协议

基础地址：

```text
/api/management/v1
```

请求 Header：

```http
Accept: application/json
Content-Type: application/json
X-HarborDeck-Management-Token: your-management-token
```

所有写请求还必须发送最近一次读取到的 revision：

```http
If-Match: "sha256:4e9b..."
```

管理接口不开放 CORS。所有响应包含 `Cache-Control: no-store`、`Pragma: no-cache`、`Vary: X-HarborDeck-Management-Token` 和 `X-Content-Type-Options: nosniff`。带状态版本的读取与所有成功写入同时返回：

```http
ETag: "sha256:4e9b..."
```

创建资源返回 `201 Created`，其他成功写入返回 `200 OK`。提交后的通用写响应为：

```json
{
  "ok": true,
  "revision": "sha256:new...",
  "result": {}
}
```

错误统一为：

```json
{
  "ok": false,
  "error": {
    "code": "GROUP_NOT_FOUND",
    "message": "指定分组不存在",
    "requestId": "req-123"
  }
}
```

### 3.1 并发与 revision

revision 是以下数据稳定 JSON 表示的 SHA-256：场景 ID、名称、保护标记和顺序；分组 ID、名称和顺序；分组内书签顺序；书签字段；快速记录字段。场景密码哈希、管理员认证、系统设置与 Token 均不参与计算。

写操作在同一个配置写锁内执行以下流程：读取当前状态、校验 `If-Match`、计算完整变更、校验完整配置、使用临时文件原子替换 `config.json`。因此不会出现只移动了一半的批量操作。

- 缺少 `If-Match`：`428 IF_MATCH_REQUIRED`。
- revision 过期：`412 REVISION_MISMATCH`，且不写入。
- 客户端收到 `412` 后必须重新读取 `/state`，基于新状态重新规划，不能直接重放旧请求。
- 网页书签管理也使用同一个 ETag/If-Match 协议，旧网页状态不能覆盖 API 的新修改。

### 3.2 Dry-run

任意写接口可增加：

```http
X-HarborDeck-Dry-Run: true
```

服务端仍会校验 Token、`If-Match`、字段、引用、顺序和最终配置，但不落盘：

```json
{
  "ok": true,
  "committed": false,
  "baseRevision": "sha256:old...",
  "proposedRevision": "sha256:new...",
  "result": {
    "summary": {
      "groups": 1,
      "bookmarks": 0,
      "quickRecords": 0
    }
  }
}
```

`summary` 的三个数字是拟议状态相对当前状态的数量差，不是操作事件数。完成预演后提交时仍应使用原 `baseRevision`；若期间状态变化，提交会返回 `412`。

### 3.3 限制与状态码

- 单个 JSON 请求体最大 `1 MiB`。
- 单次批量书签或场景数组最多 `100` 项。
- 每个来源 IP 与 Token 摘要组合：每分钟最多 `120` 个读请求和 `30` 个写请求。
- `429` 响应带 `Retry-After`。

| HTTP | 典型错误码 | 含义 |
| --- | --- | --- |
| `400` | `INVALID_JSON`、`INVALID_REQUEST`、`INVALID_IF_MATCH`、`INVALID_DRY_RUN_HEADER` | JSON、路径、查询参数或 Header 格式无效 |
| `401` | `INVALID_MANAGEMENT_TOKEN` | Token 缺失或错误 |
| `404` | `SCENE_NOT_FOUND`、`GROUP_NOT_FOUND`、`BOOKMARK_NOT_FOUND`、`QUICK_RECORD_NOT_FOUND`、`PLACEMENT_NOT_FOUND` | 目标不存在 |
| `409` | `GROUP_NAME_CONFLICT`、`GROUP_ID_CONFLICT`、`BOOKMARK_SLUG_CONFLICT`、`PLACEMENT_CONFLICT`、`GROUP_ORDER_CONFLICT`、`BOOKMARK_ORDER_CONFLICT`、`GROUP_NOT_EMPTY`、`ORPHAN_BOOKMARK` | 当前状态与请求冲突 |
| `412` | `REVISION_MISMATCH` | 客户端状态已过期 |
| `413` | `PAYLOAD_TOO_LARGE` | 请求体超过 1 MiB |
| `422` | `INVALID_REQUEST`、`INVALID_BOOKMARK`、`INVALID_ICON`、`INVALID_POSITION`、`DUPLICATE_SCENE_PLACEMENT`、`DUPLICATE_BOOKMARK_ID`、`INVALID_TARGET_GROUP`、`PLACEMENT_REQUIRED` | JSON 请求体字段或业务规则无效 |
| `428` | `IF_MATCH_REQUIRED` | 写请求缺少 revision |
| `429` | `RATE_LIMITED` | 超过限流阈值 |
| `503` | `MANAGEMENT_API_DISABLED` | 管理 Token 未正确配置 |

## 4. 数据模型

```ts
interface ManagedBookmark {
  slug: string
  name: string
  note?: string
  icon?: string
  primaryUrl: string
  secondaryUrl?: string
  probes?: string[]
  forceNewTab?: boolean
  placements: BookmarkPlacement[]
}

interface BookmarkPlacement {
  sceneId: string
  groupId: string
  position: number
}

interface ManagedGroup {
  id: string
  name: string
  position: number
  bookmarkIds: string[]
}

interface ManagedQuickRecord {
  id: string
  name: string
  note?: string
  icon?: string
  primaryUrl: string
  secondaryUrl?: string
  createdAt: number
  updatedAt: number
}
```

`slug`、场景 ID 和分组 ID 使用小写字母、数字与连字符；名称去除首尾空格后为 1–200 字符；备注最长 5000 字符；地址仅接受 `http://` 或 `https://`。书签 slug 全局唯一；分组 ID 与分组名称在场景内唯一。

一个书签可出现在多个场景，但在同一场景只能出现一次且只能属于一个分组。`position` 从 0 开始，省略时追加到分组末尾。URL 不是唯一键，不同 slug 可以使用相同 URL。

## 5. 读取接口

### 5.1 状态摘要

```http
GET /api/management/v1/status
```

```json
{
  "ok": true,
  "apiVersion": 1,
  "revision": "sha256:4e9b...",
  "counts": { "scenes": 3, "groups": 12, "bookmarks": 84, "quickRecords": 5 }
}
```

适合验证 Token 与低成本检测状态变化。

### 5.2 完整状态

```http
GET /api/management/v1/state
```

返回 `revision`、`defaultSceneId`、只读场景容器、完整分组与快速记录，以及带全部 placements 的全局书签列表。受保护场景不会被过滤。响应不会包含 `passwordHash`、管理员数据、WebDAV、系统设置、搜索 Token 或管理 Token。

### 5.3 搜索

```http
GET /api/management/v1/search?q=keyword&sceneId=all&type=all
```

| 参数 | 约束 |
| --- | --- |
| `q` | 必填，1–200 字符；匹配名称、slug/记录 ID、主地址、备用地址和备注 |
| `sceneId` | 可选，场景 ID 或 `all`，默认 `all` |
| `type` | 可选，`bookmark`、`quick-record` 或 `all`，默认 `all` |

返回 `{ revision, query, sceneId, type, items }`。书签结果含 `type: "bookmark"` 和过滤后的 placements；快速记录结果含 `type: "quick-record"` 与 `sceneId`。

### 5.4 单个书签

```http
GET /api/management/v1/bookmarks/:slug
```

返回 `{ revision, bookmark }`，其中 `bookmark` 包含全部 placements。

### 5.5 图标目录

```http
GET /api/management/v1/icons?q=server&limit=50
```

`q` 可省略，最长 100 字符；`limit` 为 1–500，默认 50。返回 `{ items: [{ id, label }] }`。书签与快速记录的 `icon` 必须使用这里返回的 ID；未知 ID 返回 `422 INVALID_ICON`。

## 6. 分组接口

### 6.1 创建分组

```http
POST /api/management/v1/scenes/:sceneId/groups
If-Match: "sha256:..."

{ "name": "AI 工具", "id": "ai-tools", "position": 2 }
```

`id` 省略时按名称生成场景内唯一 ID；`position` 省略时追加。响应 `result.group` 为新分组。

### 6.2 重命名分组

```http
PATCH /api/management/v1/scenes/:sceneId/groups/:groupId
If-Match: "sha256:..."

{ "name": "AI 与自动化" }
```

只修改名称，分组 ID 和书签顺序不变。

### 6.3 设置完整分组顺序

```http
PUT /api/management/v1/scenes/:sceneId/groups/order
If-Match: "sha256:..."

{ "groupIds": ["favorites", "ai-tools", "development"] }
```

数组必须完整包含场景内每个分组且每项恰好一次，否则返回 `409 GROUP_ORDER_CONFLICT`。

### 6.4 删除分组

```http
DELETE /api/management/v1/scenes/:sceneId/groups/:groupId?bookmarkDisposition=reject
If-Match: "sha256:..."
```

| `bookmarkDisposition` | 行为 |
| --- | --- |
| `reject` | 默认；非空分组返回 `409 GROUP_NOT_EMPTY` |
| `remove` | 删除当前场景的这些 placements；无其他位置的书签定义也被删除 |
| `move` | 删除分组前将书签按原顺序移动到 `targetGroupId`，可用 `targetPosition` 指定插入位置 |

移动示例：

```text
?bookmarkDisposition=move&targetGroupId=archive&targetPosition=0
```

响应 `result` 包含 `groupId`、`removedBookmarkIds` 和实际删除的 `deletedBookmarks`。

## 7. 书签接口

### 7.1 创建书签

```http
POST /api/management/v1/bookmarks
If-Match: "sha256:..."
```

```json
{
  "slug": "chatgpt",
  "name": "ChatGPT",
  "note": "OpenAI 对话服务",
  "icon": "bot",
  "primaryUrl": "https://chatgpt.com",
  "secondaryUrl": null,
  "probes": ["https://chatgpt.com"],
  "forceNewTab": true,
  "placements": [
    { "sceneId": "private", "groupId": "ai-tools", "position": 0 },
    { "sceneId": "work", "groupId": "tools" }
  ]
}
```

`slug` 省略时由名称生成；`icon` 省略时从内置池随机选择；placements 至少一项且同一场景不能重复。响应 `result.bookmark` 包含服务端最终生成的 slug、图标和位置。

### 7.2 修改书签

```http
PATCH /api/management/v1/bookmarks/:slug
If-Match: "sha256:..."

{
  "slug": "chatgpt-web",
  "name": "ChatGPT 网页版",
  "icon": "message-square",
  "note": null,
  "secondaryUrl": "https://chat.openai.com"
}
```

字段缺失表示保留原值；`note`、`icon`、`secondaryUrl`、`probes` 和 `forceNewTab` 传 `null` 表示清除。`primaryUrl` 不可清除。修改 slug 会在一次原子写入中更新所有场景引用。位置必须通过位置接口修改。

### 7.3 复制书签

```http
POST /api/management/v1/bookmarks/:slug/duplicate
If-Match: "sha256:..."

{ "slug": "chatgpt-work", "name": "ChatGPT 工作账号" }
```

请求体可为空。默认 slug 为可用的 `<原slug>-copy`，其余字段从原书签复制；默认在原书签的每个分组中紧随其后插入。提供 `placements` 时完全覆盖默认位置，且至少需要一个位置。

### 7.4 全局删除书签

```http
DELETE /api/management/v1/bookmarks/:slug
If-Match: "sha256:..."
```

删除定义与所有场景引用。响应 `result.bookmark` 和删除前的 `result.placements`，不影响 URL 相同但 slug 不同的书签。

## 8. 位置与顺序接口

### 8.1 添加或移动一个位置

```http
PUT /api/management/v1/scenes/:sceneId/bookmarks/:slug/placement
If-Match: "sha256:..."

{ "groupId": "ai-tools", "position": 1 }
```

书签不在该场景时新增；已在其他分组时移动；已在目标分组时调整顺序。`position` 省略时追加。

### 8.2 从一个场景移除

```http
DELETE /api/management/v1/scenes/:sceneId/bookmarks/:slug/placement?orphanPolicy=reject
If-Match: "sha256:..."
```

`reject` 是默认值，最后一个位置会返回 `409 ORPHAN_BOOKMARK`；`delete` 会在移除最后一个位置时同步删除书签定义。

### 8.3 批量移动

```http
POST /api/management/v1/scenes/:sceneId/bookmarks/batch-move
If-Match: "sha256:..."

{
  "bookmarkIds": ["chatgpt", "claude", "gemini"],
  "targetGroupId": "ai-tools",
  "position": 0
}
```

支持同组排序和跨组移动；被移动书签保持其在场景中的原相对顺序。任意书签不存在或不在该场景时整批失败。

### 8.4 批量放置到多个场景

```http
POST /api/management/v1/bookmarks/batch-place
If-Match: "sha256:..."

{
  "bookmarkIds": ["chatgpt", "claude"],
  "placements": [
    { "sceneId": "private", "groupId": "ai-tools" },
    { "sceneId": "work", "groupId": "tools" }
  ],
  "conflictPolicy": "move"
}
```

`move` 将已有位置移到目标分组；`skip` 保留冲突位置；`reject` 发现任意跨组冲突时整批返回 `409`。已经在目标分组的书签保持原位置，新位置追加到末尾。

### 8.5 批量从场景移除

```http
POST /api/management/v1/scenes/:sceneId/bookmarks/batch-remove
If-Match: "sha256:..."

{ "bookmarkIds": ["old-service", "unused-tool"], "orphanPolicy": "delete" }
```

`orphanPolicy` 与单项移除相同。全部预检成功后才会原子写入。

### 8.6 设置分组内完整顺序

```http
PUT /api/management/v1/scenes/:sceneId/groups/:groupId/bookmarks/order
If-Match: "sha256:..."

{ "bookmarkIds": ["chatgpt", "claude", "gemini"] }
```

数组必须完整包含分组当前全部书签且每项恰好一次，否则返回 `409 BOOKMARK_ORDER_CONFLICT`。

## 9. 快速记录接口

### 9.1 创建

```http
POST /api/management/v1/scenes/:sceneId/quick-records
If-Match: "sha256:..."

{
  "name": "待整理的网站",
  "primaryUrl": "https://example.com",
  "secondaryUrl": null,
  "note": "以后放进工具分组",
  "icon": "bookmark"
}
```

服务端生成 `id`、`createdAt` 和 `updatedAt`；未传图标时随机选择。响应为 `result.quickRecord`。

### 9.2 修改

```http
PATCH /api/management/v1/scenes/:sceneId/quick-records/:recordId
If-Match: "sha256:..."
```

可部分修改 `name`、`note`、`icon`、`primaryUrl`、`secondaryUrl`；可选字段传 `null` 清除。不能传入时间戳，服务端每次更新 `updatedAt`。

### 9.3 删除

```http
DELETE /api/management/v1/scenes/:sceneId/quick-records/:recordId
If-Match: "sha256:..."
```

响应 `result.quickRecord` 为删除前记录。

### 9.4 提升为普通书签

```http
POST /api/management/v1/scenes/:sceneId/quick-records/:recordId/promote
If-Match: "sha256:..."

{
  "slug": "example",
  "placements": [
    { "sceneId": "private", "groupId": "tools", "position": 0 }
  ],
  "reuseExistingByUrl": true
}
```

当 `reuseExistingByUrl` 为 `true` 且快速记录的主/备用 URL 与现有书签任一主/备用 URL 相同，服务端复用现有书签；否则创建新书签。放置成功后删除原快速记录。匹配、创建/复用、放置和删除在同一原子写入中完成。

## 10. 图标维护

```http
POST /api/management/v1/icons/fill-missing
If-Match: "sha256:..."

{ "sceneIds": ["private", "work"] }
```

`sceneIds` 省略或请求体 `{}` 时处理全部场景。只为缺少图标的书签和快速记录补充随机图标；已有图标保持不变。多个场景引用同一书签时只更新一个全局书签定义。响应包含 `updatedBookmarks` 与 `updatedQuickRecords`。

## 11. 完整 curl 流程

```bash
BASE_URL='https://harbor.example.com'
MANAGEMENT_TOKEN='替换为部署YAML中的管理Token'

# 1. 读取状态并保存 revision
STATE_HEADERS=$(mktemp)
curl --fail-with-body \
  -D "$STATE_HEADERS" \
  -H "X-HarborDeck-Management-Token: $MANAGEMENT_TOKEN" \
  "$BASE_URL/api/management/v1/state" > state.json
REVISION=$(sed -n 's/^[Ee][Tt][Aa][Gg]:[[:space:]]*//p' "$STATE_HEADERS" | tr -d '\r')

# 2. 预演创建分组
curl --fail-with-body \
  -H "Content-Type: application/json" \
  -H "X-HarborDeck-Management-Token: $MANAGEMENT_TOKEN" \
  -H "If-Match: $REVISION" \
  -H "X-HarborDeck-Dry-Run: true" \
  -d '{"id":"ai-tools","name":"AI 工具"}' \
  "$BASE_URL/api/management/v1/scenes/private/groups"

# 3. 确认后使用相同 revision 提交，并保存新 ETag
curl --fail-with-body \
  -D commit-headers.txt \
  -H "Content-Type: application/json" \
  -H "X-HarborDeck-Management-Token: $MANAGEMENT_TOKEN" \
  -H "If-Match: $REVISION" \
  -d '{"id":"ai-tools","name":"AI 工具"}' \
  "$BASE_URL/api/management/v1/scenes/private/groups"
```

自动化客户端建议遵循“读取 `/state` → 本地规划 → dry-run → 人工或策略确认 → 提交 → 保存新 revision”的流程。若任何一步返回 `412`，丢弃旧规划并重新读取。


## 历史长标识兼容

新建或主动改成的新标识最多 256 字符；自动生成器为唯一性后缀预留空间。已有标识不截断、不迁移，普通编辑未改变原标识时仍接受；完整 JSON 导入及备份恢复保留历史值。

路径参数仍限制为 256 字符。长书签从 `GET /api/management/v1/state` 读取，并可通过以下固定路径传递原始标识：

| 方法与路径 | JSON 请求体 |
| --- | --- |
| `POST /api/management/v1/bookmarks/update` | `{ "slug": "原标识", "patch": { "name": "新名称" } }` |
| `POST /api/management/v1/bookmarks/delete` | `{ "slug": "原标识" }` |
| `POST /api/management/v1/bookmarks/duplicate` | `{ "slug": "原标识", "options": {} }` |
| `POST /api/management/v1/bookmarks/set-placement` | `{ "slug": "原标识", "sceneId": "场景", "groupId": "分组", "position": 0 }` |

这四个入口复用原业务语义、管理 Token、写额度、`If-Match` 和 dry-run。`patch.slug` / `options.slug` 是拟使用的新标识。全局删除一次原子移除全部引用；没有新增 `orphanPolicy` 参数。普通父 ID 下的单项移除沿用 `batch-remove` 的 `orphanPolicy`。

请求体限制是完整 JSON 的 1 MiB UTF-8 字节，超限返回 413 且不写入；不承诺任意长度在线编辑。请求体中的历史 scene/group 标识可用于放置，但其他仍以父 ID 为路径参数的接口没有一并扩展。旧路径接口继续保留，新入口在旧服务版本上不可用。
