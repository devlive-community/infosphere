package app

import (
	"context"
	"fmt"
	"html"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"infosphere/server/internal/models"

	"github.com/chromedp/cdproto/network"
	"github.com/chromedp/cdproto/page"
	"github.com/chromedp/chromedp"
	"github.com/gin-gonic/gin"
)

// 页面尺寸（英寸）与页边距映射
var pdfPaper = map[string][2]float64{"A4": {8.27, 11.69}, "Letter": {8.5, 11}}
var pdfMargin = map[string]float64{"narrow": 0.4, "normal": 0.7, "wide": 1.0}

// requestToken 从请求头或 Cookie 取出当前用户 JWT（用于给无头浏览器带上登录态）
func requestToken(c *gin.Context) string {
	if h := c.GetHeader("Authorization"); strings.HasPrefix(h, "Bearer ") {
		return strings.TrimSpace(h[7:])
	}
	if ck, err := c.Cookie("infosphere_token"); err == nil {
		return ck
	}
	return ""
}

// resolveExportStyle 依据 style 选择生效的导出样式：
// author（且作者开启共享）用书籍作者样式，否则用请求者自己的样式（匿名用默认）。
func (a *App) resolveExportStyle(style string, book *models.Book, u *models.User) models.UserExportSetting {
	// 作者共享样式且请求作者样式：优先书籍自有导出样式，其次作者个人样式
	if style == "author" && book.ExportStyleShared {
		var bs models.BookExportSetting
		if err := a.DB.Where("book_id = ?", book.ID).First(&bs).Error; err == nil {
			return models.UserExportSetting{
				PageSize: bs.PageSize, IncludeCover: bs.IncludeCover, IncludeToc: bs.IncludeToc,
				FontSize: bs.FontSize, CodeTheme: bs.CodeTheme, Margin: bs.Margin,
			}
		}
		var us models.UserExportSetting
		if err := a.DB.Where("user_id = ?", book.UserID).First(&us).Error; err == nil {
			return us
		}
		return defaultExportSetting(book.UserID)
	}
	// 否则用请求者自己的样式（匿名用默认）
	if u == nil {
		return defaultExportSetting(0)
	}
	var s models.UserExportSetting
	if err := a.DB.Where("user_id = ?", u.ID).First(&s).Error; err != nil {
		return defaultExportSetting(u.ID)
	}
	return s
}

// resolveExportFooter 解析每页页脚文案（Powered by …）：
// 优先书籍自有配置，其次导出者个人配置，最后回退默认 "Powered by <站点名>"。
func (a *App) resolveExportFooter(book *models.Book, u *models.User) string {
	var bs models.BookExportSetting
	if err := a.DB.Where("book_id = ?", book.ID).First(&bs).Error; err == nil && strings.TrimSpace(bs.Footer) != "" {
		return bs.Footer
	}
	if u != nil {
		var us models.UserExportSetting
		if err := a.DB.Where("user_id = ?", u.ID).First(&us).Error; err == nil && strings.TrimSpace(us.Footer) != "" {
			return us.Footer
		}
	}
	site := strings.TrimSpace(a.getSetting("site_name"))
	if site == "" {
		site = "InfoSphere"
	}
	return "Powered by " + site
}

