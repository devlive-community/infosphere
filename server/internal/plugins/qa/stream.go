package qa

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// 问答进度推送（SSE）：后台生成的每一步都推给正在查看的读者，不需要前端轮询。
// GET /qa/asks/:id/stream 先推 snapshot（当前完整记录），之后逐步推 step（新增的调用链步骤与合计），结束推 done（最终记录）。
// 内存 hub 与站内通知推送相同，适用于单实例部署；订阅者消费过慢时断开连接，EventSource 自动重连后重新获得 snapshot，不丢步骤。

const (
	streamBuffer    = 256
	streamHeartbeat = 25 * time.Second
)

type askEvent struct {
	name string // step | done
	data []byte
}

type askHub struct {
	mu   sync.Mutex
	subs map[uint]map[chan askEvent]struct{}
}

var asksHub = &askHub{subs: map[uint]map[chan askEvent]struct{}{}}

func (h *askHub) subscribe(id uint) chan askEvent {
	ch := make(chan askEvent, streamBuffer)
	h.mu.Lock()
	if h.subs[id] == nil {
		h.subs[id] = map[chan askEvent]struct{}{}
	}
	h.subs[id][ch] = struct{}{}
	h.mu.Unlock()
	return ch
}

func (h *askHub) unsubscribe(id uint, ch chan askEvent) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if _, ok := h.subs[id][ch]; ok {
		delete(h.subs[id], ch)
		close(ch)
	}
	if len(h.subs[id]) == 0 {
		delete(h.subs, id)
	}
}

// publish 非阻塞推送；缓冲已满的订阅者被断开（客户端重连后重新同步）。
func (h *askHub) publish(id uint, name string, payload any) {
	raw, err := json.Marshal(payload)
	if err != nil {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	for ch := range h.subs[id] {
		select {
		case ch <- askEvent{name: name, data: raw}:
		default:
			delete(h.subs[id], ch)
			close(ch)
		}
	}
}

// stepEvent 一个新增步骤及调用链合计（index 为该步骤在 trace 中的下标）。
type stepEvent struct {
	Index        int       `json:"index"`
	Step         TraceStep `json:"step"`
	Calls        int       `json:"calls"`
	InputTokens  int64     `json:"input_tokens"`
	OutputTokens int64     `json:"output_tokens"`
	Estimated    bool      `json:"estimated"`
	DurationMs   int64     `json:"duration_ms"`
}

func writeEvent(w gin.ResponseWriter, name string, data []byte) {
	fmt.Fprintf(w, "event: %s\ndata: %s\n\n", name, data)
	w.Flush()
}

// StreamAsk GET /qa/asks/:id/stream（?token= 鉴权）我的一条问答的实时进度。
func (b *behavior) StreamAsk(c *gin.Context) {
	userID := b.core.CurrentUser(c).ID
	load := func() (Ask, bool) {
		var rec Ask
		err := b.core.Gorm().Where("id = ? AND user_id = ?", c.Param("id"), userID).First(&rec).Error
		return rec, err == nil
	}
	rec, found := load()
	if !found {
		b.core.Fail(c, http.StatusNotFound, "记录不存在")
		return
	}
	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Header().Set("X-Accel-Buffering", "no")
	c.Writer.WriteHeader(http.StatusOK)

	// 先订阅再读快照：快照之后的步骤都会收到（快照前已包含的步骤由客户端按 index 去重）
	ch := asksHub.subscribe(rec.ID)
	defer asksHub.unsubscribe(rec.ID, ch)
	rec, _ = load()
	snapshot, _ := json.Marshal(toAskView(rec))
	writeEvent(c.Writer, "snapshot", snapshot)
	if rec.Status != askRunning {
		writeEvent(c.Writer, "done", snapshot)
		return
	}
	heartbeat := time.NewTicker(streamHeartbeat)
	defer heartbeat.Stop()
	for {
		select {
		case <-c.Request.Context().Done():
			return
		case ev, ok := <-ch:
			if !ok { // 消费过慢被断开：结束本次连接，客户端重连后重新同步
				return
			}
			writeEvent(c.Writer, ev.name, ev.data)
			if ev.name == "done" {
				return
			}
		case <-heartbeat.C:
			// 心跳，并兜底检查已结束但未收到推送的情况（如服务重启后被巡检标记中断）
			if latest, ok := load(); ok && latest.Status != askRunning {
				final, _ := json.Marshal(toAskView(latest))
				writeEvent(c.Writer, "done", final)
				return
			}
			fmt.Fprint(c.Writer, ": ping\n\n")
			c.Writer.Flush()
		}
	}
}
