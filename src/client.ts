/** GitLab REST API v4 client with injected fetch for testability. */

import { EndpointSecurityError, guardEndpoint, normalizeBaseUrl, type EndpointPolicy, type LookupImpl } from './url-security.js'

export interface GitlabClientOptions {
  baseUrl?: string
  token?: string
  fetchImpl?: typeof fetch
  /** Require a publicly reachable endpoint and resolve hostnames. Off by default so self-hosted deployments keep working. */
  enforcePublicEndpoint?: boolean
  /** Test-only DNS lookup override; production uses node:dns/promises. */
  lookupImpl?: LookupImpl
  /** Request timeout in milliseconds. 0 disables the timeout. */
  timeoutMs?: number
}

export interface ProjectInfo {
  id: number
  name: string
  pathWithNamespace: string
  description: string | null
  stars: number
  defaultBranch: string | null
  visibility: string
  webUrl: string
  lastActivityAt: string
}

export interface ProjectSearchItem {
  id: number
  name: string
  pathWithNamespace: string
  description: string | null
  stars: number
  visibility: string
  webUrl: string
  lastActivityAt: string
}

export interface GroupItem {
  id: number
  name: string
  fullPath: string
  description: string | null
  visibility: string
  webUrl: string
}

export interface MemberItem {
  id: number
  username: string
  name: string
  accessLevel: number
  accessLabel: string
  webUrl: string
}

export interface IssueItem {
  iid: number
  title: string
  state: string
  labels: string[]
  createdAt: string
  author: string
  webUrl: string
}

export interface IssueDetail extends IssueItem {
  description: string
}

export interface IssueWriteResult {
  ok: boolean
  iid?: number
  webUrl?: string
  reason?: string
}

export interface MrItem {
  iid: number
  title: string
  state: string
  draft: boolean
  author: string
  sourceBranch: string
  targetBranch: string
  createdAt: string
  hasConflicts: boolean
  webUrl: string
}

export interface MrPipelineInfo {
  id: number
  status: string
  ref: string
  webUrl: string
}

export interface MrDetail extends MrItem {
  description: string
  mergeStatus: string
  detailedMergeStatus: string
  squash: boolean
  pipeline: MrPipelineInfo | null
}

export interface MrFileChange {
  oldPath: string
  newPath: string
  newFile: boolean
  deletedFile: boolean
  renamedFile: boolean
  diff: string
}

export interface MrChanges {
  iid: number
  title: string
  changes: MrFileChange[]
}

export interface NoteItem {
  id: number
  author: string
  createdAt: string
  body: string
  resolvable: boolean
  resolved: boolean
}

export interface DiscussionItem {
  id: string
  notes: NoteItem[]
}

export interface DiscussionReplyResult {
  ok: boolean
  noteId?: number
  reason?: string
}

export interface DiscussionResolveResult {
  ok: boolean
  reason?: string
}

export interface CommitItem {
  sha: string
  title: string
  message: string
  author: string
  date: string
  webUrl: string
}

export interface FileContent {
  found: boolean
  name?: string
  path?: string
  size?: number
  content?: string
  encoding?: string
  webUrl?: string
}

export interface BranchItem {
  name: string
  sha: string
}

export interface LabelItem {
  id: number
  name: string
  color: string
  description: string | null
}

export interface MilestoneItem {
  id: number
  iid: number
  title: string
  description: string | null
  state: string
  dueDate: string | null
  startDate: string | null
  webUrl: string
}

export interface ReleaseItem {
  tagName: string
  name: string
  description: string
  releasedAt: string
  author: string
  webUrl: string
}

export interface EnvironmentItem {
  id: number
  name: string
  slug: string
  state: string
  externalUrl: string | null
}

export interface MrApprovals {
  approved: boolean
  approvedBy: string[]
  approvalsRequired: number
  approvalsLeft: number
  rules: Array<{
    name: string
    ruleType: string
    approvalsRequired: number
    approvalsLeft: number
    approved: boolean
    approvedBy: string[]
  }>
}

export interface ApprovalRuleItem {
  id: number
  name: string
  ruleType: string
  approvalsRequired: number
  eligibleApprovers: string[]
  appliesToAllProtectedBranches: boolean
}

export interface ApprovalRuleListResult {
  found: boolean
  authenticated: boolean
  items: ApprovalRuleItem[]
}

export interface ApprovalRuleWriteResult {
  ok: boolean
  id?: number
  name?: string
  reason?: string
}

export interface ProtectedBranchItem {
  id: number
  name: string
  pushAccess: string
  mergeAccess: string
  unprotectAccess: string
  allowForcePush: boolean
  codeOwnerApprovalRequired: boolean
  inherited: boolean
}

export interface ProtectedBranchWriteResult {
  ok: boolean
  name?: string
  reason?: string
}

export interface PipelineScheduleItem {
  id: number
  description: string
  ref: string
  cron: string
  cronTimezone: string
  nextRunAt: string | null
  active: boolean
  owner: string
  createdAt: string
  updatedAt: string
  lastPipeline: { id: number; status: string } | null
}

export interface PipelineScheduleWriteResult {
  ok: boolean
  id?: number
  description?: string
  reason?: string
}

export interface PipelineItem {
  id: number
  ref: string
  sha: string
  status: string
  createdAt: string
  updatedAt: string
  webUrl: string
}

export interface PipelineDetail extends PipelineItem {
  stages: string[]
}

export interface JobLog {
  found: boolean
  content?: string
  webUrl?: string
}

export interface CodeSearchItem {
  path: string
  data: string
  ref: string
  startLine: number
}

export interface CodeSearchResult {
  authenticated: boolean
  items: CodeSearchItem[]
}

export interface UserInfo {
  id: number
  username: string
  name: string
  webUrl: string
}

export interface TodoItem {
  id: number
  project: string
  targetType: string
  targetTitle: string
  targetWebUrl: string
  action: string
  body: string
  createdAt: string
}

export interface MrWriteResult {
  created: boolean
  iid?: number
  webUrl?: string
  reason?: string
}

export interface ApproveResult {
  ok: boolean
  reason?: string
}

export interface MergeResult {
  merged: boolean
  webUrl?: string
  reason?: string
}

export interface PipelineTriggerResult {
  created: boolean
  pipelineId?: number
  status?: string
  webUrl?: string
  reason?: string
}

export interface BranchCreateResult {
  ok: boolean
  name?: string
  reason?: string
}

export interface FileWriteResult {
  ok: boolean
  path?: string
  commitSha?: string
  reason?: string
}

export interface ProjectCreateResult {
  ok: boolean
  id?: number
  pathWithNamespace?: string
  webUrl?: string
  reason?: string
}

export interface ProjectDeleteResult {
  deleted: boolean
  reason?: string
}

export interface MemberWriteResult {
  ok: boolean
  reason?: string
}

export interface GroupCreateResult {
  ok: boolean
  id?: number
  fullPath?: string
  webUrl?: string
  reason?: string
}

export interface GroupDeleteResult {
  deleted: boolean
  reason?: string
}

export interface ProjectTransferResult {
  ok: boolean
  pathWithNamespace?: string
  webUrl?: string
  reason?: string
}

export interface ProjectArchiveResult {
  ok: boolean
  archived?: boolean
  reason?: string
}

export interface WebhookItem {
  id: number
  url: string
  pushEvents: boolean
  mergeRequestEvents: boolean
  issueEvents: boolean
  tagPushEvents: boolean
  enableSslVerification: boolean
  createdAt: string
}

export interface WebhookListResult {
  found: boolean
  items: WebhookItem[]
}

export interface WebhookWriteResult {
  ok: boolean
  id?: number
  url?: string
  reason?: string
}

export interface VariableItem {
  key: string
  variableType: string
  protected: boolean
  masked: boolean
  environmentScope: string
}

export interface VariableListResult {
  found: boolean
  items: VariableItem[]
}

export interface VariableWriteResult {
  ok: boolean
  key?: string
  reason?: string
}

export interface RunnerItem {
  id: number
  description: string
  ipAddress: string | null
  active: boolean
  shared: boolean
  online: boolean
  status: string
  runnerType: string | null
  accessLevel: string | null
}

export interface RunnerWriteResult {
  ok: boolean
  id?: number
  reason?: string
}

export interface RegistryRepositoryItem {
  id: number
  name: string
  path: string
  location: string
  tagsCount: number
  createdAt: string | null
}

export interface RegistryTagItem {
  name: string
  location: string
  revision: string | null
  shortRevision: string | null
  digest: string | null
  createdAt: string | null
  totalSize: number | null
}

export interface RegistryDeleteResult {
  deleted: boolean
  reason?: string
}

export interface RemoteMirrorItem {
  id: number
  enabled: boolean
  keepDivergentRefs: boolean
  updateStatus: string
  lastSuccessfulUpdateAt: string | null
  lastError: string | null
  onlyProtectedBranches: boolean
}

export interface RemoteMirrorListResult {
  found: boolean
  items: RemoteMirrorItem[]
}

export interface RemoteMirrorWriteResult {
  ok: boolean
  id?: number
  enabled?: boolean
  reason?: string
}

export interface ProjectExportStartResult {
  ok: boolean
  exportStatus?: string
  reason?: string
}

export interface ProjectExportStatusResult {
  found: boolean
  exportStatus?: string
  finishedAt?: string | null
  message?: string | null
}

