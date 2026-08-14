import type { Context } from '@deepseek-ai/cordis'
import type { ToolCallView, ToolResultView, ToolResult } from '@deepseek-ai/dsh-tools'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { GitlabClient, GitlabError } from './client.js'

export const name = 'dsh-tool-gitlab'
export const inject = ['tools']

export interface GitlabPluginConfig {
  /** GitLab Personal Access Token. Read-only tools work without it; write, MR approval, CI/CD trigger, and personal tools require it. */
  token?: string
  /** API base URL override (default https://gitlab.com/api/v4). Point this at your self-managed GitLab for enterprise use. */
  baseUrl?: string
  /** Request timeout in milliseconds. */
  timeoutMs?: number
}

export function apply(ctx: Context, config: GitlabPluginConfig = {}) {
  const client = new GitlabClient({ baseUrl: config.baseUrl, token: config.token, timeoutMs: config.timeoutMs })
  for (const tool of createTools(client)) {
    ctx.tools.register(tool)
  }
}

/** Build the tool definitions for a client. Exported so tests can drive execute/render directly. */
export function createTools(client: GitlabClient) {
  return [
    defineTool({
      name: 'gitlab_get_project',
      description: 'Get metadata about a GitLab project: id, full path, description, stars, default branch, visibility, and last activity time.',
      parameters: {
        project: { type: 'string', required: true, description: 'Project path "group/project" or numeric project id, e.g. acme/payments' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean', description: 'Whether the project exists' },
            id: { type: 'integer', description: 'Project id' },
            pathWithNamespace: { type: 'string', description: 'Full project path' },
            name: { type: 'string', description: 'Project name' },
            description: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'Project description' },
            stars: { type: 'integer', description: 'Star count' },
            defaultBranch: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'Default branch' },
            visibility: { type: 'string', description: 'Visibility: private, internal, or public' },
            webUrl: { type: 'string', description: 'Project web URL' },
            lastActivityAt: { type: 'string', description: 'ISO last-activity timestamp' },
          },
        },
        render: (_args, value) => {
          if (!value.found) return [{ type: 'text', text: 'Project not found.' }]
          const lines = [
            `${value.pathWithNamespace} (id ${value.id})`,
            value.description ?? '',
            `stars: ${value.stars ?? 0}`,
            `default branch: ${value.defaultBranch ?? 'n/a'}`,
            `visibility: ${value.visibility ?? 'n/a'}`,
            value.webUrl ?? '',
            value.lastActivityAt ? `last activity: ${value.lastActivityAt}` : '',
          ].filter(Boolean)
          return [{ type: 'text', text: lines.join('\n') }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Fetch project ${args.project}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { found?: boolean; pathWithNamespace?: string; id?: number; stars?: number; visibility?: string }
        if (!v.found) return { card: 'generic', title: 'Project not found' }
        return {
          card: 'generic',
          title: v.pathWithNamespace ?? '',
          content: [{ type: 'text', text: `${v.stars ?? 0} stars · ${v.visibility ?? 'n/a'} · id ${v.id}` }],
        }
      },
      async execute(args, exec) {
        try {
          const info = await client.getProject(args.project, exec.signal)
          return { found: true, ...info }
        } catch (error) {
          if (error instanceof GitlabError && error.status === 404) {
            return { found: false }
          }
          throw error
        }
      },
    }),

    defineTool({
      name: 'gitlab_search_projects',
      description: 'Search GitLab projects by name, sorted by stars by default. Can scope the search to a group (e.g. an enterprise department).',
      parameters: {
        query: { type: 'string', required: true, description: 'Search query, e.g. "payments" or "data-platform"' },
        groupId: { type: 'integer', description: 'Only search within this group id (enterprise group scoping)' },
        sort: { type: 'string', enum: ['stars', 'last_activity_at'], description: 'Sort criterion (default stars)' },
        order: { type: 'string', enum: ['asc', 'desc'], description: 'Sort order (default desc)' },
        limit: { type: 'integer', description: 'Maximum results, 1-20 (default 5)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'integer', description: 'Project id' },
                  pathWithNamespace: { type: 'string', description: 'Full project path' },
                  description: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'Project description' },
                  stars: { type: 'integer', description: 'Star count' },
                  visibility: { type: 'string', description: 'Visibility' },
                  webUrl: { type: 'string', description: 'Project web URL' },
                  lastActivityAt: { type: 'string', description: 'ISO last-activity timestamp' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          const items = value.items ?? []
          if (items.length === 0) return [{ type: 'text', text: 'No projects found.' }]
          const lines = items.map(item => `${item.pathWithNamespace} (${item.stars} stars, ${item.visibility}) — ${item.description ?? ''}`)
          return [{ type: 'text', text: lines.join('\n') }]
        },
      },
      presentCall(args): ToolCallView {
        const scope = args.groupId ? ` in group ${args.groupId}` : ''
        return { card: 'generic', title: `Search projects: ${args.query}${scope}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { items?: Array<{ pathWithNamespace: string }> }
        const items = v.items ?? []
        if (items.length === 0) return { card: 'generic', title: 'No projects' }
        return {
          card: 'search',
          shape: 'paths',
          title: `${items.length} project(s)`,
          paths: items.map(i => i.pathWithNamespace),
          truncated: false,
          total: items.length,
        }
      },
      async execute(args, exec) {
        const limit = args.limit === undefined ? 5 : Math.max(1, Math.min(args.limit, 20))
        const items = await client.searchProjects(args.query, { groupId: args.groupId, orderBy: args.sort, order: args.order, perPage: limit, signal: exec.signal })
        return { items }
      },
    }),

    defineTool({
      name: 'gitlab_list_group_projects',
      description: 'List projects in a GitLab group, optionally including subgroups. The enterprise way to discover a team\'s repositories.',
      parameters: {
        group: { type: 'string', required: true, description: 'Group path, e.g. acme or acme/platform' },
        includeSubgroups: { type: 'boolean', description: 'Include projects from subgroups (default false)' },
        limit: { type: 'integer', description: 'Maximum results, 1-50 (default 20)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'integer', description: 'Project id' },
                  pathWithNamespace: { type: 'string', description: 'Full project path' },
                  description: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'Project description' },
                  stars: { type: 'integer', description: 'Star count' },
                  visibility: { type: 'string', description: 'Visibility' },
                  webUrl: { type: 'string', description: 'Project web URL' },
                  lastActivityAt: { type: 'string', description: 'ISO last-activity timestamp' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          const items = value.items ?? []
          if (items.length === 0) return [{ type: 'text', text: 'No projects in this group.' }]
          return [{ type: 'text', text: items.map(item => `${item.pathWithNamespace} (${item.stars} stars, ${item.visibility})`).join('\n') }]
        },
      },
      presentCall(args): ToolCallView {
        const subs = args.includeSubgroups ? ' + subgroups' : ''
        return { card: 'generic', title: `Projects in ${args.group}${subs}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { items?: Array<{ pathWithNamespace: string }> }
        const items = v.items ?? []
        if (items.length === 0) return { card: 'generic', title: 'No projects' }
        return {
          card: 'search',
          shape: 'paths',
          title: `${items.length} project(s)`,
          paths: items.map(i => i.pathWithNamespace),
          truncated: false,
          total: items.length,
        }
      },
      async execute(args, exec) {
        const limit = args.limit === undefined ? 20 : Math.max(1, Math.min(args.limit, 50))
        const items = await client.listGroupProjects(args.group, { includeSubgroups: args.includeSubgroups, perPage: limit, signal: exec.signal })
        return { items }
      },
    }),

    defineTool({
      name: 'gitlab_list_subgroups',
      description: 'List subgroups of a GitLab group, showing the enterprise org hierarchy.',
      parameters: {
        group: { type: 'string', required: true, description: 'Group path, e.g. acme' },
        limit: { type: 'integer', description: 'Maximum results, 1-50 (default 20)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'integer', description: 'Group id' },
                  fullPath: { type: 'string', description: 'Full group path' },
                  description: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'Group description' },
                  visibility: { type: 'string', description: 'Visibility' },
                  webUrl: { type: 'string', description: 'Group web URL' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          const items = value.items ?? []
          if (items.length === 0) return [{ type: 'text', text: 'No subgroups.' }]
          return [{ type: 'text', text: items.map(item => `${item.fullPath} (${item.visibility})`).join('\n') }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Subgroups of ${args.group}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { items?: Array<{ fullPath: string }> }
        const items = v.items ?? []
        if (items.length === 0) return { card: 'generic', title: 'No subgroups' }
        return {
          card: 'search',
          shape: 'paths',
          title: `${items.length} subgroup(s)`,
          paths: items.map(i => i.fullPath),
          truncated: false,
          total: items.length,
        }
      },
      async execute(args, exec) {
        const limit = args.limit === undefined ? 20 : Math.max(1, Math.min(args.limit, 50))
        const items = await client.listSubgroups(args.group, { perPage: limit, signal: exec.signal })
        return { items }
      },
    }),

    defineTool({
      name: 'gitlab_list_group_members',
      description: 'List members of a GitLab group with their access levels (Guest/Reporter/Developer/Maintainer/Owner). Enterprise access governance.',
      parameters: {
        group: { type: 'string', required: true, description: 'Group path, e.g. acme' },
        limit: { type: 'integer', description: 'Maximum results, 1-50 (default 20)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  username: { type: 'string', description: 'Username' },
                  name: { type: 'string', description: 'Display name' },
                  accessLevel: { type: 'integer', description: 'Numeric access level' },
                  accessLabel: { type: 'string', description: 'Access level name' },
                  webUrl: { type: 'string', description: 'Profile URL' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          const items = value.items ?? []
          if (items.length === 0) return [{ type: 'text', text: 'No members found.' }]
          return [{ type: 'text', text: items.map(item => `@${item.username} — ${item.accessLabel} (${item.accessLevel})`).join('\n') }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Members of ${args.group}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { items?: Array<{ username: string; accessLabel: string }> }
        const items = v.items ?? []
        if (items.length === 0) return { card: 'generic', title: 'No members' }
        return {
          card: 'generic',
          title: `${items.length} member(s)`,
          content: [{ type: 'text', text: items.map(i => `@${i.username} (${i.accessLabel})`).join('\n') }],
        }
      },
      async execute(args, exec) {
        const limit = args.limit === undefined ? 20 : Math.max(1, Math.min(args.limit, 50))
        const items = await client.listGroupMembers(args.group, { perPage: limit, signal: exec.signal })
        return { items }
      },
    }),

    defineTool({
      name: 'gitlab_list_project_members',
      description: 'List members of a GitLab project with their access levels (Guest/Reporter/Developer/Maintainer/Owner). Enterprise access governance.',
      parameters: {
        project: { type: 'string', required: true, description: 'Project path "group/project" or numeric project id' },
        limit: { type: 'integer', description: 'Maximum results, 1-50 (default 20)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  username: { type: 'string', description: 'Username' },
                  name: { type: 'string', description: 'Display name' },
                  accessLevel: { type: 'integer', description: 'Numeric access level' },
                  accessLabel: { type: 'string', description: 'Access level name' },
                  webUrl: { type: 'string', description: 'Profile URL' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          const items = value.items ?? []
          if (items.length === 0) return [{ type: 'text', text: 'No members found.' }]
          return [{ type: 'text', text: items.map(item => `@${item.username} — ${item.accessLabel} (${item.accessLevel})`).join('\n') }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Members of ${args.project}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { items?: Array<{ username: string; accessLabel: string }> }
        const items = v.items ?? []
        if (items.length === 0) return { card: 'generic', title: 'No members' }
        return {
          card: 'generic',
          title: `${items.length} member(s)`,
          content: [{ type: 'text', text: items.map(i => `@${i.username} (${i.accessLabel})`).join('\n') }],
        }
      },
      async execute(args, exec) {
        const limit = args.limit === undefined ? 20 : Math.max(1, Math.min(args.limit, 50))
        const items = await client.listProjectMembers(args.project, { perPage: limit, signal: exec.signal })
        return { items }
      },
    }),

    defineTool({
      name: 'gitlab_list_issues',
      description: 'List issues of a GitLab project, optionally filtered by state and assignee. Returns iid, title, state, labels, author, and URL.',
      parameters: {
        project: { type: 'string', required: true, description: 'Project path "group/project" or numeric project id' },
        state: { type: 'string', enum: ['opened', 'closed', 'all'], description: 'Issue state (default opened)' },
        assigneeUsername: { type: 'string', description: 'Filter by assignee username' },
        limit: { type: 'integer', description: 'Maximum results, 1-20 (default 10)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  iid: { type: 'integer', description: 'Issue iid' },
                  title: { type: 'string', description: 'Issue title' },
                  state: { type: 'string', description: 'Issue state' },
                  labels: { type: 'array', items: { type: 'string' }, description: 'Labels' },
                  author: { type: 'string', description: 'Author username' },
                  createdAt: { type: 'string', description: 'ISO creation timestamp' },
                  webUrl: { type: 'string', description: 'Issue URL' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          const items = value.items ?? []
          if (items.length === 0) return [{ type: 'text', text: 'No issues found.' }]
          const lines = items.map(item => {
            const labels = (item.labels ?? []).length > 0 ? ` [${(item.labels ?? []).join(',')}]` : ''
            return `#${item.iid} ${item.title} (${item.state}, @${item.author})${labels}`
          })
          return [{ type: 'text', text: lines.join('\n') }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Issues: ${args.project}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { items?: Array<{ iid: number; title: string }> }
        const items = v.items ?? []
        if (items.length === 0) return { card: 'generic', title: 'No issues' }
        return {
          card: 'generic',
          title: `${items.length} issue(s)`,
          content: [{ type: 'text', text: items.map(i => `#${i.iid} ${i.title}`).join('\n') }],
        }
      },
      async execute(args, exec) {
        const limit = args.limit === undefined ? 10 : Math.max(1, Math.min(args.limit, 20))
        const items = await client.listIssues(args.project, { state: args.state, assigneeUsername: args.assigneeUsername, perPage: limit, signal: exec.signal })
        return { items }
      },
    }),

    defineTool({
      name: 'gitlab_get_issue',
      description: 'Get details of a GitLab issue: title, state, author, labels, description, and URL.',
      parameters: {
        project: { type: 'string', required: true, description: 'Project path "group/project" or numeric project id' },
        iid: { type: 'integer', required: true, description: 'Issue iid, e.g. 42' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean', description: 'Whether the issue exists' },
            iid: { type: 'integer', description: 'Issue iid' },
            title: { type: 'string', description: 'Issue title' },
            state: { type: 'string', description: 'Issue state' },
            author: { type: 'string', description: 'Author username' },
            createdAt: { type: 'string', description: 'ISO creation timestamp' },
            labels: { type: 'array', items: { type: 'string' }, description: 'Labels' },
            description: { type: 'string', description: 'Issue description' },
            webUrl: { type: 'string', description: 'Issue URL' },
          },
        },
        render: (_args, value) => {
          if (!value.found) return [{ type: 'text', text: 'Issue not found.' }]
          const lines = [
            `#${value.iid} ${value.title} (${value.state}, @${value.author})`,
            `labels: ${(value.labels ?? []).length > 0 ? (value.labels ?? []).join(', ') : 'none'}`,
            value.description ? `\n${value.description}` : '',
            value.webUrl ?? '',
          ].filter(Boolean)
          return [{ type: 'text', text: lines.join('\n') }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Issue #${args.iid} in ${args.project}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { found?: boolean; iid?: number; title?: string; state?: string; author?: string }
        if (!v.found) return { card: 'generic', title: 'Issue not found' }
        return {
          card: 'generic',
          title: `Issue #${v.iid}: ${v.title}`,
          content: [{ type: 'text', text: `${v.state} · @${v.author}` }],
        }
      },
      async execute(args, exec) {
        try {
          const info = await client.getIssue(args.project, args.iid, exec.signal)
          return { found: true, ...info }
        } catch (error) {
          if (error instanceof GitlabError && error.status === 404) {
            return { found: false }
          }
          throw error
        }
      },
    }),

    defineTool({
      name: 'gitlab_list_mrs',
      description: 'List merge requests of a GitLab project, optionally filtered by state. Returns iid, title, draft status, author, and source/target branches.',
      parameters: {
        project: { type: 'string', required: true, description: 'Project path "group/project" or numeric project id' },
        state: { type: 'string', enum: ['opened', 'closed', 'merged', 'all'], description: 'MR state (default opened)' },
        limit: { type: 'integer', description: 'Maximum results, 1-20 (default 10)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  iid: { type: 'integer', description: 'MR iid' },
                  title: { type: 'string', description: 'MR title' },
                  state: { type: 'string', description: 'MR state' },
                  draft: { type: 'boolean', description: 'Whether this is a draft MR' },
                  author: { type: 'string', description: 'Author username' },
                  sourceBranch: { type: 'string', description: 'Source branch' },
                  targetBranch: { type: 'string', description: 'Target branch' },
                  hasConflicts: { type: 'boolean', description: 'Whether the MR has conflicts' },
                  createdAt: { type: 'string', description: 'ISO creation timestamp' },
                  webUrl: { type: 'string', description: 'MR URL' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          const items = value.items ?? []
          if (items.length === 0) return [{ type: 'text', text: 'No merge requests found.' }]
          const lines = items.map(item => {
            const draft = item.draft ? ' [draft]' : ''
            const conflicts = item.hasConflicts ? ' [conflicts]' : ''
            return `!${item.iid} ${item.title} (${item.state}, @${item.author})${draft}${conflicts} → ${item.sourceBranch} -> ${item.targetBranch}`
          })
          return [{ type: 'text', text: lines.join('\n') }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `MRs: ${args.project}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { items?: Array<{ iid: number; title: string }> }
        const items = v.items ?? []
        if (items.length === 0) return { card: 'generic', title: 'No MRs' }
        return {
          card: 'generic',
          title: `${items.length} MR(s)`,
          content: [{ type: 'text', text: items.map(i => `!${i.iid} ${i.title}`).join('\n') }],
        }
      },
      async execute(args, exec) {
        const limit = args.limit === undefined ? 10 : Math.max(1, Math.min(args.limit, 20))
        const items = await client.listMrs(args.project, { state: args.state, perPage: limit, signal: exec.signal })
        return { items }
      },
    }),

    defineTool({
      name: 'gitlab_get_mr',
      description: 'Get details of a GitLab merge request: draft status, merge status, CI pipeline status, conflicts, and description. Enterprise review hub.',
      parameters: {
        project: { type: 'string', required: true, description: 'Project path "group/project" or numeric project id' },
        iid: { type: 'integer', required: true, description: 'MR iid, e.g. 7' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean', description: 'Whether the MR exists' },
            iid: { type: 'integer', description: 'MR iid' },
            title: { type: 'string', description: 'MR title' },
            state: { type: 'string', description: 'MR state' },
            draft: { type: 'boolean', description: 'Whether this is a draft MR' },
            author: { type: 'string', description: 'Author username' },
            sourceBranch: { type: 'string', description: 'Source branch' },
            targetBranch: { type: 'string', description: 'Target branch' },
            mergeStatus: { type: 'string', description: 'Merge status, e.g. can_be_merged' },
            detailedMergeStatus: { type: 'string', description: 'Detailed merge status with reason' },
            hasConflicts: { type: 'boolean', description: 'Whether the MR has conflicts' },
            squash: { type: 'boolean', description: 'Whether squash-on-merge is enabled' },
            pipeline: {
              oneOf: [
                {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    id: { type: 'integer', description: 'Pipeline id' },
                    status: { type: 'string', description: 'Pipeline status' },
                    ref: { type: 'string', description: 'Pipeline ref' },
                    webUrl: { type: 'string', description: 'Pipeline URL' },
                  },
                },
                { type: 'null' },
              ],
              description: 'Latest CI pipeline, if any',
            },
            description: { type: 'string', description: 'MR description' },
            createdAt: { type: 'string', description: 'ISO creation timestamp' },
            webUrl: { type: 'string', description: 'MR URL' },
          },
        },
        render: (_args, value) => {
          if (!value.found) return [{ type: 'text', text: 'Merge request not found.' }]
          const lines = [
            `!${value.iid} ${value.title} (${value.state}, @${value.author})`,
            `branches: ${value.sourceBranch} -> ${value.targetBranch}`,
            `merge status: ${value.detailedMergeStatus ?? value.mergeStatus ?? 'n/a'}`,
            `conflicts: ${value.hasConflicts ? 'yes' : 'no'}`,
            value.draft ? 'draft: yes' : '',
            value.pipeline ? `pipeline #${value.pipeline.id}: ${value.pipeline.status}` : 'pipeline: none',
            value.description ? `\n${value.description}` : '',
            value.webUrl ?? '',
          ].filter(Boolean)
          return [{ type: 'text', text: lines.join('\n') }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `MR !${args.iid} in ${args.project}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { found?: boolean; iid?: number; title?: string; state?: string; pipeline?: { status?: string } | null; hasConflicts?: boolean }
        if (!v.found) return { card: 'generic', title: 'MR not found' }
        const bits = [v.state ?? 'n/a']
        if (v.pipeline?.status) bits.push(`pipeline: ${v.pipeline.status}`)
        if (v.hasConflicts) bits.push('conflicts')
        return {
          card: 'generic',
          title: `MR !${v.iid}: ${v.title}`,
          content: [{ type: 'text', text: bits.join(' · ') }],
        }
      },
      async execute(args, exec) {
        try {
          const info = await client.getMr(args.project, args.iid, exec.signal)
          return { found: true, ...info }
        } catch (error) {
          if (error instanceof GitlabError && error.status === 404) {
            return { found: false }
          }
          throw error
        }
      },
    }),

    defineTool({
      name: 'gitlab_get_mr_changes',
      description: 'List the files changed by a GitLab merge request with per-file diff hunks. Enterprise code review: see exactly what an MR touches.',
      parameters: {
        project: { type: 'string', required: true, description: 'Project path "group/project" or numeric project id' },
        iid: { type: 'integer', required: true, description: 'MR iid, e.g. 7' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean', description: 'Whether the MR exists' },
            iid: { type: 'integer', description: 'MR iid' },
            title: { type: 'string', description: 'MR title' },
            changedFiles: { type: 'integer', description: 'Number of changed files' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  oldPath: { type: 'string', description: 'Old file path (empty for new files)' },
                  newPath: { type: 'string', description: 'New file path' },
                  newFile: { type: 'boolean', description: 'Whether the file was added' },
                  deletedFile: { type: 'boolean', description: 'Whether the file was deleted' },
                  renamedFile: { type: 'boolean', description: 'Whether the file was renamed' },
                  diff: { type: 'string', description: 'Unified diff hunk' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          if (!value.found) return [{ type: 'text', text: 'Merge request not found.' }]
          const items = value.items ?? []
          if (items.length === 0) return [{ type: 'text', text: 'No changes in this MR.' }]
          const lines = items.map(item => {
            const kind = item.newFile ? 'A' : item.deletedFile ? 'D' : item.renamedFile ? 'R' : 'M'
            return `${kind} ${item.newPath}${item.diff ? `\n${item.diff.split('\n').slice(0, 30).join('\n')}` : ''}`
          })
          return [{ type: 'text', text: `!${value.iid}: ${value.changedFiles ?? 0} file(s) changed\n\n${lines.join('\n')}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Changes of MR !${args.iid}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { found?: boolean; iid?: number; changedFiles?: number; items?: Array<{ newPath: string; newFile?: boolean; deletedFile?: boolean }> }
        if (!v.found) return { card: 'generic', title: 'MR not found' }
        const items = v.items ?? []
        if (items.length === 0) return { card: 'generic', title: 'No changes' }
        return {
          card: 'search',
          shape: 'paths',
          title: `MR !${v.iid}: ${items.length} file(s)`,
          paths: items.map(i => `${i.newFile ? 'A ' : i.deletedFile ? 'D ' : 'M '}${i.newPath}`),
          truncated: false,
          total: items.length,
        }
      },
      async execute(args, exec) {
        try {
          const info = await client.getMrChanges(args.project, args.iid, exec.signal)
          return { found: true, iid: info.iid, title: info.title, changedFiles: info.changes.length, items: info.changes }
        } catch (error) {
          if (error instanceof GitlabError && error.status === 404) {
            return { found: false }
          }
          throw error
        }
      },
    }),

    defineTool({
      name: 'gitlab_list_mr_discussions',
      description: 'List review discussion threads on a GitLab merge request, with per-note authors, resolution state, and body. Enterprise review threads.',
      parameters: {
        project: { type: 'string', required: true, description: 'Project path "group/project" or numeric project id' },
        iid: { type: 'integer', required: true, description: 'MR iid, e.g. 7' },
        limit: { type: 'integer', description: 'Maximum threads, 1-50 (default 20)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean', description: 'Whether the MR exists' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'string', description: 'Discussion id' },
                  resolved: { type: 'boolean', description: 'Whether all resolvable notes are resolved' },
                  notes: {
                    type: 'array',
                    items: {
                      type: 'object',
                      additionalProperties: false,
                      properties: {
                        author: { type: 'string', description: 'Note author' },
                        createdAt: { type: 'string', description: 'ISO creation timestamp' },
                        body: { type: 'string', description: 'Note body' },
                        resolved: { type: 'boolean', description: 'Whether this note is resolved' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          if (!value.found) return [{ type: 'text', text: 'Merge request not found.' }]
          const items = value.items ?? []
          if (items.length === 0) return [{ type: 'text', text: 'No discussions on this MR.' }]
          const blocks = items.map((item, index) => {
            const resolved = item.resolved ? ' [resolved]' : ''
            const notes = (item.notes ?? []).map(note => `  @${note.author}: ${note.body}`).join('\n')
            return `Thread ${index + 1}${resolved}\n${notes}`
          })
          return [{ type: 'text', text: blocks.join('\n\n') }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Discussions on MR !${args.iid}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { found?: boolean; items?: Array<{ resolved?: boolean; notes?: Array<{ author?: string }> }> }
        if (!v.found) return { card: 'generic', title: 'MR not found' }
        const items = v.items ?? []
        if (items.length === 0) return { card: 'generic', title: 'No discussions' }
        return {
          card: 'generic',
          title: `${items.length} thread(s)`,
          content: [{ type: 'text', text: items.map((i, idx) => `Thread ${idx + 1}${i.resolved ? ' [resolved]' : ''} (${i.notes?.length ?? 0} notes)`).join('\n') }],
        }
      },
      async execute(args, exec) {
        try {
          const limit = args.limit === undefined ? 20 : Math.max(1, Math.min(args.limit, 50))
          const items = await client.listMrDiscussions(args.project, args.iid, { perPage: limit, signal: exec.signal })
          return { found: true, items: items.map(d => ({ id: d.id, resolved: d.notes.every(n => !n.resolvable || n.resolved), notes: d.notes.map(n => ({ author: n.author, createdAt: n.createdAt, body: n.body, resolved: n.resolved })) })) }
        } catch (error) {
          if (error instanceof GitlabError && error.status === 404) {
            return { found: false }
          }
          throw error
        }
      },
    }),


    defineTool({
      name: 'gitlab_get_mr_approvals',
      description: 'Get the approval status of a GitLab merge request: approved-by users, approvals required/left, and per-rule status. Enterprise approval workflow.',
      parameters: {
        project: { type: 'string', required: true, description: 'Project path "group/project" or numeric project id' },
        iid: { type: 'integer', required: true, description: 'MR iid, e.g. 7' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean', description: 'Whether the MR exists' },
            approved: { type: 'boolean', description: 'Whether the MR is fully approved' },
            approvedBy: { type: 'array', items: { type: 'string' }, description: 'Usernames who approved' },
            approvalsRequired: { type: 'integer', description: 'Total approvals required' },
            approvalsLeft: { type: 'integer', description: 'Approvals still needed' },
            rules: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  name: { type: 'string', description: 'Approval rule name' },
                  ruleType: { type: 'string', description: 'Rule type, e.g. any_approver' },
                  approvalsRequired: { type: 'integer', description: 'Approvals required by this rule' },
                  approvalsLeft: { type: 'integer', description: 'Approvals left for this rule' },
                  approved: { type: 'boolean', description: 'Whether this rule is satisfied' },
                  approvedBy: { type: 'array', items: { type: 'string' }, description: 'Usernames who satisfied this rule' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          if (!value.found) return [{ type: 'text', text: 'Merge request not found.' }]
          const lines = [
            `approved: ${value.approved ? 'yes' : 'no'} (${value.approvalsRequired ?? 0} required, ${value.approvalsLeft ?? 0} left)`,
            `approved by: ${(value.approvedBy ?? []).length > 0 ? (value.approvedBy ?? []).join(', ') : 'nobody yet'}`,
            ...(value.rules ?? []).map(rule => `rule "${rule.name}" (${rule.ruleType}): ${rule.approved ? 'satisfied' : `${rule.approvalsLeft ?? 0} left`} — ${(rule.approvedBy ?? []).join(', ') || 'nobody'}`),
          ]
          return [{ type: 'text', text: lines.join('\n') }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Approvals of MR !${args.iid}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { found?: boolean; approved?: boolean; approvalsLeft?: number; approvedBy?: string[] }
        if (!v.found) return { card: 'generic', title: 'MR not found' }
        const bits = [v.approved ? 'approved' : `needs ${v.approvalsLeft ?? 0} more`]
        if ((v.approvedBy ?? []).length > 0) bits.push(`by ${(v.approvedBy ?? []).join(', ')}`)
        return { card: 'generic', title: `MR !${_args.iid} approvals`, content: [{ type: 'text', text: bits.join(' · ') }] }
      },
      async execute(args, exec) {
        try {
          const info = await client.getMrApprovals(args.project, args.iid, exec.signal)
          return { found: true, ...info }
        } catch (error) {
          if (error instanceof GitlabError && error.status === 404) {
            return { found: false }
          }
          throw error
        }
      },
    }),

    defineTool({
      name: 'gitlab_reply_mr_discussion',
      description: 'Reply to a review discussion thread on a GitLab merge request. WRITE operation: requires a token.',
      parameters: {
        project: { type: 'string', required: true, description: 'Project path "group/project" or numeric project id' },
        iid: { type: 'integer', required: true, description: 'MR iid, e.g. 7' },
        discussionId: { type: 'string', required: true, description: 'Discussion thread id, e.g. from gitlab_list_mr_discussions' },
        body: { type: 'string', required: true, description: 'Reply body (Markdown)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', description: 'Whether the reply was posted' },
            noteId: { type: 'integer', description: 'Reply note id when posted' },
            reason: { type: 'string', description: 'Explanation when not posted' },
          },
        },
        render: (_args, value) => {
          if (value.ok) return [{ type: 'text', text: `Replied to discussion ${_args.discussionId} (note ${value.noteId}).` }]
          return [{ type: 'text', text: `Could not reply: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Reply on MR !${args.iid}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; noteId?: number; reason?: string }
        if (v.ok) return { card: 'generic', title: 'Reply posted', content: [{ type: 'text', text: `note ${v.noteId}` }] }
        return { card: 'generic', title: 'Reply failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { ok: false, reason: 'Replying to a discussion requires a GitLab token. Configure the plugin with a token.' }
        }
        return client.replyToDiscussion(args.project, args.iid, args.discussionId, args.body, exec.signal)
      },
    }),

    defineTool({
      name: 'gitlab_resolve_mr_discussion',
      description: 'Resolve or unresolve a review discussion thread on a GitLab merge request. WRITE operation: requires a token.',
      parameters: {
        project: { type: 'string', required: true, description: 'Project path "group/project" or numeric project id' },
        iid: { type: 'integer', required: true, description: 'MR iid, e.g. 7' },
        discussionId: { type: 'string', required: true, description: 'Discussion thread id, e.g. from gitlab_list_mr_discussions' },
        resolved: { type: 'boolean', description: 'Resolve the thread (default true)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', description: 'Whether the thread was updated' },
            reason: { type: 'string', description: 'Explanation when not updated' },
          },
        },
        render: (_args, value) => {
          if (value.ok) return [{ type: 'text', text: `Discussion ${_args.discussionId} ${_args.resolved === false ? 'unresolved' : 'resolved'}.` }]
          return [{ type: 'text', text: `Could not update the discussion: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `${args.resolved === false ? 'Unresolve' : 'Resolve'} discussion on MR !${args.iid}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; reason?: string }
        if (v.ok) return { card: 'generic', title: 'Discussion updated' }
        return { card: 'generic', title: 'Update failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { ok: false, reason: 'Resolving a discussion requires a GitLab token. Configure the plugin with a token.' }
        }
        return client.resolveDiscussion(args.project, args.iid, args.discussionId, args.resolved !== false, exec.signal)
      },
    }),

    defineTool({
      name: 'gitlab_list_commits',
      description: 'List recent commits of a GitLab project, optionally filtered by branch and author.',
      parameters: {
        project: { type: 'string', required: true, description: 'Project path "group/project" or numeric project id' },
        ref: { type: 'string', description: 'Branch or tag name (defaults to the default branch)' },
        author: { type: 'string', description: 'Author name or email filter' },
        limit: { type: 'integer', description: 'Maximum results, 1-30 (default 10)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  sha: { type: 'string', description: 'Commit short SHA' },
                  title: { type: 'string', description: 'Commit title' },
                  author: { type: 'string', description: 'Author name' },
                  date: { type: 'string', description: 'ISO commit date' },
                  webUrl: { type: 'string', description: 'Commit URL' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          const items = value.items ?? []
          if (items.length === 0) return [{ type: 'text', text: 'No commits found.' }]
          return [{ type: 'text', text: items.map(item => `${item.sha} ${item.title} (@${item.author})`).join('\n') }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Commits: ${args.project}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { items?: Array<{ sha: string; title: string }> }
        const items = v.items ?? []
        if (items.length === 0) return { card: 'generic', title: 'No commits' }
        return {
          card: 'generic',
          title: `${items.length} commit(s)`,
          content: [{ type: 'text', text: items.map(i => `${i.sha} ${i.title}`).join('\n') }],
        }
      },
      async execute(args, exec) {
        const limit = args.limit === undefined ? 10 : Math.max(1, Math.min(args.limit, 30))
        const items = await client.listCommits(args.project, { ref: args.ref, author: args.author, perPage: limit, signal: exec.signal })
        return { items }
      },
    }),

    defineTool({
      name: 'gitlab_get_file',
      description: 'Read a file from a GitLab project repository (base64-decoded). Supports an optional branch or ref.',
      parameters: {
        project: { type: 'string', required: true, description: 'Project path "group/project" or numeric project id' },
        path: { type: 'string', required: true, description: 'File path in the repository, e.g. src/index.ts' },
        ref: { type: 'string', description: 'Branch or commit ref (defaults to HEAD)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean', description: 'Whether the file exists' },
            name: { type: 'string', description: 'File name' },
            path: { type: 'string', description: 'File path' },
            size: { type: 'integer', description: 'File size in bytes' },
            content: { type: 'string', description: 'Decoded file content' },
            webUrl: { type: 'string', description: 'File URL' },
          },
        },
        render: (_args, value) => {
          if (!value.found) return [{ type: 'text', text: 'File not found.' }]
          const preview = (value.content ?? '').split('\n').slice(0, 200).join('\n')
          return [{ type: 'text', text: `--- ${value.path} (${value.size ?? 0} bytes) ---\n${preview}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Read ${args.path}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { found?: boolean; path?: string }
        if (!v.found) return { card: 'generic', title: 'File not found' }
        return { card: 'generic', title: `Read ${v.path}` }
      },
      async execute(args, exec) {
        return client.getFile(args.project, args.path, { ref: args.ref, signal: exec.signal })
      },
    }),

    defineTool({
      name: 'gitlab_list_branches',
      description: 'List branches of a GitLab project with their latest commit SHAs.',
      parameters: {
        project: { type: 'string', required: true, description: 'Project path "group/project" or numeric project id' },
        limit: { type: 'integer', description: 'Maximum results, 1-50 (default 20)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  name: { type: 'string', description: 'Branch name' },
                  sha: { type: 'string', description: 'Latest commit short SHA' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          const items = value.items ?? []
          if (items.length === 0) return [{ type: 'text', text: 'No branches found.' }]
          return [{ type: 'text', text: items.map(item => `${item.name} (${item.sha})`).join('\n') }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Branches: ${args.project}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { items?: Array<{ name: string }> }
        const items = v.items ?? []
        if (items.length === 0) return { card: 'generic', title: 'No branches' }
        return {
          card: 'search',
          shape: 'paths',
          title: `${items.length} branch(es)`,
          paths: items.map(i => i.name),
          truncated: false,
          total: items.length,
        }
      },
      async execute(args, exec) {
        const limit = args.limit === undefined ? 20 : Math.max(1, Math.min(args.limit, 50))
        const items = await client.listBranches(args.project, { perPage: limit, signal: exec.signal })
        return { items }
      },
    }),


    defineTool({
      name: 'gitlab_list_labels',
      description: 'List labels of a GitLab project with their colors. Issue governance.',
      parameters: {
        project: { type: 'string', required: true, description: 'Project path "group/project" or numeric project id' },
        limit: { type: 'integer', description: 'Maximum results, 1-50 (default 20)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'integer', description: 'Label id' },
                  name: { type: 'string', description: 'Label name' },
                  color: { type: 'string', description: 'Label color, e.g. #1068bf' },
                  description: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'Label description' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          const items = value.items ?? []
          if (items.length === 0) return [{ type: 'text', text: 'No labels found.' }]
          return [{ type: 'text', text: items.map(item => `${item.name} (${item.color})${item.description ? ` — ${item.description}` : ''}`).join('\n') }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Labels: ${args.project}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { items?: Array<{ name: string }> }
        const items = v.items ?? []
        if (items.length === 0) return { card: 'generic', title: 'No labels' }
        return {
          card: 'search',
          shape: 'paths',
          title: `${items.length} label(s)`,
          paths: items.map(i => i.name),
          truncated: false,
          total: items.length,
        }
      },
      async execute(args, exec) {
        const limit = args.limit === undefined ? 20 : Math.max(1, Math.min(args.limit, 50))
        const items = await client.listLabels(args.project, { perPage: limit, signal: exec.signal })
        return { items }
      },
    }),

    defineTool({
      name: 'gitlab_list_milestones',
      description: 'List milestones of a GitLab project with due dates and progress states. Enterprise release planning.',
      parameters: {
        project: { type: 'string', required: true, description: 'Project path "group/project" or numeric project id' },
        state: { type: 'string', enum: ['active', 'closed', 'all'], description: 'Milestone state (default active)' },
        limit: { type: 'integer', description: 'Maximum results, 1-50 (default 20)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'integer', description: 'Milestone id' },
                  iid: { type: 'integer', description: 'Milestone iid' },
                  title: { type: 'string', description: 'Milestone title' },
                  state: { type: 'string', description: 'Milestone state' },
                  dueDate: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'Due date, YYYY-MM-DD' },
                  startDate: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'Start date, YYYY-MM-DD' },
                  description: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'Milestone description' },
                  webUrl: { type: 'string', description: 'Milestone URL' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          const items = value.items ?? []
          if (items.length === 0) return [{ type: 'text', text: 'No milestones found.' }]
          return [{ type: 'text', text: items.map(item => {
            const due = item.dueDate ? ` due ${item.dueDate}` : ''
            return `*${item.iid} ${item.title} (${item.state})${due}`
          }).join('\n') }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Milestones: ${args.project}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { items?: Array<{ iid: number; title: string }> }
        const items = v.items ?? []
        if (items.length === 0) return { card: 'generic', title: 'No milestones' }
        return {
          card: 'generic',
          title: `${items.length} milestone(s)`,
          content: [{ type: 'text', text: items.map(i => `*${i.iid} ${i.title}`).join('\n') }],
        }
      },
      async execute(args, exec) {
        const limit = args.limit === undefined ? 20 : Math.max(1, Math.min(args.limit, 50))
        const items = await client.listMilestones(args.project, { state: args.state, perPage: limit, signal: exec.signal })
        return { items }
      },
    }),

    defineTool({
      name: 'gitlab_list_releases',
      description: 'List releases of a GitLab project with tags, authors, and release dates. Enterprise release management.',
      parameters: {
        project: { type: 'string', required: true, description: 'Project path "group/project" or numeric project id' },
        limit: { type: 'integer', description: 'Maximum results, 1-50 (default 20)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  tagName: { type: 'string', description: 'Tag name' },
                  name: { type: 'string', description: 'Release name' },
                  description: { type: 'string', description: 'Release notes' },
                  releasedAt: { type: 'string', description: 'ISO release timestamp' },
                  author: { type: 'string', description: 'Release author' },
                  webUrl: { type: 'string', description: 'Release URL' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          const items = value.items ?? []
          if (items.length === 0) return [{ type: 'text', text: 'No releases found.' }]
          return [{ type: 'text', text: items.map(item => `${item.tagName} — ${item.name} (${item.releasedAt ?? ''}, @${item.author})`).join('\n') }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Releases: ${args.project}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { items?: Array<{ tagName: string; name: string }> }
        const items = v.items ?? []
        if (items.length === 0) return { card: 'generic', title: 'No releases' }
        return {
          card: 'generic',
          title: `${items.length} release(s)`,
          content: [{ type: 'text', text: items.map(i => `${i.tagName} ${i.name}`).join('\n') }],
        }
      },
      async execute(args, exec) {
        const limit = args.limit === undefined ? 20 : Math.max(1, Math.min(args.limit, 50))
        const items = await client.listReleases(args.project, { perPage: limit, signal: exec.signal })
        return { items }
      },
    }),

    defineTool({
      name: 'gitlab_list_environments',
      description: 'List deployment environments of a GitLab project with states and external URLs. Enterprise DevOps visibility.',
      parameters: {
        project: { type: 'string', required: true, description: 'Project path "group/project" or numeric project id' },
        limit: { type: 'integer', description: 'Maximum results, 1-50 (default 20)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'integer', description: 'Environment id' },
                  name: { type: 'string', description: 'Environment name' },
                  slug: { type: 'string', description: 'Environment slug' },
                  state: { type: 'string', description: 'Environment state' },
                  externalUrl: { oneOf: [{ type: 'string' }, { type: 'null' }], description: 'External deployment URL' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          const items = value.items ?? []
          if (items.length === 0) return [{ type: 'text', text: 'No environments found.' }]
          return [{ type: 'text', text: items.map(item => `${item.name} (${item.state})${item.externalUrl ? ` — ${item.externalUrl}` : ''}`).join('\n') }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Environments: ${args.project}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { items?: Array<{ name: string; state: string }> }
        const items = v.items ?? []
        if (items.length === 0) return { card: 'generic', title: 'No environments' }
        return {
          card: 'search',
          shape: 'paths',
          title: `${items.length} environment(s)`,
          paths: items.map(i => `${i.name} (${i.state})`),
          truncated: false,
          total: items.length,
        }
      },
      async execute(args, exec) {
        const limit = args.limit === undefined ? 20 : Math.max(1, Math.min(args.limit, 50))
        const items = await client.listEnvironments(args.project, { perPage: limit, signal: exec.signal })
        return { items }
      },
    }),

    defineTool({
      name: 'gitlab_list_pipelines',
      description: 'List CI/CD pipelines of a GitLab project, optionally filtered by ref and status. Enterprise CI observability.',
      parameters: {
        project: { type: 'string', required: true, description: 'Project path "group/project" or numeric project id' },
        ref: { type: 'string', description: 'Branch or tag ref filter' },
        status: { type: 'string', enum: ['running', 'pending', 'success', 'failed', 'canceled', 'skipped', 'manual', 'created'], description: 'Pipeline status filter' },
        limit: { type: 'integer', description: 'Maximum results, 1-30 (default 10)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'integer', description: 'Pipeline id' },
                  ref: { type: 'string', description: 'Pipeline ref' },
                  sha: { type: 'string', description: 'Commit short SHA' },
                  status: { type: 'string', description: 'Pipeline status' },
                  createdAt: { type: 'string', description: 'ISO creation timestamp' },
                  webUrl: { type: 'string', description: 'Pipeline URL' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          const items = value.items ?? []
          if (items.length === 0) return [{ type: 'text', text: 'No pipelines found.' }]
          return [{ type: 'text', text: items.map(item => `#${item.id} ${item.status} (${item.ref} @ ${item.sha})`).join('\n') }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Pipelines: ${args.project}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { items?: Array<{ id: number; status: string; ref: string }> }
        const items = v.items ?? []
        if (items.length === 0) return { card: 'generic', title: 'No pipelines' }
        return {
          card: 'generic',
          title: `${items.length} pipeline(s)`,
          content: [{ type: 'text', text: items.map(i => `#${i.id} ${i.status} (${i.ref})`).join('\n') }],
        }
      },
      async execute(args, exec) {
        const limit = args.limit === undefined ? 10 : Math.max(1, Math.min(args.limit, 30))
        const items = await client.listPipelines(args.project, { ref: args.ref, status: args.status, perPage: limit, signal: exec.signal })
        return { items }
      },
    }),

    defineTool({
      name: 'gitlab_get_pipeline',
      description: 'Get details of a GitLab CI/CD pipeline: status, ref, stages, and timestamps. Enterprise CI observability.',
      parameters: {
        project: { type: 'string', required: true, description: 'Project path "group/project" or numeric project id' },
        pipelineId: { type: 'integer', required: true, description: 'Pipeline id, e.g. 123456' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean', description: 'Whether the pipeline exists' },
            id: { type: 'integer', description: 'Pipeline id' },
            ref: { type: 'string', description: 'Pipeline ref' },
            sha: { type: 'string', description: 'Commit short SHA' },
            status: { type: 'string', description: 'Pipeline status' },
            stages: { type: 'array', items: { type: 'string' }, description: 'Pipeline stages in order' },
            createdAt: { type: 'string', description: 'ISO creation timestamp' },
            updatedAt: { type: 'string', description: 'ISO update timestamp' },
            webUrl: { type: 'string', description: 'Pipeline URL' },
          },
        },
        render: (_args, value) => {
          if (!value.found) return [{ type: 'text', text: 'Pipeline not found.' }]
          const lines = [
            `#${value.id} ${value.status} (${value.ref} @ ${value.sha})`,
            `stages: ${(value.stages ?? []).join(' → ')}`,
            `created: ${value.createdAt}`,
            `updated: ${value.updatedAt}`,
            value.webUrl ?? '',
          ].filter(Boolean)
          return [{ type: 'text', text: lines.join('\n') }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Pipeline #${args.pipelineId} in ${args.project}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { found?: boolean; id?: number; status?: string; stages?: string[]; ref?: string }
        if (!v.found) return { card: 'generic', title: 'Pipeline not found' }
        return {
          card: 'generic',
          title: `Pipeline #${v.id}: ${v.status}`,
          content: [{ type: 'text', text: `${v.ref ?? ''} · ${(v.stages ?? []).join(' → ')}` }],
        }
      },
      async execute(args, exec) {
        try {
          const info = await client.getPipeline(args.project, args.pipelineId, exec.signal)
          return { found: true, ...info }
        } catch (error) {
          if (error instanceof GitlabError && error.status === 404) {
            return { found: false }
          }
          throw error
        }
      },
    }),

    defineTool({
      name: 'gitlab_get_job_log',
      description: 'Get the full log trace of a GitLab CI/CD job. Enterprise CI debugging.',
      parameters: {
        project: { type: 'string', required: true, description: 'Project path "group/project" or numeric project id' },
        jobId: { type: 'integer', required: true, description: 'Job id, e.g. 654321' },
        tailLines: { type: 'integer', description: 'Only render the last N lines of the log (default 200)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            found: { type: 'boolean', description: 'Whether the job exists' },
            content: { type: 'string', description: 'Job log trace' },
            webUrl: { type: 'string', description: 'Job URL' },
          },
        },
        render: (_args, value) => {
          if (!value.found) return [{ type: 'text', text: 'Job not found.' }]
          const lines = (value.content ?? '').split('\n')
          const tail = Math.max(1, Math.min(_args.tailLines ?? 200, 1000))
          const shown = lines.length > tail ? lines.slice(-tail) : lines
          return [{ type: 'text', text: shown.join('\n') }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Job #${args.jobId} log in ${args.project}`, kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { found?: boolean; content?: string }
        if (!v.found) return { card: 'generic', title: 'Job not found' }
        return {
          card: 'terminal',
          title: 'Job log',
          output: (v.content ?? '').slice(-20000),
          exitCode: 0,
        }
      },
      async execute(args, exec) {
        return client.getJobLog(args.project, args.jobId, exec.signal)
      },
    }),

    defineTool({
      name: 'gitlab_trigger_pipeline',
      description: 'Trigger a GitLab CI/CD pipeline for a ref. WRITE operation: requires a token and runs pipelines on the remote.',
      parameters: {
        project: { type: 'string', required: true, description: 'Project path "group/project" or numeric project id' },
        ref: { type: 'string', required: true, description: 'Branch or tag to run the pipeline on, e.g. main' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            created: { type: 'boolean', description: 'Whether the pipeline was triggered' },
            pipelineId: { type: 'integer', description: 'Pipeline id when triggered' },
            status: { type: 'string', description: 'Pipeline status when triggered' },
            webUrl: { type: 'string', description: 'Pipeline URL when triggered' },
            reason: { type: 'string', description: 'Explanation when not triggered' },
          },
        },
        render: (_args, value) => {
          if (value.created) return [{ type: 'text', text: `Triggered pipeline #${value.pipelineId} (${value.status}): ${value.webUrl}` }]
          return [{ type: 'text', text: `Could not trigger the pipeline: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Trigger pipeline on ${args.ref}`, kind: 'execute' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { created?: boolean; pipelineId?: number; status?: string; webUrl?: string; reason?: string }
        if (v.created) return { card: 'generic', title: `Pipeline #${v.pipelineId}`, content: [{ type: 'text', text: `${v.status} · ${v.webUrl ?? ''}` }] }
        return { card: 'generic', title: 'Trigger failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { created: false, reason: 'Triggering a pipeline requires a GitLab token. Configure the plugin with a token.' }
        }
        return client.triggerPipeline(args.project, args.ref, exec.signal)
      },
    }),

    defineTool({
      name: 'gitlab_search_code',
      description: 'Search code in a GitLab project (blob scope). A token is required for private projects.',
      parameters: {
        project: { type: 'string', required: true, description: 'Project path "group/project" or numeric project id' },
        query: { type: 'string', required: true, description: 'Search query, e.g. "defineTool" or "apiKey"' },
        ref: { type: 'string', description: 'Branch or commit ref to search in (defaults to the default branch)' },
        limit: { type: 'integer', description: 'Maximum results, 1-20 (default 10)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            authenticated: { type: 'boolean', description: 'Whether a token is configured (private projects need one)' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  path: { type: 'string', description: 'File path' },
                  data: { type: 'string', description: 'Matched line(s)' },
                  ref: { type: 'string', description: 'Ref searched' },
                  startLine: { type: 'integer', description: '1-based start line of the match' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          const items = value.items ?? []
          if (items.length === 0) {
            return [{ type: 'text', text: value.authenticated ? 'No code matches found.' : 'No matches. Note: a GitLab token is required to search private projects.' }]
          }
          return [{ type: 'text', text: items.map(item => `${item.path}:${item.startLine} — ${item.data}`).join('\n') }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Search code in ${args.project}`, kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { items?: Array<{ path: string; startLine: number }> }
        const items = v.items ?? []
        if (items.length === 0) return { card: 'generic', title: 'No code matches' }
        return {
          card: 'search',
          shape: 'matches',
          title: `${items.length} match(es)`,
          files: items.map(i => ({ path: i.path, matches: [{ lineNumber: i.startLine, line: '' }] })),
          truncated: false,
          total: items.length,
        }
      },
      async execute(args, exec) {
        const limit = args.limit === undefined ? 10 : Math.max(1, Math.min(args.limit, 20))
        const result = await client.searchCode(args.project, args.query, { ref: args.ref, perPage: limit, signal: exec.signal })
        return result
      },
    }),

    defineTool({
      name: 'gitlab_get_current_user',
      description: 'Get the authenticated GitLab user (requires a token). Enterprise identity confirmation.',
      parameters: {},
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            authenticated: { type: 'boolean', description: 'Whether a token is configured' },
            id: { type: 'integer', description: 'User id' },
            username: { type: 'string', description: 'Username' },
            name: { type: 'string', description: 'Display name' },
            webUrl: { type: 'string', description: 'Profile URL' },
          },
        },
        render: (_args, value) => {
          if (!value.authenticated) return [{ type: 'text', text: 'No token configured. Add a GitLab token to identify the current user.' }]
          return [{ type: 'text', text: `@${value.username} (${value.name}) — ${value.webUrl}` }]
        },
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'Current GitLab user', kind: 'read' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { authenticated?: boolean; username?: string }
        if (!v.authenticated) return { card: 'generic', title: 'Not authenticated' }
        return { card: 'generic', title: `@${v.username}` }
      },
      async execute(_args, exec) {
        if (!client.hasToken()) {
          return { authenticated: false }
        }
        const info = await client.getCurrentUser(exec.signal)
        return { authenticated: true, ...info }
      },
    }),

    defineTool({
      name: 'gitlab_list_todos',
      description: 'List pending GitLab todos for the authenticated user: assigned issues, MRs awaiting your approval, and mentions. Enterprise personal workbench.',
      parameters: {
        limit: { type: 'integer', description: 'Maximum results, 1-50 (default 20)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            authenticated: { type: 'boolean', description: 'Whether a token is configured' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  project: { type: 'string', description: 'Project path' },
                  targetType: { type: 'string', description: 'Target type: MergeRequest or Issue' },
                  targetTitle: { type: 'string', description: 'Target title' },
                  action: { type: 'string', description: 'Action, e.g. assigned, approval_required, mentioned' },
                  body: { type: 'string', description: 'Todo body' },
                  createdAt: { type: 'string', description: 'ISO creation timestamp' },
                  targetWebUrl: { type: 'string', description: 'Target URL' },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          if (!value.authenticated) return [{ type: 'text', text: 'Listing todos requires a GitLab token. Configure the plugin with a token.' }]
          const items = value.items ?? []
          if (items.length === 0) return [{ type: 'text', text: 'No pending todos. Inbox zero!' }]
          return [{ type: 'text', text: items.map(item => `[${item.project}] ${item.targetType} ${item.targetTitle} (${item.action})`).join('\n') }]
        },
      },
      presentCall(): ToolCallView {
        return { card: 'generic', title: 'My GitLab todos', kind: 'search' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { authenticated?: boolean; items?: Array<{ targetType: string; targetTitle: string }> }
        if (!v.authenticated) return { card: 'generic', title: 'Not authenticated' }
        const items = v.items ?? []
        if (items.length === 0) return { card: 'generic', title: 'No todos' }
        return {
          card: 'generic',
          title: `${items.length} todo(s)`,
          content: [{ type: 'text', text: items.map(i => `${i.targetType} ${i.targetTitle}`).join('\n') }],
        }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { authenticated: false, items: [] }
        }
        const limit = args.limit === undefined ? 20 : Math.max(1, Math.min(args.limit, 50))
        const items = await client.listTodos({ perPage: limit, signal: exec.signal })
        return { authenticated: true, items }
      },
    }),

    defineTool({
      name: 'gitlab_create_issue',
      description: 'Create an issue in a GitLab project. WRITE operation: requires a token.',
      parameters: {
        project: { type: 'string', required: true, description: 'Project path "group/project" or numeric project id' },
        title: { type: 'string', required: true, description: 'Issue title' },
        description: { type: 'string', description: 'Issue description (Markdown)' },
        labels: { type: 'array', items: { type: 'string' }, description: 'Labels, e.g. ["bug"]' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', description: 'Whether the issue was created' },
            iid: { type: 'integer', description: 'Issue iid when created' },
            webUrl: { type: 'string', description: 'Issue URL when created' },
            reason: { type: 'string', description: 'Explanation when not created' },
          },
        },
        render: (_args, value) => {
          if (value.ok) return [{ type: 'text', text: `Created issue #${value.iid}: ${value.webUrl}` }]
          return [{ type: 'text', text: `Could not create the issue: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Create issue: ${args.title}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; iid?: number; webUrl?: string; reason?: string }
        if (v.ok) return { card: 'generic', title: `Issue #${v.iid} created`, content: [{ type: 'text', text: v.webUrl ?? '' }] }
        return { card: 'generic', title: 'Create issue failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { ok: false, reason: 'Creating an issue requires a GitLab token. Configure the plugin with a token.' }
        }
        return client.createIssue(args.project, { title: args.title, description: args.description, labels: args.labels }, exec.signal)
      },
    }),

    defineTool({
      name: 'gitlab_comment_issue',
      description: 'Comment on a GitLab issue. WRITE operation: requires a token.',
      parameters: {
        project: { type: 'string', required: true, description: 'Project path "group/project" or numeric project id' },
        iid: { type: 'integer', required: true, description: 'Issue iid, e.g. 42' },
        body: { type: 'string', required: true, description: 'Comment body (Markdown)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', description: 'Whether the comment was posted' },
            webUrl: { type: 'string', description: 'Issue URL' },
            reason: { type: 'string', description: 'Explanation when not posted' },
          },
        },
        render: (_args, value) => {
          if (value.ok) return [{ type: 'text', text: `Commented on issue #${_args.iid}: ${value.webUrl}` }]
          return [{ type: 'text', text: `Could not comment: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Comment on issue #${args.iid}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; webUrl?: string; reason?: string }
        if (v.ok) return { card: 'generic', title: 'Comment posted', content: [{ type: 'text', text: v.webUrl ?? '' }] }
        return { card: 'generic', title: 'Comment failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { ok: false, reason: 'Commenting requires a GitLab token. Configure the plugin with a token.' }
        }
        return client.commentOnIssue(args.project, args.iid, args.body, exec.signal)
      },
    }),

    defineTool({
      name: 'gitlab_update_issue',
      description: 'Open or close a GitLab issue. WRITE operation: requires a token.',
      parameters: {
        project: { type: 'string', required: true, description: 'Project path "group/project" or numeric project id' },
        iid: { type: 'integer', required: true, description: 'Issue iid, e.g. 42' },
        state: { type: 'string', enum: ['open', 'close'], required: true, description: 'Target state: open or close' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', description: 'Whether the issue was updated' },
            iid: { type: 'integer', description: 'Issue iid' },
            webUrl: { type: 'string', description: 'Issue URL' },
            reason: { type: 'string', description: 'Explanation when not updated' },
          },
        },
        render: (_args, value) => {
          if (value.ok) return [{ type: 'text', text: `Issue #${value.iid} ${_args.state}d: ${value.webUrl}` }]
          return [{ type: 'text', text: `Could not update the issue: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `${args.state === 'close' ? 'Close' : 'Reopen'} issue #${args.iid}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; iid?: number; webUrl?: string; reason?: string }
        if (v.ok) return { card: 'generic', title: `Issue #${v.iid} updated`, content: [{ type: 'text', text: v.webUrl ?? '' }] }
        return { card: 'generic', title: 'Update failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { ok: false, reason: 'Updating an issue requires a GitLab token. Configure the plugin with a token.' }
        }
        return client.updateIssue(args.project, args.iid, args.state, exec.signal)
      },
    }),

    defineTool({
      name: 'gitlab_create_mr',
      description: 'Create a merge request in a GitLab project, optionally as a draft. WRITE operation: requires a token.',
      parameters: {
        project: { type: 'string', required: true, description: 'Project path "group/project" or numeric project id' },
        title: { type: 'string', required: true, description: 'MR title' },
        sourceBranch: { type: 'string', required: true, description: 'Source branch, e.g. feature/my-change' },
        targetBranch: { type: 'string', required: true, description: 'Target branch, e.g. main' },
        description: { type: 'string', description: 'MR description (Markdown)' },
        draft: { type: 'boolean', description: 'Create as a draft MR (default false)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            created: { type: 'boolean', description: 'Whether the MR was created' },
            iid: { type: 'integer', description: 'MR iid when created' },
            webUrl: { type: 'string', description: 'MR URL when created' },
            reason: { type: 'string', description: 'Explanation when not created' },
          },
        },
        render: (_args, value) => {
          if (value.created) return [{ type: 'text', text: `Created MR !${value.iid}: ${value.webUrl}` }]
          return [{ type: 'text', text: `Could not create the MR: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `${args.draft ? 'Draft MR' : 'MR'}: ${args.title}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { created?: boolean; iid?: number; webUrl?: string; reason?: string }
        if (v.created) return { card: 'generic', title: `MR !${v.iid} created`, content: [{ type: 'text', text: v.webUrl ?? '' }] }
        return { card: 'generic', title: 'Create MR failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { created: false, reason: 'Creating a merge request requires a GitLab token. Configure the plugin with a token.' }
        }
        return client.createMr(args.project, { title: args.title, sourceBranch: args.sourceBranch, targetBranch: args.targetBranch, description: args.description, draft: args.draft }, exec.signal)
      },
    }),

    defineTool({
      name: 'gitlab_comment_mr',
      description: 'Comment on a GitLab merge request. WRITE operation: requires a token.',
      parameters: {
        project: { type: 'string', required: true, description: 'Project path "group/project" or numeric project id' },
        iid: { type: 'integer', required: true, description: 'MR iid, e.g. 7' },
        body: { type: 'string', required: true, description: 'Comment body (Markdown)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', description: 'Whether the comment was posted' },
            webUrl: { type: 'string', description: 'MR URL' },
            reason: { type: 'string', description: 'Explanation when not posted' },
          },
        },
        render: (_args, value) => {
          if (value.ok) return [{ type: 'text', text: `Commented on MR !${_args.iid}: ${value.webUrl}` }]
          return [{ type: 'text', text: `Could not comment: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Comment on MR !${args.iid}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; webUrl?: string; reason?: string }
        if (v.ok) return { card: 'generic', title: 'Comment posted', content: [{ type: 'text', text: v.webUrl ?? '' }] }
        return { card: 'generic', title: 'Comment failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { ok: false, reason: 'Commenting requires a GitLab token. Configure the plugin with a token.' }
        }
        return client.commentMr(args.project, args.iid, args.body, exec.signal)
      },
    }),

    defineTool({
      name: 'gitlab_approve_mr',
      description: 'Approve a GitLab merge request. WRITE operation: requires a token with approval rights. Enterprise approval flow.',
      parameters: {
        project: { type: 'string', required: true, description: 'Project path "group/project" or numeric project id' },
        iid: { type: 'integer', required: true, description: 'MR iid, e.g. 7' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', description: 'Whether the MR was approved' },
            reason: { type: 'string', description: 'Explanation when not approved' },
          },
        },
        render: (_args, value) => {
          if (value.ok) return [{ type: 'text', text: `Approved MR !${_args.iid}.` }]
          return [{ type: 'text', text: `Could not approve the MR: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Approve MR !${args.iid}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; reason?: string }
        if (v.ok) return { card: 'generic', title: 'MR approved' }
        return { card: 'generic', title: 'Approve failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { ok: false, reason: 'Approving an MR requires a GitLab token. Configure the plugin with a token.' }
        }
        return client.approveMr(args.project, args.iid, exec.signal)
      },
    }),

    defineTool({
      name: 'gitlab_merge_mr',
      description: 'Merge a GitLab merge request, optionally squashing commits. WRITE operation: requires a token.',
      parameters: {
        project: { type: 'string', required: true, description: 'Project path "group/project" or numeric project id' },
        iid: { type: 'integer', required: true, description: 'MR iid, e.g. 7' },
        squash: { type: 'boolean', description: 'Squash commits when merging (default false)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            merged: { type: 'boolean', description: 'Whether the MR was merged' },
            webUrl: { type: 'string', description: 'MR URL' },
            reason: { type: 'string', description: 'Explanation when not merged' },
          },
        },
        render: (_args, value) => {
          if (value.merged) return [{ type: 'text', text: `Merged MR !${_args.iid}: ${value.webUrl}` }]
          return [{ type: 'text', text: `Could not merge the MR: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Merge MR !${args.iid}${args.squash ? ' (squash)' : ''}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { merged?: boolean; webUrl?: string; reason?: string }
        if (v.merged) return { card: 'generic', title: 'MR merged', content: [{ type: 'text', text: v.webUrl ?? '' }] }
        return { card: 'generic', title: 'Merge failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { merged: false, reason: 'Merging an MR requires a GitLab token. Configure the plugin with a token.' }
        }
        return client.mergeMr(args.project, args.iid, { squash: args.squash, signal: exec.signal })
      },
    }),

    defineTool({
      name: 'gitlab_create_branch',
      description: 'Create a branch in a GitLab project from a ref. WRITE operation: requires a token.',
      parameters: {
        project: { type: 'string', required: true, description: 'Project path "group/project" or numeric project id' },
        branch: { type: 'string', required: true, description: 'New branch name, e.g. feature/my-change' },
        ref: { type: 'string', required: true, description: 'Source branch or commit ref, e.g. main' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', description: 'Whether the branch was created' },
            name: { type: 'string', description: 'Branch name' },
            reason: { type: 'string', description: 'Explanation when not created' },
          },
        },
        render: (_args, value) => {
          if (value.ok) return [{ type: 'text', text: `Created branch ${value.name}.` }]
          return [{ type: 'text', text: `Could not create the branch: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'generic', title: `Create branch ${args.branch} from ${args.ref}`, kind: 'edit' }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; name?: string; reason?: string }
        if (v.ok) return { card: 'generic', title: `Branch ${v.name} created` }
        return { card: 'generic', title: 'Create branch failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { ok: false, reason: 'Creating a branch requires a GitLab token. Configure the plugin with a token.' }
        }
        return client.createBranch(args.project, args.branch, args.ref, exec.signal)
      },
    }),

    defineTool({
      name: 'gitlab_write_file',
      description: 'Create or update a file in a GitLab project via a commit. WRITE operation: requires a token and creates a commit on the remote.',
      parameters: {
        project: { type: 'string', required: true, description: 'Project path "group/project" or numeric project id' },
        path: { type: 'string', required: true, description: 'File path in the repository, e.g. docs/notes.md' },
        content: { type: 'string', required: true, description: 'File content (UTF-8 text)' },
        message: { type: 'string', required: true, description: 'Commit message' },
        branch: { type: 'string', description: 'Branch to write to (defaults to the default branch)' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            ok: { type: 'boolean', description: 'Whether the file was written' },
            path: { type: 'string', description: 'File path' },
            commitSha: { type: 'string', description: 'Commit short SHA' },
            reason: { type: 'string', description: 'Explanation when not written' },
          },
        },
        render: (_args, value) => {
          if (value.ok) return [{ type: 'text', text: `Wrote ${value.path} (commit ${value.commitSha})` }]
          return [{ type: 'text', text: `Could not write ${value.path}: ${value.reason}` }]
        },
      },
      presentCall(args): ToolCallView {
        return { card: 'diff', title: `Write ${args.path}`, diffs: [{ path: args.path, oldText: null, newText: args.content }], locations: [{ path: args.path }] }
      },
      presentResult(_args, result): ToolResultView | undefined {
        const v = result as unknown as { ok?: boolean; path?: string; commitSha?: string; reason?: string }
        if (v.ok) {
          return { card: 'diff', title: `Wrote ${v.path}`, diffs: [{ path: v.path ?? '', oldText: null, newText: `(committed as ${v.commitSha})` }] }
        }
        return { card: 'generic', title: 'Write file failed', content: [{ type: 'text', text: v.reason ?? 'Unknown' }] }
      },
      async execute(args, exec) {
        if (!client.hasToken()) {
          return { ok: false, reason: 'Writing a file requires a GitLab token. Configure the plugin with a token.' }
        }
        return client.writeFile(args.project, args.path, args.content, { message: args.message, branch: args.branch, signal: exec.signal })
      },
    }),
  ]
}
