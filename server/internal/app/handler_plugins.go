package app

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"infosphere/server/internal/config"
	"infosphere/server/internal/models"

	"github.com/gin-gonic/gin"
)

// 插件系统：目前仅内置「PDF 导出」插件，安装时下载官方 chrome-headless-shell 到数据目录，
// 保持基础二进制/镜像轻量；未安装则 PDF 导出不可用。

const pluginPDFExport = "pdf-export"

type pluginInfo struct {
	Key         string `json:"key"`
	Name        string `json:"name"`
	Description string `json:"description"`
	SizeHint    string `json:"size_hint"`
}

// pluginRegistry 已知插件清单
var pluginRegistry = []pluginInfo{
	{
		Key:         pluginPDFExport,
		Name:        "PDF 导出",
		Description: "安装官方 chrome-headless-shell，用于将书籍渲染导出为 PDF。约 130–170MB，下载到数据目录。",
		SizeHint:    "~150MB",
	},
}

func pluginInfoByKey(key string) *pluginInfo {
	for i := range pluginRegistry {
		if pluginRegistry[i].Key == key {
			return &pluginRegistry[i]
		}
	}
	return nil
}

// pluginDir 插件的数据目录
func pluginDir(key string) string {
	return filepath.Join(config.DataDir(), "plugins", key)
}

// pluginMeta 解析 Plugin.Meta JSON
func pluginMeta(p *models.Plugin) map[string]any {
	m := map[string]any{}
	if p.Meta != "" {
		_ = json.Unmarshal([]byte(p.Meta), &m)
	}
	return m
}

func (a *App) savePluginMeta(p *models.Plugin, meta map[string]any) {
	raw, _ := json.Marshal(meta)
	p.Meta = string(raw)
	a.DB.Save(p)
}

// cftPlatform 将 Go 平台映射到 Chrome for Testing 平台标识
func cftPlatform() (string, error) {
	switch runtime.GOOS + "/" + runtime.GOARCH {
	case "linux/amd64":
		return "linux64", nil
	case "darwin/amd64":
		return "mac-x64", nil
	case "darwin/arm64":
		return "mac-arm64", nil
	case "windows/amd64":
		return "win64", nil
	default:
		return "", fmt.Errorf("不支持的平台 %s/%s", runtime.GOOS, runtime.GOARCH)
	}
}

