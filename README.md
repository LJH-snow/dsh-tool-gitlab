# dsh-tool-gitlab

[English](README.md) | [中文](README.zh.md)

A Cordis tool plugin that gives [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) enterprise-grade GitLab capabilities. Agents can review merge requests end-to-end (changes, discussions, approvals), observe and trigger CI/CD pipelines, audit group/project membership, and work their personal todo inbox — in natural language.

Built on the official "everything is a plugin" architecture via `ctx.tools.register(defineTool(...))`, following the official [adding-a-tool](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/adding-a-tool.md) contract. Designed for **self-managed GitLab** (`baseUrl` override) and **enterprise governance workflows**.

## Install

Install directly from GitHub (no npm publish needed):

```sh
npm install github:LJH-snow/dsh-tool-gitlab
# or a specific branch/tag
npm install github:LJH-snow/dsh-tool-gitlab#main
```

Or from a local checkout:

```sh
git clone https://github.com/LJH-snow/dsh-tool-gitlab
cd dsh-tool-gitlab
npm install && npm run build   # builds to lib/
npm install /path/to/dsh-tool-gitlab
```

> Once published to npm, it will also be installable as `npm install @libai168/dsh-tool-gitlab`.

Requires `@deepseek-ai/cordis` (^4.0.1) and `@deepseek-ai/dsh-tools` (^0.1.0-rc.6) as peer dependencies, provided by the host dsh runtime.

## Configuration

Load the plugin in a dsh composition config (`cordis.yml`):

```yaml
- name: 'dsh-tool-gitlab'
  config:
    token: 'glpat_xxx'      # GitLab PAT (optional; required for write tools, approvals, CI triggers, and personal tools)
    baseUrl: 'https://gitlab.com/api/v4'   # optional; point at your self-managed GitLab, e.g. https://gitlab.example.com/api/v4
    timeoutMs: 15000        # optional, request timeout in ms (default 15000)
```

Full example: [examples/cordis.yml](examples/cordis.yml).

> Security: read-only tools work without a token. Write tools, MR approval, pipeline triggering, code search on private projects, current-user, and todos require a token. Prefer a minimal-scope PAT (e.g. `api` + `read_repository` scopes as needed) and never commit it.

## Enterprise differentiators

| Area | GitLab plugin tools | What the GitHub plugin has |
|---|---|---|
| Merge Request lifecycle | `gitlab_get_mr_changes` (per-file diffs), `gitlab_list_mr_discussions` (review threads), `gitlab_reply_mr_discussion`, `gitlab_resolve_mr_discussion`, `gitlab_get_mr_approvals` (approval rules), `gitlab_approve_mr`, `gitlab_merge_mr` (squash) | PR draft + merge only |
| CI/CD | `gitlab_list_pipelines`, `gitlab_get_pipeline` (stages), `gitlab_get_job_log` (full trace), `gitlab_trigger_pipeline` | workflow run list only |
| Org & governance | `gitlab_list_group_projects`, `gitlab_list_subgroups`, `gitlab_list_group_members`, `gitlab_list_project_members` (Guest→Owner access levels), `gitlab_add_*_member`, `gitlab_update_*_member`, `gitlab_remove_*_member` | — |
| Project management | `gitlab_create_project`, `gitlab_delete_project` (delete-kind UI cards) | — |
| Group management | `gitlab_create_group`, `gitlab_delete_group`; `gitlab_transfer_project`, `gitlab_archive_project`, `gitlab_unarchive_project` | — |
| Automation & CI config | `gitlab_list/create/delete_project_webhook`, `gitlab_list/create/update/delete_project_variable` (values never exposed) | — |
| Personal workbench | `gitlab_list_todos` (assigned / approval-required / mentioned), `gitlab_get_current_user` | — |
| Release & DevOps | `gitlab_list_releases`, `gitlab_list_milestones`, `gitlab_list_environments`, `gitlab_list_labels` | releases list only |
| Runner, registry & backup | list/enable/disable/delete runners, registry repositories/tags, remote mirrors (URLs masked), project export status | — |
| Self-managed | `baseUrl` override for on-premises GitLab | GitHub Enterprise baseUrl |
| Review UX | `search`-card MR changes, `diff`-card file writes, `terminal`-card job logs | generic/search cards |

## Tools

### Read-only

| Tool | Description | Token |
|---|---|---|
| `gitlab_get_project` | Project metadata (id, full path, stars, default branch, visibility) | no |
| `gitlab_search_projects` | Search projects by name (optionally scoped to a group) | no |
| `gitlab_list_group_projects` | Projects in a group, with optional subgroup inclusion | no |
| `gitlab_list_subgroups` | Subgroups of a group (org hierarchy) | no |
| `gitlab_list_group_members` | Group members with access levels (Guest/Reporter/Developer/Maintainer/Owner) | no |
| `gitlab_list_project_members` | Project members with access levels | no |
| `gitlab_list_issues` | List issues (state/assignee filters) | no |
| `gitlab_get_issue` | Issue details (description included) | no |
| `gitlab_list_mrs` | List merge requests (state filter, draft/conflict flags) | no |
| `gitlab_get_mr` | MR details: merge status, CI pipeline, conflicts, squash | no |
| `gitlab_get_mr_changes` | Changed files with per-file diff hunks | no |
| `gitlab_get_mr_approvals` | Approval status: approvers, required/left, per-rule state | no |
| `gitlab_list_mr_discussions` | Review threads with notes and resolution state | no |
| `gitlab_list_commits` | Commits (branch/author filters) | no |
| `gitlab_get_file` | Read a repository file (base64-decoded, ref support) | no |
| `gitlab_list_branches` | Branches with latest SHAs | no |
| `gitlab_list_labels` | Project labels with colors | no |
| `gitlab_list_milestones` | Milestones with due dates and states | no |
| `gitlab_list_releases` | Releases with tags, authors, and dates | no |
| `gitlab_list_environments` | Deployment environments with states and URLs | no |
| `gitlab_list_pipelines` | CI/CD pipelines (ref/status filters) | no |
| `gitlab_get_pipeline` | Pipeline details with stages | no |
| `gitlab_get_job_log` | Full job log trace (terminal card in UI) | no* |
| `gitlab_search_code` | Blob code search inside a project | private projects |
| `gitlab_get_current_user` | Authenticated user identity | yes |
| `gitlab_list_todos` | Pending todos (assigned, approval-required, mentioned) | yes |
| `gitlab_list_project_webhooks` | Webhook URLs and enabled event types (metadata only) | private projects |
| `gitlab_list_project_variables` | CI/CD variable keys and options — values are never returned | private projects |
| `gitlab_list_runners` | Runners assigned to a project (status, type, access level) | private projects |
| `gitlab_list_registry_repositories` | Container registry repositories with tag counts | private projects |
| `gitlab_list_registry_tags` | Container registry tags with digests and sizes | private projects |
| `gitlab_list_project_mirrors` | Remote mirror settings; URLs and credentials are never returned | yes |
| `gitlab_get_project_export_status` | Check an asynchronous project export status | yes |

