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
})