// resolveChromeDownload 从 Chrome for Testing 稳定通道解析当前平台的 chrome-headless-shell 下载地址
func resolveChromeDownload() (version, url string, err error) {
	platform, err := cftPlatform()
	if err != nil {
		return "", "", err
	}
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Get("https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json")
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()
	var payload struct {
		Channels map[string]struct {
			Version   string `json:"version"`
			Downloads struct {
				ChromeHeadlessShell []struct {
					Platform string `json:"platform"`
					URL      string `json:"url"`
				} `json:"chrome-headless-shell"`
			} `json:"downloads"`
		} `json:"channels"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return "", "", err
	}
	stable, ok := payload.Channels["Stable"]
	if !ok {
		return "", "", fmt.Errorf("未找到稳定通道版本")
	}
	for _, d := range stable.Downloads.ChromeHeadlessShell {
		if d.Platform == platform {
			return stable.Version, d.URL, nil
		}
	}
	return "", "", fmt.Errorf("稳定通道未提供 %s 平台的 chrome-headless-shell", platform)
}

// chromeBinaryName 平台对应的可执行文件名
func chromeBinaryName() string {
	if runtime.GOOS == "windows" {
		return "chrome-headless-shell.exe"
	}
	return "chrome-headless-shell"
}

// installedChromePath 返回已安装插件记录的 chrome 可执行路径（未安装返回空）
func (a *App) installedChromePath() string {
	var p models.Plugin
	if err := a.DB.Where("key = ? AND installed = ?", pluginPDFExport, true).First(&p).Error; err != nil {
		return ""
	}
	path, _ := pluginMeta(&p)["chrome_path"].(string)
	if path == "" {
		return ""
	}
	if _, err := os.Stat(path); err != nil {
		return ""
	}
	return path
}

// runPluginInstall 后台下载并解压 chrome-headless-shell，完成后更新插件记录。
// gen 为本次操作的代次令牌：若期间被卸载/重装（代次变化），所有 DB 写入都会被丢弃，
// 避免旧 goroutine 把已删除的插件行重新写回。
func (a *App) runPluginInstall(p *models.Plugin, gen int64) {
	key := p.Key
	// save 仅在本代次仍有效时写库，否则丢弃（插件已被卸载/重装）
	save := func(meta map[string]any) {
		if !a.plugins.current(key, gen) {
			return
		}
		a.savePluginMeta(p, meta)
	}
	fail := func(reason string) {
		save(map[string]any{"status": "failed", "error": reason})
	}

	version, url, err := resolveChromeDownload()
	if err != nil {
		fail("解析下载地址失败: " + err.Error())
		return
	}
	dir := pluginDir(pluginPDFExport)
	_ = os.RemoveAll(dir)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		fail("创建插件目录失败: " + err.Error())
		return
	}
	zipPath := filepath.Join(dir, "chrome.zip")
	if err := downloadFile(url, zipPath); err != nil {
		fail("下载失败: " + err.Error())
		return
	}
	chromeRoot := filepath.Join(dir, "chrome")
	if err := unzipTo(zipPath, chromeRoot); err != nil {
		fail("解压失败: " + err.Error())
		return
	}
	_ = os.Remove(zipPath)

	binPath := findChromeBinary(chromeRoot)
	if binPath == "" {
		fail("未在下载包中找到 chrome-headless-shell 可执行文件")
		return
	}
	_ = os.Chmod(binPath, 0o755)
	if out, err := exec.Command(binPath, "--version").CombinedOutput(); err != nil {
		fail("chrome-headless-shell 自检失败: " + strings.TrimSpace(string(out)))
		return
	}

	// 若已被卸载则不落库，并清理刚下载的文件
	if !a.plugins.current(key, gen) {
		_ = os.RemoveAll(dir)
		return
	}
	now := time.Now()
	p.Installed = true
	p.Version = version
	p.InstalledAt = &now
	save(map[string]any{"status": "installed", "chrome_path": binPath})
}

// findChromeBinary 在解压目录中递归查找 chrome-headless-shell 可执行文件
func findChromeBinary(root string) string {
	target := chromeBinaryName()
	var found string
	_ = filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}
		if info.Name() == target {
			found = path
			return io.EOF // 提前结束
		}
		return nil
	})
	return found
}

// unzipTo 解压 zip 到目标目录（保留可执行权限）
func unzipTo(src, dst string) error {
	r, err := zip.OpenReader(src)
	if err != nil {
		return err
	}
	defer r.Close()
	for _, f := range r.File {
		fp := filepath.Join(dst, f.Name)
		if !strings.HasPrefix(fp, filepath.Clean(dst)+string(os.PathSeparator)) {
			return fmt.Errorf("非法压缩路径: %s", f.Name)
		}
		if f.FileInfo().IsDir() {
			if err := os.MkdirAll(fp, 0o755); err != nil {
				return err
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(fp), 0o755); err != nil {
			return err
		}
		rc, err := f.Open()
		if err != nil {
			return err
		}
		out, err := os.OpenFile(fp, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, f.Mode())
		if err != nil {
			rc.Close()
			return err
		}
		_, err = io.Copy(out, rc)
		out.Close()
		rc.Close()
		if err != nil {
			return err
		}
	}
	return nil
}

// ---------- 管理端点 ----------

// AdminListPlugins GET /admin/plugins 列出插件及安装状态
func (a *App) AdminListPlugins(c *gin.Context) {
	var rows []models.Plugin
	a.DB.Find(&rows)
	state := map[string]models.Plugin{}
	for _, r := range rows {
		state[r.Key] = r
	}
	items := make([]gin.H, 0, len(pluginRegistry))
	for _, info := range pluginRegistry {
		p := state[info.Key]
		items = append(items, gin.H{
			"key":         info.Key,
			"name":        info.Name,
			"description": info.Description,
			"size_hint":   info.SizeHint,
			"installed":   p.Installed,
			"version":     p.Version,
			"status":      pluginMeta(&p)["status"],
			"error":       pluginMeta(&p)["error"],
		})
	}
	ok(c, gin.H{"items": items})
}

// AdminInstallPlugin POST /admin/plugins/:key/install 触发后台安装
func (a *App) AdminInstallPlugin(c *gin.Context) {
	key := c.Param("key")
	if pluginInfoByKey(key) == nil {
		fail(c, http.StatusNotFound, "插件不存在")
		return
	}
	var p models.Plugin
	if err := a.DB.Where("key = ?", key).First(&p).Error; err != nil {
		p = models.Plugin{Key: key}
	}
	if s, _ := pluginMeta(&p)["status"].(string); s == "downloading" {
		fail(c, http.StatusConflict, "插件正在安装中")
		return
	}
	gen := a.plugins.begin(key)
	p.Installed = false
	a.savePluginMeta(&p, map[string]any{"status": "downloading"})
	go a.runPluginInstall(&p, gen)
	ok(c, gin.H{"message": "已开始安装，请稍候刷新状态", "status": "downloading"})
}

// AdminUninstallPlugin POST /admin/plugins/:key/uninstall 卸载并清理下载文件
func (a *App) AdminUninstallPlugin(c *gin.Context) {
	key := c.Param("key")
	if pluginInfoByKey(key) == nil {
		fail(c, http.StatusNotFound, "插件不存在")
		return
	}
	// 递增代次，使任何进行中的安装 goroutine 的后续写入全部失效，避免卸载后被重新写回
	a.plugins.begin(key)
	_ = os.RemoveAll(pluginDir(key))
	a.DB.Where("key = ?", key).Delete(&models.Plugin{})
	ok(c, gin.H{"message": "已卸载"})
}