### Write operations

| Tool | Description | Token |
|---|---|---|
| `gitlab_create_issue` | Create an issue (labels supported) | yes |
| `gitlab_comment_issue` | Comment on an issue | yes |
| `gitlab_update_issue` | Open or close an issue | yes |
| `gitlab_create_mr` | Create a merge request (draft supported) | yes |
| `gitlab_comment_mr` | Comment on a merge request | yes |
| `gitlab_reply_mr_discussion` | Reply to a review discussion thread | yes |
| `gitlab_resolve_mr_discussion` | Resolve/unresolve a review discussion thread | yes |
| `gitlab_approve_mr` | Approve a merge request (approval flow) | yes |
| `gitlab_merge_mr` | Merge a merge request (squash supported) | yes |
| `gitlab_trigger_pipeline` | Trigger a CI/CD pipeline for a ref | yes |
| `gitlab_create_branch` | Create a branch from a ref | yes |
| `gitlab_write_file` | Create/update a file via a commit (diff card in UI) | yes |
| `gitlab_create_project` | Create a project (visibility, namespace, README init) | yes |
| `gitlab_delete_project` | Permanently delete a project (delete-kind UI card) | yes |
| `gitlab_add_group_member` | Add a member to a group (guest→owner) | yes |
| `gitlab_update_group_member` | Change a group member's access level | yes |
| `gitlab_remove_group_member` | Remove a member from a group (delete-kind UI card) | yes |
| `gitlab_add_project_member` | Add a member to a project (guest→owner) | yes |
| `gitlab_update_project_member` | Change a project member's access level | yes |
| `gitlab_remove_project_member` | Remove a member from a project (delete-kind UI card) | yes |
| `gitlab_create_group` | Create a group (visibility, path) | yes |
| `gitlab_delete_group` | Permanently delete a group and all its projects (delete-kind UI card) | yes |
| `gitlab_transfer_project` | Transfer a project to another namespace (move-kind UI card) | yes |
| `gitlab_archive_project` | Archive a project (read-only for everyone) | yes |
| `gitlab_unarchive_project` | Unarchive a project | yes |
| `gitlab_create_project_webhook` | Create a webhook that pushes events to a URL | yes |
| `gitlab_delete_project_webhook` | Delete a webhook (delete-kind UI card) | yes |
| `gitlab_create_project_variable` | Create a CI/CD variable (value sent once, never echoed) | yes |
| `gitlab_update_project_variable` | Update a CI/CD variable (value never echoed) | yes |
| `gitlab_delete_project_variable` | Delete a CI/CD variable (delete-kind UI card) | yes |
| `gitlab_enable_project_runner` | Enable an existing runner for a project | yes |
| `gitlab_disable_project_runner` | Unassign a runner from a project | yes |
| `gitlab_delete_runner` | Permanently delete a runner (delete-kind UI card) | yes |
| `gitlab_delete_registry_repository` | Delete a registry repository and all tags (delete-kind UI card) | yes |
| `gitlab_delete_registry_tag` | Delete a specific registry tag (delete-kind UI card) | yes |
| `gitlab_create_project_mirror` | Create a remote mirror; mirror URL is sent once and never echoed | yes |
| `gitlab_start_project_export` | Start an asynchronous project export | yes |

### Behavior contract (per the official execute contract)

- **Business failures are canonical values**: missing project/issue/MR → `{ found: false }`; MR creation failure (branch missing / MR exists) → `{ created: false, reason }`; merge blocked (conflicts/checks) → `{ merged: false, reason }`; no token → clear `reason`/`authenticated: false` values.
- **Only infrastructure errors throw**: invalid token (401), forbidden (403), rate limit (429).
- **Cancellable**: every request forwards `exec.signal`, with a default 15s timeout.

## Development

```sh
npm install
npm run typecheck   # type check
npm test            # unit tests (vitest)
npm run build       # build to lib/
```

See [DEVELOPMENT.md](DEVELOPMENT.md) for plans and decisions.

## Publishing

1. The package is published under your npm scope: `@libai168/dsh-tool-gitlab` (npm publishing requires a granular access token with **2FA bypass** enabled, or trusted publishing).
2. `npm run build`, then `npm publish --access public`.
3. Add the [`dsh-plugin`](https://github.com/topics/dsh-plugin) topic to your GitHub repo for ecosystem discovery.

## License

[MIT](LICENSE)
