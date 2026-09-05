package main

import (
	"flag"
	"fmt"
	"log"

	"infosphere/server/internal/app"
	"infosphere/server/internal/config"
)

func main() {
	port := flag.Int("port", 0, "服务监听端口")
	showVersion := flag.Bool("version", false, "打印版本信息后退出")
	flag.Parse()

	if *showVersion {
		fmt.Printf("infosphere %s (commit=%s built=%s)\n", app.Version, app.Commit, app.BuildDate)
		return
	}

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("读取配置失败: %v", err)
	}

	a, err := app.New(cfg)
	if err != nil {
		log.Fatalf("%v", err)
	}

	if !cfg.Installed {
		log.Println("InfoSphere 尚未安装，请访问 /install 进入安装向导")
	}

	listenPort := cfg.ListenPort(*port)
	if err := a.Run(listenPort); err != nil {
		log.Fatalf("服务启动失败: %v", err)
	}
}
