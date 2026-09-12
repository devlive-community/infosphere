// 与 Go 服务端对应的 API 数据类型
export type BookStatus = 'draft' | 'in_progress' | 'published' | 'completed' | 'archived'
export type DocumentStatus = 'draft' | 'published' | 'archived'
export type UserRole = 'admin' | 'user'

export interface User {
  id: number
  username: string
  email: string
  role: UserRole
  avatar: string
  bio: string
  github_url: string
  is_active: boolean
  email_verified?: boolean
  invite_code?: string
  two_factor_enabled?: boolean
  last_login_at: string | null
  created_at: string
  updated_at: string
}

export interface Tag {
  id: number
  name: string
  slug: string
  book_count?: number
}

export interface Book {
  id: number
  title: string
  description: string
  cover_image: string
  slug: string
  user_id: number
  status: BookStatus
  is_public: boolean
  login_required?: boolean
  view_count: number
  order_col: string
  order_dir: 'asc' | 'desc'
  chapter_prefix: string
  chapter_count?: number
  collaborator_role?: 'editor' | 'viewer'
  watermark_enabled: boolean
  watermark_text: string
  export_enabled?: boolean
  guest_export_enabled?: boolean
  export_style_shared?: boolean
  export_formats?: string
  user?: Pick<User, 'id' | 'username' | 'avatar' | 'email' | 'bio' | 'github_url' | 'role'>
  tags?: Tag[]
  created_at: string
  updated_at: string
}

export type CollaborationInvitationStatus = 'pending' | 'accepted' | 'rejected'

export interface CollaborationInvitation {
  id: number
  book_id: number
  book_title: string
  book_slug: string
  role: 'editor' | 'viewer'
  inviter_username: string
  created_at: string
}

export interface BookAccess {
  can_read: boolean
  can_manage: boolean
  can_edit_content: boolean
  can_export: boolean
  collaborator_role?: 'editor' | 'viewer'
}

export interface Document {
  id: number
  book_id: number
  parent_id: number | null
  title: string
  slug: string
  content: string
  user_id: number
  sort_order: number
  view_count?: number
  status: DocumentStatus
  allow_comments?: boolean | null
  created_at: string
  updated_at: string
  children?: Document[]
}

export type DocumentRevisionReason = 'create' | 'save' | 'publish' | 'pre_restore' | 'restore'

export interface DocumentRevisionSummary {
  id: number
  document_id: number
  book_id: number
  title: string
  content_length: number
  status: DocumentStatus
  allow_comments: boolean
  reason: DocumentRevisionReason
  author?: Pick<User, 'id' | 'username' | 'avatar'>
  created_at: string
}

export interface DocumentRevision extends DocumentRevisionSummary {
  content: string
}

export interface SiteConfig {
  site_name?: string
  site_description?: string
  version?: string
  installation_date?: string
  comments_enabled?: string
}

export interface SetupStatus {
  installed: boolean
  version: string
  db_types: ('sqlite' | 'mysql' | 'postgres')[]
  db_type?: string
  data_dir?: string
  sqlite_default_path?: string
}

export interface PageResult<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

export interface TrashItem {
  type: 'book' | 'document'
  id: number
  title: string
  slug: string
  book_id?: number
  book_title?: string
  book_slug?: string
  owner_username?: string
  descendant_count: number
  deleted_at: string
  expires_at: string
}

export interface SiteStats {
  user_count: number
  book_count: number
  document_count: number
  total_views: number
}

export interface DatabasePayload {
  type: 'sqlite' | 'mysql' | 'postgres'
  host?: string
  port?: number
  name?: string
  user?: string
  password?: string
  path?: string
}
