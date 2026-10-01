export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: 'USER' | 'ADMIN';
  avatarUrl: string | null;
  emailVerifiedAt?: string | null;
  lastLoginAt?: string | null;
}

export type WorkspaceKind = 'PRIVATE' | 'PUBLIC';

export interface Workspace {
  id: string;
  name: string;
  ownerId: string;
  kind: WorkspaceKind;
  createdAt: string;
}

export interface DocNode {
  id: string;
  title: string;
  parentId: string | null;
  workspaceId: string;
  updatedAt: string;
  createdById?: string;
  createdBy?: UserSearchItem;
  workspace?: { id: string; name: string; ownerId: string; kind?: WorkspaceKind };
  isFavorite?: boolean;
  favoritedAt?: string;
  isFolder?: boolean;
}

export interface DocDetail extends DocNode {
  contentJson: string;
  isArchived: boolean;
  createdById: string;
}

export interface DocAccess {
  role: 'OWNER' | 'EDITOR' | 'VIEWER' | 'ADMIN';
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
  canInvite: boolean;
  isPublic: boolean;
}

export interface DocTreeResponse {
  workspaces: Workspace[];
  publicWorkspace: Workspace | null;
  mine: DocNode[];
  public: DocNode[];
  shared: DocNode[];
  favorites: DocNode[];
  counts?: Record<'mine' | 'public' | 'shared' | 'favorites', number>;
}

export interface NotificationItem {
  id: string;
  category: string;
  title: string;
  body: string | null;
  link: string | null;
  metaJson: string;
  readAt: string | null;
  createdAt: string;
}

export interface UserPreferences {
  theme: 'system' | 'light' | 'dark';
  themeColor: string;
  defaultHome: string;
  editorFontFamily: string | null;
  editorFontSize: number;
  autoSaveSeconds: number;
  notifyInApp: boolean;
  notifyEmail: boolean;
  calendarDefaultRemind: number;
  language: 'zh-CN' | 'en';
  mailListPageSize: number;
  mailSyncLimit: number;
}

export interface RecentItem {
  type: 'doc' | 'table' | 'event';
  id: string;
  title: string;
  updatedAt: string;
  meta?: Record<string, unknown>;
}

export interface DashboardSummary {
  todayEvents: CalendarEvent[];
  upcomingTodos: TodoItem[];
  recentDocs: DocNode[];
  favoriteDocs: DocNode[];
  unreadNotif: number;
  now: string;
}

export interface TableFormView {
  id: string;
  tableId: string;
  token: string;
  title: string;
  description: string | null;
  fieldsJson: string;
  requireLogin: boolean;
  closedAt: string | null;
  submissions: number;
  createdAt: string;
  updatedAt: string;
}

export interface PublicFormDetail {
  id: string;
  title: string;
  description: string | null;
  requireLogin: boolean;
  fields: {
    name: string;
    type: string;
    options: Record<string, unknown>;
    label: string;
    required: boolean;
  }[];
}

export interface CalendarEvent {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string;
  allDay: boolean;
  location: string | null;
  color: string | null;
  reminderMinutes: number | null;
  relatedTodoId: string | null;
  repeatRule: 'daily' | 'weekly' | 'monthly' | null;
  exceptionsJson?: string;
  sourceEventId?: string;
  occurrenceKey?: string;
  isOccurrence?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MailAccount {
  id: string;
  label: string;
  email: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  username: string;
  fromName: string | null;
  signature: string | null;
  isDefault: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
}

export interface MailMessageItem {
  id: string;
  uid: number;
  folder: string;
  subject: string | null;
  fromName: string | null;
  fromEmail: string | null;
  preview: string | null;
  receivedAt: string;
  isRead: boolean;
  isFlagged: boolean;
}

export interface MailMessageDetail extends MailMessageItem {
  textBody: string | null;
  htmlBody: string | null;
  toJson: string;
  ccJson: string;
  to: { name?: string; address: string }[];
  cc: { name?: string; address: string }[];
  account: { id: string; email: string; label: string };
}

export interface TodoItem {
  id: string;
  title: string;
  dueDate: string | null;
  completedAt: string | null;
  order: number;
  createdAt: string;
}

export interface TodoProgress {
  completed: number;
  total: number;
  percent: number;
}

export interface TableField {
  id: string;
  name: string;
  type: string;
  options: Record<string, unknown>;
  order: number;
}

export interface TableRecord {
  id: string;
  data: Record<string, unknown>;
  order: number;
}

export interface TableBase {
  id: string;
  workspaceId: string;
  name: string;
  templateKey: string | null;
  updatedAt: string;
}

export interface TableTemplate {
  key: string;
  name: string;
  description: string;
  fields: { name: string; type: string; options?: Record<string, unknown> }[];
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: 'USER' | 'ADMIN';
  status: 'ACTIVE' | 'DISABLED';
  avatarUrl: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  emailVerifiedAt: string | null;
}

export interface ApiError {
  error: string;
  code?: string;
  details?: unknown;
}

export interface Attachment {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  category: string;
  createdAt: string;
  url: string;
}

export interface UserAvatar {
  id: string;
  url: string;
  createdAt: string;
}

export interface UserSearchItem {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

export interface Collaborator {
  id: string;
  role: 'VIEWER' | 'EDITOR';
  user: UserSearchItem;
  createdAt: string;
}

export interface ShareLink {
  id: string;
  token: string;
  resourceType: 'doc' | 'table';
  resourceId: string;
  role: 'view' | 'edit';
  requireLogin: boolean;
  expiresAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

export interface DocumentVersion {
  id: string;
  documentId: string;
  title: string;
  contentJson: string;
  label: string | null;
  createdAt: string;
  author: UserSearchItem;
}

export interface DocumentComment {
  id: string;
  documentId: string;
  authorId: string;
  anchorId: string | null;
  anchorText: string | null;
  body: string;
  parentId: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  author: UserSearchItem;
}

export interface PresenceParticipant extends UserSearchItem {
  lastSeenAt: string;
}

export interface AuditLogItem {
  id: string;
  action: string;
  target: string;
  metaJson: string;
  createdAt: string;
  actor: { id: string; email: string; name: string };
}

export interface SystemSettings {
  allow_public_register: string;
  default_workspace_name: string;
  max_upload_mb: string;
  brand_name: string;
  company_name: string;
  oa_url: string;
  register_invite_code: string;
  [k: string]: string;
}

export interface AdminGroup {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  members: { id: string; user: UserSearchItem }[];
}

export interface AdminStats {
  userCount: number;
  docCount: number;
  tableCount: number;
  attachmentCount: number;
  attachmentTotalSize: number;
}

export interface AdminUpdateStatus {
  currentVersion: string;
  latestVersion: string;
  currentCommit?: string;
  latestCommit?: string;
  updateSource?: string;
  updateRepo?: string;
  updateBranch?: string;
  hasUpdate: boolean;
  autoUpdateConfigured: boolean;
  manualCommand: string;
  checkUrl?: string;
}
