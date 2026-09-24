package qa

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"time"

	"knowforge/server/internal/ai"
	"knowforge/server/internal/models"
	"knowforge/server/internal/plugincore"
)

// 问答在后台生成：不受单个 HTTP 请求（及反向代理）超时约束，也不限制时长与轮数；
// 每一步写入调用链并经 SSE 推送给正在查看的读者（见 stream.go）；读者可取消。进程内登记进行中的问答，服务重启后遗留的进行中记录由巡检标记为中断。

var runningAsks sync.Map // 问答 ID → context.CancelFunc

// cancelAsk 取消进行中的问答，返回是否找到。
func cancelAsk(id uint) bool {
	if v, ok := runningAsks.Load(id); ok {
		v.(context.CancelFunc)()
		return true
	}
	return false
}

// startAsk 在后台生成回答（调用方标注随 ctx 传递，用于 AI 用量记录与每月额度）。
func (b *behavior) startAsk(rec Ask, u models.User, book models.Book, caller ai.Caller, topK int) {
	ctx, cancel := context.WithCancel(ai.WithCaller(context.Background(), caller))
	runningAsks.Store(rec.ID, cancel)
	go func() {
		defer func() {
			if r := recover(); r != nil {
				b.finishAsk(rec.ID, time.Now(), askFailed, answerResult{}, "回答生成出错，请重新提问")
			}
			runningAsks.Delete(rec.ID)
			cancel()
		}()
		b.runAsk(ctx, rec, &u, &book, topK)
	}()
}

func (b *behavior) runAsk(ctx context.Context, rec Ask, u *models.User, book *models.Book, topK int) {
	started := time.Now()
	db := b.core.Gorm()
	tr := newTracer(func(steps []TraceStep, t traceTotals) {
		elapsed := time.Since(started).Milliseconds()
		db.Model(&Ask{}).Where("id = ?", rec.ID).Updates(map[string]any{
			"trace": encodeTrace(steps), "calls": t.Calls, "input_tokens": t.InputTokens, "output_tokens": t.OutputTokens,
			"estimated": t.Estimated, "duration_ms": elapsed,
		})
		// 写库后再推送，保证订阅者读到的快照不会缺少已推送的步骤
		asksHub.publish(rec.ID, "step", stepEvent{Index: len(steps) - 1, Step: steps[len(steps)-1], Calls: t.Calls,
			InputTokens: t.InputTokens, OutputTokens: t.OutputTokens, Estimated: t.Estimated, DurationMs: elapsed})
	})
	if _, err := b.ensureIndex(ctx, book.ID); err != nil {
		status := askFailed
		if errors.Is(err, context.Canceled) {
			status = askCanceled
		}
		b.finishAsk(rec.ID, started, status, answerResult{}, "建立索引失败，请稍后再试")
		return
	}
	chunks := b.loadChunks(u, book)
	var (
		res answerResult
		err error
	)
	if rec.Mode == "agent" {
		res, err = b.answerAgent(ctx, tr, book, chunks, rec.Question, rec.Selection, rec.DocID)
	} else {
		res, err = b.answerRAG(ctx, tr, book, chunks, rec.Question, rec.Selection, rec.DocID, topK)
	}
	if err != nil {
		status := askFailed
		if errors.Is(err, context.Canceled) {
			status = askCanceled
		}
		b.finishAsk(rec.ID, started, status, res, userError(err))
		return
	}
	b.finishAsk(rec.ID, started, askDone, res, "")
}

func (b *behavior) finishAsk(id uint, started time.Time, status string, res answerResult, errMsg string) {
	cites := res.Citations
	if cites == nil {
		cites = []Citation{}
	}
	raw, _ := json.Marshal(cites)
	db := b.core.Gorm()
	db.Model(&Ask{}).Where("id = ?", id).Updates(map[string]any{
		"status": status, "answer": res.Answer, "citations": string(raw), "steps": res.Steps, "error": errMsg,
		"duration_ms": time.Since(started).Milliseconds(),
	})
	var final Ask
	if db.First(&final, id).Error == nil {
		asksHub.publish(id, "done", toAskView(final))
	}
}

// sweepInterruptedAsks 把不在本进程中运行的「进行中」问答标记为中断（服务重启等）。
// 只处理创建超过 30 秒的记录，避开刚创建、尚未登记的问答。
func sweepInterruptedAsks(core plugincore.Core) {
	db := core.Gorm()
	if !db.Migrator().HasTable(&Ask{}) {
		return
	}
	var ids []uint
	db.Model(&Ask{}).Where("status = ? AND created_at < ?", askRunning, time.Now().Add(-30*time.Second)).Pluck("id", &ids)
	for _, id := range ids {
		if _, live := runningAsks.Load(id); !live {
			db.Model(&Ask{}).Where("id = ? AND status = ?", id, askRunning).
				Updates(map[string]any{"status": askFailed, "error": "服务重启，回答已中断，请重新提问"})
		}
	}
}
