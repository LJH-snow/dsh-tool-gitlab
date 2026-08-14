# dsh-tool-gitlab

[English](README.md) | [中文](README.zh.md)

面向 **DeepSeek Harness**(`dsh`)的 Cordis 工具插件,为 Agent 提供企业级 GitLab 能力:端到端的合并请求(MR)评审(变更、讨论、批准)、CI/CD 流水线观测与触发、组/项目成员与权限审计、个人 Todo 工作台——全部通过自然语言完成。

基于官方"一切皆插件"架构(`ctx.tools.register(defineTool(...))`),遵循官方 [adding-a-tool](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/adding-a-tool.md) 契约。专门为 **自托管 GitLab**(通过 `baseUrl` 覆盖)和 **企业治理工作流** 设计。

## 安装

直接从 GitHub 安装(无需发布 npm):

```sh
npm install github:LJH-snow/dsh-tool-gitlab
# 或指定分支/标签
npm install github:LJH-snow/dsh-tool-gitlab#main
```

或从本地安装:

```sh
git clone https://github.com/LJH-snow/dsh-tool-gitlab
cd dsh-tool-gitlab
npm install && npm run build   # 构建到 lib/
npm install /path/to/dsh-tool-gitlab
```

> 发布到 npm 后也可通过 `npm install @libai168/dsh-tool-gitlab` 安装。

需要 `@deepseek-ai/cordis`(^4.0.1)和 `@deepseek-ai/dsh-tools`(^0.1.0-rc.6)作为 peer 依赖,由 dsh 运行时提供。

## 配置

在 dsh 组合配置(`cordis.yml`)中加载插件:

```yaml
- name: 'dsh-tool-gitlab'
  config:
    token: 'glpat_xxx'      # GitLab PAT(可选;写操作、MR 批准、CI 触发、个人工具需要)
    baseUrl: 'https://gitlab.com/api/v4'   # 可选;自托管时指向你的实例,如 https://gitlab.example.com/api/v4
    timeoutMs: 15000        # 可选,请求超时毫秒数(默认 15000)
```

完整示例见 [examples/cordis.yml](examples/cordis.yml)。

> 安全:只读工具无需 token;写工具、MR 批准、流水线触发、私仓代码搜索、当前用户与 Todo 需要 token。建议使用最小权限 PAT(按需选择 `api`、`read_repository` 等 scope),切勿提交到仓库。

## 与 GitHub 插件的差异化(企业向)

| 领域 | 本插件(GitLab) | GitHub 插件 |
|---|---|---|
| MR 全生命周期 | `gitlab_get_mr_changes`(逐文件 diff)、`gitlab_list_mr_discussions`(评审讨论线)、`gitlab_approve_mr`、`gitlab_merge_mr`(squash) | 仅 PR 草稿 + 合并 |
| CI/CD | `gitlab_list_pipelines`、`gitlab_get_pipeline`(stages)、`gitlab_get_job_log`(完整日志)、`gitlab_trigger_pipeline` | 仅 workflow 运行列表 |
| 组织与治理 | `gitlab_list_group_projects`、`gitlab_list_subgroups`、`gitlab_list_group_members`、`gitlab_list_project_members`(Guest→Owner 访问级别) | — |
| 个人工作台 | `gitlab_list_todos`(指派/待批准/被提及)、`gitlab_get_current_user` | — |
| 自托管 | `baseUrl` 覆盖指向内网 GitLab | GitHub Enterprise baseUrl |
| 评审 UX | MR 变更为 `search` 卡片、写文件为 `diff` 卡片、Job 日志为 `terminal` 卡片 | generic/search 卡片 |

## 工具列表

### 只读

