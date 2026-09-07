package app

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"infosphere/server/internal/config"

	"github.com/gin-gonic/gin"
)

// 构建元数据，由 CI 通过 -ldflags 注入
var (
	BuildDate = "unknown"
	Commit    = "unknown"
)

// Health GET /health（无鉴权，供 nginx / CI 健康检查）
func (a *App) Health(c *gin.Context) {
	dbStatus := "down"
	if a.DB != nil {
		if sqlDB, err := a.DB.DB(); err == nil {
			if err := sqlDB.Ping(); err == nil {
				dbStatus = "up"
			}
		}
	}
	webStatus, nodeVersion := a.web.Status()
	c.JSON(http.StatusOK, gin.H{
		"status":     "ok",
		"db":         dbStatus,
		"installed":  a.Config.Installed,
		"version":    Version,
		"commit":     Commit,
		"build_date": BuildDate,
		"web":        webStatus,
		"node":       nodeVersion,
	})
}

// ---------- 在线升级 ----------

type releaseAsset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
}

type releaseInfo struct {
	TagName     string         `json:"tag_name"`
	Name        string         `json:"name"`
	HTMLURL     string         `json:"html_url"`
	PublishedAt string         `json:"published_at"`
	Assets      []releaseAsset `json:"assets"`
}

// upstreamRepo 升级源仓库
func upstreamRepo() string {
	if repo := os.Getenv("INFO_SPHERE_UPSTREAM_REPO"); repo != "" {
		return repo
	}
	return "devlive-community/infosphere"
}

var releaseCache struct {
	sync.Mutex
	info  *releaseInfo
	price time.Time
}

func (a *App) latestRelease() (*releaseInfo, error) {
	releaseCache.Lock()
	defer releaseCache.Unlock()
	if releaseCache.info != nil && time.Now().Before(releaseCache.price) {
		return releaseCache.info, nil
	}
	url := fmt.Sprintf("https://api.github.com/repos/%s/releases/latest", upstreamRepo())
	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GitHub API 返回 %d", resp.StatusCode)
	}
	var info releaseInfo
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return nil, err
	}
	releaseCache.info = &info
	releaseCache.price = time.Now().Add(10 * time.Minute)
	return &info, nil
}

var versionPattern = regexp.MustCompile(`^\d+(\.\d+)*$`)

// parseVersion 解析形如 2026.0.1 的版本号为整数切片
func parseVersion(v string) []int {
	v = strings.TrimPrefix(strings.TrimSpace(v), "v")
	if !versionPattern.MatchString(v) {
		return nil
	}
	parts := strings.Split(v, ".")
	nums := make([]int, len(parts))
	for i, p := range parts {
		n, err := strconv.Atoi(p)
		if err != nil {
			return nil
		}
		nums[i] = n
	}
	return nums
}

// versionLess 判断 a < b
func versionLess(a, b string) bool {
	pa, pb := parseVersion(a), parseVersion(b)
	if pa == nil || pb == nil {
		return false
	}
	for i := 0; i < len(pa) || i < len(pb); i++ {
		var na, nb int
		if i < len(pa) {
			na = pa[i]
		}
		if i < len(pb) {
			nb = pb[i]
		}
		if na != nb {
			return na < nb
		}
	}
	return false
}

// SystemVersion GET /system/version 当前版本与上游最新版本
func (a *App) SystemVersion(c *gin.Context) {
	resp := gin.H{
		"version":          Version,
		"commit":           Commit,
		"build_date":       BuildDate,
		"update_available": false,
		"latest":           nil,
	}
	if info, err := a.latestRelease(); err == nil && info.TagName != "" {
		latest := strings.TrimPrefix(info.TagName, "v")
		resp["latest"] = gin.H{
			"version":      latest,
			"url":          info.HTMLURL,
			"published_at": info.PublishedAt,
		}
		resp["update_available"] = versionLess(Version, latest)
	}
	ok(c, resp)
}

