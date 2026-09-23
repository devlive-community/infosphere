type TFn = (key: string, vars?: Record<string, string | number>) => string

// NotificationI18n 服务端可在通知 payload 中附带的多语言信息：key 为 i18n 键，params 为插值参数。
export interface NotificationI18n { key: string; params?: Record<string, string | number> }

export interface NotificationPayload { link?: string; i18n?: NotificationI18n }

// notificationTitle 通知标题：payload.i18n 有对应翻译时按当前界面语言渲染，否则回退服务端存储的标题
// （兼容旧通知与未提供多语言的通知来源）。
export function notificationTitle(n: { title: string; payload?: NotificationPayload | null }, t: TFn): string {
  const i18n = n.payload?.i18n
  if (i18n?.key) {
    const text = t(i18n.key, i18n.params)
    if (text !== i18n.key) return text
  }
  return n.title
}
