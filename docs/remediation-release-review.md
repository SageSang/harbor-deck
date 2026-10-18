# HarborDeck 发布前复核与更新摘要

复核日期：2026-09-12。基线为 HEAD 010024c 的未提交修复工作树，包版本仍为 1.4.19。本次仅检查与提供发布建议，没有提交、推送、发布或部署。

**结论**

本轮在核对的权限、认证提交、恢复/关闭、编辑草稿、导航缓存、扩展地址决策和收藏、长标识入口中，未发现新的高优先级代码阻塞。原计划中的主要修复已落地；这不等于所有发布门槛都已完成。

建议先准备 Web 候选修复版，验证目标环境后发布；扩展另行完成真实 Chrome 安装、权限、Cookie、反代和时延验收，再正式发布。当前仍不能直接宣称“Web 与扩展已全面验收”。

**本轮核验的证据**

| 项目 | 结果与范围 |
|---|---|
| 批准方案 | SHA-256 与批准版本一致，未改变实现范围 |
| 最终实现输入 | remediation-validation.json 的 66 个 source_files 全部存在且哈希一致，没有在验证后发生未记录的实现改动 |
| 独立重跑测试 | npm test：51 个文件、288 项通过，退出码 0 |
| 独立代码检查 | npm run lint 与 git diff --check 通过 |
| 生产依赖 | 本轮 npm audit --omit=dev：0 项告警 |
| 全量依赖 | 仍有 5 项：3 moderate、1 high、1 critical，位于开发测试工具链 |
| 构建与镜像对应 | 本地 verification-20260912 镜像 ID 与主任务最终记录一致：sha256:8665f0277703a8830b68db0b8688119e786556164d77ff06764ed692b87bda39，linux/amd64 |
| 独立镜像启动复测 | 再次核对源码哈希后，使用同一不可变镜像 ID 启动仅绑定 127.0.0.1 的临时容器；health、虚构管理员 setup、系统配置读写与保存值核对、退出再登录、静态 HTML 均通过；未挂载真实配置，容器已正常停止并自动移除 |
| 主任务运行证据 | 最终 Docker 构建、隔离 HTTP/WebDAV 冒烟、正常关闭与 Web 浏览器交互已有记录；本轮核对输入和镜像身份，没有重新执行那组浏览器操作 |

