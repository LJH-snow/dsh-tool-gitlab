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
      'gitlab_approve_mr',
      'gitlab_comment_issue',
      'gitlab_comment_mr',
      'gitlab_create_branch',
      'gitlab_create_issue',
      'gitlab_create_mr',
      'gitlab_get_current_user',
      'gitlab_get_file',
      'gitlab_get_issue',
      'gitlab_get_job_log',
      'gitlab_get_mr',
      'gitlab_get_mr_approvals',
      'gitlab_get_mr_changes',
      'gitlab_get_pipeline',
      'gitlab_get_project',
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
      'gitlab_list_releases',
      'gitlab_list_subgroups',
      'gitlab_list_todos',
      'gitlab_merge_mr',
      'gitlab_reply_mr_discussion',
      'gitlab_resolve_mr_discussion',
      'gitlab_search_code',
      'gitlab_search_projects',
      'gitlab_trigger_pipeline',
      'gitlab_update_issue',
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
})
