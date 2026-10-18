# HarborDeck 四批修复实现与验证

实施依据为 `remediation-plan-review.md`，批准正文 SHA-256：`916982e4e0cd2b76aed42bb0cfa4e9cc93ac2628ac4f239dc599326dcd8b2cf7`。本文件记录未发布工作树的实际变更；包版本仍为 1.4.19，不表示该版本线上镜像已经包含修复。未提交、推送或部署，未读写真实业务配置。

## 已实现的行为

- A：integration 的查询和去重先过滤可见候选；Web 保存以提交前权限检查新增引用。正常共享、解锁后共享与独立管理 Token 保留。认证采用锁外哈希、只读最终检查、窄提交事务及同步会话处理；场景范围失效和预占限流已接入。
- B：WebDAV 截止时间覆盖响应头、所需成功正文及错误正文。服务监听不等待远端调度；恢复提交和访问失效不等待重排调度。上传成功后的列版本/清理失败以 warnings 单独报告。SIGTERM/SIGINT 进入优雅关闭，取消远端工作，已开始的本地替换结算后再关闭。
- C：按字段保留其他草稿、提交后继续输入和远端冲突。导航响应只更新仍有效的精确访问缓存；新建/复制后选择正确场景。已保存但页面同步失败时仅重读，不重发写请求。
- D：扩展按设置版本维护地址结果，30 秒成功缓存保留 120ms 快路径；冷路径默认 400ms，最早 180ms。已知失败、输入、隐藏和离线不会被迟到结果重新启动。英文初始化、实例草稿、受限内嵌说明与保存结果核验已接入。管理 API 新增四个原始标识请求体入口，新建 ID 不超过 256，已有值不追溯截断。

## 部署配置与兼容

- `HARBORDECK_TRUSTED_EXTENSION_IDS`：可选，逗号分隔的精确 Chrome 扩展 ID（每项 32 个 a–p 字符）。仅必要 HTML 入口 `/?embedded=1`、`/index.html?embedded=1` 放行这些扩展来源；普通页面和 API 仍拒绝嵌入。未配置时保留防嵌入策略。查询参数本身不授权。扩展设置页显示当前 ID。保留 Cookie 策略及 X-Frame-Options，真实 Chrome 和反代最终响应需验收。
- `HARBORDECK_WEBDAV_TIMEOUT_MS`：可选，默认 15000，整数范围 100–300000 毫秒。它是每个远端请求的完整读取预算，不是整次多步骤备份总耗时。写请求超时或取消后远端结果可能不确定，应先核对。
- 现有环境 Token 不变。服务重启需重新登录、重新解锁；改密使其他旧会话失效。恢复与提交前最新 auth 相同则保留管理员登录，每次恢复都清空场景解锁。
- 四个兼容入口为 `/api/management/v1/bookmarks/update`、`delete`、`duplicate`、`set-placement`，均为 POST。沿用管理 Token、If-Match、dry-run 和 1 MiB UTF-8 请求体上限；长对象读取使用 `/state`。没有新增派生 ID 或映射表；其他长父 ID 路径不保证已兼容。详见 `bookmark-management-api.md` 和 OpenAPI。
- 旧配置、共享引用、标识、人工备注和扩展真实草稿不自动清理或迁移。扩展旧缓存仅作为候选重建。
- 检查工具 globals/typescript-eslint 已移到开发依赖。运行镜像继续使用 `npm ci --omit=dev`；Fastify 和相关 URI/YAML 依赖采用兼容更新。

## 验证记录

2026-09-12 恢复后先核对交接的 66 个实现输入，全部与协作任务运行 285 项测试时一致。随后补上弹窗确认保存后的关闭窗口保护，以及 loader 最后一次异步存储检查期间的失败、设置变更和截止取消保护，再对最终输入执行适用检查。早先 275 项结果不作为最终统计。

| 最终检查 | 结果与范围 |
| --- | --- |
| `npm test` | 51 个测试文件，288 项通过，退出码 0 |
| `npm run lint`、`git diff --check` | 通过，退出码 0 |
| Web/服务端构建 | 交接时 `npm run build` 通过；恢复后 Web/服务端输入未变，最终 Docker 构建再次执行 `npm run build` 并通过 |
| `npm run build:extension` | 对恢复后的最终扩展代码完成类型检查、打包与 manifest 生成，退出码 0 |
| Docker | 重新构建 `harbor-deck:verification-20260912`，linux/amd64；运行层使用生产依赖，未挂载真实配置 |
| 容器 HTTP 冒烟 | health、虚构管理员登录/配置保存、内存 WebDAV 上传及恢复、相同 auth 恢复保留登录、静态 HTML 均通过；Node v24.11.1、Fastify 5.12.4、运行层无 typescript-eslint |
| 正常关闭 | 当前与中断前遗留的两个临时验证容器均已停止，退出码均为 0，无配置卷挂载；测试镜像仅保留为本地构建产物 |
| 当前镜像浏览器复核 | Codex 内置浏览器登录成功；先后保存两组名称，第二组草稿保留；新建 Final Scene B 后仍选中该场景。仅证明 Web 交互，不代替 Chrome 扩展实机验收 |
| 生产依赖审计 | `npm audit --omit=dev --json`：0 项告警 |
| 开发依赖审计 | 全量仍有 5 项：3 moderate、1 high、1 critical，均在 Vitest/Vite 测试工具链；npm 建议 Vitest 5 大版本迁移。本次不做未经方案覆盖的测试框架大版本升级 |

