/** 内容门禁给出的付费墙信息（付费内容插件，见服务端 paidcontent.gateDocument） */
export interface Paywall {
  locked: true
  book_id: number
  doc_id: number
  currency: string
  discount_percent: number
  book_price_cents: number
  book_final_cents: number
  chapter_price_cents: number
  chapter_final_cents: number
  free_tier: number
  logged_in: boolean
  upgrade_link: string
}

/** 书籍付费信息与当前读者的访问状态（GET /paid/books/:id） */
export interface PaidBookInfo {
  enabled: boolean
  currency: string
  book_price_cents: number
  book_final_cents: number
  chapter_price_cents: number
  free_chapters: number
  preview_percent: number
  free_tier: number
  discount_percent: number
  purchased_book: boolean
  can_read_all: boolean
  locked_doc_ids: number[]
  upgrade_link: string
  is_author: boolean
}