export type IssueState = 'opened' | 'closed' | 'all'
export type MrState = 'opened' | 'closed' | 'merged' | 'all'
export type AccessLevelInput = string | number
export type ProtectedBranchAccessInput = string | number

const ACCESS_LEVELS: Record<number, string> = {
  10: 'Guest',
  20: 'Reporter',
  30: 'Developer',
  40: 'Maintainer',
  50: 'Owner',
}

export function accessLabel(level: number): string {
  return ACCESS_LEVELS[level] ?? `Level ${level}`
}

const LEVEL_LABELS: Record<string, number> = {
  guest: 10,
  reporter: 20,
  developer: 30,
  maintainer: 40,
  owner: 50,
}

export function accessLevelValue(input: AccessLevelInput): number | undefined {
  if (typeof input === 'number') return ACCESS_LEVELS[input] !== undefined ? input : undefined
  return LEVEL_LABELS[input.trim().toLowerCase()]
}

const PROTECTED_BRANCH_LEVELS: Record<string, number> = {
  no_access: 0,
  none: 0,
  developer: 30,
  maintainer: 40,
}

export function protectedBranchAccessValue(input: ProtectedBranchAccessInput): number | undefined {
  if (typeof input === 'number') return input === 0 || input === 30 || input === 40 ? input : undefined
  return PROTECTED_BRANCH_LEVELS[input.trim().toLowerCase()]
}

function accessDescriptions(levels: Array<{ access_level_description?: string }> | undefined): string {
  const names = (levels ?? []).map(level => level.access_level_description ?? '').filter(Boolean)
  return names.length > 0 ? names.join('/') : 'none'
}

export class GitlabError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

export class GitlabClient {
  private readonly baseUrl: string
  private readonly token: string | undefined
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number
  private readonly endpointPolicy: EndpointPolicy

  constructor(options: GitlabClientOptions = {}) {
    try {
      this.baseUrl = options.enforcePublicEndpoint === true
        ? normalizeBaseUrl(options.baseUrl, 'https://gitlab.com/api/v4')
        : (options.baseUrl ?? 'https://gitlab.com/api/v4').replace(/\/$/, '')
    } catch (error) {
      if (error instanceof EndpointSecurityError) throw new GitlabError(error.message, 400)
      throw error
    }
    this.token = options.token
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch
    this.timeoutMs = options.timeoutMs ?? 15_000
    this.endpointPolicy = { enforcePublicEndpoint: options.enforcePublicEndpoint === true, lookupImpl: options.lookupImpl }
  }

