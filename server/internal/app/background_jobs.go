package app

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"infosphere/server/internal/config"
	"infosphere/server/internal/jobqueue"
	"infosphere/server/internal/models"
)

const (
	emailSendJobType = "email.send"
	pdfImportJobType = "content.import.pdf"
)

type emailSendJob struct {
	To      string `json:"to"`
	Subject string `json:"subject"`
	HTML    string `json:"html"`
}

type pdfImportJob struct {
	UserID     uint   `json:"user_id"`
	BookID     uint   `json:"book_id,omitempty"`
	Mode       string `json:"mode,omitempty"`
	SourcePath string `json:"source_path"`
	Filename   string `json:"filename"`
	Title      string `json:"title,omitempty"`
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
	queue.RegisterResult(pdfImportJobType, a.runPDFImportJob)
	a.jobsMu.Lock()
	a.Jobs = queue
	a.jobsMu.Unlock()
	return nil
}

func (a *App) runPDFImportJob(_ context.Context, raw json.RawMessage) (any, error) {
	var job pdfImportJob
	if err := json.Unmarshal(raw, &job); err != nil {
		return nil, fmt.Errorf("解析 PDF 导入任务失败: %w", err)
	}
	if job.UserID == 0 || strings.TrimSpace(job.SourcePath) == "" || strings.TrimSpace(job.Filename) == "" {
		return nil, fmt.Errorf("PDF 导入任务缺少必要字段")
	}
	root, err := filepath.Abs(filepath.Join(config.DataDir(), "import-jobs"))
	if err != nil {
		return nil, fmt.Errorf("解析导入目录失败: %w", err)
	}
	source, err := filepath.Abs(job.SourcePath)
	if err != nil {
		return nil, fmt.Errorf("解析 PDF 源文件路径失败: %w", err)
	}
	relative, err := filepath.Rel(root, source)
	if err != nil || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		return nil, fmt.Errorf("PDF 源文件路径无效")
	}
	var user models.User
	if err := a.DB.First(&user, job.UserID).Error; err != nil {
		return nil, fmt.Errorf("导入用户不存在")
	}
	upload, err := a.extractStoredPDF(storedPDF{Filename: job.Filename, Path: source})
	if err != nil {
		return nil, err
	}

	var result pdfImportResult
	if job.BookID == 0 {
		title := strings.TrimSpace(strings.TrimSuffix(job.Filename, filepath.Ext(job.Filename)))
		if strings.TrimSpace(job.Title) != "" {
			title = job.Title
		}
		title = truncateText(title, 255)
		chapters := splitPDFChapters(upload.Result.Markdown, title)
		book, createErr := a.createContentImportBook(&user, title, fmt.Sprintf("从 PDF 导入，共 %d 页。", upload.Result.Pages), chapters)
		if createErr != nil {
			return nil, fmt.Errorf("创建 PDF 书籍失败: %w", createErr)
		}
		result = pdfImportResult{Book: &book, BookID: book.ID, ImportedDoc: len(chapters), Pages: upload.Result.Pages, Source: "pdf", Message: fmt.Sprintf("导入完成：《%s》共 %d 个章节", book.Title, len(chapters))}
	} else {
		var book models.Book
		if err := a.DB.First(&book, job.BookID).Error; err != nil {
			return nil, fmt.Errorf("待重新导入的书籍不存在")
		}
		if !a.canManageBook(&user, &book) {
			return nil, fmt.Errorf("已无权重新导入这本书")
		}
		mode := strings.ToLower(strings.TrimSpace(job.Mode))
		if mode != "append" && mode != "replace" {
			return nil, fmt.Errorf("PDF 重新导入方式无效")
		}
		result, err = a.applyPDFReimport(&book, &user, upload, mode)
		if err != nil {
			return nil, fmt.Errorf("重新导入 PDF 失败: %w", err)
		}
	}
	if err := os.Remove(source); err != nil && !os.IsNotExist(err) {
		// 内容已经成功入库，清理失败不能触发任务重试，否则追加模式会重复写入章节。
		// import-jobs 目录中的遗留源文件由后续定期清理兜底。
		log.Printf("[jobs] cleanup PDF import source failed: %v", err)
	}
	return result, nil
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