构建和运行的详细记录见 [实现报告](remediation-implementation.md)。测试工具链的 critical 告警针对特定 Vitest UI/API 使用条件，不能当作生产镜像已存在同等暴露面；生产运行层不安装这套依赖。后续单独安排工具链升级，不把 npm audit fix --force 当作本次发布步骤，也不向不可信网络开放测试 UI/API。[Vitest 官方公告](https://github.com/vitest-dev/vitest/security/advisories/GHSA-5xrq-8626-4rwp)

**仍需处理或明确接受的事项**

1. 修复尚未提交，版本和 Compose 镜像标签仍是 1.4.19，新版本发布说明尚未准备。现有 1.4.19 公共镜像不包含这些未发布代码。
2. 真实 Chrome 的商店/解压扩展、HTTP LAN/HTTPS、主备地址权限、第三方 Cookie、内嵌登录/退出/场景锁定及反代最终响应仍需验收。扩展页面有专门的存储和 Cookie 规则，Codex 内置浏览器中的普通 Web 测试不能代替它。[Chrome 官方说明](https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies)
3. 30 秒成功缓存内的首次切网仍可能采用旧地址，这是批准的速度取舍；120/400ms 是设置读取后的控制器预算，不是实测的网站总加载时间。
4. 四个兼容入口解决的是历史长书签 slug 的相应操作；不承诺所有长 scene/group 路径或超过 1 MiB 的在线写入均可用。
5. 当前运行验证为 amd64；arm64 多架构产物和目标宿主机/反代升级中断仍须验证。旧版回滚会带回已知隐私问题，应优先使用保留安全修复的回退构建。

**这次实际增加和改善的能力**

| 类型 | 用户能感知的变化 |
|---|---|
| 新增管理能力 | 四个 POST 请求体入口：bookmarks/update、delete、duplicate、set-placement，便于管理旧长 slug；读取仍用 /state |
| 新增部署选项 | HARBORDECK_TRUSTED_EXTENSION_IDS 精确登记可内嵌的 Chrome 扩展；HARBORDECK_WEBDAV_TIMEOUT_MS 配置单次 WebDAV 完整请求超时 |
| 新增恢复交互 | 扩展探测失败/离线可手动选主备地址或重新检测；收藏结果不明确时保留草稿并提供只读核对；Web 保存成功但同步失败时只重读页面 |
| 隐私与认证修复 | 搜索/扩展 Token 不再因同 URL 隐式带出隐藏书签；Web 禁止新增无权读取的引用；setup、改密、限流、恢复后访问失效处理更完整 |
| 编辑体验修复 | 保存一个分组不清掉其他草稿；保存期间的新输入保留；新建/复制场景后选中正确对象；旧权限响应不回填 |
| 备份可靠性修复 | 远端故障不再拖住服务监听；正文受超时约束；本地恢复不等待远端调度；上传成功与后续清理失败分开报告；支持受控优雅关闭 |
| 扩展修复 | 30 秒成功快缓存、设置版本隔离、地址结果不等主题；英文初始化正常识别已有收藏；慢 POST 和成功关闭窗口保护；保留原有内嵌选择并提供受限来源配置与帮助 |

共享书签、单管理员、场景密码、搜索/uTools、AI 管理 Token 的原有权限继续保留。没有自动删除历史共享、改写旧 ID、迁移全量配置或要求轮换 Token。内嵌属于原功能修复，不应包装成已经完成真机验收的新功能。

**建议发布步骤（尚未执行）**

建议使用下一补丁版本 1.4.20；本轮查询 origin 未发现 v1.4.20 或 v1.5.0 的对应标签，正式推送前仍需再确认没有被其他任务占用。

1. 完成候选版本验收。优先验证目标机器上的 Web 镜像、登录/解锁、共享收藏、草稿保存和备份；恢复只在隔离数据副本中验证。扩展另跑真实 Chrome 矩阵，未通过不发布扩展。
2. 准备发布提交。将 package.json 与 package-lock.json 版本更新为 1.4.20，更新 README/Compose 中公开部署版本；建立双语 release-notes/v1.4.20-web.md。所有新增实现模块和测试都要纳入，排除 @eaDir；现有 README 和历史审查文档改动应先区分归属。版本调整后核对差异并运行适用检查。
3. 发布服务端。将审阅后的提交推到 GitHub origin，在该提交上创建并推送 v1.4.20-web。现有工作流会构建并推送 ghcr.io/sagesang/harbor-deck 的 1.4.20、1.4、latest 标签，并支持 amd64/arm64；等待两个工作流成功及产物可用。注意 latest/1.4 会移动，不能把推标签当成无发布效果的操作。
4. 更新部署。先备份当前镜像摘要、部署配置和完整 config.json/配置卷，确认备份可读；把部署镜像固定到 1.4.20 或其 digest，保留原配置卷与 Token。按需要添加以下环境项，再 pull/up。服务重启需要重新登录和解锁，实际中断以健康检查恢复为准。

```yaml
environment:
  # 仅使用内嵌模式时登记实际 ID；多个用逗号分隔。每项须为 32 个 a–p 字符。
  HARBORDECK_TRUSTED_EXTENSION_IDS: '<实际 Chrome 扩展 ID>'
  # 可选，默认 15000；是单个请求的预算，非整次备份总预算。
  HARBORDECK_WEBDAV_TIMEOUT_MS: '15000'
```

不用内嵌时省略可信 ID 项，不要原样使用尖括号占位符。启用内嵌还需检查反代最终 CSP，不要全站移除安全头。

```bash
docker compose pull harbor-deck
docker compose up -d harbor-deck
docker compose ps harbor-deck
docker compose logs --tail=100 harbor-deck
```

以上部署命令在实际部署目录执行，不是在源码目录直接套用。升级后验证健康、登录、场景解锁、收藏和分组保存，再做手动备份；不要为冒烟测试恢复线上旧数据。

5. 扩展验收完成后，准备 release-notes/v1.4.20-extension.md，在对应已验证提交上推送 v1.4.20-extension。现有工作流会构建扩展并生成 harbor-deck-v1.4.20-extension.zip，发布到 GitHub Release；它不会自动提交 Chrome Web Store。Web Store 更新需另行上传。无后缀 v1.4.20 会同时发布 Web 和扩展，仅在两者均通过发布门槛时使用。

实际规则来自 [标签解析脚本](../.github/scripts/parse-release-tag.sh)、[镜像工作流](../.github/workflows/docker-publish.yml)、[Release 工作流](../.github/workflows/extension-release.yml)。工作流不会替代全部单元测试/lint，所以发布提交前的检查记录仍须完整。

回退时优先只回退对应镜像/扩展并保留数据，先确认旧版能够读取现配置；若必须恢复数据，先备份现状并明确会丢失的修改窗口。不覆盖现有人工内容，不删除配置卷。
