// 与 Go 服务端对应的 API 数据类型
export type BookStatus = 'draft' | 'published' | 'archived'
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
  view_count: number
  order_col: string
  order_dir: 'asc' | 'desc'
  chapter_prefix: string
  chapter_count?: number
  watermark_enabled: boolean
  watermark_text: string
  user?: Pick<User, 'id' | 'username' | 'avatar' | 'email' | 'bio' | 'github_url' | 'role'>
  tags?: Tag[]
  created_at: string
  updated_at: string
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
  status: BookStatus
  allow_comments?: boolean | null
  created_at: string
  updated_at: string
  children?: Document[]
}

export interface SiteConfig {
  site_name?: string
  site_description?: string
  version?: string
  installation_date?: string
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
