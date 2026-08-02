# HarborDeck 集成 API

本文档描述面向 uTools、浏览器扩展和其他快捷工具的稳定接口。管理页面使用的 `/api/auth/*`、`/api/config/*` 等接口属于前端内部接口，不建议第三方直接调用。

## 基本信息

- Base URL：部署地址，例如 `http://192.168.1.10:8080` 或反向代理后的 `https://nav.example.com`
- 数据格式：成功响应为 JSON；参数错误和鉴权错误通常以纯文本返回
- 管理员登录 Cookie：集成接口不需要管理员登录，只需要集成 Token
- HTTPS：建议通过群晖反向代理或其他网关提供 HTTPS

## 鉴权

在容器环境变量中设置 Token：

```env
HARBORDECK_SEARCH_TOKEN=请替换为随机生成的长字符串
```

每个集成请求都要携带 Header：

```http
X-HarborDeck-Search-Token: your-secret-token
```

服务同时兼容旧环境变量 `SMART_HARBOR_SEARCH_TOKEN` 和 `SEARCH_API_TOKEN`，新部署请使用 `HARBORDECK_SEARCH_TOKEN`。

不要把 Token 提交到 Git、公开的 uTools 源码或截图中。

## 错误码

| 状态码 | 含义 |
| --- | --- |
| `400` | 请求参数不符合约束，响应正文包含错误原因 |
| `401` | Token 缺失或不正确 |
| `404` | 指定的场景不存在 |
| `503` | 服务端没有配置集成 Token |
| `500` | 服务端内部错误 |

## 1. 健康检查

### `GET /api/health`

无需 Token，用于容器健康检查或判断服务是否在线。

```bash
curl "$BASE_URL/api/health"
```

响应：

```json
{"ok":true}
```

## 2. 搜索书签

### `GET /api/integrations/bookmarks/search`

必须携带集成 Token。

查询参数：

| 参数 | 必填 | 约束 | 说明 |
| --- | --- | --- | --- |
| `q` | 是 | 1–200 个字符 | 匹配名称、slug、主地址、备用地址和备注 |
| `sceneId` | 否 | 非空字符串 | 指定场景 ID；传 `all` 或省略时搜索所有场景 |

搜索所有场景：

```bash
BASE_URL="http://192.168.1.10:8080"
TOKEN="your-secret-token"

curl -G "$BASE_URL/api/integrations/bookmarks/search" \
  -H "X-HarborDeck-Search-Token: $TOKEN" \
  --data-urlencode "q=har" \
  --data-urlencode "sceneId=all"
```

搜索指定场景：

```bash
curl -G "$BASE_URL/api/integrations/bookmarks/search" \
  -H "X-HarborDeck-Search-Token: $TOKEN" \
  --data-urlencode "q=har" \
  --data-urlencode "sceneId=work"
```

响应示例：

```json
{
  "query": "har",
  "sceneId": "all",
  "results": [
    {
      "sceneId": "work",
      "sceneName": "工作",
      "groupId": "dev-tools",
      "groupName": "开发工具",
      "slug": "harbor",
      "name": "Harbor",
      "url": "https://harbor.example.com"
    }
  ]
}
```

处理规则：

- `results` 按场景、分组和书签的现有顺序返回。
- 有备用地址时，返回的 `url` 使用备用地址；否则使用主地址。
- 设置了密码的场景永远不会返回，即使管理员已经在网页中解锁。
- 指定不存在的 `sceneId`（不包括 `all`）返回 `404`。
- 没有匹配项时返回空数组，不是错误。

## 3. 获取可添加书签的场景和分组

### `GET /api/integrations/bookmarks/scenes`

必须携带集成 Token。只返回未设置场景密码的场景，供添加书签时选择目标。

```bash
curl "$BASE_URL/api/integrations/bookmarks/scenes" \
  -H "X-HarborDeck-Search-Token: $TOKEN"
```

响应示例：

```json
{
  "defaultSceneId": "work",
  "scenes": [
    {
      "id": "work",
      "name": "工作",
      "groups": [
        { "id": "dev-tools", "name": "开发工具" }
      ]
    }
  ]
}
```

## 4. 添加书签

### `POST /api/integrations/bookmarks`

必须携带集成 Token。请求体为 JSON：

| 字段 | 必填 | 约束 |
| --- | --- | --- |
| `name` | 是 | 1–200 个字符 |
| `primaryUrl` | 是 | 合法 URL |
| `secondaryUrl` | 否 | 合法 URL |
| `note` | 否 | 最长 5000 个字符 |
| `placements` | 是 | 1–100 个 `{ sceneId, groupId }` |

添加到一个场景：

```bash
curl -X POST "$BASE_URL/api/integrations/bookmarks" \
  -H "Content-Type: application/json" \
  -H "X-HarborDeck-Search-Token: $TOKEN" \
  -d '{
    "name": "示例网站",
    "primaryUrl": "https://example.com",
    "secondaryUrl": "https://example-internal.example.com",
    "note": "快捷入口",
    "placements": [
      { "sceneId": "work", "groupId": "dev-tools" }
    ]
  }'
```

一次添加到多个场景：

```bash
curl -X POST "$BASE_URL/api/integrations/bookmarks" \
  -H "Content-Type: application/json" \
  -H "X-HarborDeck-Search-Token: $TOKEN" \
  -d '{
    "name": "示例网站",
    "primaryUrl": "https://example.com",
    "placements": [
      { "sceneId": "work", "groupId": "dev-tools" },
      { "sceneId": "personal", "groupId": "favorites" }
    ]
  }'
```

处理规则：

- 目标场景设置了密码时，该 placement 会被忽略；如果所有 placement 都不可用，返回 `400`。
- 同一个场景只能归属一个分组；同一请求对同一场景传多个 placement 时，以最后一个为准。
- 如果已有书签的 `primaryUrl` 完全相同，会复用原书签，不会覆盖原有标题、备用地址或备注。
- 新书签会自动生成唯一 slug，并从内置图标池随机选择图标。
- 如果书签已经位于该场景的其他分组，会移动到请求指定的分组；其他场景不受影响。

响应示例：

```json
{
  "created": true,
  "bookmark": {
    "slug": "example-site",
    "name": "示例网站",
    "primaryUrl": "https://example.com",
    "secondaryUrl": "https://example-internal.example.com"
  },
  "placements": [
    { "sceneId": "work", "groupId": "dev-tools" }
  ],
  "navigation": {
    "defaultSceneId": "work",
    "bookmarks": [],
    "scenes": []
  }
}
```

返回的 `navigation` 会去除场景密码哈希，不应当把它当作长期缓存；需要搜索时直接调用搜索接口。

## uTools 调用建议

用户每输入一个字符就调用一次搜索接口时，建议增加 150–300ms 防抖，并使用 URL 编码。Token 应保存在 uTools 私有配置中，不要写入公开仓库。

Windows PowerShell 请使用 `curl.exe`，避免 `curl` 被 PowerShell 别名替换为 `Invoke-WebRequest`。
