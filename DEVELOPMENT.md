# dsh-tool-gitlab 开发文档

> 本文档是项目的**单一真源**:先写文档,再照文档开发;每次开发推进后同步更新本文档,保证文档始终与代码现状一致。

## 1. 项目概览

| 项 | 内容 |
|---|---|
| 项目名 | `dsh-tool-gitlab` |
| 定位 | DeepSeek Harness(dsh)的**独立 GitLab 工具插件**(Cordis 插件),面向企业用户 |
| 发布名 | `@libai168/dsh-tool-gitlab` |
| 架构 | 一切皆插件:通过 `ctx.tools.register(defineTool(...))` 注册模型可见工具 |
| 官方参考 | `docs/cookbook/adding-a-tool.md`、`packages/shell/tool-bash`、`docs/cordis-tutorial/` |
| 项目位置 | 本目录(与官方仓库 `deepseek-harness/` 平级,**不污染官方仓库**) |

### 1.1 目标
- 让 dsh Agent 通过自然语言操作 GitLab,聚焦**企业场景**:MR 全生命周期(评审/批准/合并)、CI/CD 流水线、组与成员治理、个人 Todo 工作台。
- 完全复用 GitHub 插件(`dsh-tool-github`)的架构模式:客户端注入 fetch 便于测试、`createTools(client)` 导出、纯函数 UI 呈现、业务失败返回规范值、基础设施错误抛异常、透传 `exec.signal`。
- 差异化明显:GitHub 插件只有"PR 草稿 + merge + workflow 列表",本插件补齐 MR changes/discussions/approve、pipeline 详情/job 日志/触发、组/子组/成员访问级别、todos 等企业高频能力。

### 1.2 范围(v0.1)
共 **31 个工具**:

**只读(21)**:`gitlab_get_project`、`gitlab_search_projects`、`gitlab_list_group_projects`、`gitlab_list_subgroups`、`gitlab_list_group_members`、`gitlab_list_project_members`、`gitlab_list_issues`、`gitlab_get_issue`、`gitlab_list_mrs`、`gitlab_get_mr`、`gitlab_get_mr_changes`、`gitlab_list_mr_discussions`、`gitlab_list_commits`、`gitlab_get_file`、`gitlab_list_branches`、`gitlab_list_pipelines`、`gitlab_get_pipeline`、`gitlab_get_job_log`、`gitlab_search_code`、`gitlab_get_current_user`、`gitlab_list_todos`

**写操作(10)**:`gitlab_create_issue`、`gitlab_comment_issue`、`gitlab_update_issue`、`gitlab_create_mr`、`gitlab_comment_mr`、`gitlab_approve_mr`、`gitlab_merge_mr`、`gitlab_trigger_pipeline`、`gitlab_create_branch`、`gitlab_write_file`

### 1.3 范围(v0.2)
共 **7 个新增工具**(总 38 个),聚焦评审闭环与 DevOps 资产:

**只读(5)**:`gitlab_get_mr_approvals`、`gitlab_list_labels`、`gitlab_list_milestones`、`gitlab_list_releases`、`gitlab_list_environments`

**写操作(2)**:`gitlab_reply_mr_discussion`、`gitlab_resolve_mr_discussion`

**不在范围内**(后续版本考虑):项目管理(创建/删除项目)、成员增删改。

## 2. 技术要点

### 2.1 API 基础
- GitLab REST API **v4**,默认 baseUrl `https://gitlab.com/api/v4`,企业自托管通过 `baseUrl` 配置覆盖。
- 认证:请求头 `PRIVATE-TOKEN`(支持 PAT/OAuth token)。
- 项目标识:统一用 `group/project` 路径(URL 编码为 `group%2Fproject`),也接受数字 id。
- 错误映射:`404` → 不存在;`401` → token 无效;`403` → 禁止访问;`429` → 限流;其余 → 通用错误。

