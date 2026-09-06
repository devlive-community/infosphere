package app

import (
	"fmt"
	"log"

	"infosphere/server/internal/config"
	"infosphere/server/internal/database"
	"infosphere/server/internal/mail"
	"infosphere/server/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// App 应用上下文：配置 + 数据库 + 通知推送
type App struct {
	Config        *config.Config
	DB            *gorm.DB
	Notifications *notificationHub
	// MailSender 邮件发送器；为空时按站点配置解析（测试可注入替代实现）
	MailSender mail.Sender
}

// New 创建应用实例；已安装时建立数据库连接
func New(cfg *config.Config) (*App, error) {
	a := &App{Config: cfg, Notifications: newNotificationHub()}
	if cfg.Installed {
		db, err := database.Open(cfg.Database)
		if err != nil {
			return nil, fmt.Errorf("打开数据库失败: %w", err)
		}
		if err := database.Ping(db); err != nil {
			return nil, fmt.Errorf("数据库连接失败: %w", err)
		}
		// 已安装的库也要执行迁移：版本升级新增字段/表时自动补齐（幂等）
		if err := models.All(db); err != nil {
			return nil, fmt.Errorf("数据库迁移失败: %w", err)
		}
		a.DB = db
		// 版本变化时向管理员发送升级完成通知（首次安装时 version 刚写入，不会触发）
		a.NotifyAdminsOnUpgrade()
	}
	return a, nil
}

// Run 启动 HTTP 服务
func (a *App) Run(port int) error {
	gin.SetMode(gin.ReleaseMode)
	r := a.Router()
	addr := fmt.Sprintf(":%d", port)
	log.Printf("InfoSphere 服务已启动: http://localhost%s", addr)
	return r.Run(addr)
}