  hasToken(): boolean {
    return Boolean(this.token)
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      accept: 'application/json',
      'user-agent': 'dsh-tool-gitlab',
    }
    if (this.token) headers['private-token'] = this.token
    return headers
  }

  private combinedSignal(signal?: AbortSignal): AbortSignal | undefined {
    if (this.timeoutMs <= 0) return signal
    const timeout = AbortSignal.timeout(this.timeoutMs)
    return signal ? AbortSignal.any([signal, timeout]) : timeout
  }

  private async request<T>(path: string, options: { signal?: AbortSignal; method?: string; body?: unknown } = {}): Promise<T> {
    const headers = this.headers()
    const init: RequestInit = { headers, method: options.method ?? 'GET', signal: this.combinedSignal(options.signal) }
    if (options.body !== undefined) {
      headers['content-type'] = 'application/json'
      init.body = JSON.stringify(options.body)
    }
        const blocked = await guardEndpoint(`${this.baseUrl}${path}`, this.endpointPolicy)
    if (blocked) throw new GitlabError(blocked, 400)
const res = await this.fetchImpl(`${this.baseUrl}${path}`, init)
    this.throwOnError(res)
    if (res.status === 204) return undefined as T
    return (await res.json()) as T
  }

  private async requestText(path: string, options: { signal?: AbortSignal } = {}): Promise<string> {
        const blocked = await guardEndpoint(`${this.baseUrl}${path}`, this.endpointPolicy)
    if (blocked) throw new GitlabError(blocked, 400)
const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      headers: this.headers(),
      method: 'GET',
      signal: this.combinedSignal(options.signal),
    })
    this.throwOnError(res)
    return res.text()
  }

  private throwOnError(res: Response): void {
    if (res.status === 404) throw new GitlabError('Not found', 404)
    if (res.status === 401) throw new GitlabError('Invalid or missing GitLab token', 401)
    if (res.status === 403) throw new GitlabError('GitLab API access forbidden', 403)
    if (res.status === 429) throw new GitlabError('GitLab rate limit exceeded', 429)
    if (!res.ok) throw new GitlabError(`GitLab API error ${res.status}`, res.status)
  }

  private pageParams(perPage: number | undefined, max = 100): string {
    const perPageClamped = perPage === undefined ? 20 : Math.max(1, Math.min(perPage, max))
    return `per_page=${perPageClamped}`
  }

  private webUrl(projectPath: string): string {
    const host = this.baseUrl.replace(/\/api\/v4\/?$/, '')
    return `${host}/${projectPath}`
  }

  async getProject(project: string, signal?: AbortSignal): Promise<ProjectInfo> {
    const data = await this.request<{
      id: number
      name: string
      path_with_namespace: string
      description: string | null
      star_count: number
      default_branch: string | null
      visibility: string
      web_url: string
      last_activity_at: string
    }>(`/projects/${encodeURIComponent(project)}`, { signal })
    return {
      id: data.id,
      name: data.name,
      pathWithNamespace: data.path_with_namespace,
      description: data.description,
      stars: data.star_count,
      defaultBranch: data.default_branch,
      visibility: data.visibility,
      webUrl: data.web_url,
      lastActivityAt: data.last_activity_at,
    }
  }

  async searchProjects(query: string, options: { groupId?: number; orderBy?: 'stars' | 'last_activity_at'; order?: 'asc' | 'desc'; perPage?: number; signal?: AbortSignal } = {}): Promise<ProjectSearchItem[]> {
    const params = new URLSearchParams({ search: query, simple: 'true', order_by: options.orderBy ?? 'stars', sort: options.order ?? 'desc', per_page: String(options.perPage ?? 20) })
    if (options.groupId !== undefined) params.set('group_id', String(options.groupId))
    const data = await this.request<Array<{
      id: number
      name: string
      path_with_namespace: string
      description: string | null
      star_count: number
      visibility: string
      web_url: string
      last_activity_at: string
    }>>(`/projects?${params}`, { signal: options.signal })
    return data.map(item => ({
      id: item.id,
      name: item.name,
      pathWithNamespace: item.path_with_namespace,
      description: item.description,
      stars: item.star_count,
      visibility: item.visibility,
      webUrl: item.web_url,
      lastActivityAt: item.last_activity_at,
    }))
  }

  async listGroupProjects(group: string, options: { includeSubgroups?: boolean; perPage?: number; signal?: AbortSignal } = {}): Promise<ProjectSearchItem[]> {
    const params = new URLSearchParams({ include_subgroups: options.includeSubgroups ? 'true' : 'false', simple: 'true', ...(options.perPage ? { per_page: String(options.perPage) } : {}) })
    const data = await this.request<Array<{
      id: number
      name: string
      path_with_namespace: string
      description: string | null
      star_count: number
      visibility: string
      web_url: string
      last_activity_at: string
    }>>(`/groups/${encodeURIComponent(group)}/projects?${params}`, { signal: options.signal })
    return data.map(item => ({
      id: item.id,
      name: item.name,
      pathWithNamespace: item.path_with_namespace,
      description: item.description,
      stars: item.star_count,
      visibility: item.visibility,
      webUrl: item.web_url,
      lastActivityAt: item.last_activity_at,
    }))
  }

  async listSubgroups(group: string, options: { perPage?: number; signal?: AbortSignal } = {}): Promise<GroupItem[]> {
    const data = await this.request<Array<{
      id: number
      name: string
      full_path: string
      description: string | null
      visibility: string
      web_url: string
    }>>(`/groups/${encodeURIComponent(group)}/subgroups?${this.pageParams(options.perPage)}`, { signal: options.signal })
    return data.map(item => ({
      id: item.id,
      name: item.name,
      fullPath: item.full_path,
      description: item.description,
      visibility: item.visibility,
      webUrl: item.web_url,
    }))
  }

  async listGroupMembers(group: string, options: { perPage?: number; signal?: AbortSignal } = {}): Promise<MemberItem[]> {
    const data = await this.request<Array<{
      id: number
      username: string
      name: string
      access_level: number
      web_url: string
    }>>(`/groups/${encodeURIComponent(group)}/members/all?${this.pageParams(options.perPage)}`, { signal: options.signal })
    return data.map(item => ({
      id: item.id,
      username: item.username,
      name: item.name,
      accessLevel: item.access_level,
      accessLabel: accessLabel(item.access_level),
      webUrl: item.web_url,
    }))
  }

  async listProjectMembers(project: string, options: { perPage?: number; signal?: AbortSignal } = {}): Promise<MemberItem[]> {
    const data = await this.request<Array<{
      id: number
      username: string
      name: string
      access_level: number
      web_url: string
    }>>(`/projects/${encodeURIComponent(project)}/members/all?${this.pageParams(options.perPage)}`, { signal: options.signal })
    return data.map(item => ({
      id: item.id,
      username: item.username,
      name: item.name,
      accessLevel: item.access_level,
      accessLabel: accessLabel(item.access_level),
      webUrl: item.web_url,
    }))
  }

  async listIssues(project: string, options: { state?: IssueState; assigneeUsername?: string; perPage?: number; signal?: AbortSignal } = {}): Promise<IssueItem[]> {
    const params = new URLSearchParams({ state: options.state ?? 'opened', ...(options.assigneeUsername ? { assignee_username: options.assigneeUsername } : {}), ...(options.perPage ? { per_page: String(options.perPage) } : {}) })
    const data = await this.request<Array<{
      iid: number
      title: string
      state: string
      labels: string[]
      created_at: string
      author: { username: string }
      web_url: string
    }>>(`/projects/${encodeURIComponent(project)}/issues?${params}`, { signal: options.signal })
    return data.map(item => ({
      iid: item.iid,
      title: item.title,
      state: item.state,
      labels: item.labels ?? [],
      createdAt: item.created_at,
      author: item.author.username,
      webUrl: item.web_url,
    }))
  }

  async getIssue(project: string, issueIid: number, signal?: AbortSignal): Promise<IssueDetail> {
    const data = await this.request<{
      iid: number
      title: string
      state: string
      labels: string[]
      created_at: string
      author: { username: string }
      description: string
      web_url: string
    }>(`/projects/${encodeURIComponent(project)}/issues/${issueIid}`, { signal })
    return {
      iid: data.iid,
      title: data.title,
      state: data.state,
      labels: data.labels ?? [],
      createdAt: data.created_at,
      author: data.author.username,
      description: data.description ?? '',
      webUrl: data.web_url,
    }
  }

  async createIssue(project: string, input: { title: string; description?: string; labels?: string[] }, signal?: AbortSignal): Promise<IssueWriteResult> {
    try {
      const data = await this.request<{ iid: number; web_url: string }>(
        `/projects/${encodeURIComponent(project)}/issues`,
        { method: 'POST', body: { title: input.title, description: input.description ?? '', labels: input.labels ?? [] }, signal },
      )
      return { ok: true, iid: data.iid, webUrl: data.web_url }
    } catch (error) {
      if (error instanceof GitlabError && (error.status === 400 || error.status === 422)) {
        return { ok: false, reason: 'Could not create the issue (validation failed).' }
      }
      throw error
    }
  }

  async commentOnIssue(project: string, issueIid: number, body: string, signal?: AbortSignal): Promise<IssueWriteResult> {
    try {
      const data = await this.request<{ id: number }>(
        `/projects/${encodeURIComponent(project)}/issues/${issueIid}/notes`,
        { method: 'POST', body: { body }, signal },
      )
      return { ok: true, webUrl: `${this.webUrl(project)}/-/issues/${issueIid}` }
    } catch (error) {
      if (error instanceof GitlabError && error.status === 404) {
        return { ok: false, reason: 'Issue not found.' }
      }
      throw error
    }
  }

  async updateIssue(project: string, issueIid: number, state: 'open' | 'close', signal?: AbortSignal): Promise<IssueWriteResult> {
    try {
      const data = await this.request<{ iid: number; state: string; web_url: string }>(
        `/projects/${encodeURIComponent(project)}/issues/${issueIid}`,
        { method: 'PUT', body: { state_event: state === 'open' ? 'reopen' : 'close' }, signal },
      )
      return { ok: true, iid: data.iid, webUrl: data.web_url }
    } catch (error) {
      if (error instanceof GitlabError && error.status === 404) {
        return { ok: false, reason: 'Issue not found.' }
      }
      throw error
    }
  }

  async listMrs(project: string, options: { state?: MrState; perPage?: number; signal?: AbortSignal } = {}): Promise<MrItem[]> {
    const params = new URLSearchParams({ state: options.state ?? 'opened', ...(options.perPage ? { per_page: String(options.perPage) } : {}) })
    const data = await this.request<Array<{
      iid: number
      title: string
      state: string
      draft: boolean
      author: { username: string }
      source_branch: string
      target_branch: string
      created_at: string
      has_conflicts: boolean
      web_url: string
    }>>(`/projects/${encodeURIComponent(project)}/merge_requests?${params}`, { signal: options.signal })
    return data.map(item => ({
      iid: item.iid,
      title: item.title,
      state: item.state,
      draft: item.draft,
      author: item.author.username,
      sourceBranch: item.source_branch,
      targetBranch: item.target_branch,
      createdAt: item.created_at,
      hasConflicts: item.has_conflicts,
      webUrl: item.web_url,
    }))
  }

  async getMr(project: string, mrIid: number, signal?: AbortSignal): Promise<MrDetail> {
    const data = await this.request<{
      iid: number
      title: string
      state: string
      draft: boolean
      author: { username: string }
      source_branch: string
      target_branch: string
      created_at: string
      has_conflicts: boolean
      description: string
      merge_status: string
      detailed_merge_status: string
      squash: boolean
      pipeline: { id: number; status: string; ref: string; web_url: string } | null
      web_url: string
    }>(`/projects/${encodeURIComponent(project)}/merge_requests/${mrIid}`, { signal })
    return {
      iid: data.iid,
      title: data.title,
      state: data.state,
      draft: data.draft,
      author: data.author.username,
      sourceBranch: data.source_branch,
      targetBranch: data.target_branch,
      createdAt: data.created_at,
      hasConflicts: data.has_conflicts,
      description: data.description ?? '',
      mergeStatus: data.merge_status,
      detailedMergeStatus: data.detailed_merge_status,
      squash: data.squash,
      pipeline: data.pipeline ? { id: data.pipeline.id, status: data.pipeline.status, ref: data.pipeline.ref, webUrl: data.pipeline.web_url } : null,
      webUrl: data.web_url,
    }
  }

  async getMrChanges(project: string, mrIid: number, signal?: AbortSignal): Promise<MrChanges> {
    const data = await this.request<{
      iid: number
      title: string
      changes: Array<{
        old_path: string
        new_path: string
        new_file: boolean
        deleted_file: boolean
        renamed_file: boolean
        diff: string
      }>
    }>(`/projects/${encodeURIComponent(project)}/merge_requests/${mrIid}/changes`, { signal })
    return {
      iid: data.iid,
      title: data.title,
      changes: (data.changes ?? []).map(change => ({
        oldPath: change.old_path,
        newPath: change.new_path,
        newFile: change.new_file,
        deletedFile: change.deleted_file,
        renamedFile: change.renamed_file,
        diff: change.diff,
      })),
    }
  }

  async listMrDiscussions(project: string, mrIid: number, options: { perPage?: number; signal?: AbortSignal } = {}): Promise<DiscussionItem[]> {
    const data = await this.request<Array<{
      id: string
      notes: Array<{
        id: number
        author: { username: string }
        created_at: string
        body: string
        resolvable: boolean
        resolved: boolean
      }>
    }>>(`/projects/${encodeURIComponent(project)}/merge_requests/${mrIid}/discussions?${this.pageParams(options.perPage)}`, { signal: options.signal })
    return data.map(discussion => ({
      id: discussion.id,
      notes: discussion.notes.map(note => ({
        id: note.id,
        author: note.author.username,
        createdAt: note.created_at,
        body: note.body,
        resolvable: note.resolvable,
        resolved: note.resolved,
      })),
    }))
  }

  async getMrApprovals(project: string, mrIid: number, signal?: AbortSignal): Promise<MrApprovals> {
    const data = await this.request<{
      approved: boolean
      approved_by: Array<{ user: { username: string } }>
      approvals_required: number
      approvals_left: number
      rules: Array<{
        name: string
        rule_type: string
        approvals_required: number
        approvals_left: number
        approved: boolean
        approved_by: Array<{ user: { username: string } }>
      }>
    }>(`/projects/${encodeURIComponent(project)}/merge_requests/${mrIid}/approvals`, { signal })
    return {
      approved: data.approved,
      approvedBy: (data.approved_by ?? []).map(item => item.user.username),
      approvalsRequired: data.approvals_required,
      approvalsLeft: data.approvals_left,
      rules: (data.rules ?? []).map(rule => ({
        name: rule.name,
        ruleType: rule.rule_type,
        approvalsRequired: rule.approvals_required,
        approvalsLeft: rule.approvals_left,
        approved: rule.approved,
        approvedBy: (rule.approved_by ?? []).map(item => item.user.username),
      })),
    }
  }

  async listMrApprovalRules(project: string, mrIid: number, signal?: AbortSignal): Promise<ApprovalRuleListResult> {
    try {
      const data = await this.request<Array<{
        id: number
        name: string
        rule_type: string
        approvals_required: number
        eligible_approvers?: Array<{ username: string }>
        applies_to_all_protected_branches?: boolean
      }>>(`/projects/${encodeURIComponent(project)}/merge_requests/${mrIid}/approval_rules`, { signal })
      return {
        found: true,
        authenticated: true,
        items: data.map(item => ({
          id: item.id,
          name: item.name,
          ruleType: item.rule_type,
          approvalsRequired: item.approvals_required,
          eligibleApprovers: (item.eligible_approvers ?? []).map(user => user.username),
          appliesToAllProtectedBranches: item.applies_to_all_protected_branches ?? false,
        })),
      }
    } catch (error) {
      if (error instanceof GitlabError && error.status === 404) {
        return { found: false, authenticated: true, items: [] }
      }
      throw error
    }
  }

  async createMrApprovalRule(project: string, mrIid: number, input: {
    name: string
    approvalsRequired?: number
    userIds?: number[]
    groupIds?: number[]
    appliesToAllProtectedBranches?: boolean
    signal?: AbortSignal
  }): Promise<ApprovalRuleWriteResult> {
    try {
      const data = await this.request<{ id: number; name: string }>(
        `/projects/${encodeURIComponent(project)}/merge_requests/${mrIid}/approval_rules`,
        {
          method: 'POST',
          body: {
            name: input.name,
            approvals_required: input.approvalsRequired ?? 1,
            user_ids: input.userIds ?? [],
            group_ids: input.groupIds ?? [],
            applies_to_all_protected_branches: input.appliesToAllProtectedBranches ?? false,
          },
          signal: input.signal,
        },
      )
      return { ok: true, id: data.id, name: data.name }
    } catch (error) {
      if (error instanceof GitlabError && (error.status === 400 || error.status === 404 || error.status === 409 || error.status === 422)) {
        return { ok: false, reason: 'Could not create the approval rule (MR not found or validation failed).' }
      }
      throw error
    }
  }

  async updateMrApprovalRule(project: string, mrIid: number, ruleId: number, input: {
    name?: string
    approvalsRequired?: number
    userIds?: number[]
    groupIds?: number[]
    appliesToAllProtectedBranches?: boolean
    signal?: AbortSignal
  }): Promise<ApprovalRuleWriteResult> {
    try {
      const body: Record<string, unknown> = {}
      if (input.name !== undefined) body.name = input.name
      if (input.approvalsRequired !== undefined) body.approvals_required = input.approvalsRequired
      if (input.userIds !== undefined) body.user_ids = input.userIds
      if (input.groupIds !== undefined) body.group_ids = input.groupIds
      if (input.appliesToAllProtectedBranches !== undefined) body.applies_to_all_protected_branches = input.appliesToAllProtectedBranches
      const data = await this.request<{ id: number; name: string }>(
        `/projects/${encodeURIComponent(project)}/merge_requests/${mrIid}/approval_rules/${ruleId}`,
        { method: 'PUT', body, signal: input.signal },
      )
      return { ok: true, id: data.id, name: data.name }
    } catch (error) {
      if (error instanceof GitlabError && (error.status === 400 || error.status === 404 || error.status === 422)) {
        return { ok: false, reason: 'Could not update the approval rule (not found or validation failed).' }
      }
      throw error
    }
  }

  async deleteMrApprovalRule(project: string, mrIid: number, ruleId: number, signal?: AbortSignal): Promise<ApprovalRuleWriteResult> {
    try {
      await this.request<unknown>(
        `/projects/${encodeURIComponent(project)}/merge_requests/${mrIid}/approval_rules/${ruleId}`,
        { method: 'DELETE', signal },
      )
      return { ok: true, id: ruleId }
    } catch (error) {
      if (error instanceof GitlabError && error.status === 404) {
        return { ok: false, reason: 'Approval rule not found.' }
      }
      throw error
    }
  }

  async listProtectedBranches(project: string, options: { perPage?: number; signal?: AbortSignal } = {}): Promise<ProtectedBranchItem[]> {
    const data = await this.request<Array<{
      id: number
      name: string
      push_access_levels?: Array<{ access_level_description?: string }>
      merge_access_levels?: Array<{ access_level_description?: string }>
      unprotect_access_levels?: Array<{ access_level_description?: string }>
      allow_force_push?: boolean
      code_owner_approval_required?: boolean
      inherited?: boolean
    }>>(`/projects/${encodeURIComponent(project)}/protected_branches?${this.pageParams(options.perPage)}`, { signal: options.signal })
    return data.map(item => ({
      id: item.id,
      name: item.name,
      pushAccess: accessDescriptions(item.push_access_levels),
      mergeAccess: accessDescriptions(item.merge_access_levels),
      unprotectAccess: accessDescriptions(item.unprotect_access_levels),
      allowForcePush: item.allow_force_push ?? false,
      codeOwnerApprovalRequired: item.code_owner_approval_required ?? false,
      inherited: item.inherited ?? false,
    }))
  }

  async protectBranch(project: string, input: {
    name: string
    pushAccess?: ProtectedBranchAccessInput
    mergeAccess?: ProtectedBranchAccessInput
    unprotectAccess?: ProtectedBranchAccessInput
    allowForcePush?: boolean
    codeOwnerApprovalRequired?: boolean
    signal?: AbortSignal
  }): Promise<ProtectedBranchWriteResult> {
    const pushAccess = protectedBranchAccessValue(input.pushAccess ?? 40)
    const mergeAccess = protectedBranchAccessValue(input.mergeAccess ?? 40)
    const unprotectAccess = protectedBranchAccessValue(input.unprotectAccess ?? 40)
    if (pushAccess === undefined || mergeAccess === undefined || unprotectAccess === undefined) {
      return { ok: false, name: input.name, reason: 'Invalid protected branch access level. Use no_access/developer/maintainer or 0/30/40.' }
    }
    try {
      const data = await this.request<{ id: number; name: string }>(
        `/projects/${encodeURIComponent(project)}/protected_branches`,
        {
          method: 'POST',
          body: {
            name: input.name,
            push_access_level: pushAccess,
            merge_access_level: mergeAccess,
            unprotect_access_level: unprotectAccess,
            allow_force_push: input.allowForcePush ?? false,
            code_owner_approval_required: input.codeOwnerApprovalRequired ?? false,
          },
          signal: input.signal,
        },
      )
      return { ok: true, name: data.name }
    } catch (error) {
      if (error instanceof GitlabError && (error.status === 400 || error.status === 404 || error.status === 409 || error.status === 422)) {
        return { ok: false, name: input.name, reason: 'Could not protect the branch (branch not found, already protected, or validation failed).' }
      }
      throw error
    }
  }

  async unprotectBranch(project: string, branch: string, signal?: AbortSignal): Promise<ProtectedBranchWriteResult> {
    try {
      await this.request<unknown>(
        `/projects/${encodeURIComponent(project)}/protected_branches/${encodeURIComponent(branch)}`,
        { method: 'DELETE', signal },
      )
      return { ok: true, name: branch }
    } catch (error) {
      if (error instanceof GitlabError && error.status === 404) {
        return { ok: false, name: branch, reason: 'Protected branch not found.' }
      }
      throw error
    }
  }

  async listPipelineSchedules(project: string, options: { active?: boolean; perPage?: number; signal?: AbortSignal } = {}): Promise<PipelineScheduleItem[]> {
    const params = new URLSearchParams({
      ...(options.active !== undefined ? { active: String(options.active) } : {}),
      ...(options.perPage ? { per_page: String(options.perPage) } : {}),
    })
    const data = await this.request<Array<{
      id: number
      description: string
      ref: string
      cron: string
      cron_timezone: string
      next_run_at: string | null
      active: boolean
      owner: { username: string } | null
      created_at: string
      updated_at: string
      last_pipeline: { id: number; status: string } | null
    }>>(`/projects/${encodeURIComponent(project)}/pipeline_schedules?${params}`, { signal: options.signal })
    return data.map(item => ({
      id: item.id,
      description: item.description,
      ref: item.ref,
      cron: item.cron,
      cronTimezone: item.cron_timezone,
      nextRunAt: item.next_run_at,
      active: item.active,
      owner: item.owner?.username ?? '',
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      lastPipeline: item.last_pipeline ? { id: item.last_pipeline.id, status: item.last_pipeline.status } : null,
    }))
  }

  async createPipelineSchedule(project: string, input: {
    description: string
    ref: string
    cron: string
    cronTimezone?: string
    active?: boolean
    signal?: AbortSignal
  }): Promise<PipelineScheduleWriteResult> {
    try {
      const data = await this.request<{ id: number; description: string }>(
        `/projects/${encodeURIComponent(project)}/pipeline_schedules`,
        {
          method: 'POST',
          body: {
            description: input.description,
            ref: input.ref,
            cron: input.cron,
            cron_timezone: input.cronTimezone ?? 'UTC',
            active: input.active ?? true,
          },
          signal: input.signal,
        },
      )
      return { ok: true, id: data.id, description: data.description }
    } catch (error) {
      if (error instanceof GitlabError && (error.status === 400 || error.status === 404 || error.status === 409 || error.status === 422)) {
        return { ok: false, reason: 'Could not create the pipeline schedule (ref not found, cron invalid, or project not found).' }
      }
      throw error
    }
  }

  async updatePipelineSchedule(project: string, scheduleId: number, input: {
    description?: string
    ref?: string
    cron?: string
    cronTimezone?: string
    active?: boolean
    signal?: AbortSignal
  }): Promise<PipelineScheduleWriteResult> {
    try {
      const body: Record<string, unknown> = {}
      if (input.description !== undefined) body.description = input.description
      if (input.ref !== undefined) body.ref = input.ref
      if (input.cron !== undefined) body.cron = input.cron
      if (input.cronTimezone !== undefined) body.cron_timezone = input.cronTimezone
      if (input.active !== undefined) body.active = input.active
      const data = await this.request<{ id: number; description: string }>(
        `/projects/${encodeURIComponent(project)}/pipeline_schedules/${scheduleId}`,
        { method: 'PUT', body, signal: input.signal },
      )
      return { ok: true, id: data.id, description: data.description }
    } catch (error) {
      if (error instanceof GitlabError && (error.status === 400 || error.status === 404 || error.status === 422)) {
        return { ok: false, reason: 'Could not update the pipeline schedule (not found or validation failed).' }
      }
      throw error
    }
  }

  async deletePipelineSchedule(project: string, scheduleId: number, signal?: AbortSignal): Promise<PipelineScheduleWriteResult> {
    try {
      await this.request<unknown>(
        `/projects/${encodeURIComponent(project)}/pipeline_schedules/${scheduleId}`,
        { method: 'DELETE', signal },
      )
      return { ok: true, id: scheduleId }
    } catch (error) {
      if (error instanceof GitlabError && error.status === 404) {
        return { ok: false, reason: 'Pipeline schedule not found.' }
      }
      throw error
    }
  }

  async replyToDiscussion(project: string, mrIid: number, discussionId: string, body: string, signal?: AbortSignal): Promise<DiscussionReplyResult> {
    try {
      const data = await this.request<{ id: number }>(
        `/projects/${encodeURIComponent(project)}/merge_requests/${mrIid}/discussions/${encodeURIComponent(discussionId)}/notes`,
        { method: 'POST', body: { body }, signal },
      )
      return { ok: true, noteId: data.id }
    } catch (error) {
      if (error instanceof GitlabError && error.status === 404) {
        return { ok: false, reason: 'Discussion thread not found.' }
      }
      throw error
    }
  }

  async resolveDiscussion(project: string, mrIid: number, discussionId: string, resolved: boolean, signal?: AbortSignal): Promise<DiscussionResolveResult> {
    try {
      await this.request<unknown>(
        `/projects/${encodeURIComponent(project)}/merge_requests/${mrIid}/discussions/${encodeURIComponent(discussionId)}`,
        { method: 'PUT', body: { resolved }, signal },
      )
      return { ok: true }
    } catch (error) {
      if (error instanceof GitlabError && error.status === 404) {
        return { ok: false, reason: 'Discussion thread not found.' }
      }
      throw error
    }
  }

  async listLabels(project: string, options: { perPage?: number; signal?: AbortSignal } = {}): Promise<LabelItem[]> {
    const data = await this.request<Array<{
      id: number
      name: string
      color: string
      description: string | null
    }>>(`/projects/${encodeURIComponent(project)}/labels?${this.pageParams(options.perPage)}`, { signal: options.signal })
    return data.map(item => ({ id: item.id, name: item.name, color: item.color, description: item.description }))
  }

  async listMilestones(project: string, options: { state?: 'active' | 'closed' | 'all'; perPage?: number; signal?: AbortSignal } = {}): Promise<MilestoneItem[]> {
    const params = new URLSearchParams({ state: options.state ?? 'active', ...(options.perPage ? { per_page: String(options.perPage) } : {}) })
    const data = await this.request<Array<{
      id: number
      iid: number
      title: string
      description: string | null
      state: string
      due_date: string | null
      start_date: string | null
      web_url: string
    }>>(`/projects/${encodeURIComponent(project)}/milestones?${params}`, { signal: options.signal })
    return data.map(item => ({
      id: item.id,
      iid: item.iid,
      title: item.title,
      description: item.description,
      state: item.state,
      dueDate: item.due_date,
      startDate: item.start_date,
      webUrl: item.web_url,
    }))
  }

  async listReleases(project: string, options: { perPage?: number; signal?: AbortSignal } = {}): Promise<ReleaseItem[]> {
    const data = await this.request<Array<{
      tag_name: string
      name: string
      description: string
      released_at: string
      author: { name: string }
      _links: { self: string } | null
    }>>(`/projects/${encodeURIComponent(project)}/releases?${this.pageParams(options.perPage)}`, { signal: options.signal })
    return data.map(item => ({
      tagName: item.tag_name,
      name: item.name ?? item.tag_name,
      description: item.description ?? '',
      releasedAt: item.released_at,
      author: item.author?.name ?? '',
      webUrl: item._links?.self ?? '',
    }))
  }

  async listEnvironments(project: string, options: { perPage?: number; signal?: AbortSignal } = {}): Promise<EnvironmentItem[]> {
    const data = await this.request<Array<{
      id: number
      name: string
      slug: string
      state: string
      external_url: string | null
    }>>(`/projects/${encodeURIComponent(project)}/environments?${this.pageParams(options.perPage)}`, { signal: options.signal })
    return data.map(item => ({
      id: item.id,
      name: item.name,
      slug: item.slug,
      state: item.state,
      externalUrl: item.external_url,
    }))
  }

  async listCommits(project: string, options: { ref?: string; author?: string; perPage?: number; signal?: AbortSignal } = {}): Promise<CommitItem[]> {
    const params = new URLSearchParams({ ...(options.ref ? { ref_name: options.ref } : {}), ...(options.author ? { author: options.author } : {}), ...(options.perPage ? { per_page: String(options.perPage) } : {}) })
    const data = await this.request<Array<{
      id: string
      title: string
      message: string
      author_name: string
      committed_date: string
      web_url: string
    }>>(`/projects/${encodeURIComponent(project)}/repository/commits?${params}`, { signal: options.signal })
    return data.map(item => ({
      sha: item.id.slice(0, 7),
      title: item.title,
      message: item.message,
      author: item.author_name,
      date: item.committed_date,
      webUrl: item.web_url,
    }))
  }

  async getFile(project: string, path: string, options: { ref?: string; signal?: AbortSignal } = {}): Promise<FileContent> {
    try {
      const query = new URLSearchParams({ ref: options.ref ?? 'HEAD' })
      const data = await this.request<{
        file_name: string
        file_path: string
        size: number
        encoding: string
        content: string
        web_url: string
      }>(`/projects/${encodeURIComponent(project)}/repository/files/${encodeURIComponent(path)}?${query}`, { signal: options.signal })
      const content = data.encoding === 'base64' ? Buffer.from(data.content, 'base64').toString('utf8') : data.content
      return { found: true, name: data.file_name, path: data.file_path, size: data.size, content, encoding: data.encoding, webUrl: data.web_url }
    } catch (error) {
      if (error instanceof GitlabError && error.status === 404) {
        return { found: false }
      }
      throw error
    }
  }

  async listBranches(project: string, options: { perPage?: number; signal?: AbortSignal } = {}): Promise<BranchItem[]> {
    const data = await this.request<Array<{ name: string; commit: { id: string } }>>(
      `/projects/${encodeURIComponent(project)}/repository/branches?${this.pageParams(options.perPage)}`,
      { signal: options.signal },
    )
    return data.map(item => ({ name: item.name, sha: item.commit.id.slice(0, 7) }))
  }

  async listPipelines(project: string, options: { ref?: string; status?: string; perPage?: number; signal?: AbortSignal } = {}): Promise<PipelineItem[]> {
    const params = new URLSearchParams({ ...(options.ref ? { ref: options.ref } : {}), ...(options.status ? { status: options.status } : {}), ...(options.perPage ? { per_page: String(options.perPage) } : {}) })
    const data = await this.request<Array<{
      id: number
      ref: string
      sha: string
      status: string
      created_at: string
      updated_at: string
      web_url: string
    }>>(`/projects/${encodeURIComponent(project)}/pipelines?${params}`, { signal: options.signal })
    return data.map(item => ({
      id: item.id,
      ref: item.ref,
      sha: item.sha.slice(0, 7),
      status: item.status,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      webUrl: item.web_url,
    }))
  }

  async getPipeline(project: string, pipelineId: number, signal?: AbortSignal): Promise<PipelineDetail> {
    const data = await this.request<{
      id: number
      ref: string
      sha: string
      status: string
      stages: string[]
      created_at: string
      updated_at: string
      web_url: string
    }>(`/projects/${encodeURIComponent(project)}/pipelines/${pipelineId}`, { signal })
    return {
      id: data.id,
      ref: data.ref,
      sha: data.sha.slice(0, 7),
      status: data.status,
      stages: data.stages ?? [],
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      webUrl: data.web_url,
    }
  }

  async getJobLog(project: string, jobId: number, signal?: AbortSignal): Promise<JobLog> {
    try {
      const content = await this.requestText(`/projects/${encodeURIComponent(project)}/jobs/${jobId}/trace`, { signal })
      return { found: true, content, webUrl: `${this.webUrl(project)}/-/jobs/${jobId}` }
    } catch (error) {
      if (error instanceof GitlabError && error.status === 404) {
        return { found: false }
      }
      throw error
    }
  }

  async searchCode(project: string, query: string, options: { ref?: string; perPage?: number; signal?: AbortSignal } = {}): Promise<CodeSearchResult> {
    const params = new URLSearchParams({ scope: 'blobs', search: query, ...(options.ref ? { ref: options.ref } : {}), ...(options.perPage ? { per_page: String(options.perPage) } : {}) })
    const data = await this.request<Array<{
      path: string
      data: string
      ref: string
      startline: number
    }>>(`/projects/${encodeURIComponent(project)}/search?${params}`, { signal: options.signal })
    return {
      authenticated: this.hasToken(),
      items: data.map(item => ({ path: item.path, data: item.data, ref: item.ref, startLine: item.startline })),
    }
  }

  async getCurrentUser(signal?: AbortSignal): Promise<UserInfo> {
    const data = await this.request<{ id: number; username: string; name: string; web_url: string }>('/user', { signal })
    return { id: data.id, username: data.username, name: data.name, webUrl: data.web_url }
  }

  async listTodos(options: { perPage?: number; signal?: AbortSignal } = {}): Promise<TodoItem[]> {
    const data = await this.request<Array<{
      id: number
      project: { path_with_namespace: string }
      target_type: string
      target: { iid: number; title: string; web_url: string }
      action_name: string
      body: string
      created_at: string
    }>>(`/todos?state=pending&${this.pageParams(options.perPage)}`, { signal: options.signal })
    return data.map(item => ({
      id: item.id,
      project: item.project.path_with_namespace,
      targetType: item.target_type,
      targetTitle: item.target.title,
      targetWebUrl: item.target.web_url,
      action: item.action_name,
      body: item.body,
      createdAt: item.created_at,
    }))
  }

  async createMr(project: string, input: { title: string; sourceBranch: string; targetBranch: string; description?: string; draft?: boolean }, signal?: AbortSignal): Promise<MrWriteResult> {
    try {
      const data = await this.request<{ iid: number; web_url: string }>(
        `/projects/${encodeURIComponent(project)}/merge_requests`,
        {
          method: 'POST',
          body: {
            source_branch: input.sourceBranch,
            target_branch: input.targetBranch,
            title: input.title,
            description: input.description ?? '',
            draft: input.draft ?? false,
          },
          signal,
        },
      )
      return { created: true, iid: data.iid, webUrl: data.web_url }
    } catch (error) {
      if (error instanceof GitlabError && (error.status === 400 || error.status === 409 || error.status === 422)) {
        return { created: false, reason: 'Could not create the merge request (branch missing, MR already exists, or validation failed).' }
      }
      throw error
    }
  }

  async commentMr(project: string, mrIid: number, body: string, signal?: AbortSignal): Promise<IssueWriteResult> {
    try {
      const data = await this.request<{ id: number }>(
        `/projects/${encodeURIComponent(project)}/merge_requests/${mrIid}/notes`,
        { method: 'POST', body: { body }, signal },
      )
      return { ok: true, webUrl: `${this.webUrl(project)}/-/merge_requests/${mrIid}` }
    } catch (error) {
      if (error instanceof GitlabError && error.status === 404) {
        return { ok: false, reason: 'Merge request not found.' }
      }
      throw error
    }
  }

  async approveMr(project: string, mrIid: number, signal?: AbortSignal): Promise<ApproveResult> {
    try {
      await this.request<unknown>(`/projects/${encodeURIComponent(project)}/merge_requests/${mrIid}/approve`, { method: 'POST', signal })
      return { ok: true }
    } catch (error) {
      if (error instanceof GitlabError && (error.status === 404 || error.status === 409)) {
        return { ok: false, reason: 'Merge request not found or already approved.' }
      }
      throw error
    }
  }

  async mergeMr(project: string, mrIid: number, options: { squash?: boolean; signal?: AbortSignal } = {}): Promise<MergeResult> {
    try {
      const data = await this.request<{ web_url: string }>(
        `/projects/${encodeURIComponent(project)}/merge_requests/${mrIid}/merge`,
        { method: 'PUT', body: { squash: options.squash ?? false }, signal: options.signal },
      )
      return { merged: true, webUrl: data.web_url }
    } catch (error) {
      if (error instanceof GitlabError && (error.status === 405 || error.status === 406 || error.status === 409)) {
        return { merged: false, reason: 'The merge request cannot be merged (conflicts, failing checks, or state changed).' }
      }
      throw error
    }
  }

  async triggerPipeline(project: string, ref: string, signal?: AbortSignal): Promise<PipelineTriggerResult> {
    try {
      const data = await this.request<{ id: number; status: string; web_url: string }>(
        `/projects/${encodeURIComponent(project)}/pipeline?ref=${encodeURIComponent(ref)}`,
        { method: 'POST', signal },
      )
      return { created: true, pipelineId: data.id, status: data.status, webUrl: data.web_url }
    } catch (error) {
      if (error instanceof GitlabError && error.status === 400) {
        return { created: false, reason: 'Could not trigger the pipeline (no CI configuration on this ref, or invalid ref).' }
      }
      throw error
    }
  }

  async createBranch(project: string, branch: string, ref: string, signal?: AbortSignal): Promise<BranchCreateResult> {
    try {
      await this.request<unknown>(
        `/projects/${encodeURIComponent(project)}/repository/branches`,
        { method: 'POST', body: { branch, ref }, signal },
      )
      return { ok: true, name: branch }
    } catch (error) {
      if (error instanceof GitlabError && error.status === 400) {
        return { ok: false, name: branch, reason: 'Branch already exists or the ref is invalid.' }
      }
      throw error
    }
  }

  async writeFile(project: string, path: string, content: string, options: { message: string; branch?: string; signal?: AbortSignal }): Promise<FileWriteResult> {
    try {
      const data = await this.request<{ id: string; short_id: string }>(
        `/projects/${encodeURIComponent(project)}/repository/commits`,
        {
          method: 'POST',
          body: {
            branch: options.branch,
            commit_message: options.message,
            actions: [{ action: 'update', file_path: path, content }],
          },
          signal: options.signal,
        },
      )
      return { ok: true, path, commitSha: data.short_id }
    } catch (error) {
      if (error instanceof GitlabError && (error.status === 400 || error.status === 422)) {
        return { ok: false, path, reason: 'Could not write the file (validation failed or the branch has conflicts).' }
      }
      throw error
    }
  }

  async createProject(input: {
    name: string
    path?: string
    namespaceId?: number
    visibility?: 'private' | 'internal' | 'public'
    description?: string
    initializeWithReadme?: boolean
    signal?: AbortSignal
  }): Promise<ProjectCreateResult> {
    try {
      const data = await this.request<{ id: number; path_with_namespace: string; web_url: string }>(
        '/projects',
        {
          method: 'POST',
          body: {
            name: input.name,
            path: input.path,
            namespace_id: input.namespaceId,
            visibility: input.visibility,
            description: input.description ?? '',
            initialize_with_readme: input.initializeWithReadme ?? false,
          },
          signal: input.signal,
        },
      )
      return { ok: true, id: data.id, pathWithNamespace: data.path_with_namespace, webUrl: data.web_url }
    } catch (error) {
      if (error instanceof GitlabError && (error.status === 400 || error.status === 422)) {
        return { ok: false, reason: 'Could not create the project (name taken or validation failed).' }
      }
      throw error
    }
  }

  async deleteProject(project: string, signal?: AbortSignal): Promise<ProjectDeleteResult> {
    try {
      await this.request<unknown>(`/projects/${encodeURIComponent(project)}`, { method: 'DELETE', signal })
      return { deleted: true }
    } catch (error) {
      if (error instanceof GitlabError && error.status === 404) {
        return { deleted: false, reason: 'Project not found.' }
      }
      throw error
    }
  }

  async addGroupMember(group: string, input: { user: string; accessLevel: AccessLevelInput; signal?: AbortSignal }): Promise<MemberWriteResult> {
    const accessLevel = accessLevelValue(input.accessLevel)
    if (accessLevel === undefined) {
      return { ok: false, reason: `Invalid access level "${input.accessLevel}". Use guest/reporter/developer/maintainer/owner or 10/20/30/40/50.` }
    }
    try {
      await this.request<unknown>(`/groups/${encodeURIComponent(group)}/members`, {
        method: 'POST',
        body: { user_id: input.user, access_level: accessLevel },
        signal: input.signal,
      })
      return { ok: true }
    } catch (error) {
      if (error instanceof GitlabError && (error.status === 400 || error.status === 404 || error.status === 409 || error.status === 422)) {
        return { ok: false, reason: 'Could not add the member (user not found, already a member, or validation failed).' }
      }
      throw error
    }
  }

  async updateGroupMember(group: string, input: { userId: number; accessLevel: AccessLevelInput; signal?: AbortSignal }): Promise<MemberWriteResult> {
    const accessLevel = accessLevelValue(input.accessLevel)
    if (accessLevel === undefined) {
      return { ok: false, reason: `Invalid access level "${input.accessLevel}". Use guest/reporter/developer/maintainer/owner or 10/20/30/40/50.` }
    }
    try {
      await this.request<unknown>(`/groups/${encodeURIComponent(group)}/members/${input.userId}`, {
        method: 'PUT',
        body: { access_level: accessLevel },
        signal: input.signal,
      })
      return { ok: true }
    } catch (error) {
      if (error instanceof GitlabError && (error.status === 400 || error.status === 404 || error.status === 422)) {
        return { ok: false, reason: 'Could not update the member (not found or validation failed).' }
      }
      throw error
    }
  }

  async removeGroupMember(group: string, userId: number, signal?: AbortSignal): Promise<MemberWriteResult> {
    try {
      await this.request<unknown>(`/groups/${encodeURIComponent(group)}/members/${userId}`, { method: 'DELETE', signal })
      return { ok: true }
    } catch (error) {
      if (error instanceof GitlabError && (error.status === 404)) {
        return { ok: false, reason: 'Member not found in this group.' }
      }
      throw error
    }
  }

  async addProjectMember(project: string, input: { user: string; accessLevel: AccessLevelInput; signal?: AbortSignal }): Promise<MemberWriteResult> {
    const accessLevel = accessLevelValue(input.accessLevel)
    if (accessLevel === undefined) {
      return { ok: false, reason: `Invalid access level "${input.accessLevel}". Use guest/reporter/developer/maintainer/owner or 10/20/30/40/50.` }
    }
    try {
      await this.request<unknown>(`/projects/${encodeURIComponent(project)}/members`, {
        method: 'POST',
        body: { user_id: input.user, access_level: accessLevel },
        signal: input.signal,
      })
      return { ok: true }
    } catch (error) {
      if (error instanceof GitlabError && (error.status === 400 || error.status === 404 || error.status === 409 || error.status === 422)) {
        return { ok: false, reason: 'Could not add the member (user not found, already a member, or validation failed).' }
      }
      throw error
    }
  }

  async updateProjectMember(project: string, input: { userId: number; accessLevel: AccessLevelInput; signal?: AbortSignal }): Promise<MemberWriteResult> {
    const accessLevel = accessLevelValue(input.accessLevel)
    if (accessLevel === undefined) {
      return { ok: false, reason: `Invalid access level "${input.accessLevel}". Use guest/reporter/developer/maintainer/owner or 10/20/30/40/50.` }
    }
    try {
      await this.request<unknown>(`/projects/${encodeURIComponent(project)}/members/${input.userId}`, {
        method: 'PUT',
        body: { access_level: accessLevel },
        signal: input.signal,
      })
      return { ok: true }
    } catch (error) {
      if (error instanceof GitlabError && (error.status === 400 || error.status === 404 || error.status === 422)) {
        return { ok: false, reason: 'Could not update the member (not found or validation failed).' }
      }
      throw error
    }
  }

  async removeProjectMember(project: string, userId: number, signal?: AbortSignal): Promise<MemberWriteResult> {
    try {
      await this.request<unknown>(`/projects/${encodeURIComponent(project)}/members/${userId}`, { method: 'DELETE', signal })
      return { ok: true }
    } catch (error) {
      if (error instanceof GitlabError && (error.status === 404)) {
        return { ok: false, reason: 'Member not found in this project.' }
      }
      throw error
    }
  }

  async createGroup(input: {
    name: string
    path?: string
    visibility?: 'private' | 'internal' | 'public'
    description?: string
    signal?: AbortSignal
  }): Promise<GroupCreateResult> {
    try {
      const data = await this.request<{ id: number; full_path: string; web_url: string }>(
        '/groups',
        {
          method: 'POST',
          body: {
            name: input.name,
            path: input.path,
            visibility: input.visibility,
            description: input.description ?? '',
          },
          signal: input.signal,
        },
      )
      return { ok: true, id: data.id, fullPath: data.full_path, webUrl: data.web_url }
    } catch (error) {
      if (error instanceof GitlabError && (error.status === 400 || error.status === 422)) {
        return { ok: false, reason: 'Could not create the group (path taken or validation failed).' }
      }
      throw error
    }
  }

  async deleteGroup(group: string, signal?: AbortSignal): Promise<GroupDeleteResult> {
    try {
      await this.request<unknown>(`/groups/${encodeURIComponent(group)}`, { method: 'DELETE', signal })
      return { deleted: true }
    } catch (error) {
      if (error instanceof GitlabError && error.status === 404) {
        return { deleted: false, reason: 'Group not found.' }
      }
      throw error
    }
  }

  async transferProject(project: string, namespace: string, signal?: AbortSignal): Promise<ProjectTransferResult> {
    try {
      const data = await this.request<{ path_with_namespace: string; web_url: string }>(
        `/projects/${encodeURIComponent(project)}/transfer`,
        { method: 'PUT', body: { namespace }, signal },
      )
      return { ok: true, pathWithNamespace: data.path_with_namespace, webUrl: data.web_url }
    } catch (error) {
      if (error instanceof GitlabError && (error.status === 400 || error.status === 404 || error.status === 422)) {
        return { ok: false, reason: 'Could not transfer the project (namespace invalid or project not found).' }
      }
      throw error
    }
  }

  async archiveProject(project: string, signal?: AbortSignal): Promise<ProjectArchiveResult> {
    try {
      const data = await this.request<{ archived: boolean }>(`/projects/${encodeURIComponent(project)}/archive`, { method: 'POST', signal })
      return { ok: true, archived: data.archived }
    } catch (error) {
      if (error instanceof GitlabError && error.status === 404) {
        return { ok: false, reason: 'Project not found.' }
      }
      throw error
    }
  }

  async unarchiveProject(project: string, signal?: AbortSignal): Promise<ProjectArchiveResult> {
    try {
      const data = await this.request<{ archived: boolean }>(`/projects/${encodeURIComponent(project)}/unarchive`, { method: 'POST', signal })
      return { ok: true, archived: data.archived }
    } catch (error) {
      if (error instanceof GitlabError && error.status === 404) {
        return { ok: false, reason: 'Project not found.' }
      }
      throw error
    }
  }

  async listProjectWebhooks(project: string, options: { perPage?: number; signal?: AbortSignal } = {}): Promise<WebhookListResult> {
    try {
      const data = await this.request<Array<{
        id: number
        url: string
        push_events: boolean
        merge_requests_events: boolean
        issues_events: boolean
        tag_push_events: boolean
        enable_ssl_verification: boolean
        created_at: string
      }>>(`/projects/${encodeURIComponent(project)}/hooks?${this.pageParams(options.perPage)}`, { signal: options.signal })
      return {
        found: true,
        items: data.map(item => ({
          id: item.id,
          url: item.url,
          pushEvents: item.push_events,
          mergeRequestEvents: item.merge_requests_events,
          issueEvents: item.issues_events,
          tagPushEvents: item.tag_push_events,
          enableSslVerification: item.enable_ssl_verification,
          createdAt: item.created_at,
        })),
      }
    } catch (error) {
      if (error instanceof GitlabError && error.status === 404) {
        return { found: false, items: [] }
      }
      throw error
    }
  }

  async createProjectWebhook(project: string, input: {
    url: string
    pushEvents?: boolean
    mergeRequestEvents?: boolean
    issueEvents?: boolean
    tagPushEvents?: boolean
    enableSslVerification?: boolean
    signal?: AbortSignal
  }): Promise<WebhookWriteResult> {
    try {
      const data = await this.request<{ id: number; url: string }>(
        `/projects/${encodeURIComponent(project)}/hooks`,
        {
          method: 'POST',
          body: {
            url: input.url,
            push_events: input.pushEvents,
            merge_requests_events: input.mergeRequestEvents,
            issues_events: input.issueEvents,
            tag_push_events: input.tagPushEvents,
            enable_ssl_verification: input.enableSslVerification,
          },
          signal: input.signal,
        },
      )
      return { ok: true, id: data.id, url: data.url }
    } catch (error) {
      if (error instanceof GitlabError && (error.status === 400 || error.status === 404 || error.status === 422)) {
        return { ok: false, reason: 'Could not create the webhook (invalid URL or project not found).' }
      }
      throw error
    }
  }

  async deleteProjectWebhook(project: string, hookId: number, signal?: AbortSignal): Promise<WebhookWriteResult> {
    try {
      await this.request<unknown>(`/projects/${encodeURIComponent(project)}/hooks/${hookId}`, { method: 'DELETE', signal })
      return { ok: true }
    } catch (error) {
      if (error instanceof GitlabError && error.status === 404) {
        return { ok: false, reason: 'Webhook not found.' }
      }
      throw error
    }
  }

  async listProjectVariables(project: string, options: { perPage?: number; signal?: AbortSignal } = {}): Promise<VariableListResult> {
    try {
      const data = await this.request<Array<{
        key: string
        variable_type: string
        protected: boolean
        masked: boolean
        environment_scope: string
      }>>(`/projects/${encodeURIComponent(project)}/variables?${this.pageParams(options.perPage)}`, { signal: options.signal })
      return {
        found: true,
        items: data.map(item => ({
          key: item.key,
          variableType: item.variable_type,
          protected: item.protected,
          masked: item.masked,
          environmentScope: item.environment_scope,
        })),
      }
    } catch (error) {
      if (error instanceof GitlabError && error.status === 404) {
        return { found: false, items: [] }
      }
      throw error
    }
  }

  async createProjectVariable(project: string, input: {
    key: string
    value: string
    variableType?: 'env_var' | 'file'
    protected?: boolean
    masked?: boolean
    environmentScope?: string
    signal?: AbortSignal
  }): Promise<VariableWriteResult> {
    try {
      await this.request<unknown>(
        `/projects/${encodeURIComponent(project)}/variables`,
        {
          method: 'POST',
          body: {
            key: input.key,
            value: input.value,
            variable_type: input.variableType,
            protected: input.protected,
            masked: input.masked,
            environment_scope: input.environmentScope,
          },
          signal: input.signal,
        },
      )
      return { ok: true, key: input.key }
    } catch (error) {
      if (error instanceof GitlabError && (error.status === 400 || error.status === 404 || error.status === 409 || error.status === 422)) {
        return { ok: false, reason: 'Could not create the variable (key exists, invalid value, or project not found).' }
      }
      throw error
    }
  }

  async updateProjectVariable(project: string, input: {
    key: string
    value: string
    variableType?: 'env_var' | 'file'
    protected?: boolean
    masked?: boolean
    environmentScope?: string
    signal?: AbortSignal
  }): Promise<VariableWriteResult> {
    try {
      await this.request<unknown>(
        `/projects/${encodeURIComponent(project)}/variables/${encodeURIComponent(input.key)}`,
        {
          method: 'PUT',
          body: {
            value: input.value,
            variable_type: input.variableType,
            protected: input.protected,
            masked: input.masked,
            environment_scope: input.environmentScope,
          },
          signal: input.signal,
        },
      )
      return { ok: true, key: input.key }
    } catch (error) {
      if (error instanceof GitlabError && (error.status === 400 || error.status === 404 || error.status === 422)) {
        return { ok: false, reason: 'Could not update the variable (not found or validation failed).' }
      }
      throw error
    }
  }

  async deleteProjectVariable(project: string, key: string, signal?: AbortSignal): Promise<VariableWriteResult> {
    try {
      await this.request<unknown>(`/projects/${encodeURIComponent(project)}/variables/${encodeURIComponent(key)}`, { method: 'DELETE', signal })
      return { ok: true }
    } catch (error) {
      if (error instanceof GitlabError && error.status === 404) {
        return { ok: false, reason: 'Variable not found.' }
      }
      throw error
    }
  }

  async listRunners(project: string, options: { perPage?: number; signal?: AbortSignal } = {}): Promise<RunnerItem[]> {
    const data = await this.request<Array<{
      id: number
      description: string | null
      ip_address: string | null
      active: boolean
      is_shared: boolean
      online: boolean
      status: string
      runner_type: string
      access_level: string | null
    }>>(`/projects/${encodeURIComponent(project)}/runners?${this.pageParams(options.perPage, 50)}`, { signal: options.signal })
    return data.map(item => ({
      id: item.id,
      description: item.description ?? '',
      ipAddress: item.ip_address,
      active: item.active,
      shared: item.is_shared ?? false,
      online: item.online ?? false,
      status: item.status ?? (item.online ? 'online' : 'offline'),
      runnerType: item.runner_type ?? null,
      accessLevel: item.access_level ?? null,
    }))
  }

  async enableProjectRunner(project: string, runnerId: number, signal?: AbortSignal): Promise<RunnerWriteResult> {
    try {
      const data = await this.request<{ id: number }>(
        `/projects/${encodeURIComponent(project)}/runners`,
        { method: 'POST', body: { runner_id: runnerId }, signal },
      )
      return { ok: true, id: data.id ?? runnerId }
    } catch (error) {
      if (error instanceof GitlabError && (error.status === 400 || error.status === 404 || error.status === 409 || error.status === 422)) {
        return { ok: false, id: runnerId, reason: 'Could not enable the runner for this project (not found or already enabled).' }
      }
      throw error
    }
  }

  async disableProjectRunner(project: string, runnerId: number, signal?: AbortSignal): Promise<RunnerWriteResult> {
    try {
      await this.request<unknown>(`/projects/${encodeURIComponent(project)}/runners/${runnerId}`, { method: 'DELETE', signal })
      return { ok: true, id: runnerId }
    } catch (error) {
      if (error instanceof GitlabError && error.status === 404) {
        return { ok: false, id: runnerId, reason: 'Runner is not assigned to this project.' }
      }
      throw error
    }
  }

  async deleteRunner(runnerId: number, signal?: AbortSignal): Promise<RunnerWriteResult> {
    try {
      await this.request<unknown>(`/runners/${runnerId}`, { method: 'DELETE', signal })
      return { ok: true, id: runnerId }
    } catch (error) {
      if (error instanceof GitlabError && error.status === 404) {
        return { ok: false, id: runnerId, reason: 'Runner not found.' }
      }
      throw error
    }
  }

  async listRegistryRepositories(project: string, options: { perPage?: number; signal?: AbortSignal } = {}): Promise<RegistryRepositoryItem[]> {
    const data = await this.request<Array<{
      id: number
      name: string
      path: string
      location: string
      tags_count: number
      created_at: string | null
    }>>(`/projects/${encodeURIComponent(project)}/registry/repositories?${this.pageParams(options.perPage, 50)}`, { signal: options.signal })
    return data.map(item => ({
      id: item.id,
      name: item.name,
      path: item.path,
      location: item.location,
      tagsCount: item.tags_count ?? 0,
      createdAt: item.created_at,
    }))
  }

  async listRegistryTags(project: string, repositoryId: number, options: { perPage?: number; signal?: AbortSignal } = {}): Promise<RegistryTagItem[]> {
    const data = await this.request<Array<{
      name: string
      location: string
      revision: string | null
      short_revision: string | null
      digest: string | null
      created_at: string | null
      total_size: number | null
    }>>(`/projects/${encodeURIComponent(project)}/registry/repositories/${repositoryId}/tags?${this.pageParams(options.perPage, 50)}`, { signal: options.signal })
    return data.map(item => ({
      name: item.name,
      location: item.location,
      revision: item.revision,
      shortRevision: item.short_revision,
      digest: item.digest,
      createdAt: item.created_at,
      totalSize: item.total_size,
    }))
  }

  async deleteRegistryRepository(project: string, repositoryId: number, signal?: AbortSignal): Promise<RegistryDeleteResult> {
    try {
      await this.request<unknown>(`/projects/${encodeURIComponent(project)}/registry/repositories/${repositoryId}`, { method: 'DELETE', signal })
      return { deleted: true }
    } catch (error) {
      if (error instanceof GitlabError && error.status === 404) {
        return { deleted: false, reason: 'Registry repository not found.' }
      }
      throw error
    }
  }

  async deleteRegistryTag(project: string, repositoryId: number, tag: string, signal?: AbortSignal): Promise<RegistryDeleteResult> {
    try {
      await this.request<unknown>(
        `/projects/${encodeURIComponent(project)}/registry/repositories/${repositoryId}/tags/${encodeURIComponent(tag)}`,
        { method: 'DELETE', signal },
      )
      return { deleted: true }
    } catch (error) {
      if (error instanceof GitlabError && error.status === 404) {
        return { deleted: false, reason: 'Registry repository or tag not found.' }
      }
      throw error
    }
  }

  async listRemoteMirrors(project: string, options: { perPage?: number; signal?: AbortSignal } = {}): Promise<RemoteMirrorListResult> {
    try {
      const data = await this.request<Array<{
        id: number
        enabled: boolean
        keep_divergent_refs: boolean
        update_status: string
        last_successful_update_at: string | null
        last_error: string | null
        only_protected_branches: boolean
      }>>(`/projects/${encodeURIComponent(project)}/remote_mirrors?${this.pageParams(options.perPage, 50)}`, { signal: options.signal })
      return {
        found: true,
        items: data.map(item => ({
          id: item.id,
          enabled: item.enabled,
          keepDivergentRefs: item.keep_divergent_refs,
          updateStatus: item.update_status,
          lastSuccessfulUpdateAt: item.last_successful_update_at,
          lastError: item.last_error,
          onlyProtectedBranches: item.only_protected_branches,
        })),
      }
    } catch (error) {
      if (error instanceof GitlabError && error.status === 404) {
        return { found: false, items: [] }
      }
      throw error
    }
  }

  async createRemoteMirror(project: string, input: {
    url: string
    enabled?: boolean
    keepDivergentRefs?: boolean
    onlyProtectedBranches?: boolean
    signal?: AbortSignal
  }): Promise<RemoteMirrorWriteResult> {
    try {
      const data = await this.request<{ id: number; enabled: boolean }>(
        `/projects/${encodeURIComponent(project)}/remote_mirrors`,
        {
          method: 'POST',
          body: {
            url: input.url,
            enabled: input.enabled ?? true,
            keep_divergent_refs: input.keepDivergentRefs ?? false,
            only_protected_branches: input.onlyProtectedBranches ?? false,
          },
          signal: input.signal,
        },
      )
      return { ok: true, id: data.id, enabled: data.enabled }
    } catch (error) {
      if (error instanceof GitlabError && (error.status === 400 || error.status === 404 || error.status === 409 || error.status === 422)) {
        return { ok: false, reason: 'Could not create the remote mirror (invalid URL, project not found, or validation failed).' }
      }
      throw error
    }
  }

  async startProjectExport(project: string, options: { description?: string; signal?: AbortSignal } = {}): Promise<ProjectExportStartResult> {
    try {
      const data = await this.request<{ message?: string; export_status?: string }>(
        `/projects/${encodeURIComponent(project)}/export`,
        {
          method: 'POST',
          body: options.description ? { description: options.description } : undefined,
          signal: options.signal,
        },
      )
      return { ok: true, exportStatus: data.export_status ?? 'started' }
    } catch (error) {
      if (error instanceof GitlabError && (error.status === 400 || error.status === 404 || error.status === 422)) {
        return { ok: false, reason: 'Could not start the project export (project not found or export is invalid).' }
      }
      throw error
    }
  }

  async getProjectExportStatus(project: string, signal?: AbortSignal): Promise<ProjectExportStatusResult> {
    try {
      const data = await this.request<{
        export_status: string
        finished_at: string | null
        message: string | null
      }>(`/projects/${encodeURIComponent(project)}/export/status`, { signal })
      return { found: true, exportStatus: data.export_status, finishedAt: data.finished_at, message: data.message }
    } catch (error) {
      if (error instanceof GitlabError && error.status === 404) {
        return { found: false }
      }
      throw error
    }
  }
}
