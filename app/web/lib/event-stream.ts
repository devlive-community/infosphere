import { API_BASE, api } from '@/lib/api'

// openTicketedStream 连接需要登录的事件流：先换取短时事件流凭证（POST /stream-tickets）再建立 EventSource，
// 登录令牌不出现在 URL 中。连接被拒或断开后浏览器放弃重连时（如凭证过期），换新凭证按退避重连；调用 stop 后不再重连。
// setup 在每次（重新）建立连接后调用，用于注册事件处理；返回的函数用于关闭。
export function openTicketedStream(path: string, setup: (source: EventSource, stop: () => void) => void): () => void {
  let stopped = false
  let source: EventSource | null = null
  let retry = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  const stop = () => {
    stopped = true
    if (timer) clearTimeout(timer)
    source?.close()
  }
  const schedule = () => {
    if (stopped) return
    source?.close()
    timer = setTimeout(() => void connect(), Math.min(30000, 1000 * 2 ** retry++))
  }
  const connect = async () => {
    if (stopped) return
    let ticket: string
    try {
      ticket = (await api<{ ticket: string }>('/stream-tickets', { method: 'POST' })).ticket
    } catch {
      schedule()
      return
    }
    if (stopped) return
    const es = new EventSource(`${API_BASE}/api/v1${path}${path.includes('?') ? '&' : '?'}ticket=${encodeURIComponent(ticket)}`)
    source = es
    es.addEventListener('open', () => { retry = 0 })
    es.addEventListener('error', () => { if (es.readyState === EventSource.CLOSED) schedule() })
    setup(es, stop)
  }
  void connect()
  return stop
}
