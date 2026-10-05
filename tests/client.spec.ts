import { describe, expect, it, vi } from 'vitest'
import { GitlabClient, GitlabError } from '../src/client.ts'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function textResponse(status: number, body: string): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/plain' } })
}

describe('GitlabClient', () => {
  it('fetches project metadata with private-token header and default base URL', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {
      id: 123,
      name: 'payments',
      path_with_namespace: 'acme/payments',
      description: 'payment service',
      star_count: 42,
      default_branch: 'main',
      visibility: 'private',
      web_url: 'https://gitlab.com/acme/payments',
      last_activity_at: '2026-08-13T00:00:00Z',
    }))
    const client = new GitlabClient({ token: 'glpat_test', fetchImpl })
    const project = await client.getProject('acme/payments')

    expect(project).toEqual({
      id: 123,
      name: 'payments',
      pathWithNamespace: 'acme/payments',
      description: 'payment service',
      stars: 42,
      defaultBranch: 'main',
      visibility: 'private',
      webUrl: 'https://gitlab.com/acme/payments',
      lastActivityAt: '2026-08-13T00:00:00Z',
    })
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://gitlab.com/api/v4/projects/acme%2Fpayments')
    expect(init.headers).toMatchObject({ 'private-token': 'glpat_test' })
  })

  it('throws GitlabError with status 404 when the project does not exist', async () => {
    const client = new GitlabClient({ fetchImpl: vi.fn(async () => jsonResponse(404, {})) })
    await expect(client.getProject('nope/missing')).rejects.toThrow(GitlabError)
  })

  it('throws GitlabError 401 on invalid token and 429 on rate limiting', async () => {
    const client401 = new GitlabClient({ fetchImpl: vi.fn(async () => jsonResponse(401, {})) })
    await expect(client401.getProject('a/b')).rejects.toMatchObject({ status: 401 })
    const client429 = new GitlabClient({ fetchImpl: vi.fn(async () => jsonResponse(429, {})) })
    await expect(client429.getProject('a/b')).rejects.toMatchObject({ status: 429 })
  })

  it('honors a self-managed baseUrl override', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {
      id: 1, name: 'x', path_with_namespace: 'a/x', description: null, star_count: 0,
      default_branch: 'main', visibility: 'private', web_url: 'https://gitlab.example.com/a/x',
      last_activity_at: '2026-01-01T00:00:00Z',
    }))
    const client = new GitlabClient({ baseUrl: 'https://gitlab.example.com/api/v4/', fetchImpl })
    await client.getProject('a/x')
    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url.startsWith('https://gitlab.example.com/api/v4/projects/')).toBe(true)
  })

  it('searchProjects builds query params and maps items', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, [
      { id: 1, name: 'payments', path_with_namespace: 'acme/payments', description: 'd', star_count: 5, visibility: 'internal', web_url: 'https://gitlab.com/acme/payments', last_activity_at: '2026-01-01T00:00:00Z' },
    ]))
    const client = new GitlabClient({ fetchImpl })
    const items = await client.searchProjects('payments', { orderBy: 'stars', order: 'desc', perPage: 5 })
    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('/projects?')
    expect(url).toContain('search=payments')
    expect(url).toContain('order_by=stars')
    expect(url).toContain('sort=desc')
    expect(url).toContain('per_page=5')
    expect(items[0]).toMatchObject({ pathWithNamespace: 'acme/payments', stars: 5 })
  })

  it('listGroupProjects passes include_subgroups', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, []))
    const client = new GitlabClient({ fetchImpl })
    await client.listGroupProjects('acme', { includeSubgroups: true, perPage: 10 })
    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('/groups/acme/projects?')
    expect(url).toContain('include_subgroups=true')
    expect(url).toContain('per_page=10')
  })

  it('listGroupMembers maps access levels to labels', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, [
      { id: 1, username: 'alice', name: 'Alice', access_level: 50, web_url: 'https://gitlab.com/alice' },
      { id: 2, username: 'bob', name: 'Bob', access_level: 30, web_url: 'https://gitlab.com/bob' },
    ]))
    const client = new GitlabClient({ fetchImpl })
    const members = await client.listGroupMembers('acme')
    expect(members[0]).toMatchObject({ username: 'alice', accessLabel: 'Owner' })
    expect(members[1]).toMatchObject({ username: 'bob', accessLabel: 'Developer' })
  })

  it('listIssues passes state and assignee filters', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, [
      { iid: 1, title: 'Bug', state: 'opened', labels: ['bug'], created_at: '2026-01-01T00:00:00Z', author: { username: 'alice' }, web_url: 'https://gitlab.com/a/b/-/issues/1' },
    ]))
    const client = new GitlabClient({ fetchImpl })
    const issues = await client.listIssues('a/b', { state: 'opened', assigneeUsername: 'alice', perPage: 3 })
    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('/issues?')
    expect(url).toContain('state=opened')
    expect(url).toContain('assignee_username=alice')
    expect(url).toContain('per_page=3')
    expect(issues[0]).toMatchObject({ iid: 1, labels: ['bug'], author: 'alice' })
  })

  it('getIssue maps the description', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {
      iid: 1, title: 'Bug', state: 'opened', labels: [], created_at: '2026-01-01T00:00:00Z',
      author: { username: 'alice' }, description: 'details here', web_url: 'https://gitlab.com/a/b/-/issues/1',
    }))
    const client = new GitlabClient({ fetchImpl })
    const issue = await client.getIssue('a/b', 1)
    expect(issue).toMatchObject({ iid: 1, description: 'details here' })
  })

  it('createIssue POSTs title, description, and labels', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(201, { iid: 9, web_url: 'https://gitlab.com/a/b/-/issues/9' }))
    const client = new GitlabClient({ token: 'glpat_test', fetchImpl })
    const result = await client.createIssue('a/b', { title: 'Bug', description: 'Why', labels: ['bug'] })
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ title: 'Bug', description: 'Why', labels: ['bug'] })
    expect(result).toEqual({ ok: true, iid: 9, webUrl: 'https://gitlab.com/a/b/-/issues/9' })
  })

  it('commentOnIssue returns the issue URL', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(201, { id: 77 }))
    const client = new GitlabClient({ token: 'glpat_test', fetchImpl })
    const result = await client.commentOnIssue('a/b', 9, 'looks good')
    expect(result).toEqual({ ok: true, webUrl: 'https://gitlab.com/a/b/-/issues/9' })
  })

  it('commentMr returns the MR URL', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(201, { id: 78 }))
    const client = new GitlabClient({ token: 'glpat_test', fetchImpl })
    const result = await client.commentMr('a/b', 7, 'please rebase')
    expect(result).toEqual({ ok: true, webUrl: 'https://gitlab.com/a/b/-/merge_requests/7' })
  })

  it('updateIssue sends state_event close', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { iid: 1, state: 'closed', web_url: 'https://gitlab.com/a/b/-/issues/1' }))
    const client = new GitlabClient({ token: 'glpat_test', fetchImpl })
    await client.updateIssue('a/b', 1, 'close')
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({ state_event: 'close' })
  })

  it('listMrs maps draft, conflicts, and branches', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, [
      { iid: 7, title: 'Add checkout', state: 'opened', draft: true, author: { username: 'alice' }, source_branch: 'feat/x', target_branch: 'main', created_at: '2026-01-01T00:00:00Z', has_conflicts: false, web_url: 'https://gitlab.com/a/b/-/merge_requests/7' },
    ]))
    const client = new GitlabClient({ fetchImpl })
    const mrs = await client.listMrs('a/b', { state: 'opened' })
    expect(mrs[0]).toMatchObject({ iid: 7, draft: true, sourceBranch: 'feat/x', targetBranch: 'main', hasConflicts: false })
  })

  it('getMr maps the pipeline and detailed merge status', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {
      iid: 7, title: 'Add checkout', state: 'opened', draft: false, author: { username: 'alice' },
      source_branch: 'feat/x', target_branch: 'main', created_at: '2026-01-01T00:00:00Z', has_conflicts: false,
      description: 'desc', merge_status: 'can_be_merged', detailed_merge_status: 'mergeable', squash: true,
      pipeline: { id: 11, status: 'success', ref: 'feat/x', web_url: 'https://gitlab.com/a/b/-/pipelines/11' },
      web_url: 'https://gitlab.com/a/b/-/merge_requests/7',
    }))
    const client = new GitlabClient({ fetchImpl })
    const mr = await client.getMr('a/b', 7)
    expect(mr).toMatchObject({ iid: 7, detailedMergeStatus: 'mergeable', squash: true })
    expect(mr.pipeline).toMatchObject({ id: 11, status: 'success' })
  })

  it('getMrChanges maps file changes', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {
      iid: 7, title: 'x', changes: [
        { old_path: 'a.ts', new_path: 'a.ts', new_file: false, deleted_file: false, renamed_file: false, diff: '@@ -1 +1 @@\n-old\n+new' },
      ],
    }))
    const client = new GitlabClient({ fetchImpl })
    const changes = await client.getMrChanges('a/b', 7)
    expect(changes.changes[0]).toMatchObject({ oldPath: 'a.ts', newFile: false, diff: '@@ -1 +1 @@\n-old\n+new' })
  })

  it('listMrDiscussions maps notes and authors', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, [
      { id: 'd1', notes: [{ id: 1, author: { username: 'alice' }, created_at: '2026-01-01T00:00:00Z', body: 'please fix', resolvable: true, resolved: false }] },
    ]))
    const client = new GitlabClient({ fetchImpl })
    const discussions = await client.listMrDiscussions('a/b', 7)
    expect(discussions[0].notes[0]).toMatchObject({ author: 'alice', body: 'please fix', resolved: false })
  })

  it('getMrApprovals maps approved-by users and rules', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {
      approved: true,
      approved_by: [{ user: { username: 'alice' } }, { user: { username: 'bob' } }],
      approvals_required: 1,
      approvals_left: 0,
      rules: [
        { name: 'Maintainer', rule_type: 'any_approver', approvals_required: 1, approvals_left: 0, approved: true, approved_by: [{ user: { username: 'alice' } }] },
      ],
    }))
    const client = new GitlabClient({ fetchImpl })
    const approvals = await client.getMrApprovals('a/b', 7)
    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('/merge_requests/7/approvals')
    expect(approvals).toMatchObject({ approved: true, approvedBy: ['alice', 'bob'], approvalsLeft: 0 })
    expect(approvals.rules[0]).toMatchObject({ name: 'Maintainer', ruleType: 'any_approver', approvedBy: ['alice'] })
  })

  it('replyToDiscussion POSTs the note to the thread', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(201, { id: 88 }))
    const client = new GitlabClient({ token: 'glpat_test', fetchImpl })
    const result = await client.replyToDiscussion('a/b', 7, 'd1', 'fixed, thanks')
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('POST')
    expect(url).toContain('/discussions/d1/notes')
    expect(JSON.parse(String(init.body))).toEqual({ body: 'fixed, thanks' })
    expect(result).toEqual({ ok: true, noteId: 88 })

    const missing = new GitlabClient({ token: 'glpat_test', fetchImpl: vi.fn(async () => jsonResponse(404, {})) })
    expect((await missing.replyToDiscussion('a/b', 7, 'd1', 'x')).ok).toBe(false)
  })

  it('resolveDiscussion PUTs resolved state', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { id: 'd1' }))
    const client = new GitlabClient({ token: 'glpat_test', fetchImpl })
    const result = await client.resolveDiscussion('a/b', 7, 'd1', true)
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('PUT')
    expect(url).toContain('/discussions/d1')
    expect(JSON.parse(String(init.body))).toEqual({ resolved: true })
    expect(result).toEqual({ ok: true })
  })

  it('listLabels maps label colors', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, [
      { id: 1, name: 'bug', color: '#d9534f', description: 'Something is broken' },
    ]))
    const client = new GitlabClient({ fetchImpl })
    const labels = await client.listLabels('a/b')
    expect(labels[0]).toMatchObject({ name: 'bug', color: '#d9534f' })
  })

  it('listMilestones maps due dates and state', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, [
      { id: 1, iid: 2, title: 'v1.1', description: null, state: 'active', due_date: '2026-09-01', start_date: null, web_url: 'https://gitlab.com/a/b/-/milestones/2' },
    ]))
    const client = new GitlabClient({ fetchImpl })
    const milestones = await client.listMilestones('a/b', { state: 'active' })
    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('state=active')
    expect(milestones[0]).toMatchObject({ iid: 2, title: 'v1.1', dueDate: '2026-09-01' })
  })

  it('listReleases maps tags, authors, and links', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, [
      { tag_name: 'v1.0.0', name: 'Version 1', description: 'notes', released_at: '2026-01-01T00:00:00Z', author: { name: 'Alice' }, _links: { self: 'https://gitlab.com/a/b/-/releases/v1.0.0' } },
    ]))
    const client = new GitlabClient({ fetchImpl })
    const releases = await client.listReleases('a/b')
    expect(releases[0]).toMatchObject({ tagName: 'v1.0.0', name: 'Version 1', author: 'Alice', webUrl: 'https://gitlab.com/a/b/-/releases/v1.0.0' })
  })

  it('listEnvironments maps states and external URLs', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, [
      { id: 1, name: 'staging', slug: 'staging', state: 'available', external_url: 'https://staging.example.com' },
    ]))
    const client = new GitlabClient({ fetchImpl })
    const environments = await client.listEnvironments('a/b')
    expect(environments[0]).toMatchObject({ name: 'staging', state: 'available', externalUrl: 'https://staging.example.com' })
  })

  it('listCommits maps short SHA and author', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, [
      { id: 'abcdef1234567890', title: 'Fix bug', message: 'Fix bug\n\nbody', author_name: 'Alice', committed_date: '2026-01-01T00:00:00Z', web_url: 'https://gitlab.com/a/b/-/commit/abcdef' },
    ]))
    const client = new GitlabClient({ fetchImpl })
    const commits = await client.listCommits('a/b', { ref: 'main', perPage: 5 })
    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('ref_name=main')
    expect(commits[0]).toMatchObject({ sha: 'abcdef1', author: 'Alice' })
  })

  it('getFile decodes base64 content and returns found:false on 404', async () => {
    const content = Buffer.from('hello world', 'utf8').toString('base64')
    const fetchImpl = vi.fn(async () => jsonResponse(200, {
      file_name: 'readme.md', file_path: 'readme.md', size: 11, encoding: 'base64', content, web_url: 'https://gitlab.com/a/b/-/blob/main/readme.md',
    }))
    const client = new GitlabClient({ fetchImpl })
    const file = await client.getFile('a/b', 'readme.md')
    expect(file).toMatchObject({ found: true, content: 'hello world', size: 11 })
    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('/files/readme.md?')
    expect(url).toContain('ref=HEAD')

    const missing = new GitlabClient({ fetchImpl: vi.fn(async () => jsonResponse(404, {})) })
    expect(await missing.getFile('a/b', 'nope.txt')).toEqual({ found: false })
  })

  it('listPipelines passes ref/status filters', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, [
      { id: 11, ref: 'main', sha: 'abcdef1234567890', status: 'failed', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', web_url: 'https://gitlab.com/a/b/-/pipelines/11' },
    ]))
    const client = new GitlabClient({ fetchImpl })
    const pipelines = await client.listPipelines('a/b', { ref: 'main', status: 'failed' })
    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('ref=main')
    expect(url).toContain('status=failed')
    expect(pipelines[0]).toMatchObject({ id: 11, sha: 'abcdef1' })
  })

  it('getPipeline maps stages', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {
      id: 11, ref: 'main', sha: 'abcdef1234567890', status: 'success', stages: ['build', 'test', 'deploy'],
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', web_url: 'https://gitlab.com/a/b/-/pipelines/11',
    }))
    const client = new GitlabClient({ fetchImpl })
    const pipeline = await client.getPipeline('a/b', 11)
    expect(pipeline).toMatchObject({ status: 'success', stages: ['build', 'test', 'deploy'] })
  })

  it('getJobLog reads the raw trace and maps 404 to found:false', async () => {
    const fetchImpl = vi.fn(async () => textResponse(200, 'section_start\nrunning tests...\nsection_end'))
    const client = new GitlabClient({ fetchImpl })
    const log = await client.getJobLog('a/b', 654321)
    expect(log).toMatchObject({ found: true, content: 'section_start\nrunning tests...\nsection_end' })
    expect(log.webUrl).toContain('/-/jobs/654321')

    const missing = new GitlabClient({ fetchImpl: vi.fn(async () => jsonResponse(404, {})) })
    expect(await missing.getJobLog('a/b', 1)).toEqual({ found: false })
  })

  it('searchCode maps blob matches', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, [
      { basename: 'index.ts', path: 'src/index.ts', data: 'export const x = 1', filename: 'src/index.ts', ref: 'main', startline: 3, project_id: 1 },
    ]))
    const client = new GitlabClient({ token: 'glpat_test', fetchImpl })
    const result = await client.searchCode('a/b', 'defineTool', { perPage: 5 })
    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('/search?')
    expect(url).toContain('scope=blobs')
    expect(url).toContain('search=defineTool')
    expect(result.authenticated).toBe(true)
    expect(result.items[0]).toMatchObject({ path: 'src/index.ts', startLine: 3 })
  })

  it('getCurrentUser and listTodos map identity and todos', async () => {
    const fetchUser = vi.fn(async () => jsonResponse(200, { id: 1, username: 'alice', name: 'Alice', web_url: 'https://gitlab.com/alice' }))
    const client = new GitlabClient({ token: 'glpat_test', fetchImpl: fetchUser })
    const user = await client.getCurrentUser()
    expect(user).toMatchObject({ username: 'alice' })

    const fetchTodos = vi.fn(async () => jsonResponse(200, [
      { id: 5, project: { path_with_namespace: 'a/b' }, target_type: 'MergeRequest', target: { iid: 7, title: 'Add checkout', web_url: 'https://gitlab.com/a/b/-/merge_requests/7' }, action_name: 'approval_required', body: 'MR awaiting approval', created_at: '2026-01-01T00:00:00Z' },
    ]))
    const todoClient = new GitlabClient({ token: 'glpat_test', fetchImpl: fetchTodos })
    const todos = await todoClient.listTodos({ perPage: 20 })
    const [url] = fetchTodos.mock.calls[0] as [string]
    expect(url).toContain('/todos?')
    expect(url).toContain('state=pending')
    expect(todos[0]).toMatchObject({ project: 'a/b', targetType: 'MergeRequest', action: 'approval_required' })
  })

  it('createMr POSTs draft and maps 409 to created:false', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(201, { iid: 12, web_url: 'https://gitlab.com/a/b/-/merge_requests/12' }))
    const client = new GitlabClient({ token: 'glpat_test', fetchImpl })
    const result = await client.createMr('a/b', { title: 'Change', sourceBranch: 'feat/x', targetBranch: 'main', description: 'Why', draft: true })
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ source_branch: 'feat/x', target_branch: 'main', title: 'Change', description: 'Why', draft: true })
    expect(result).toEqual({ created: true, iid: 12, webUrl: 'https://gitlab.com/a/b/-/merge_requests/12' })

    const conflict = new GitlabClient({ token: 'glpat_test', fetchImpl: vi.fn(async () => jsonResponse(409, {})) })
    const failed = await conflict.createMr('a/b', { title: 'x', sourceBranch: 'a', targetBranch: 'b' })
    expect(failed.created).toBe(false)
    expect(failed.reason).toBeTruthy()
  })

  it('approveMr maps 409 already-approved to ok:false', async () => {
    const client = new GitlabClient({ token: 'glpat_test', fetchImpl: vi.fn(async () => jsonResponse(409, {})) })
    const result = await client.approveMr('a/b', 7)
    expect(result).toEqual({ ok: false, reason: expect.any(String) })
  })

  it('mergeMr PUTs squash and maps 406 to merged:false', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { web_url: 'https://gitlab.com/a/b/-/merge_requests/7' }))
    const client = new GitlabClient({ token: 'glpat_test', fetchImpl })
    const result = await client.mergeMr('a/b', 7, { squash: true })
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('PUT')
    expect(JSON.parse(String(init.body))).toEqual({ squash: true })
    expect(result.merged).toBe(true)

    const blocked = new GitlabClient({ token: 'glpat_test', fetchImpl: vi.fn(async () => jsonResponse(406, {})) })
    const failed = await blocked.mergeMr('a/b', 7)
    expect(failed.merged).toBe(false)
    expect(failed.reason).toBeTruthy()
  })

  it('triggerPipeline POSTs the ref and maps 400 to created:false', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(201, { id: 99, status: 'created', web_url: 'https://gitlab.com/a/b/-/pipelines/99' }))
    const client = new GitlabClient({ token: 'glpat_test', fetchImpl })
    const result = await client.triggerPipeline('a/b', 'main')
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('POST')
    expect(url).toContain('/pipeline?ref=main')
    expect(result).toEqual({ created: true, pipelineId: 99, status: 'created', webUrl: 'https://gitlab.com/a/b/-/pipelines/99' })

    const noConfig = new GitlabClient({ token: 'glpat_test', fetchImpl: vi.fn(async () => jsonResponse(400, {})) })
    expect((await noConfig.triggerPipeline('a/b', 'main')).created).toBe(false)
  })

  it('createBranch POSTs branch/ref and maps 400 to ok:false', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(201, { name: 'feat/x' }))
    const client = new GitlabClient({ token: 'glpat_test', fetchImpl })
    const result = await client.createBranch('a/b', 'feat/x', 'main')
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({ branch: 'feat/x', ref: 'main' })
    expect(result).toEqual({ ok: true, name: 'feat/x' })

    const exists = new GitlabClient({ token: 'glpat_test', fetchImpl: vi.fn(async () => jsonResponse(400, {})) })
    expect((await exists.createBranch('a/b', 'feat/x', 'main')).ok).toBe(false)
  })

  it('writeFile commits via the commits API and maps 400 to ok:false', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(201, { id: 'abcdef1234567890', short_id: 'abcdef1', title: 'Update docs/notes.md' }))
    const client = new GitlabClient({ token: 'glpat_test', fetchImpl })
    const result = await client.writeFile('a/b', 'docs/notes.md', 'hi', { message: 'Update notes', branch: 'main' })
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('POST')
    expect(url).toContain('/repository/commits')
    const body = JSON.parse(String(init.body))
    expect(body).toMatchObject({ branch: 'main', commit_message: 'Update notes' })
    expect(body.actions[0]).toMatchObject({ action: 'update', file_path: 'docs/notes.md', content: 'hi' })
    expect(result).toEqual({ ok: true, path: 'docs/notes.md', commitSha: 'abcdef1' })

    const rejected = new GitlabClient({ token: 'glpat_test', fetchImpl: vi.fn(async () => jsonResponse(400, {})) })
    expect((await rejected.writeFile('a/b', 'x', 'y', { message: 'm' })).ok).toBe(false)
  })

  it('createProject POSTs name, namespace, and visibility', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(201, { id: 11, path_with_namespace: 'acme/widgets', web_url: 'https://gitlab.com/acme/widgets' }))
    const client = new GitlabClient({ token: 'glpat_test', fetchImpl })
    const result = await client.createProject({ name: 'Widgets', path: 'widgets', namespaceId: 5, visibility: 'private', initializeWithReadme: true })
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/projects')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toMatchObject({
      name: 'Widgets',
      path: 'widgets',
      namespace_id: 5,
      visibility: 'private',
      initialize_with_readme: true,
    })
    expect(result).toEqual({ ok: true, id: 11, pathWithNamespace: 'acme/widgets', webUrl: 'https://gitlab.com/acme/widgets' })

    const rejected = new GitlabClient({ token: 'glpat_test', fetchImpl: vi.fn(async () => jsonResponse(422, {})) })
    expect((await rejected.createProject({ name: 'x' })).ok).toBe(false)
  })

  it('deleteProject DELETEs and maps 404 to deleted:false', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }))
    const client = new GitlabClient({ token: 'glpat_test', fetchImpl })
    expect(await client.deleteProject('a/b')).toEqual({ deleted: true })
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/projects/a%2Fb')
    expect(init.method).toBe('DELETE')

    const missing = new GitlabClient({ token: 'glpat_test', fetchImpl: vi.fn(async () => jsonResponse(404, {})) })
    expect(await missing.deleteProject('a/b')).toEqual({ deleted: false, reason: 'Project not found.' })
  })

  it('addGroupMember POSTs user and access level, rejecting invalid levels', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(201, { id: 1 }))
    const client = new GitlabClient({ token: 'glpat_test', fetchImpl })
    expect(await client.addGroupMember('acme', { user: 'alice', accessLevel: 'maintainer' })).toEqual({ ok: true })
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ user_id: 'alice', access_level: 40 })

    const noLevel = new GitlabClient({ token: 'glpat_test', fetchImpl: vi.fn() })
    expect((await noLevel.addGroupMember('acme', { user: 'alice', accessLevel: 'superadmin' })).ok).toBe(false)
  })

  it('updateGroupMember PUTs the new access level and maps 404', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { id: 1 }))
    const client = new GitlabClient({ token: 'glpat_test', fetchImpl })
    expect(await client.updateGroupMember('acme', { userId: 42, accessLevel: 20 })).toEqual({ ok: true })
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/groups/acme/members/42')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(String(init.body))).toEqual({ access_level: 20 })

    const missing = new GitlabClient({ token: 'glpat_test', fetchImpl: vi.fn(async () => jsonResponse(404, {})) })
    expect((await missing.updateGroupMember('acme', { userId: 42, accessLevel: 'owner' })).ok).toBe(false)
  })

  it('removeGroupMember DELETEs and maps 404', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }))
    const client = new GitlabClient({ token: 'glpat_test', fetchImpl })
    expect(await client.removeGroupMember('acme', 42)).toEqual({ ok: true })
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/groups/acme/members/42')
    expect(init.method).toBe('DELETE')

    const missing = new GitlabClient({ token: 'glpat_test', fetchImpl: vi.fn(async () => jsonResponse(404, {})) })
    expect((await missing.removeGroupMember('acme', 42)).ok).toBe(false)
  })

  it('addProjectMember and updateProjectMember hit project member endpoints', async () => {
    const addImpl = vi.fn(async () => jsonResponse(201, { id: 1 }))
    const add = new GitlabClient({ token: 'glpat_test', fetchImpl: addImpl })
    expect(await add.addProjectMember('a/b', { user: 7, accessLevel: 'developer' })).toEqual({ ok: true })
    const [addUrl, addInit] = addImpl.mock.calls[0] as [string, RequestInit]
    expect(addUrl).toContain('/projects/a%2Fb/members')
    expect(JSON.parse(String(addInit.body))).toEqual({ user_id: 7, access_level: 30 })

    const updImpl = vi.fn(async () => jsonResponse(200, { id: 1 }))
    const upd = new GitlabClient({ token: 'glpat_test', fetchImpl: updImpl })
    expect(await upd.updateProjectMember('a/b', { userId: 7, accessLevel: 'reporter' })).toEqual({ ok: true })
    const [updUrl, updInit] = updImpl.mock.calls[0] as [string, RequestInit]
    expect(updUrl).toContain('/projects/a%2Fb/members/7')
    expect(updInit.method).toBe('PUT')
    expect(JSON.parse(String(updInit.body))).toEqual({ access_level: 20 })
  })

  it('removeProjectMember DELETEs and maps 404', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }))
    const client = new GitlabClient({ token: 'glpat_test', fetchImpl })
    expect(await client.removeProjectMember('a/b', 7)).toEqual({ ok: true })
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/projects/a%2Fb/members/7')
    expect(init.method).toBe('DELETE')

    const missing = new GitlabClient({ token: 'glpat_test', fetchImpl: vi.fn(async () => jsonResponse(404, {})) })
    expect((await missing.removeProjectMember('a/b', 7)).ok).toBe(false)
  })

  it('accessLevelValue maps labels and integers', async () => {
    const { accessLevelValue } = await import('../src/client.ts')
    expect(accessLevelValue('guest')).toBe(10)
    expect(accessLevelValue('MAINTAINER')).toBe(40)
    expect(accessLevelValue(50)).toBe(50)
    expect(accessLevelValue('admin')).toBeUndefined()
    expect(accessLevelValue(99)).toBeUndefined()
  })

  it('createGroup POSTs name, path, and visibility', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(201, { id: 3, full_path: 'acme/platform', web_url: 'https://gitlab.com/acme/platform' }))
    const client = new GitlabClient({ token: 'glpat_test', fetchImpl })
    const result = await client.createGroup({ name: 'Platform', path: 'platform', visibility: 'internal' })
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/groups')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toMatchObject({ name: 'Platform', path: 'platform', visibility: 'internal' })
    expect(result).toEqual({ ok: true, id: 3, fullPath: 'acme/platform', webUrl: 'https://gitlab.com/acme/platform' })

    const rejected = new GitlabClient({ token: 'glpat_test', fetchImpl: vi.fn(async () => jsonResponse(422, {})) })
    expect((await rejected.createGroup({ name: 'x' })).ok).toBe(false)
  })

  it('deleteGroup DELETEs and maps 404', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }))
    const client = new GitlabClient({ token: 'glpat_test', fetchImpl })
    expect(await client.deleteGroup('acme')).toEqual({ deleted: true })
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/groups/acme')
    expect(init.method).toBe('DELETE')

    const missing = new GitlabClient({ token: 'glpat_test', fetchImpl: vi.fn(async () => jsonResponse(404, {})) })
    expect(await missing.deleteGroup('acme')).toEqual({ deleted: false, reason: 'Group not found.' })
  })

  it('transferProject PUTs the namespace and maps failures', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { path_with_namespace: 'acme/widgets', web_url: 'https://gitlab.com/acme/widgets' }))
    const client = new GitlabClient({ token: 'glpat_test', fetchImpl })
    const result = await client.transferProject('legacy/widgets', 'acme')
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/projects/legacy%2Fwidgets/transfer')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(String(init.body))).toEqual({ namespace: 'acme' })
    expect(result).toEqual({ ok: true, pathWithNamespace: 'acme/widgets', webUrl: 'https://gitlab.com/acme/widgets' })

    const rejected = new GitlabClient({ token: 'glpat_test', fetchImpl: vi.fn(async () => jsonResponse(400, {})) })
    expect((await rejected.transferProject('a/b', 'x')).ok).toBe(false)
  })

  it('archiveProject and unarchiveProject POST and map 404', async () => {
    const archiver = new GitlabClient({ token: 'glpat_test', fetchImpl: vi.fn(async () => jsonResponse(201, { archived: true })) })
    expect(await archiver.archiveProject('a/b')).toEqual({ ok: true, archived: true })
    const unarchiver = new GitlabClient({ token: 'glpat_test', fetchImpl: vi.fn(async () => jsonResponse(201, { archived: false })) })
    expect(await unarchiver.unarchiveProject('a/b')).toEqual({ ok: true, archived: false })

    const missing = new GitlabClient({ token: 'glpat_test', fetchImpl: vi.fn(async () => jsonResponse(404, {})) })
    expect((await missing.archiveProject('a/b')).ok).toBe(false)
    expect((await missing.unarchiveProject('a/b')).ok).toBe(false)
  })

  it('listProjectWebhooks maps event flags and 404 to found:false', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, [{
      id: 1, url: 'https://example.com/hook', push_events: true, merge_requests_events: false,
      issues_events: true, tag_push_events: false, enable_ssl_verification: true, created_at: '2026-01-01T00:00:00Z',
    }]))
    const client = new GitlabClient({ token: 'glpat_test', fetchImpl })
    const result = await client.listProjectWebhooks('a/b')
    expect(result).toEqual({
      found: true,
      items: [{ id: 1, url: 'https://example.com/hook', pushEvents: true, mergeRequestEvents: false, issueEvents: true, tagPushEvents: false, enableSslVerification: true, createdAt: '2026-01-01T00:00:00Z' }],
    })
    const missing = new GitlabClient({ token: 'glpat_test', fetchImpl: vi.fn(async () => jsonResponse(404, {})) })
    expect(await missing.listProjectWebhooks('a/b')).toEqual({ found: false, items: [] })
  })

  it('createProjectWebhook POSTs url and flags, deleteProjectWebhook DELETEs', async () => {
    const createImpl = vi.fn(async () => jsonResponse(201, { id: 9, url: 'https://example.com/hook' }))
    const client = new GitlabClient({ token: 'glpat_test', fetchImpl: createImpl })
    expect(await client.createProjectWebhook('a/b', { url: 'https://example.com/hook', pushEvents: true, mergeRequestEvents: true }))
      .toEqual({ ok: true, id: 9, url: 'https://example.com/hook' })
    const [, init] = createImpl.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toMatchObject({ url: 'https://example.com/hook', push_events: true, merge_requests_events: true })

    const delImpl = vi.fn(async () => new Response(null, { status: 204 }))
    const deleter = new GitlabClient({ token: 'glpat_test', fetchImpl: delImpl })
    expect(await deleter.deleteProjectWebhook('a/b', 9)).toEqual({ ok: true })
    const [delUrl, delInit] = delImpl.mock.calls[0] as [string, RequestInit]
    expect(delUrl).toContain('/projects/a%2Fb/hooks/9')
    expect(delInit.method).toBe('DELETE')

    const missing = new GitlabClient({ token: 'glpat_test', fetchImpl: vi.fn(async () => jsonResponse(404, {})) })
    expect((await missing.deleteProjectWebhook('a/b', 9)).ok).toBe(false)
  })

  it('listProjectVariables returns metadata only and maps 404', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, [{
      key: 'DEPLOY_TOKEN', variable_type: 'env_var', protected: true, masked: true, environment_scope: 'production',
    }]))
    const client = new GitlabClient({ token: 'glpat_test', fetchImpl })
    const result = await client.listProjectVariables('a/b')
    expect(result).toEqual({
      found: true,
      items: [{ key: 'DEPLOY_TOKEN', variableType: 'env_var', protected: true, masked: true, environmentScope: 'production' }],
    })
    expect(JSON.stringify(result)).not.toContain('value')

    const missing = new GitlabClient({ token: 'glpat_test', fetchImpl: vi.fn(async () => jsonResponse(404, {})) })
    expect(await missing.listProjectVariables('a/b')).toEqual({ found: false, items: [] })
  })

  it('createProjectVariable sends value but returns only the key', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(201, { key: 'TOKEN', value: 'supersecret' }))
    const client = new GitlabClient({ token: 'glpat_test', fetchImpl })
    const result = await client.createProjectVariable('a/b', { key: 'TOKEN', value: 'supersecret', protected: true, masked: true })
    expect(result).toEqual({ ok: true, key: 'TOKEN' })
    expect(JSON.stringify(result)).not.toContain('supersecret')
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toMatchObject({ key: 'TOKEN', value: 'supersecret', protected: true, masked: true })

    const rejected = new GitlabClient({ token: 'glpat_test', fetchImpl: vi.fn(async () => jsonResponse(409, {})) })
    expect((await rejected.createProjectVariable('a/b', { key: 'K', value: 'v' })).ok).toBe(false)
  })

  it('updateProjectVariable PUTs the key and maps 404', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { key: 'TOKEN', value: 'new' }))
    const client = new GitlabClient({ token: 'glpat_test', fetchImpl })
    expect(await client.updateProjectVariable('a/b', { key: 'TOKEN', value: 'new', environmentScope: 'production' })).toEqual({ ok: true, key: 'TOKEN' })
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/projects/a%2Fb/variables/TOKEN')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(String(init.body))).toMatchObject({ value: 'new', environment_scope: 'production' })

    const missing = new GitlabClient({ token: 'glpat_test', fetchImpl: vi.fn(async () => jsonResponse(404, {})) })
    expect((await missing.updateProjectVariable('a/b', { key: 'K', value: 'v' })).ok).toBe(false)
  })

  it('deleteProjectVariable DELETEs and maps 404', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }))
    const client = new GitlabClient({ token: 'glpat_test', fetchImpl })
    expect(await client.deleteProjectVariable('a/b', 'TOKEN')).toEqual({ ok: true })
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/projects/a%2Fb/variables/TOKEN')
    expect(init.method).toBe('DELETE')

    const missing = new GitlabClient({ token: 'glpat_test', fetchImpl: vi.fn(async () => jsonResponse(404, {})) })
    expect((await missing.deleteProjectVariable('a/b', 'TOKEN')).ok).toBe(false)
  })

  it('listRunners and enable/disable/delete runner hit the runner endpoints', async () => {
    const listImpl = vi.fn(async () => jsonResponse(200, [{
      id: 8, description: 'linux', ip_address: null, active: true, is_shared: false,
      online: true, status: 'online', runner_type: 'project_type', access_level: 'ref_protected',
    }]))
    const lister = new GitlabClient({ token: 'glpat_test', fetchImpl: listImpl })
    const runners = await lister.listRunners('a/b', { perPage: 5 })
    expect(runners).toEqual([{
      id: 8, description: 'linux', ipAddress: null, active: true, shared: false, online: true,
      status: 'online', runnerType: 'project_type', accessLevel: 'ref_protected',
    }])
    const [listUrl] = listImpl.mock.calls[0] as [string]
    expect(listUrl).toContain('/projects/a%2Fb/runners?')
    expect(listUrl).toContain('per_page=5')

    const enableImpl = vi.fn(async () => jsonResponse(201, { id: 8 }))
    const enabler = new GitlabClient({ token: 'glpat_test', fetchImpl: enableImpl })
    expect(await enabler.enableProjectRunner('a/b', 8)).toEqual({ ok: true, id: 8 })
    const [enableUrl, enableInit] = enableImpl.mock.calls[0] as [string, RequestInit]
    expect(enableUrl).toContain('/projects/a%2Fb/runners')
    expect(enableInit.method).toBe('POST')
    expect(JSON.parse(String(enableInit.body))).toEqual({ runner_id: 8 })

    const disableImpl = vi.fn(async () => new Response(null, { status: 204 }))
    const disabler = new GitlabClient({ token: 'glpat_test', fetchImpl: disableImpl })
    expect(await disabler.disableProjectRunner('a/b', 8)).toEqual({ ok: true, id: 8 })
    const [disableUrl, disableInit] = disableImpl.mock.calls[0] as [string, RequestInit]
    expect(disableUrl).toContain('/projects/a%2Fb/runners/8')
    expect(disableInit.method).toBe('DELETE')

    const deleteImpl = vi.fn(async () => new Response(null, { status: 204 }))
    const deleter = new GitlabClient({ token: 'glpat_test', fetchImpl: deleteImpl })
    expect(await deleter.deleteRunner(8)).toEqual({ ok: true, id: 8 })
    const [deleteUrl, deleteInit] = deleteImpl.mock.calls[0] as [string, RequestInit]
    expect(deleteUrl).toContain('/runners/8')
    expect(deleteInit.method).toBe('DELETE')

    const missing = new GitlabClient({ token: 'glpat_test', fetchImpl: vi.fn(async () => jsonResponse(404, {})) })
    expect((await missing.disableProjectRunner('a/b', 8)).ok).toBe(false)
    expect((await missing.deleteRunner(8)).ok).toBe(false)
  })

  it('listRegistryRepositories and listRegistryTags map container metadata', async () => {
    const repoImpl = vi.fn(async () => jsonResponse(200, [{
      id: 1, name: 'app', path: 'a/b/app', location: 'registry.example.com/a/b/app',
      tags_count: 3, created_at: '2026-01-01T00:00:00Z',
    }]))
    const repoClient = new GitlabClient({ token: 'glpat_test', fetchImpl: repoImpl })
    const repos = await repoClient.listRegistryRepositories('a/b')
    expect(repos).toEqual([{
      id: 1, name: 'app', path: 'a/b/app', location: 'registry.example.com/a/b/app', tagsCount: 3, createdAt: '2026-01-01T00:00:00Z',
    }])
    const [repoUrl] = repoImpl.mock.calls[0] as [string]
    expect(repoUrl).toContain('/projects/a%2Fb/registry/repositories?')

    const tagImpl = vi.fn(async () => jsonResponse(200, [{
      name: 'latest', location: 'registry.example.com/a/b/app:latest', revision: 'abc', short_revision: 'ab12cd',
      digest: 'sha256:abc', created_at: '2026-01-01T00:00:00Z', total_size: 1024,
    }]))
    const tagClient = new GitlabClient({ token: 'glpat_test', fetchImpl: tagImpl })
    const tags = await tagClient.listRegistryTags('a/b', 1)
    expect(tags).toEqual([{
      name: 'latest', location: 'registry.example.com/a/b/app:latest', revision: 'abc', shortRevision: 'ab12cd',
      digest: 'sha256:abc', createdAt: '2026-01-01T00:00:00Z', totalSize: 1024,
    }])
    const [tagUrl] = tagImpl.mock.calls[0] as [string]
    expect(tagUrl).toContain('/projects/a%2Fb/registry/repositories/1/tags?')
  })

  it('deleteRegistryRepository and deleteRegistryTag DELETEs and map 404', async () => {
    const repoImpl = vi.fn(async () => new Response(null, { status: 204 }))
    const repoClient = new GitlabClient({ token: 'glpat_test', fetchImpl: repoImpl })
    expect(await repoClient.deleteRegistryRepository('a/b', 1)).toEqual({ deleted: true })
    const [repoUrl, repoInit] = repoImpl.mock.calls[0] as [string, RequestInit]
    expect(repoUrl).toContain('/projects/a%2Fb/registry/repositories/1')
    expect(repoInit.method).toBe('DELETE')

    const tagImpl = vi.fn(async () => new Response(null, { status: 204 }))
    const tagClient = new GitlabClient({ token: 'glpat_test', fetchImpl: tagImpl })
    expect(await tagClient.deleteRegistryTag('a/b', 1, 'latest')).toEqual({ deleted: true })
    const [tagUrl, tagInit] = tagImpl.mock.calls[0] as [string, RequestInit]
    expect(tagUrl).toContain('/projects/a%2Fb/registry/repositories/1/tags/latest')
    expect(tagInit.method).toBe('DELETE')

    const missing = new GitlabClient({ token: 'glpat_test', fetchImpl: vi.fn(async () => jsonResponse(404, {})) })
    expect((await missing.deleteRegistryRepository('a/b', 1)).deleted).toBe(false)
    expect((await missing.deleteRegistryTag('a/b', 1, 'latest')).deleted).toBe(false)
  })

  it('listRemoteMirrors exposes safe metadata and masks URLs', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, [{
      id: 5, url: 'https://user:secret@example.com/repo.git', enabled: true, keep_divergent_refs: true,
      update_status: 'finished', last_successful_update_at: '2026-01-01T00:00:00Z', last_error: null,
      only_protected_branches: false,
    }]))
    const client = new GitlabClient({ token: 'glpat_test', fetchImpl })
    const result = await client.listRemoteMirrors('a/b')
    expect(result).toEqual({
      found: true,
      items: [{
        id: 5, enabled: true, keepDivergentRefs: true, updateStatus: 'finished',
        lastSuccessfulUpdateAt: '2026-01-01T00:00:00Z', lastError: null, onlyProtectedBranches: false,
      }],
    })
    expect(JSON.stringify(result)).not.toContain('secret')
    expect(JSON.stringify(result)).not.toContain('example.com/repo.git')

    const missing = new GitlabClient({ token: 'glpat_test', fetchImpl: vi.fn(async () => jsonResponse(404, {})) })
    expect(await missing.listRemoteMirrors('a/b')).toEqual({ found: false, items: [] })
  })

  it('createRemoteMirror sends the URL once and never returns it', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(201, { id: 5, enabled: false, url: 'https://user:secret@example.com/repo.git' }))
    const client = new GitlabClient({ token: 'glpat_test', fetchImpl })
    const result = await client.createRemoteMirror('a/b', {
      url: 'https://user:secret@example.com/repo.git', enabled: true, keepDivergentRefs: true, onlyProtectedBranches: true,
    })
    expect(result).toEqual({ ok: true, id: 5, enabled: false })
    expect(JSON.stringify(result)).not.toContain('secret')
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toMatchObject({
      url: 'https://user:secret@example.com/repo.git', enabled: true, keep_divergent_refs: true, only_protected_branches: true,
    })
  })

  it('startProjectExport and getProjectExportStatus map async export state', async () => {
    const startImpl = vi.fn(async () => jsonResponse(202, { message: '202 Accepted' }))
    const starter = new GitlabClient({ token: 'glpat_test', fetchImpl: startImpl })
    const started = await starter.startProjectExport('a/b', { description: 'backup' })
    expect(started).toEqual({ ok: true, exportStatus: 'started' })
    const [startUrl, startInit] = startImpl.mock.calls[0] as [string, RequestInit]
    expect(startUrl).toContain('/projects/a%2Fb/export')
    expect(startInit.method).toBe('POST')
    expect(JSON.parse(String(startInit.body))).toEqual({ description: 'backup' })

    const statusImpl = vi.fn(async () => jsonResponse(200, {
      export_status: 'finished', finished_at: '2026-01-01T00:00:00Z', message: null,
    }))
    const statusClient = new GitlabClient({ token: 'glpat_test', fetchImpl: statusImpl })
    expect(await statusClient.getProjectExportStatus('a/b')).toEqual({
      found: true, exportStatus: 'finished', finishedAt: '2026-01-01T00:00:00Z', message: null,
    })
    const [statusUrl] = statusImpl.mock.calls[0] as [string]
    expect(statusUrl).toContain('/projects/a%2Fb/export/status')

    const missing = new GitlabClient({ token: 'glpat_test', fetchImpl: vi.fn(async () => jsonResponse(404, {})) })
    expect(await missing.getProjectExportStatus('a/b')).toEqual({ found: false })
  })

  it('listMrApprovalRules maps rules and handles 404', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, [
      {
        id: 5,
        name: 'Security',
        rule_type: 'regular',
        approvals_required: 2,
        eligible_approvers: [{ username: 'alice' }, { username: 'bob' }],
        applies_to_all_protected_branches: true,
      },
    ]))
    const client = new GitlabClient({ token: 'glpat_test', fetchImpl })
    const result = await client.listMrApprovalRules('a/b', 7)
    expect(result).toEqual({
      found: true,
      authenticated: true,
      items: [{
        id: 5,
        name: 'Security',
        ruleType: 'regular',
        approvalsRequired: 2,
        eligibleApprovers: ['alice', 'bob'],
        appliesToAllProtectedBranches: true,
      }],
    })
    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('/projects/a%2Fb/merge_requests/7/approval_rules')

    const missing = new GitlabClient({ token: 'glpat_test', fetchImpl: vi.fn(async () => jsonResponse(404, {})) })
    expect(await missing.listMrApprovalRules('a/b', 8)).toEqual({ found: false, authenticated: true, items: [] })
  })

  it('create/update/delete MR approval rules use write endpoints', async () => {
    const createImpl = vi.fn(async () => jsonResponse(201, { id: 5, name: 'Security' }))
    const creator = new GitlabClient({ token: 'glpat_test', fetchImpl: createImpl })
    expect(await creator.createMrApprovalRule('a/b', 7, {
      name: 'Security', approvalsRequired: 2, userIds: [1], groupIds: [2],
    })).toEqual({ ok: true, id: 5, name: 'Security' })
    const [createUrl, createInit] = createImpl.mock.calls[0] as [string, RequestInit]
    expect(createUrl).toContain('/projects/a%2Fb/merge_requests/7/approval_rules')
    expect(createInit.method).toBe('POST')
    expect(JSON.parse(String(createInit.body))).toMatchObject({
      name: 'Security', approvals_required: 2, user_ids: [1], group_ids: [2],
    })

    const updateImpl = vi.fn(async () => jsonResponse(200, { id: 5, name: 'Security' }))
    const updater = new GitlabClient({ token: 'glpat_test', fetchImpl: updateImpl })
    expect(await updater.updateMrApprovalRule('a/b', 7, 5, { approvalsRequired: 3 })).toEqual({ ok: true, id: 5, name: 'Security' })
    const [updateUrl, updateInit] = updateImpl.mock.calls[0] as [string, RequestInit]
    expect(updateUrl).toContain('/approval_rules/5')
    expect(updateInit.method).toBe('PUT')
    expect(JSON.parse(String(updateInit.body))).toEqual({ approvals_required: 3 })

    const deleteImpl = vi.fn(async () => new Response(null, { status: 204 }))
    const deleter = new GitlabClient({ token: 'glpat_test', fetchImpl: deleteImpl })
    expect(await deleter.deleteMrApprovalRule('a/b', 7, 5)).toEqual({ ok: true, id: 5 })
    expect((deleteImpl.mock.calls[0] as [string, RequestInit])[1].method).toBe('DELETE')

    const missing = new GitlabClient({ token: 'glpat_test', fetchImpl: vi.fn(async () => jsonResponse(404, {})) })
    expect((await missing.deleteMrApprovalRule('a/b', 7, 9)).ok).toBe(false)
  })

  it('listProtectedBranches maps access level descriptions', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, [{
      id: 1,
      name: 'main',
      push_access_levels: [{ access_level_description: 'Developers + Maintainers' }],
      merge_access_levels: [{ access_level_description: 'Maintainers' }],
      unprotect_access_levels: [],
      allow_force_push: false,
      code_owner_approval_required: true,
      inherited: true,
    }]))
    const client = new GitlabClient({ token: 'glpat_test', fetchImpl })
    const branches = await client.listProtectedBranches('a/b')
    expect(branches[0]).toEqual({
      id: 1,
      name: 'main',
      pushAccess: 'Developers + Maintainers',
      mergeAccess: 'Maintainers',
      unprotectAccess: 'none',
      allowForcePush: false,
      codeOwnerApprovalRequired: true,
      inherited: true,
    })
    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('/projects/a%2Fb/protected_branches?')
  })

  it('protectBranch maps access labels and unprotectBranch encodes the branch', async () => {
    const postImpl = vi.fn(async () => jsonResponse(201, { id: 1, name: 'main' }))
    const poster = new GitlabClient({ token: 'glpat_test', fetchImpl: postImpl })
    expect(await poster.protectBranch('a/b', {
      name: 'main', pushAccess: 'developer', mergeAccess: 'maintainer',
    })).toEqual({ ok: true, name: 'main' })
    const [, init] = postImpl.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toMatchObject({
      name: 'main', push_access_level: 30, merge_access_level: 40, unprotect_access_level: 40,
    })

    const invalid = new GitlabClient({ token: 'glpat_test', fetchImpl: vi.fn() })
    expect((await invalid.protectBranch('a/b', { name: 'main', pushAccess: 'owner' })).ok).toBe(false)

    const deleteImpl = vi.fn(async () => new Response(null, { status: 204 }))
    const deleter = new GitlabClient({ token: 'glpat_test', fetchImpl: deleteImpl })
    expect(await deleter.unprotectBranch('a/b', 'release/1.x')).toEqual({ ok: true, name: 'release/1.x' })
    const [deleteUrl, deleteInit] = deleteImpl.mock.calls[0] as [string, RequestInit]
    expect(deleteUrl).toContain('/projects/a%2Fb/protected_branches/release%2F1.x')
    expect(deleteInit.method).toBe('DELETE')

    const missing = new GitlabClient({ token: 'glpat_test', fetchImpl: vi.fn(async () => jsonResponse(404, {})) })
    expect((await missing.unprotectBranch('a/b', 'main')).ok).toBe(false)
  })

  it('listPipelineSchedules maps schedule metadata and last run', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, [{
      id: 9,
      description: 'Nightly E2E',
      ref: 'main',
      cron: '0 2 * * *',
      cron_timezone: 'UTC',
      next_run_at: '2026-08-27T02:00:00Z',
      active: true,
      owner: { username: 'alice' },
      created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-08-02T00:00:00Z',
      last_pipeline: { id: 12, status: 'success' },
    }]))
    const client = new GitlabClient({ token: 'glpat_test', fetchImpl })
    const schedules = await client.listPipelineSchedules('a/b', { active: true })
    expect(schedules[0]).toEqual({
      id: 9,
      description: 'Nightly E2E',
      ref: 'main',
      cron: '0 2 * * *',
      cronTimezone: 'UTC',
      nextRunAt: '2026-08-27T02:00:00Z',
      active: true,
      owner: 'alice',
      createdAt: '2026-08-01T00:00:00Z',
      updatedAt: '2026-08-02T00:00:00Z',
      lastPipeline: { id: 12, status: 'success' },
    })
    const [url] = fetchImpl.mock.calls[0] as [string]
    expect(url).toContain('/projects/a%2Fb/pipeline_schedules?')
    expect(url).toContain('active=true')
  })

  it('create/update/delete pipeline schedules use schedule endpoints', async () => {
    const createImpl = vi.fn(async () => jsonResponse(201, { id: 9, description: 'Nightly E2E' }))
    const creator = new GitlabClient({ token: 'glpat_test', fetchImpl: createImpl })
    expect(await creator.createPipelineSchedule('a/b', {
      description: 'Nightly E2E', ref: 'main', cron: '0 2 * * *', active: false,
    })).toEqual({ ok: true, id: 9, description: 'Nightly E2E' })
    const [createUrl, createInit] = createImpl.mock.calls[0] as [string, RequestInit]
    expect(createUrl).toContain('/projects/a%2Fb/pipeline_schedules')
    expect(createInit.method).toBe('POST')
    expect(JSON.parse(String(createInit.body))).toMatchObject({
      description: 'Nightly E2E', ref: 'main', cron: '0 2 * * *', active: false, cron_timezone: 'UTC',
    })

    const updateImpl = vi.fn(async () => jsonResponse(200, { id: 9, description: 'Nightly E2E' }))
    const updater = new GitlabClient({ token: 'glpat_test', fetchImpl: updateImpl })
    expect(await updater.updatePipelineSchedule('a/b', 9, { cronTimezone: 'Asia/Shanghai' })).toEqual({ ok: true, id: 9, description: 'Nightly E2E' })
    const [, updateInit] = updateImpl.mock.calls[0] as [string, RequestInit]
    expect(updateInit.method).toBe('PUT')
    expect(JSON.parse(String(updateInit.body))).toEqual({ cron_timezone: 'Asia/Shanghai' })

    const deleteImpl = vi.fn(async () => new Response(null, { status: 204 }))
    const deleter = new GitlabClient({ token: 'glpat_test', fetchImpl: deleteImpl })
    expect(await deleter.deletePipelineSchedule('a/b', 9)).toEqual({ ok: true, id: 9 })
    expect((deleteImpl.mock.calls[0] as [string, RequestInit])[1].method).toBe('DELETE')

    const missing = new GitlabClient({ token: 'glpat_test', fetchImpl: vi.fn(async () => jsonResponse(404, {})) })
    expect((await missing.deletePipelineSchedule('a/b', 9)).ok).toBe(false)
  })
})

