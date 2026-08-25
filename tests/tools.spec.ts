import { describe, expect, it, vi } from 'vitest'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { GitlabClient } from '../src/client.ts'
import { createTools } from '../src/index.ts'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function exec(): ToolRunContext {
  return { signal: new AbortController().signal } as unknown as ToolRunContext
}

const tools = () => Object.fromEntries(createTools(new GitlabClient({ fetchImpl: globalThis.fetch })).map(t => [t.name, t]))

describe('tool definitions', () => {
  it('registers the planned enterprise tool set', () => {
    expect(Object.keys(tools()).sort()).toEqual([
      'gitlab_add_group_member',
      'gitlab_add_project_member',
      'gitlab_approve_mr',
      'gitlab_archive_project',
      'gitlab_comment_issue',
      'gitlab_comment_mr',
      'gitlab_create_branch',
      'gitlab_create_group',
      'gitlab_create_issue',
      'gitlab_create_mr',
      'gitlab_create_project',
      'gitlab_create_project_mirror',
      'gitlab_create_project_variable',
      'gitlab_create_project_webhook',
      'gitlab_delete_group',
      'gitlab_delete_project',
      'gitlab_delete_project_variable',
      'gitlab_delete_project_webhook',
      'gitlab_delete_registry_repository',
      'gitlab_delete_registry_tag',
      'gitlab_delete_runner',
      'gitlab_disable_project_runner',
      'gitlab_enable_project_runner',
      'gitlab_get_current_user',
      'gitlab_get_file',
      'gitlab_get_issue',
      'gitlab_get_job_log',
      'gitlab_get_mr',
      'gitlab_get_mr_approvals',
      'gitlab_get_mr_changes',
      'gitlab_get_pipeline',
      'gitlab_get_project',
      'gitlab_get_project_export_status',
      'gitlab_list_branches',
      'gitlab_list_commits',
      'gitlab_list_environments',
      'gitlab_list_group_members',
      'gitlab_list_group_projects',
      'gitlab_list_issues',
      'gitlab_list_labels',
      'gitlab_list_milestones',
      'gitlab_list_mr_discussions',
      'gitlab_list_mrs',
      'gitlab_list_pipelines',
      'gitlab_list_project_members',
      'gitlab_list_project_mirrors',
      'gitlab_list_project_variables',
      'gitlab_list_project_webhooks',
      'gitlab_list_registry_repositories',
      'gitlab_list_registry_tags',
      'gitlab_list_releases',
      'gitlab_list_runners',
      'gitlab_list_subgroups',
      'gitlab_list_todos',
      'gitlab_merge_mr',
      'gitlab_remove_group_member',
      'gitlab_remove_project_member',
      'gitlab_reply_mr_discussion',
      'gitlab_resolve_mr_discussion',
      'gitlab_search_code',
      'gitlab_search_projects',
      'gitlab_start_project_export',
      'gitlab_transfer_project',
      'gitlab_trigger_pipeline',
      'gitlab_unarchive_project',
      'gitlab_update_group_member',
      'gitlab_update_issue',
      'gitlab_update_project_member',
      'gitlab_update_project_variable',
      'gitlab_write_file',
    ])
  })

  it('gitlab_get_project returns found:false on 404', async () => {
    const client = new GitlabClient({ fetchImpl: vi.fn(async () => jsonResponse(404, {})) })
    const tool = createTools(client).find(t => t.name === 'gitlab_get_project')!
    const result = await tool.execute({ project: 'nope/missing' }, exec())
    expect(result).toEqual({ found: false })
  })

  it('gitlab_get_project render is a pure function of the value', async () => {
    const client = new GitlabClient({ fetchImpl: vi.fn(async () => jsonResponse(404, {})) })
    const tool = createTools(client).find(t => t.name === 'gitlab_get_project')!
    const blocks = await (tool.output as { render: (a: unknown, v: any) => unknown }).render({}, { found: true, pathWithNamespace: 'a/b', id: 1, stars: 3, visibility: 'private' })
    expect(JSON.stringify(blocks)).toContain('a/b')
    expect(JSON.stringify(blocks)).toContain('stars: 3')
  })

  it('gitlab_get_file returns found:false on 404', async () => {
    const client = new GitlabClient({ fetchImpl: vi.fn(async () => jsonResponse(404, {})) })
    const tool = createTools(client).find(t => t.name === 'gitlab_get_file')!
    const result = await tool.execute({ project: 'a/b', path: 'nope.txt' }, exec())
    expect(result).toEqual({ found: false })
  })

  it('gitlab_get_job_log returns found:false on 404', async () => {
    const client = new GitlabClient({ fetchImpl: vi.fn(async () => jsonResponse(404, {})) })
    const tool = createTools(client).find(t => t.name === 'gitlab_get_job_log')!
    const result = await tool.execute({ project: 'a/b', jobId: 1 }, exec())
    expect(result).toEqual({ found: false })
  })

  it('write tools return a clear reason without a token', async () => {
    const client = new GitlabClient({ fetchImpl: vi.fn() })
    const toolsMap = createTools(client).map(t => [t.name, t] as const)
    const createMr = toolsMap.find(([name]) => name === 'gitlab_create_mr')![1]
    const mr = await createMr.execute({ project: 'a/b', title: 'x', sourceBranch: 'f', targetBranch: 'main' }, exec())
    expect(mr).toMatchObject({ created: false })
    expect(String(mr.reason)).toContain('token')

    const approve = toolsMap.find(([name]) => name === 'gitlab_approve_mr')![1]
    expect(await approve.execute({ project: 'a/b', iid: 1 }, exec())).toMatchObject({ ok: false })

    const merge = toolsMap.find(([name]) => name === 'gitlab_merge_mr')![1]
    expect(await merge.execute({ project: 'a/b', iid: 1 }, exec())).toMatchObject({ merged: false })

    const pipeline = toolsMap.find(([name]) => name === 'gitlab_trigger_pipeline')![1]
    expect(await pipeline.execute({ project: 'a/b', ref: 'main' }, exec())).toMatchObject({ created: false })
  })

  it('gitlab_get_current_user and gitlab_list_todos return authenticated:false without a token', async () => {
    const client = new GitlabClient({ fetchImpl: vi.fn() })
    const toolsMap = createTools(client).map(t => [t.name, t] as const)
    const user = toolsMap.find(([name]) => name === 'gitlab_get_current_user')![1]
    expect(await user.execute({}, exec())).toEqual({ authenticated: false })
    const todos = toolsMap.find(([name]) => name === 'gitlab_list_todos')![1]
    expect(await todos.execute({}, exec())).toEqual({ authenticated: false, items: [] })
  })

  it('gitlab_create_mr maps 409 to created:false', async () => {
    const client = new GitlabClient({ token: 'glpat_test', fetchImpl: vi.fn(async () => jsonResponse(409, {})) })
    const tool = createTools(client).find(t => t.name === 'gitlab_create_mr')!
    const result = await tool.execute({ project: 'a/b', title: 'x', sourceBranch: 'f', targetBranch: 'main' }, exec())
    expect(result).toMatchObject({ created: false })
  })

  it('gitlab_merge_mr maps 406 to merged:false', async () => {
    const client = new GitlabClient({ token: 'glpat_test', fetchImpl: vi.fn(async () => jsonResponse(406, {})) })
    const tool = createTools(client).find(t => t.name === 'gitlab_merge_mr')!
    const result = await tool.execute({ project: 'a/b', iid: 7 }, exec())
    expect(result).toMatchObject({ merged: false })
  })

  it('gitlab_search_code renders a token hint when unauthenticated', async () => {
    const client = new GitlabClient({ fetchImpl: vi.fn(async () => jsonResponse(200, [])) })
    const tool = createTools(client).find(t => t.name === 'gitlab_search_code')!
    const result = await tool.execute({ project: 'a/b', query: 'x' }, exec())
    expect(result).toEqual({ authenticated: false, items: [] })
    const blocks = await (tool.output as { render: (a: unknown, v: any) => unknown }).render({}, { authenticated: false, items: [] })
    expect(JSON.stringify(blocks)).toContain('token')
  })

  it('gitlab_get_mr renders pipeline and conflict signals', async () => {
    const client = new GitlabClient({ fetchImpl: vi.fn() })
    const tool = createTools(client).find(t => t.name === 'gitlab_get_mr')!
    const blocks = await (tool.output as { render: (a: unknown, v: any) => unknown }).render({}, {
      found: true, iid: 7, title: 'x', state: 'opened', author: 'a', sourceBranch: 'f', targetBranch: 'main',
      detailedMergeStatus: 'cannot_be_merged', hasConflicts: true, squash: false, draft: false,
      pipeline: { id: 1, status: 'failed' }, description: '', createdAt: '', webUrl: 'https://gitlab.com/a/b/-/merge_requests/7',
    })
    const text = JSON.stringify(blocks)
    expect(text).toContain('cannot_be_merged')
    expect(text).toContain('conflicts: yes')
    expect(text).toContain('pipeline #1: failed')
  })

  it('gitlab_get_mr_approvals renders approval state', async () => {
    const client = new GitlabClient({ fetchImpl: vi.fn() })
    const tool = createTools(client).find(t => t.name === 'gitlab_get_mr_approvals')!
    const blocks = await (tool.output as { render: (a: unknown, v: any) => unknown }).render({}, {
      found: true, approved: false, approvedBy: [], approvalsRequired: 2, approvalsLeft: 1,
      rules: [{ name: 'Maintainer', ruleType: 'any_approver', approvalsRequired: 2, approvalsLeft: 1, approved: false, approvedBy: [] }],
    })
    const text = JSON.stringify(blocks)
    expect(text).toContain('1 left')
    expect(text).toContain('Maintainer')
  })

  it('gitlab_reply_mr_discussion and gitlab_resolve_mr_discussion require a token', async () => {
    const client = new GitlabClient({ fetchImpl: vi.fn() })
    const toolsMap = createTools(client).map(t => [t.name, t] as const)
    const reply = toolsMap.find(([name]) => name === 'gitlab_reply_mr_discussion')![1]
    expect(await reply.execute({ project: 'a/b', iid: 7, discussionId: 'd1', body: 'x' }, exec())).toMatchObject({ ok: false })
    const resolve = toolsMap.find(([name]) => name === 'gitlab_resolve_mr_discussion')![1]
    expect(await resolve.execute({ project: 'a/b', iid: 7, discussionId: 'd1' }, exec())).toMatchObject({ ok: false })
  })

  it('gitlab_list_releases renders release rows', async () => {
    const client = new GitlabClient({ fetchImpl: vi.fn() })
    const tool = createTools(client).find(t => t.name === 'gitlab_list_releases')!
    const blocks = await (tool.output as { render: (a: unknown, v: any) => unknown }).render({}, {
      items: [{ tagName: 'v1.0.0', name: 'Version 1', description: '', releasedAt: '2026-01-01T00:00:00Z', author: 'Alice', webUrl: '' }],
    })
    expect(JSON.stringify(blocks)).toContain('v1.0.0')
  })

  it('gitlab_list_environments presents a search paths card', async () => {
    const client = new GitlabClient({ fetchImpl: vi.fn() })
    const tool = createTools(client).find(t => t.name === 'gitlab_list_environments')!
    const view = tool.presentResult!({ project: 'a/b' }, { items: [{ name: 'staging', state: 'available' }] })
    expect(view).toMatchObject({ card: 'search', shape: 'paths' })
  })

  it('gitlab_get_job_log presents a terminal card', async () => {
    const client = new GitlabClient({ fetchImpl: vi.fn() })
    const tool = createTools(client).find(t => t.name === 'gitlab_get_job_log')!
    const view = tool.presentResult!({ project: 'a/b', jobId: 1 }, { found: true, content: 'line1\nline2', webUrl: 'x' })
    expect(view).toMatchObject({ card: 'terminal' })
  })

  it('gitlab_write_file presents a diff card and requires a token', async () => {
    const client = new GitlabClient({ fetchImpl: vi.fn() })
    const tool = createTools(client).find(t => t.name === 'gitlab_write_file')!
    const call = tool.presentCall!({ project: 'a/b', path: 'docs/notes.md', content: 'hi', message: 'm' })
    expect(call).toMatchObject({ card: 'diff' })
    const result = await tool.execute({ project: 'a/b', path: 'docs/notes.md', content: 'hi', message: 'm' }, exec())
    expect(result).toMatchObject({ ok: false })
  })

  it('gitlab_get_mr_changes renders changed file paths', async () => {
    const client = new GitlabClient({ fetchImpl: vi.fn() })
    const tool = createTools(client).find(t => t.name === 'gitlab_get_mr_changes')!
    const blocks = await (tool.output as { render: (a: unknown, v: any) => unknown }).render({}, {
      found: true, iid: 7, title: 'x', changedFiles: 1,
      items: [{ oldPath: '', newPath: 'src/new.ts', newFile: true, deletedFile: false, renamedFile: false, diff: '' }],
    })
    expect(JSON.stringify(blocks)).toContain('1 file(s) changed')
  })

  it('clamps limits to the documented range', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, []))
    const client = new GitlabClient({ fetchImpl })
    const tool = createTools(client).find(t => t.name === 'gitlab_list_issues')!
    await tool.execute({ project: 'a/b', limit: 999 }, exec())
    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('per_page=20')
  })

  it('v0.3 write tools require a token', async () => {
    const client = new GitlabClient({ fetchImpl: vi.fn() })
    const map = tools()
    expect(await map.gitlab_create_project.execute({ name: 'x' }, exec())).toMatchObject({ ok: false })
    expect(await map.gitlab_delete_project.execute({ project: 'a/b' }, exec())).toMatchObject({ deleted: false })
    expect(await map.gitlab_add_group_member.execute({ group: 'g', user: 'u', accessLevel: 'maintainer' }, exec())).toMatchObject({ ok: false })
    expect(await map.gitlab_update_group_member.execute({ group: 'g', userId: 1, accessLevel: 'owner' }, exec())).toMatchObject({ ok: false })
    expect(await map.gitlab_remove_group_member.execute({ group: 'g', userId: 1 }, exec())).toMatchObject({ ok: false })
    expect(await map.gitlab_add_project_member.execute({ project: 'a/b', user: 'u', accessLevel: 'maintainer' }, exec())).toMatchObject({ ok: false })
    expect(await map.gitlab_update_project_member.execute({ project: 'a/b', userId: 1, accessLevel: 'owner' }, exec())).toMatchObject({ ok: false })
    expect(await map.gitlab_remove_project_member.execute({ project: 'a/b', userId: 1 }, exec())).toMatchObject({ ok: false })
  })

  it('v0.3 tools pass access levels through the client', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(201, { id: 1 }))
    const client = new GitlabClient({ token: 'glpat_test', fetchImpl })
    const map = Object.fromEntries(createTools(client).map(t => [t.name, t]))
    const result = await map.gitlab_add_group_member.execute({ group: 'acme', user: 'alice', accessLevel: 'developer' }, exec())
    expect(result).toEqual({ ok: true })
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({ user_id: 'alice', access_level: 30 })
  })

  it('gitlab_create_project renders result and presentCall', async () => {
    const client = new GitlabClient({ fetchImpl: vi.fn() })
    const tool = createTools(client).find(t => t.name === 'gitlab_create_project')!
    const blocks = await (tool.output as { render: (a: unknown, v: any) => unknown }).render({}, { ok: true, pathWithNamespace: 'acme/widgets', webUrl: 'https://gitlab.com/acme/widgets' })
    expect(JSON.stringify(blocks)).toContain('acme/widgets')
    expect(tool.presentCall!({ name: 'Widgets' })).toMatchObject({ card: 'generic', kind: 'edit' })
    expect(tool.presentResult!({ name: 'Widgets' }, { ok: true, pathWithNamespace: 'acme/widgets', webUrl: 'u' })).toMatchObject({ card: 'generic', title: 'Project acme/widgets created' })
  })

  it('gitlab_delete_project uses the delete kind and maps failures', async () => {
    const client = new GitlabClient({ fetchImpl: vi.fn() })
    const tool = createTools(client).find(t => t.name === 'gitlab_delete_project')!
    expect(tool.presentCall!({ project: 'a/b' })).toMatchObject({ card: 'generic', kind: 'delete' })
    const missing = new GitlabClient({ token: 'glpat_test', fetchImpl: vi.fn(async () => jsonResponse(404, {})) })
    const mtool = createTools(missing).find(t => t.name === 'gitlab_delete_project')!
    expect(await mtool.execute({ project: 'a/b' }, exec())).toMatchObject({ deleted: false, reason: 'Project not found.' })
  })

  it('member removal tools present the delete kind', async () => {
    const client = new GitlabClient({ fetchImpl: vi.fn() })
    const map = tools()
    expect(map.gitlab_remove_group_member.presentCall!({ group: 'g', userId: 1 })).toMatchObject({ kind: 'delete' })
    expect(map.gitlab_remove_project_member.presentCall!({ project: 'a/b', userId: 1 })).toMatchObject({ kind: 'delete' })
    expect(map.gitlab_add_group_member.presentCall!({ group: 'g', user: 'u', accessLevel: 'guest' })).toMatchObject({ kind: 'edit' })
  })

  it('v0.4 write tools require a token', async () => {
    const client = new GitlabClient({ fetchImpl: vi.fn() })
    const map = tools()
    expect(await map.gitlab_create_group.execute({ name: 'x' }, exec())).toMatchObject({ ok: false })
    expect(await map.gitlab_delete_group.execute({ group: 'g' }, exec())).toMatchObject({ deleted: false })
    expect(await map.gitlab_transfer_project.execute({ project: 'a/b', namespace: 'g' }, exec())).toMatchObject({ ok: false })
    expect(await map.gitlab_archive_project.execute({ project: 'a/b' }, exec())).toMatchObject({ ok: false })
    expect(await map.gitlab_unarchive_project.execute({ project: 'a/b' }, exec())).toMatchObject({ ok: false })
    expect(await map.gitlab_create_project_webhook.execute({ project: 'a/b', url: 'https://example.com/hook' }, exec())).toMatchObject({ ok: false })
    expect(await map.gitlab_delete_project_webhook.execute({ project: 'a/b', hookId: 1 }, exec())).toMatchObject({ ok: false })
    expect(await map.gitlab_create_project_variable.execute({ project: 'a/b', key: 'K', value: 'v' }, exec())).toMatchObject({ ok: false })
    expect(await map.gitlab_update_project_variable.execute({ project: 'a/b', key: 'K', value: 'v' }, exec())).toMatchObject({ ok: false })
    expect(await map.gitlab_delete_project_variable.execute({ project: 'a/b', key: 'K' }, exec())).toMatchObject({ ok: false })
  })

  it('v0.4 read tools report unauthenticated without a token', async () => {
    const client = new GitlabClient({ fetchImpl: vi.fn() })
    const map = tools()
    expect(await map.gitlab_list_project_webhooks.execute({ project: 'a/b' }, exec())).toMatchObject({ found: true, authenticated: false, items: [] })
    expect(await map.gitlab_list_project_variables.execute({ project: 'a/b' }, exec())).toMatchObject({ found: true, authenticated: false, items: [] })
  })

  it('gitlab_create_group passes visibility and path', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(201, { id: 3, full_path: 'acme/platform', web_url: 'https://gitlab.com/acme/platform' }))
    const client = new GitlabClient({ token: 'glpat_test', fetchImpl })
    const map = Object.fromEntries(createTools(client).map(t => [t.name, t]))
    const result = await map.gitlab_create_group.execute({ name: 'Platform', path: 'platform', visibility: 'private' }, exec())
    expect(result).toEqual({ ok: true, id: 3, fullPath: 'acme/platform', webUrl: 'https://gitlab.com/acme/platform' })
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toMatchObject({ name: 'Platform', path: 'platform', visibility: 'private' })
  })

  it('gitlab_transfer_project presents a move kind and renders the new path', async () => {
    const client = new GitlabClient({ fetchImpl: vi.fn() })
    const tool = createTools(client).find(t => t.name === 'gitlab_transfer_project')!
    expect(tool.presentCall!({ project: 'a/b', namespace: 'acme' })).toMatchObject({ card: 'generic', kind: 'move' })
    const blocks = await (tool.output as { render: (a: unknown, v: any) => unknown }).render({}, { ok: true, pathWithNamespace: 'acme/b', webUrl: 'u' })
    expect(JSON.stringify(blocks)).toContain('acme/b')
  })

  it('gitlab_create_project_webhook sends the URL and event flags', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(201, { id: 9, url: 'https://example.com/hook' }))
    const client = new GitlabClient({ token: 'glpat_test', fetchImpl })
    const map = Object.fromEntries(createTools(client).map(t => [t.name, t]))
    const result = await map.gitlab_create_project_webhook.execute({ project: 'a/b', url: 'https://example.com/hook', pushEvents: true, mergeRequestEvents: true }, exec())
    expect(result).toEqual({ ok: true, id: 9, url: 'https://example.com/hook' })
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toMatchObject({ url: 'https://example.com/hook', push_events: true, merge_requests_events: true })
  })

  it('gitlab_list_project_variables never leaks values', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, [{ key: 'DEPLOY_TOKEN', variable_type: 'env_var', protected: true, masked: true, environment_scope: '*' }]))
    const client = new GitlabClient({ token: 'glpat_test', fetchImpl })
    const map = Object.fromEntries(createTools(client).map(t => [t.name, t]))
    const result = await map.gitlab_list_project_variables.execute({ project: 'a/b' }, exec())
    expect(result).toEqual({
      found: true,
      items: [{ key: 'DEPLOY_TOKEN', variableType: 'env_var', protected: true, masked: true, environmentScope: '*' }],
    })
    expect(JSON.stringify(result)).not.toContain('value')
  })

  it('gitlab_create_project_variable returns only the key, not the value', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(201, { key: 'TOKEN', value: 'supersecret' }))
    const client = new GitlabClient({ token: 'glpat_test', fetchImpl })
    const map = Object.fromEntries(createTools(client).map(t => [t.name, t]))
    const result = await map.gitlab_create_project_variable.execute({ project: 'a/b', key: 'TOKEN', value: 'supersecret' }, exec())
    expect(result).toEqual({ ok: true, key: 'TOKEN' })
    expect(JSON.stringify(result)).not.toContain('supersecret')
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toMatchObject({ key: 'TOKEN', value: 'supersecret' })
  })

  it('delete tools present the delete kind', async () => {
    const client = new GitlabClient({ fetchImpl: vi.fn() })
    const map = tools()
    expect(map.gitlab_delete_group.presentCall!({ group: 'g' })).toMatchObject({ kind: 'delete' })
    expect(map.gitlab_delete_project_webhook.presentCall!({ project: 'a/b', hookId: 1 })).toMatchObject({ kind: 'delete' })
    expect(map.gitlab_delete_project_variable.presentCall!({ project: 'a/b', key: 'K' })).toMatchObject({ kind: 'delete' })
  })

  it('v0.5 write tools require a token', async () => {
    const client = new GitlabClient({ fetchImpl: vi.fn() })
    const map = Object.fromEntries(createTools(client).map(t => [t.name, t]))
    expect(await map.gitlab_enable_project_runner.execute({ project: 'a/b', runnerId: 8 }, exec())).toMatchObject({ ok: false })
    expect(await map.gitlab_disable_project_runner.execute({ project: 'a/b', runnerId: 8 }, exec())).toMatchObject({ ok: false })
    expect(await map.gitlab_delete_runner.execute({ runnerId: 8 }, exec())).toMatchObject({ ok: false })
    expect(await map.gitlab_delete_registry_repository.execute({ project: 'a/b', repositoryId: 1 }, exec())).toMatchObject({ deleted: false })
    expect(await map.gitlab_delete_registry_tag.execute({ project: 'a/b', repositoryId: 1, tag: 'latest' }, exec())).toMatchObject({ deleted: false })
    expect(await map.gitlab_create_project_mirror.execute({ project: 'a/b', url: 'https://example.com/repo.git' }, exec())).toMatchObject({ ok: false })
    expect(await map.gitlab_start_project_export.execute({ project: 'a/b' }, exec())).toMatchObject({ ok: false })
  })

  it('v0.5 read tools report unauthenticated without a token', async () => {
    const client = new GitlabClient({ fetchImpl: vi.fn() })
    const map = Object.fromEntries(createTools(client).map(t => [t.name, t]))
    expect(await map.gitlab_list_runners.execute({ project: 'a/b' }, exec())).toEqual({ found: true, authenticated: false, items: [] })
    expect(await map.gitlab_list_registry_repositories.execute({ project: 'a/b' }, exec())).toEqual({ found: true, authenticated: false, items: [] })
    expect(await map.gitlab_list_registry_tags.execute({ project: 'a/b', repositoryId: 1 }, exec())).toEqual({ found: true, authenticated: false, items: [] })
    expect(await map.gitlab_list_project_mirrors.execute({ project: 'a/b' }, exec())).toEqual({ found: true, authenticated: false, items: [] })
    expect(await map.gitlab_get_project_export_status.execute({ project: 'a/b' }, exec())).toEqual({ found: true, authenticated: false })
  })

  it('v0.5 list tools clamp limits and return found:false on 404', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, []))
    const client = new GitlabClient({ token: 'glpat_test', fetchImpl })
    const map = Object.fromEntries(createTools(client).map(t => [t.name, t]))
    await map.gitlab_list_runners.execute({ project: 'a/b', limit: 999 }, exec())
    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('per_page=50')

    const missing = new GitlabClient({ token: 'glpat_test', fetchImpl: vi.fn(async () => jsonResponse(404, {})) })
    const missingMap = Object.fromEntries(createTools(missing).map(t => [t.name, t]))
    expect(await missingMap.gitlab_list_registry_repositories.execute({ project: 'a/b' }, exec())).toEqual({ found: false, authenticated: true, items: [] })
    expect(await missingMap.gitlab_list_registry_tags.execute({ project: 'a/b', repositoryId: 1 }, exec())).toEqual({ found: false, authenticated: true, items: [] })
  })

  it('gitlab_create_project_mirror sends the URL but never echoes it', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(201, { id: 5, enabled: true, url: 'https://user:secret@example.com/repo.git' }))
    const client = new GitlabClient({ token: 'glpat_test', fetchImpl })
    const tool = createTools(client).find(t => t.name === 'gitlab_create_project_mirror')!
    const result = await tool.execute({ project: 'a/b', url: 'https://user:secret@example.com/repo.git' }, exec())
    expect(result).toEqual({ ok: true, id: 5, enabled: true })
    expect(JSON.stringify(result)).not.toContain('secret')
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toMatchObject({ url: 'https://user:secret@example.com/repo.git' })
  })

  it('v0.5 destructive and edit tools present the right kind', async () => {
    const client = new GitlabClient({ fetchImpl: vi.fn() })
    const map = tools()
    expect(map.gitlab_delete_runner.presentCall!({ runnerId: 8 })).toMatchObject({ kind: 'delete' })
    expect(map.gitlab_delete_registry_repository.presentCall!({ project: 'a/b', repositoryId: 1 })).toMatchObject({ kind: 'delete' })
    expect(map.gitlab_delete_registry_tag.presentCall!({ project: 'a/b', repositoryId: 1, tag: 'latest' })).toMatchObject({ kind: 'delete' })
    expect(map.gitlab_enable_project_runner.presentCall!({ project: 'a/b', runnerId: 8 })).toMatchObject({ kind: 'edit' })
    expect(map.gitlab_disable_project_runner.presentCall!({ project: 'a/b', runnerId: 8 })).toMatchObject({ kind: 'edit' })
    expect(map.gitlab_create_project_mirror.presentCall!({ project: 'a/b', url: 'u' })).toMatchObject({ kind: 'edit' })
    expect(map.gitlab_start_project_export.presentCall!({ project: 'a/b' })).toMatchObject({ kind: 'edit' })
  })
})
