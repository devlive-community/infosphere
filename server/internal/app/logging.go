package app

import (
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"knowforge/server/internal/config"
)

// 运行日志：按天生成文件（<log_dir>/knowforge-YYYY-MM-DD.log），可在系统设置中配置
// 是否启用、存放目录、日志等级、留存天数。等级用于本应用的分级日志助手（Debugf/Infof/…）；
// 标准库 log 的既有输出一并进入当天文件，便于排查。

const (
	logLevelDebug = 0
	logLevelInfo  = 1
	logLevelWarn  = 2
	logLevelError = 3
)

// dailyLogWriter 按天切换的日志文件 writer；写文件失败不影响主流程。
type dailyLogWriter struct {
	mu   sync.Mutex
	dir  string
	day  string
	file *os.File
}

func (w *dailyLogWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	today := time.Now().Format("2006-01-02")
	if today != w.day || w.file == nil {
		if w.file != nil {
			_ = w.file.Close()
		}
		if err := os.MkdirAll(w.dir, 0o755); err != nil {
			return len(p), nil
		}
		f, err := os.OpenFile(filepath.Join(w.dir, "knowforge-"+today+".log"), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
		if err != nil {
			return len(p), nil
		}
		w.file, w.day = f, today
	}
	return w.file.Write(p)
}

// logDir 解析日志目录：配置优先，缺省 <DATA>/logs。
func (a *App) logDir() string {
	if dir := strings.TrimSpace(a.getSetting("log_dir")); dir != "" {
		return dir
	}
	return filepath.Join(config.DataDir(), "logs")
}

func (a *App) logRetentionDays() int {
	n := atoiDefault(a.getSetting("log_retention_days"), 14)
	if n < 1 {
		n = 1
	}
	if n > 3650 {
		n = 3650
	}
	return n
}

// logLevelValue 当前日志等级阈值（低于该等级的分级日志被丢弃）。
func (a *App) logLevelValue() int {
	switch strings.ToLower(strings.TrimSpace(a.getSetting("log_level"))) {
	case "debug":
		return logLevelDebug
	case "warn", "warning":
		return logLevelWarn
	case "error":
		return logLevelError
	default:
		return logLevelInfo
	}
}

// initLogging 按配置把标准库日志同时写到当天文件（未安装或显式关闭则仅 stdout）。
func (a *App) initLogging() {
	if a.getSetting("log_enabled") == "false" {
		log.SetOutput(os.Stdout)
		a.logWriter = nil
		return
	}
	a.logWriter = &dailyLogWriter{dir: a.logDir()}
	log.SetOutput(io.MultiWriter(os.Stdout, a.logWriter))
}

func logLevelName(level int) string {
	switch level {
	case logLevelDebug:
		return "DEBUG"
	case logLevelWarn:
		return "WARN"
	case logLevelError:
		return "ERROR"
	default:
		return "INFO"
	}
}

// logAt 分级日志：低于配置等级则丢弃，否则带等级前缀写入（进而落当天文件）。
func (a *App) logAt(level int, format string, args ...any) {
	if level < a.logLevelValue() {
		return
	}
	log.Printf("["+logLevelName(level)+"] "+format, args...)
}

func (a *App) Debugf(format string, args ...any) { a.logAt(logLevelDebug, format, args...) }
func (a *App) Infof(format string, args ...any)  { a.logAt(logLevelInfo, format, args...) }
func (a *App) Warnf(format string, args ...any)  { a.logAt(logLevelWarn, format, args...) }
func (a *App) Errorf(format string, args ...any) { a.logAt(logLevelError, format, args...) }

// purgeOldLogs 清理超过留存天数的日志文件（按文件名日期，回退按修改时间），维护任务调用。
func (a *App) purgeOldLogs() {
	if a.getSetting("log_enabled") == "false" {
		return
	}
	dir := a.logDir()
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	cutoff := time.Now().AddDate(0, 0, -a.logRetentionDays())
	for _, e := range entries {
		if e.IsDir() || !strings.HasPrefix(e.Name(), "knowforge-") || !strings.HasSuffix(e.Name(), ".log") {
			continue
		}
		datePart := strings.TrimSuffix(strings.TrimPrefix(e.Name(), "knowforge-"), ".log")
		day, perr := time.Parse("2006-01-02", datePart)
		if perr != nil {
			if info, ierr := e.Info(); ierr == nil {
				day = info.ModTime()
			} else {
				continue
			}
		}
		if day.Before(cutoff) {
			_ = os.Remove(filepath.Join(dir, e.Name()))
		}
	}
}
