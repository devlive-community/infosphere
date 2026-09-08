package app

import (
	"context"
	"fmt"
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
	targetUserID := uint(0)
	if style == "author" && book.ExportStyleShared {
		targetUserID = book.UserID
	} else if u != nil {
		targetUserID = u.ID
	}
	if targetUserID == 0 {
		return defaultExportSetting(0)
	}
	var s models.UserExportSetting
	if err := a.DB.Where("user_id = ?", targetUserID).First(&s).Error; err != nil {
		return defaultExportSetting(targetUserID)
	}
	return s
}

// ExportBookPDF GET /books/:id/export/pdf?style=author|mine 通过无头 Chrome 导出 PDF
func (a *App) ExportBookPDF(c *gin.Context) {
	book, status := a.findBook(c)
	if book == nil {
		fail(c, status, "书籍不存在")
		return
	}
	u := currentUser(c)

	// 鉴权：作者/协作者/管理员始终可导出；否则要求书籍处于可公开阅读状态且作者开启导出
	canExport := a.canEditBookContent(u, book) ||
		(book.IsPublic && isPubliclyReadableBookStatus(book.Status) && book.ExportEnabled)
	if !canExport {
		fail(c, http.StatusForbidden, "该书籍未开放导出")
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

	pdf, err := a.renderPDF(printURL, requestToken(c), setting)
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

// renderPDF 用 chrome-headless-shell 打开打印页并输出 PDF；带上登录 Cookie 以渲染私有内容
func (a *App) renderPDF(printURL, token string, setting models.UserExportSetting) ([]byte, error) {
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
				WithMarginTop(m).WithMarginBottom(m).WithMarginLeft(m).WithMarginRight(m).
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
