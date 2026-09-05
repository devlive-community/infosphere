package app

import (
	"fmt"
	"log"

	"infosphere/server/internal/config"
	"infosphere/server/internal/database"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// App 应用上下文：配置 + 数据库
type App struct {
	Config *config.Config
	DB     *gorm.DB
}

// New 创建应用实例；已安装时建立数据库连接
func New(cfg *config.Config) (*App, error) {
	a := &App{Config: cfg}
	if cfg.Installed {
		db, err := database.Open(cfg.Database)
		if err != nil {
			return nil, fmt.Errorf("打开数据库失败: %w", err)
		}
		if err := database.Ping(db); err != nil {
			return nil, fmt.Errorf("数据库连接失败: %w", err)
		}
		a.DB = db
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
