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
  nickname?: string
  website?: string
  location?: string
  company?: string
  is_active: boolean
  email_verified?: boolean
  invite_code?: string
  two_factor_enabled?: boolean
  deletion_requested_at?: string | null
  last_login_at: string | null
  created_at: string
  updated_at: string
}

export interface Tag {
  id: number
  name: string
  slug: string
  icon_type?: string
  icon_value?: string
  book_count?: number
}

export interface Book {
  id: number
  title: string
  description: string
  cover_image: string
  slug: string
  slug_editable?: boolean
  user_id: number
  status: BookStatus
  is_public: boolean
  login_required?: boolean
  view_count: number
  order_col: string
  order_dir: 'asc' | 'desc'
  chapter_prefix: string
  child_status_follow_parent?: boolean
  language?: string
  trans_group?: string
  version?: string
  version_group?: string
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
  icon?: string
  external_url?: string
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
  site_logo?: string
  site_favicon?: string
  site_keywords?: string
  site_footer_text?: string
  site_footer_links?: string
  site_beian?: string
  help_doc_url?: string
  terms_url?: string
  privacy_url?: string
  version?: string
  installation_date?: string
  comments_enabled?: string
  registration_require_email_activation?: string
  announcement_enabled?: string
  announcement_text?: string
  announcement_tone?: string
  translation_enabled?: boolean
  achievements_enabled?: string
  feature_plugins?: string[]
  collect_page_enabled?: boolean
  collect_site_enabled?: boolean
}

export type AchievementCategory = 'reading' | 'creation' | 'community' | 'account' | 'special'
export type AchievementStatus = 'draft' | 'active' | 'paused' | 'archived'
export type AchievementRarity = 'common' | 'rare' | 'epic' | 'legendary'

export interface AchievementAsset {
  id: number
  kind: 'image' | 'svg'
  url: string
  mime_type: string
  width: number
  height: number
}

export interface AchievementRule {
  id?: number
  achievement_id?: number
  metric_key: string
  operator: 'gte' | 'eq' | 'between'
  target_value: number
  target_max: number
  window_type: 'lifetime' | 'calendar_day' | 'calendar_week' | 'calendar_month' | 'rolling_days'
  window_value: number
  distinct_by: string
  filters: string | Record<string, unknown>
  sort_order?: number
}

export interface AchievementDefinition {
  translations?: Record<string, { fields: Record<string, string>; published?: Record<string, string>; revision: number; publish: boolean }>
  resolved_locale?: string
  id: number
  key: string
  name: string
  name_en: string
  description: string
  description_en: string
  locked_hint: string
  locked_hint_en: string
  category: AchievementCategory
  status: AchievementStatus
  rarity: AchievementRarity
  icon_type: 'fa' | 'image' | 'svg'
  icon_value: string
  asset_id: number | null
  asset?: AchievementAsset | null
  series_key: string
  tier: number
  reward_xp: number
  supersedes_previous: boolean
  rule_logic: 'all' | 'any'
  grant_mode: 'auto' | 'manual'
  visibility: 'public' | 'private' | 'hidden'
  progress_mode: 'aggregate' | 'primary' | 'hidden'
  active_from: string | null
  active_until: string | null
  version: number
  sort_order: number
  rules: AchievementRule[]
  created_at: string
  updated_at: string
}

export interface AchievementProgress {
  id: number
  current_value: number
  percent: number
  rule_values: string
  status: 'pending' | 'unlocked'
  last_evaluated_at: string
}

export interface AchievementGrant {
  id: number
  user_id: number
  achievement_id: number
  achievement?: AchievementDefinition
  source: 'auto' | 'manual'
  reason: string
  is_public: boolean
  showcase_order: number
  unlocked_at: string
  revoked_at?: string | null
}

export interface UserAchievementItem {
  definition: AchievementDefinition
  progress: AchievementProgress | null
  grant: AchievementGrant | null
  unlocked: boolean
}

export interface AchievementSettings {
  enabled: boolean
  public_profile_enabled: boolean
  notifications_enabled: boolean
  allow_user_hide: boolean
  showcase_limit: number
}

export interface AchievementMetric {
  key: string
  label: string
  category: AchievementCategory
  description: string
  aggregation: string
  unit: string
  windows: string[]
  allowed_filters: string[]
}

export interface BookReviewUser {
  id: number
  username: string
  avatar?: string
  role?: string
}

export interface BookReview {
  id: number
  user_id: number
  user: BookReviewUser
  rating: number
  content: string
  created_at: string
  updated_at: string
}

export interface BookReviewSummary {
  average: number
  count: number
  distribution: Record<string, number>
}

export interface FooterLink {
  label: string
  href: string
}

export interface FooterLinkGroup {
  title: string
  links: FooterLink[]
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
