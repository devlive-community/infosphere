package app

import (
	"context"
	"net/http"
	"strings"

	"knowforge/server/internal/mail"
	"knowforge/server/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm/clause"
)

// 邮件通知：站内通知（评论/点赞/协作/审核/系统）可同时发邮件。
// 总开关 mail_notifications_enabled（管理员，邮件设置页），用户可逐类型关闭。

func (a *App) mailNotificationsEnabled() bool {
	return a.getSetting("mail_notifications_enabled") == "true"
}

// emailPrefFor 用户是否愿意接收该类型的邮件通知（无偏好记录=默认开启）。
func (a *App) emailPrefFor(u *models.User, ntype string) bool {
	var p models.UserNotificationPref
	if a.DB.Where("user_id = ?", u.ID).First(&p).Error != nil {
		return true // 无记录默认全开
	}
	switch ntype {
	case "comment":
		return p.Comment
	case "reaction":
		return p.Reaction
	case "collaboration":
		return p.Collaboration
	case "moderation":
		return p.Moderation
	case "system":
		return p.System
	case "achievement":
		return p.Achievement
	case "book_update":
		return p.BookUpdate
	case "growth":
		return p.Growth
	}
	return false
}

// maybeSendNotificationEmail 在 Notify 后按总开关与用户偏好决定是否发邮件。
func (a *App) maybeSendNotificationEmail(userID uint, ntype, title string, payload map[string]any) {
	if !a.mailNotificationsEnabled() {
		return
	}
	var u models.User
	if a.DB.First(&u, userID).Error != nil || u.Email == "" {
		return
	}
	if !a.emailPrefFor(&u, ntype) {
		return
	}
	link := ""
	if v, ok := payload["link"].(string); ok && v != "" {
		base := strings.TrimRight(a.getSetting("site_url"), "/")
		if strings.HasPrefix(v, "http") {
			link = v
		} else if base != "" {
			link = base + v
		}
	}
	siteName := strings.TrimSpace(a.getSetting("site_name"))
	if siteName == "" {
		siteName = "KnowForge"
	}
	subject := strings.NewReplacer("\r", " ", "\n", " ").Replace("[" + siteName + "] " + title)
	_ = a.enqueueEmail(context.Background(), u.Email, subject, mail.NotificationHTML(title, link, siteName))
}

// ---- 用户：通知偏好 ----

type notificationPrefs struct {
	Comment       bool `json:"comment"`
	Reaction      bool `json:"reaction"`
	Collaboration bool `json:"collaboration"`
	Moderation    bool `json:"moderation"`
	System        bool `json:"system"`
	Achievement   bool `json:"achievement"`
	BookUpdate    bool `json:"book_update"`
	Growth        bool `json:"growth"`
}

type notificationPrefsUpdate struct {
	Comment       bool  `json:"comment"`
	Reaction      bool  `json:"reaction"`
	Collaboration bool  `json:"collaboration"`
	Moderation    bool  `json:"moderation"`
	System        bool  `json:"system"`
	Achievement   *bool `json:"achievement"`
	BookUpdate    *bool `json:"book_update"`
	Growth        *bool `json:"growth"`
}

func prefsPayload(p models.UserNotificationPref) notificationPrefs {
	return notificationPrefs{
		Comment: p.Comment, Reaction: p.Reaction, Collaboration: p.Collaboration,
		Moderation: p.Moderation, System: p.System, Achievement: p.Achievement, BookUpdate: p.BookUpdate, Growth: p.Growth,
	}
}

// GetNotificationPrefs GET /auth/notification-prefs（含总开关，供前端提示）
func (a *App) GetNotificationPrefs(c *gin.Context) {
	u := currentUser(c)
	p := models.UserNotificationPref{UserID: u.ID, Comment: true, Reaction: true, Collaboration: true, Moderation: true, System: true, Achievement: true, BookUpdate: true, Growth: true}
	a.DB.Where("user_id = ?", u.ID).First(&p)
	ok(c, gin.H{
		"email_enabled": a.mailNotificationsEnabled(),
		"prefs":         prefsPayload(p),
	})
}

// UpdateNotificationPrefs PUT /auth/notification-prefs
func (a *App) UpdateNotificationPrefs(c *gin.Context) {
	u := currentUser(c)
	var req notificationPrefsUpdate
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	existing := models.UserNotificationPref{UserID: u.ID, Achievement: true, BookUpdate: true, Growth: true}
	a.DB.Where("user_id = ?", u.ID).First(&existing)
	achievement := existing.Achievement
	if req.Achievement != nil {
		achievement = *req.Achievement
	}
	bookUpdate := existing.BookUpdate
	if req.BookUpdate != nil {
		bookUpdate = *req.BookUpdate
	}
	growth := existing.Growth
	if req.Growth != nil {
		growth = *req.Growth
	}
	p := models.UserNotificationPref{
		UserID: u.ID, Comment: req.Comment, Reaction: req.Reaction,
		Collaboration: req.Collaboration, Moderation: req.Moderation, System: req.System,
		Achievement: achievement, BookUpdate: bookUpdate, Growth: growth,
	}
	a.DB.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "user_id"}}, UpdateAll: true}).Create(&p)
	ok(c, gin.H{"prefs": prefsPayload(p)})
}