### 2.2 业务失败 vs 基础设施错误(契约)
| 场景 | 返回 |
|---|---|
| 项目/issue/MR/pipeline/job/文件不存在 | `{ found: false }` |
| 创建 MR 失败(400/409/422:分支缺失、MR 已存在、校验失败) | `{ created: false, reason }` |
| 批准 MR 失败(409:已批准) | `{ ok: false, reason }` |
| 合并 MR 被阻断(405/406/409:冲突、检查未过、状态变化) | `{ merged: false, reason }` |
| 触发流水线失败(400:无 CI 配置) | `{ created: false, reason }` |
| 未配置 token 的写工具 | `{ ok:false|created:false|merged:false, reason: '...requires a GitLab token...' }` |
| `gitlab_get_current_user` / `gitlab_list_todos` 未配置 token | `{ authenticated: false }` |
| 401/403/429/其他 | 抛 `GitlabError`(基础设施错误) |

### 2.3 UI 呈现
- 全部工具实现 `presentCall`/`presentResult`(纯函数,回放安全)。
- 企业向差异化卡片:`gitlab_get_mr_changes` 用 `search/paths` 卡片(变更文件列表)、`gitlab_write_file` 用 `diff` 卡片(写文件内联 diff)、`gitlab_get_job_log` 用 `terminal` 卡片(日志输出)。
- 搜索结果类工具用 `search/paths` 卡片(项目/组/子组/分支)。

### 2.4 依赖与认证
- 运行时 peer:`@deepseek-ai/cordis`、`@deepseek-ai/dsh-tools`(与 GitHub 插件同版本)。
- 认证:插件配置 `token`(GitLab PAT,最小权限),走 `ctx` 配置注入;不落盘、不打印。

## 3. 开发计划(阶段与验收)

### 阶段 0:架构复用(已完成)
- [x] 研读 `dsh-tool-github` 源码(client/index/tests/README),提取可复用架构模式
- [x] 确定 GitLab API v4 端点与 31 个工具清单(企业向差异化)
- 验收:架构与 GitHub 插件一致,工具清单覆盖企业场景

### 阶段 1:脚手架(已完成)
- [x] `package.json`(type: module,exports 指向 lib,peerDeps cordis/dsh-tools,scope `@libai168`)
- [x] `tsconfig.json`(module: NodeNext,strict,declaration,outDir lib/)
- [x] `.gitignore`、`LICENSE`(MIT)
- 验收:typecheck ✅

### 阶段 2:客户端(已完成)
- [x] `src/client.ts`:`GitlabClient`(注入 fetch、baseUrl 默认 gitlab.com/api/v4、`PRIVATE-TOKEN` 认证、15s 超时合并 exec.signal、`GitlabError`)
- [x] 只读方法:getProject/searchProjects/listGroupProjects/listSubgroups/listGroupMembers/listProjectMembers/listIssues/getIssue/listMrs/getMr/getMrChanges/listMrDiscussions/listCommits/getFile/listBranches/listPipelines/getPipeline/getJobLog/searchCode/getCurrentUser/listTodos
- [x] 写方法:createIssue/commentOnIssue/updateIssue/createMr/commentMr/approveMr/mergeMr/triggerPipeline/createBranch/writeFile(全部做业务错误映射)
- [x] `accessLabel()` 访问级别映射(10 Guest / 20 Reporter / 30 Developer / 40 Maintainer / 50 Owner)
- 验收:`tests/client.spec.ts` 28 例全过 ✅

### 阶段 3:工具定义(已完成)
- [x] `src/index.ts`:`apply` + `createTools(client)` 导出,31 个工具注册
- [x] 每个工具:参数 schema、规范输出 schema、`render` 纯函数、`presentCall`/`presentResult`、execute 透传 signal、limit 钳制(1-20/30/50)
- [x] 差异化卡片:MR changes(search/paths)、write_file(diff)、job log(terminal)
- 验收:`tests/tools.spec.ts` 15 例(工具清单精确断言、404 业务值、无 token 提示、错误映射、卡片呈现)全过 ✅;全仓 43/43 通过;typecheck ✅;build ✅;产物导出 `apply/createTools/inject/name` ✅

