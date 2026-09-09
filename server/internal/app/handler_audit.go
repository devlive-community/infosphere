package app

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"infosphere/server/internal/models"

	"github.com/gin-gonic/gin"
)

type auditLogItem struct {
	ID            uint           `json:"id"`
	ActorID       uint           `json:"actor_id"`
	ActorUsername string         `json:"actor_username"`
	Action        string         `json:"action"`
	ResourceType  string         `json:"resource_type"`
	ResourceID    string         `json:"resource_id"`
	ResourceLabel string         `json:"resource_label"`
	Summary       map[string]any `json:"summary"`
	CreatedAt     time.Time      `json:"created_at"`
}

// recordAudit 在业务操作成功后写入脱敏摘要。审计写入失败不能伪装成业务失败，统一记服务日志。
func (a *App) recordAudit(c *gin.Context, action, resourceType, resourceID, label string, summary map[string]any) {
	u := currentUser(c)
	if u == nil || !IsAdmin(u) {
		return
	}
	raw, err := json.Marshal(summary)
	if err != nil {
		log.Printf("audit marshal failed action=%s resource=%s/%s: %v", action, resourceType, resourceID, err)
		return
	}
	entry := models.AuditLog{
		ActorID: u.ID, ActorUsername: u.Username, Action: action,
		ResourceType: resourceType, ResourceID: resourceID,
		ResourceLabel: label, Summary: string(raw), CreatedAt: currentTime(),
	}
	if err := a.DB.Create(&entry).Error; err != nil {
		log.Printf("audit write failed action=%s resource=%s/%s: %v", action, resourceType, resourceID, err)
	}
}

func changedFields(fields ...string) map[string]any {
	return map[string]any{"changed_fields": fields}
}

func parseAuditDate(raw string, endOfDay bool) (time.Time, error) {
	value, err := time.ParseInLocation("2006-01-02", raw, time.Local)
	if err != nil {
		return time.Time{}, err
	}
	if endOfDay {
		value = value.AddDate(0, 0, 1)
	}
	return value, nil
}

// AdminListAuditLogs GET /admin/audit-logs 管理员分页查询审计日志。
func (a *App) AdminListAuditLogs(c *gin.Context) {
	page, pageSize := paginate(c)
	query := a.DB.Model(&models.AuditLog{})
	if actor := strings.TrimSpace(c.Query("actor")); actor != "" {
		query = query.Where("actor_username LIKE ?", "%"+actor+"%")
	}
	if action := strings.TrimSpace(c.Query("action")); action != "" {
		query = query.Where("action = ?", action)
	}
	if resourceType := strings.TrimSpace(c.Query("resource_type")); resourceType != "" {
		query = query.Where("resource_type = ?", resourceType)
	}
	if raw := strings.TrimSpace(c.Query("from")); raw != "" {
		from, err := parseAuditDate(raw, false)
		if err != nil {
			fail(c, http.StatusBadRequest, "开始日期格式应为 YYYY-MM-DD")
			return
		}
		query = query.Where("created_at >= ?", from)
	}
	if raw := strings.TrimSpace(c.Query("to")); raw != "" {
		to, err := parseAuditDate(raw, true)
		if err != nil {
			fail(c, http.StatusBadRequest, "结束日期格式应为 YYYY-MM-DD")
			return
		}
		query = query.Where("created_at < ?", to)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询审计日志失败")
		return
	}
	rows := []models.AuditLog{}
	if err := query.Order("created_at DESC, id DESC").Limit(pageSize).Offset((page - 1) * pageSize).Find(&rows).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询审计日志失败")
		return
	}
	items := make([]auditLogItem, 0, len(rows))
	for _, row := range rows {
		summary := map[string]any{}
		_ = json.Unmarshal([]byte(row.Summary), &summary)
		items = append(items, auditLogItem{
			ID: row.ID, ActorID: row.ActorID, ActorUsername: row.ActorUsername,
			Action: row.Action, ResourceType: row.ResourceType, ResourceID: row.ResourceID,
			ResourceLabel: row.ResourceLabel, Summary: summary, CreatedAt: row.CreatedAt,
		})
	}
	ok(c, PageResult{Items: items, Total: total, Page: page, PageSize: pageSize})
}

func auditID(id uint) string { return strconv.FormatUint(uint64(id), 10) }
