package app

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"infosphere/server/internal/jobqueue"
)

const emailSendJobType = "email.send"

type emailSendJob struct {
	To      string `json:"to"`
	Subject string `json:"subject"`
	HTML    string `json:"html"`
}

func (a *App) configureJobQueue() error {
	queue, err := jobqueue.New(a.DB, a.Config.Secret)
	if err != nil {
		return err
	}
	queue.Register(emailSendJobType, func(_ context.Context, raw json.RawMessage) error {
		var job emailSendJob
		if err := json.Unmarshal(raw, &job); err != nil {
			return fmt.Errorf("解析邮件任务失败: %w", err)
		}
		if job.To == "" || job.Subject == "" || job.HTML == "" {
			return fmt.Errorf("邮件任务缺少必要字段")
		}
		return a.mailSender().Send(job.To, job.Subject, job.HTML)
	})
	a.jobsMu.Lock()
	a.Jobs = queue
	a.jobsMu.Unlock()
	return nil
}

func (a *App) jobQueue() *jobqueue.Queue {
	a.jobsMu.RLock()
	defer a.jobsMu.RUnlock()
	return a.Jobs
}

// startJobSupervisor 同时覆盖“启动时已安装”和“安装向导在当前进程内完成”两种情况。
// 队列实例发生变化时停止旧 worker，再启动新 worker。
func (a *App) startJobSupervisor(ctx context.Context) {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	var active *jobqueue.Queue
	var cancel context.CancelFunc
	for {
		queue := a.jobQueue()
		if queue != nil && queue != active {
			if cancel != nil {
				cancel()
			}
			workerCtx, workerCancel := context.WithCancel(ctx)
			cancel = workerCancel
			active = queue
			go queue.Start(workerCtx)
		}
		select {
		case <-ctx.Done():
			if cancel != nil {
				cancel()
			}
			return
		case <-ticker.C:
		}
	}
}

// enqueueEmail 在生产应用中写入持久化队列。测试或安装后尚未重启的极短窗口内
// 若队列未初始化，则回退到同步发送，保证邮件能力不会静默丢失。
func (a *App) enqueueEmail(ctx context.Context, to, subject, html string) error {
	queue := a.jobQueue()
	if queue == nil {
		return a.mailSender().Send(to, subject, html)
	}
	_, err := queue.Enqueue(ctx, emailSendJobType, emailSendJob{To: to, Subject: subject, HTML: html}, 5)
	return err
}