describe('GitLab endpoint policy', () => {
  const valid = { token: 'glpat_test' }
  const ok = () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
  const call = (client: GitlabClient) => client.getProject('g/p')

  it('rejects literal link-local endpoints by default, including IPv4 embedded in IPv6', async () => {
    for (const baseUrl of [
      'http://169.254.169.254',
      'http://169.254.1.1',
      'http://[fe80::1]',
      'http://[::ffff:169.254.169.254]',
      'http://[64:ff9b::a9fe:a9fe]',
      'http://[::169.254.169.254]',
    ]) {
      const fetchImpl = vi.fn()
      await expect(call(new GitlabClient({ ...valid, baseUrl, fetchImpl }))).rejects.toBeInstanceOf(GitlabError)
      expect(fetchImpl).not.toHaveBeenCalled()
    }
  })

  it('keeps self-hosted private and loopback endpoints working by default', async () => {
    for (const baseUrl of [
      'http://10.0.0.5',
      'http://172.16.4.4',
      'http://192.168.1.10',
      'http://127.0.0.1:8080',
      'http://[fc00::1]',
    ]) {
      const fetchImpl = vi.fn(async () => ok())
      await call(new GitlabClient({ ...valid, baseUrl, fetchImpl })).catch(() => undefined)
      expect(fetchImpl).toHaveBeenCalledTimes(1)
    }
  })

  it('performs no DNS work in the default mode', async () => {
    const lookupImpl = vi.fn(async () => { throw new Error('default mode must not resolve hostnames') })
    const fetchImpl = vi.fn(async () => ok())
    await call(new GitlabClient({ ...valid, baseUrl: 'https://gitlab.internal.corp', fetchImpl, lookupImpl })).catch(() => undefined)
    expect(lookupImpl).not.toHaveBeenCalled()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('rejects private and link-local endpoints when enforcePublicEndpoint is on', async () => {
    for (const baseUrl of ['http://10.0.0.5', 'http://127.0.0.1', 'http://169.254.169.254', 'http://[fc00::1]']) {
      const fetchImpl = vi.fn()
      await expect(call(new GitlabClient({ ...valid, baseUrl, fetchImpl, enforcePublicEndpoint: true }))).rejects.toBeInstanceOf(GitlabError)
      expect(fetchImpl).not.toHaveBeenCalled()
    }
  })

  it('resolves and rejects blocked hostnames only when enforcePublicEndpoint is on', async () => {
    const lookupImpl = async () => [{ address: '169.254.169.254', family: 4 as const }]
    const fetchImpl = vi.fn()
    await expect(call(new GitlabClient({ ...valid, baseUrl: 'https://metadata.gitlab.test', fetchImpl, lookupImpl, enforcePublicEndpoint: true }))).rejects.toBeInstanceOf(GitlabError)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('allows a public endpoint when enforcePublicEndpoint is on', async () => {
    const lookupImpl = async () => [{ address: '93.184.216.34', family: 4 as const }]
    const fetchImpl = vi.fn(async () => ok())
    await call(new GitlabClient({ ...valid, baseUrl: 'https://gitlab.example.test', fetchImpl, lookupImpl, enforcePublicEndpoint: true })).catch(() => undefined)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})

describe('GitlabError identity', () => {
  it('reports its own class name so callers can branch on error.name', () => {
    const error = new GitlabError('probe', 400)
    expect(error).toBeInstanceOf(GitlabError)
    expect(error.name).toBe('GitlabError')
  })
})