// SystemUpgrade POST /system/upgrade 管理员触发在线升级
func (a *App) SystemUpgrade(c *gin.Context) {
	if os.Getenv("INFO_SPHERE_UPGRADE") != "enabled" {
		fail(c, http.StatusBadRequest, "在线升级仅在 systemd 部署模式下启用（需设置 INFO_SPHERE_UPGRADE=enabled）")
		return
	}
	info, err := a.latestRelease()
	if err != nil {
		fail(c, http.StatusBadGateway, "获取最新版本失败: "+err.Error())
		return
	}
	if !versionLess(Version, strings.TrimPrefix(info.TagName, "v")) {
		fail(c, http.StatusBadRequest, "当前已是最新版本")
		return
	}

	serverAsset := findUpgradeAsset(info)
	if serverAsset == nil {
		fail(c, http.StatusNotFound, "最新版本未提供当前平台（"+runtime.GOOS+"/"+runtime.GOARCH+"）的升级包")
		return
	}

	workDir := filepath.Join(config.DataDir(), "upgrade")
	if err := os.MkdirAll(workDir, 0o755); err != nil {
		fail(c, http.StatusInternalServerError, "创建升级目录失败: "+err.Error())
		return
	}

	// 1. 下载并替换后端二进制
	newBin := filepath.Join(workDir, "infosphere-server.new")
	if err := downloadFile(serverAsset.BrowserDownloadURL, newBin); err != nil {
		fail(c, http.StatusBadGateway, "下载后端升级包失败: "+err.Error())
		return
	}
	if err := os.Chmod(newBin, 0o755); err != nil {
		fail(c, http.StatusInternalServerError, "设置执行权限失败: "+err.Error())
		return
	}
	expectedVersion := strings.TrimPrefix(info.TagName, "v")
	if out, err := exec.Command(newBin, "-version").Output(); err != nil || !strings.Contains(string(out), expectedVersion) {
		fail(c, http.StatusBadGateway, "升级包自检失败，已中止")
		return
	}

	self, err := os.Executable()
	if err != nil {
		fail(c, http.StatusInternalServerError, "定位自身二进制失败: "+err.Error())
		return
	}
	selfPath, _ := filepath.Abs(self)
	backup := selfPath + ".bak"
	if err := os.Rename(selfPath, backup); err != nil {
		fail(c, http.StatusInternalServerError, "备份当前版本失败: "+err.Error())
		return
	}
	if err := os.Rename(newBin, selfPath); err != nil {
		_ = os.Rename(backup, selfPath) // 回滚
		fail(c, http.StatusInternalServerError, "替换二进制失败: "+err.Error())
		return
	}

	// 2. 响应后延迟重启唯一的 InfoSphere 服务。新二进制已同时包含
	// Go API、Next.js standalone 与 Node.js 运行时。
	go func() {
		time.Sleep(2 * time.Second)
		_ = exec.Command("sudo", "systemctl", "restart", "infosphere-api").Run()
		_ = exec.Command("sudo", "systemctl", "restart", "infosphere.service").Run() // 单机模式兜底
	}()
	ok(c, gin.H{"message": "已升级到 " + strings.TrimPrefix(info.TagName, "v") + "，服务正在重启，页面稍后将自动刷新。"})
}

// findUpgradeAsset 在 Release 资产中定位包含 API 与 Web 运行时的当前平台单文件。
func findUpgradeAsset(info *releaseInfo) *releaseAsset {
	serverName := fmt.Sprintf("infosphere-server-%s-%s", runtime.GOOS, runtime.GOARCH)
	for i := range info.Assets {
		if info.Assets[i].Name == serverName {
			return &info.Assets[i]
		}
	}
	return nil
}

// downloadFile 流式下载文件
func downloadFile(url, dst string) error {
	client := &http.Client{Timeout: 10 * time.Minute}
	resp, err := client.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("下载返回 %d", resp.StatusCode)
	}
	tmp := dst + ".part"
	f, err := os.Create(tmp)
	if err != nil {
		return err
	}
	defer f.Close()
	if _, err := f.ReadFrom(resp.Body); err != nil {
		return err
	}
	return os.Rename(tmp, dst)
}