最终输入清单与哈希记录在 `remediation-validation.json`，实现输入摘要为 `0bbd00c5e19fa7ccbffdd658b54c517dd18a43fc7a99c22a530582504c416b1c`。原 HEAD 仍为 010024c，全部修复尚未提交。原 README 和历史审查文档的既有修改保持原基线。

### 分批验收证据

| 批次 | 已落实的必要对照与证据 | 仍有边界 |
| --- | --- | --- |
| A | `webSafety`、`integrationApi`：提交前可见性、两个保存入口整笔拒绝、正常共享与隐藏同 URL 分离；`authConcurrency`、`passwordAttempts`、`configStore`：setup/CAS、只读登录、原会话撤销、范围代次、代理分桶、预占额度、提交顺序；`restoreAccess`：auth 变/不变、同密码恢复清场景、远端调度挂体时及时返回 | 真实反代部署仍待验收 |
| B | `webdavBackup`、`webdavBackupManager`、`startupAndEmbedding`：正文/错误正文超时、成功上传后清理失败、取消下载不写、开始提交后等待、7/30/365 天、远端停住仍可监听；最终容器运行实际 Node/生产依赖与 WebDAV 冒烟 | 慢链路实测、实际升级中断与强杀/掉电不在已验证范围 |
| C | `bookmarkEditing.integration` 的实际 Providers/QueryClient：字段草稿、继续输入、远端增删、412、乱序/ABA、旧访问、new/duplicate、已保存但同步失败仅 GET 重试 | 不把组件测试替代所有设备布局验收 |
| D | `storage`、`network`、`newtabController`、`newtab-loader`、`resolutionCoordinator`、`popup`、`integrationClient`：旧设置/真实草稿、预算/取消、版本归属、主题独立、未验证地址与已知失败、英文初始化、POST 不重发；`bookmarkManagementApi`、`identifiers`：四入口、256/257/4096、413、原子引用及 dry-run | 真实 Chrome 安装/权限/Cookie/跨网与完整时延分布仍待验收 |

### 中断前待处理的三项竞态

1. **已知失败未立即撤掉快路径**：协调器先发布失败，再等待恢复探测；同版本在途恢复先于缓存命中。loader 接收快照变更并在导航前复核；恢复时再补上最后一次异步检查期间观察到失败或设置变化的取消，以及最终检查超过预算不迟到导航。对应 `resolutionCoordinator.test.ts` 与 `newtab-loader.test.ts`。
2. **慢 POST 期间及成功关闭窗口可能丢草稿**：提交期间与确认成功后关闭前均禁止编辑；提交入口拒绝重复进入。结果不明仍保留草稿，只读核对，不重发。对应 `popup.test.tsx` 的慢 POST/关闭窗口与不确定写入回归。
3. **generation 检查跨异步设置读取**：地址、失败标记及主题提交均先读取最新设置，再同步比较 generation 和设置归属；手动强校验也不并入弱单地址任务。对应 `resolutionCoordinator.test.ts`。

所有接口与浏览器验证均使用临时目录、内存 WebDAV 或无真实配置挂载的测试容器；不能据此声称已验收线上部署。

## 尚未通过的发布门槛

- 真实 Chrome 商店与解压安装的 host permission、第三方 Cookie、HTTP LAN/HTTPS、反代组合；内嵌登录、退出、解锁及非可信来源拒绝。
- 真实浏览器的 warm/cold/离线完整时延分布、跨真实网络首开、后台休眠与输入保护。120/400ms 是读取设置后控制器预算，约 150ms warm 完整耗时是待测目标。30 秒窗口内未被感知的切网仍可能先打开旧地址。
- 真实宿主机与反代的升级中断窗口、其他 CPU 架构镜像及线上备份恢复。正常关闭测试不构成强杀/掉电保证。
- Vitest/Vite 开发测试工具链仍有 5 项告警（含 1 critical）。生产镜像不含这套开发依赖；工具链的大版本迁移需单独安排，不能把生产依赖无告警解释成整个工具链无告警。

发布前备份镜像摘要、部署配置与完整配置卷，并验证隔离恢复。先发布 A/B 服务端，再按独立验收发布 C/D；旧扩展仍可使用原接口。回滚先保留当前数据；恢复旧数据前说明修改损失窗口。旧服务会带回已修复的隐私缺陷，优先准备保留 A 批修复的回退构建。