// ExportBookPDF GET /books/:id/export/pdf?style=author|mine 通过无头 Chrome 导出 PDF
func (a *App) ExportBookPDF(c *gin.Context) {
	book, status := a.findBook(c)
	if book == nil {
		fail(c, status, "书籍不存在")
		return
	}
	u := currentUser(c)

	if !a.canExportBook(u, book) {
		fail(c, http.StatusForbidden, "该书籍未开放导出")
		return
	}
	if !formatAllowed(book, "pdf") {
		fail(c, http.StatusForbidden, "作者未开放 PDF 导出")
		return
	}

	// 依赖 PDF 插件（chrome-headless-shell）
	chromePath := a.installedChromePath()
	if chromePath == "" {
		fail(c, http.StatusBadRequest, "PDF 导出插件尚未安装，请联系管理员在后台「插件」中安装")
		return
	}
	webPort := a.web.Port()
	if webPort == 0 {
		fail(c, http.StatusServiceUnavailable, "Web 运行时不可用，无法生成 PDF")
		return
	}

	setting := a.resolveExportStyle(c.Query("style"), book, u)

	// 打印页地址（内嵌 Web），样式作为查询参数下发，水印始终取自书籍作者设置
	q := url.Values{}
	q.Set("page_size", setting.PageSize)
	q.Set("font_size", strconv.Itoa(setting.FontSize))
	q.Set("code_theme", setting.CodeTheme)
	q.Set("margin", setting.Margin)
	q.Set("cover", boolParam(setting.IncludeCover))
	q.Set("toc", boolParam(setting.IncludeToc))
	printURL := fmt.Sprintf("http://127.0.0.1:%d/book/print/%s?%s", webPort, url.PathEscape(book.Slug), q.Encode())

	footer := a.resolveExportFooter(book, u)
	pdf, err := a.renderPDF(printURL, requestToken(c), setting, footer)
	if err != nil {
		fail(c, http.StatusInternalServerError, "生成 PDF 失败: "+err.Error())
		return
	}
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s.pdf", book.Slug))
	c.Data(http.StatusOK, "application/pdf", pdf)
}

func boolParam(b bool) string {
	if b {
		return "1"
	}
	return "0"
}

// renderPDF 用 chrome-headless-shell 打开打印页并输出 PDF；带上登录 Cookie 以渲染私有内容。
// footer 为每页页脚文案，经 Chrome 原生 footerTemplate 渲染，保证出现在每一物理页底部。
func (a *App) renderPDF(printURL, token string, setting models.UserExportSetting, footer string) ([]byte, error) {
	execOpts := append(chromedp.DefaultExecAllocatorOptions[:],
		chromedp.ExecPath(a.installedChromePath()),
		chromedp.Flag("headless", true),
		chromedp.Flag("no-sandbox", true),
		chromedp.Flag("disable-gpu", true),
	)
	allocCtx, cancelAlloc := chromedp.NewExecAllocator(context.Background(), execOpts...)
	defer cancelAlloc()
	ctx, cancel := chromedp.NewContext(allocCtx)
	defer cancel()
	ctx, cancelTimeout := context.WithTimeout(ctx, 90*time.Second)
	defer cancelTimeout()

	paper := pdfPaper[setting.PageSize]
	if paper == [2]float64{} {
		paper = pdfPaper["A4"]
	}
	m := pdfMargin[setting.Margin]
	if m == 0 {
		m = pdfMargin["normal"]
	}
	// 底部预留足够空间容纳页脚（英寸）
	marginBottom := m
	if marginBottom < 0.55 {
		marginBottom = 0.55
	}

	// Chrome 页脚模板：不继承页面样式，需显式设定字号；文本转义避免破坏模板
	footerTemplate := fmt.Sprintf(
		`<div style="width:100%%;font-size:9px;color:#9ca3af;text-align:center;padding:0 12px;">%s</div>`,
		html.EscapeString(footer),
	)

	var pdf []byte
	err := chromedp.Run(ctx,
		chromedp.ActionFunc(func(ctx context.Context) error {
			if token == "" {
				return nil
			}
			// 为 127.0.0.1 设置登录 Cookie，使打印页 SSR 能渲染私有/作者内容
			return network.SetCookie("infosphere_token", token).
				WithDomain("127.0.0.1").WithPath("/").Do(ctx)
		}),
		chromedp.Navigate(printURL),
		// 打印页渲染完成后会挂上 #print-ready 元素
		chromedp.WaitVisible("#print-ready", chromedp.ByID),
		chromedp.ActionFunc(func(ctx context.Context) error {
			buf, _, err := page.PrintToPDF().
				WithPrintBackground(true).
				WithPaperWidth(paper[0]).
				WithPaperHeight(paper[1]).
				WithMarginTop(m).WithMarginBottom(marginBottom).WithMarginLeft(m).WithMarginRight(m).
				WithDisplayHeaderFooter(true).
				WithHeaderTemplate("<span></span>").
				WithFooterTemplate(footerTemplate).
				Do(ctx)
			pdf = buf
			return err
		}),
	)
	if err != nil {
		return nil, err
	}
	return pdf, nil
}
