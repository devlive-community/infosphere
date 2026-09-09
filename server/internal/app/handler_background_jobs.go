package app

import (
	"net/http"
	"strconv"
	"strings"

	"infosphere/server/internal/jobqueue"
	"infosphere/server/internal/models"

	"github.com/gin-gonic/gin"
)

var backgroundJobStatuses = map[string]bool{
	jobqueue.StatusPending: true, jobqueue.StatusRunning: true, jobqueue.StatusRetrying: true,
	jobqueue.StatusSucceeded: true, jobqueue.StatusFailed: true,
}

// AdminListBackgroundJobs GET /admin/tasks 管理员分页查看任务状态；加密 payload 永不返回。
func (a *App) AdminListBackgroundJobs(c *gin.Context) {
	page, pageSize := paginate(c)
	query := a.DB.Model(&models.BackgroundJob{})
	if jobType := strings.TrimSpace(c.Query("type")); jobType != "" {
		query = query.Where("type = ?", jobType)
	}
	if status := strings.TrimSpace(c.Query("status")); status != "" {
		if !backgroundJobStatuses[status] {
			fail(c, http.StatusBadRequest, "任务状态无效")
			return
		}
		query = query.Where("status = ?", status)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询异步任务失败")
		return
	}
	items := []models.BackgroundJob{}
	if err := query.Order("created_at DESC, id DESC").Limit(pageSize).Offset((page - 1) * pageSize).Find(&items).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询异步任务失败")
		return
	}
	ok(c, PageResult{Items: items, Total: total, Page: page, PageSize: pageSize})
}

// AdminRetryBackgroundJob POST /admin/tasks/:id/retry 只允许重新排队最终失败的任务。
func (a *App) AdminRetryBackgroundJob(c *gin.Context) {
	id64, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id64 == 0 {
		fail(c, http.StatusBadRequest, "任务 ID 无效")
		return
	}
	queue := a.jobQueue()
	if queue == nil {
		fail(c, http.StatusServiceUnavailable, "异步任务服务尚未就绪")
		return
	}
	retried, err := queue.Retry(c.Request.Context(), uint(id64))
	if err != nil {
		fail(c, http.StatusInternalServerError, "重新排队失败")
		return
	}
	if !retried {
		fail(c, http.StatusConflict, "仅失败任务可以重新排队")
		return
	}
	a.recordAudit(c, "task.retried", "task", strconv.FormatUint(id64, 10), "异步任务", map[string]any{"task_id": id64})
	ok(c, gin.H{"id": id64, "status": jobqueue.StatusPending})
}