### 阶段 4:文档与发布准备(已完成)
- [x] `README.md`(英文):安装/配置/差异化对比表/工具表/行为约定/开发/发布
- [x] `README.zh.md`(中文,同上)
- [x] `examples/cordis.yml`:组合配置示例(token/baseUrl/timeoutMs,自托管注释)
- [x] `npm pack --dry-run` 打包验证(临时缓存目录):8 文件、23.3 kB,含 lib/ 产物与双语文档
- [ ] 正式发布清单(需外部操作):`npm run build` → `npm publish --access public` → GitHub 仓库加 `dsh-plugin` topic

### 阶段 5:v0.2 扩展(已完成)
- [x] 客户端新增 7 方法:`getMrApprovals`、`replyToDiscussion`、`resolveDiscussion`、`listLabels`、`listMilestones`、`listReleases`、`listEnvironments`
- [x] `src/index.ts` 注册 7 个新工具(总 38 个):MR 批准状态/讨论回复/讨论解决 + labels/milestones/releases/environments 列表
- [x] 新工具全部实现参数 schema、规范输出、`render` 纯函数、`presentCall`/`presentResult`;写工具无 token 返回业务值
- [x] 差异化卡片:`gitlab_list_environments` 用 `search/paths` 卡片;`gitlab_get_mr_approvals` 输出批准规则明细
- [x] `tests/` 补齐新工具用例(client 37 + tools 19 = 56 全绿)
- [x] `.github/workflows/ci.yml`:Node 22/24 矩阵,`npm ci` → typecheck → test → build
- [x] README.md / README.zh.md 同步工具表与差异化对比(中英一致)
- 验收:typecheck ✅ / 56/56 ✅ / build ✅ / 打包 dry-run ✅(阶段 4 勾选)

## 4. 验证记录

### 2026-08-14
- `npm install`(提权联网)✅ → `npm run typecheck` ✅(修复 5 处 labels/notes 可空类型) → `npm test` 43/43 ✅(client 28 + tools 15) → `npm run build` ✅
- 产物验证:`node -e "import('./lib/index.js')"` 输出 `apply/createTools/inject/name`,`name: dsh-tool-gitlab`,`inject: ["tools"]` ✅

### 2026-08-14(v0.2)
- v0.2 扩展:新增 7 工具(总 38),补齐评审闭环(MR 批准/讨论回复/解决)与 DevOps 资产列表(labels/milestones/releases/environments)✅
- 测试 56/56(client 37 + tools 19)✅;typecheck ✅;build ✅;产物导出不变 ✅
- `.github/workflows/ci.yml` CI(矩阵 Node 22/24)✅
- `npm pack --dry-run`(临时缓存 `/private/tmp/npm-pack-cache`):8 文件、23.3 kB,打包内容含 lib/ 与 README/LICENSE ✅

## 5. 风险与决策记录

| 时间 | 决策/风险 | 说明 |
|---|---|---|
| 2026-08-14 | 独立目录开发,不并入官方仓库 | 与 GitHub 插件一致,插件生态为主路径 |
| 2026-08-14 | 依赖 npm 上的 `@deepseek-ai/*` 发布版 | 与 GitHub 插件同版本(rc.6),已验证 |
| 2026-08-14 | 企业差异化聚焦 5 大块 | MR 全流程/CI/CD/组与成员/Todo/自托管;放弃 stars/forks 等个人开发者向功能 |
| 2026-08-14 | 沙箱内 npm install 网络受限 | 提权后正常;正式环境无此问题 |
| 2026-08-14 | GitLab 无 GitHub 的 total_count | 搜索/列表类返回纯数组,输出不加 total 字段 |
| 2026-08-14 | v0.2 纳入讨论回复/解决与批准状态 | 评审闭环高频场景;回复/解决沿用写工具契约(无 token 返回业务值) |
| 2026-08-14 | 新增 GitHub Actions CI | Node 22/24 矩阵;CI 不跑 `npm pack`,发布仍走本地手工流程 |