| 工具 | 功能 | Token |
|---|---|---|
| `gitlab_get_project` | 项目元信息(id、完整路径、star、默认分支、可见性) | 否 |
| `gitlab_search_projects` | 按名称搜索项目(可限定组范围) | 否 |
| `gitlab_list_group_projects` | 组内项目列表(可含子组) | 否 |
| `gitlab_list_subgroups` | 子组列表(组织层级) | 否 |
| `gitlab_list_group_members` | 组成员及访问级别(Guest/Reporter/Developer/Maintainer/Owner) | 否 |
| `gitlab_list_project_members` | 项目成员及访问级别 | 否 |
| `gitlab_list_issues` | 列出 issue(状态/指派人过滤) | 否 |
| `gitlab_get_issue` | issue 详情(含描述) | 否 |
| `gitlab_list_mrs` | 列出 MR(状态过滤、draft/冲突标记) | 否 |
| `gitlab_get_mr` | MR 详情:合并状态、CI 流水线、冲突、squash | 否 |
| `gitlab_get_mr_changes` | 变更文件及逐文件 diff | 否 |
| `gitlab_list_mr_discussions` | 评审讨论线(含评论与解决状态) | 否 |
| `gitlab_list_commits` | 提交列表(分支/作者过滤) | 否 |
| `gitlab_get_file` | 读取仓库文件(base64 解码、支持 ref) | 否 |
| `gitlab_list_branches` | 分支列表及最新 SHA | 否 |
| `gitlab_list_pipelines` | CI/CD 流水线(ref/status 过滤) | 否 |
| `gitlab_get_pipeline` | 流水线详情(含 stages) | 否 |
| `gitlab_get_job_log` | Job 完整日志(UI 显示 terminal 卡片) | 否* |
| `gitlab_search_code` | 项目内代码搜索(blob) | 私仓需要 |
| `gitlab_get_current_user` | 当前认证用户 | 是 |
| `gitlab_list_todos` | 待办(指派/待批准/被提及) | 是 |

### 写操作

| 工具 | 功能 | Token |
|---|---|---|
| `gitlab_create_issue` | 创建 issue(支持 labels) | 是 |
| `gitlab_comment_issue` | 评论 issue | 是 |
| `gitlab_update_issue` | 打开/关闭 issue | 是 |
| `gitlab_create_mr` | 创建 MR(支持 draft) | 是 |
| `gitlab_comment_mr` | 评论 MR | 是 |
| `gitlab_approve_mr` | 批准 MR(审批流) | 是 |
| `gitlab_merge_mr` | 合并 MR(支持 squash) | 是 |
| `gitlab_trigger_pipeline` | 为 ref 触发 CI/CD 流水线 | 是 |
| `gitlab_create_branch` | 从 ref 创建分支 | 是 |
| `gitlab_write_file` | 通过 commit 创建/更新文件(UI 显示 diff 卡片) | 是 |

### 行为约定(遵循官方 execute 契约)

- **业务失败用规范值**:项目/issue/MR 不存在 → `{ found: false }`;MR 创建失败(分支缺失/已存在)→ `{ created: false, reason }`;合并被阻断(冲突/检查未过)→ `{ merged: false, reason }`;未配置 token → 明确的 `reason`/`authenticated: false`。
- **仅基础设施错误抛异常**:token 无效(401)、禁止访问(403)、限流(429)。
- **可取消**:所有请求透传 `exec.signal`,默认 15 秒超时。

## 开发

```sh
npm install
npm run typecheck   # 类型检查
npm test            # 单元测试(vitest)
npm run build       # 构建到 lib/
```

开发计划与决策见 [DEVELOPMENT.md](DEVELOPMENT.md)。

## 发布

1. 包发布到你的 npm scope:`@libai168/dsh-tool-gitlab`(npm 发布需要启用 **2FA bypass** 的细粒度访问令牌,或 trusted publishing)。
2. `npm run build`,然后 `npm publish --access public`。
3. 给 GitHub 仓库添加 [`dsh-plugin`](https://github.com/topics/dsh-plugin) topic,便于生态发现。

## License

[MIT](LICENSE)
