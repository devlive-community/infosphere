package app

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/url"
	"os/signal"
	"syscall"
	"time"

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
	RateLimits    RateLimitStore
	// MailSender 邮件发送器；为空时按站点配置解析（测试可注入替代实现）
	MailSender mail.Sender
	// 导入解析器允许测试注入；生产为空时使用内置 PDF/网页实现。
	PDFExtractor func(path string) (pdfExtractResult, error)
	WebFetcher   func(context.Context, *url.URL) (webPage, error)
	WebRenderer  func(context.Context, *url.URL) (webPage, error)
	web          *webRuntime
}

// New 创建应用实例；已安装时建立数据库连接
func New(cfg *config.Config) (*App, error) {
	a := &App{Config: cfg, Notifications: newNotificationHub(), RateLimits: newMemoryRateLimitStore()}
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
	web, err := prepareWebRuntime(port)
	if err != nil {
		return err
	}
	a.web = web
	r := a.Router()
	addr := fmt.Sprintf(":%d", port)
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return err
	}
	server := &http.Server{Handler: r, ReadHeaderTimeout: 10 * time.Second}
	serveErr := make(chan error, 1)
	go func() { serveErr <- server.Serve(listener) }()

	if web != nil {
		if err := web.Start(port); err != nil {
			ctx, cancel := shutdownContext()
			defer cancel()
			_ = server.Shutdown(ctx)
			return err
		}
	}
	log.Printf("InfoSphere 服务已启动: http://localhost%s", addr)

	signalCtx, stopSignals := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stopSignals()
	select {
	case <-signalCtx.Done():
		ctx, cancel := shutdownContext()
		defer cancel()
		_ = server.Shutdown(ctx)
		web.Stop(ctx)
		return nil
	case err := <-serveErr:
		ctx, cancel := shutdownContext()
		defer cancel()
		web.Stop(ctx)
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	case <-web.Wait():
		ctx, cancel := shutdownContext()
		defer cancel()
		_ = server.Shutdown(ctx)
		if webErr := web.Err(); webErr != nil {
			return fmt.Errorf("内嵌 Next.js 已退出: %w", webErr)
		}
		return errors.New("内嵌 Next.js 意外退出")
	}
}
