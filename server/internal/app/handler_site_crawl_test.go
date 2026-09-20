package app

import (
	"context"
	"encoding/json"
	"net/url"
	"strings"
	"testing"

	"infosphere/server/internal/models"

	"golang.org/x/net/html"
)

// 目录树推断：侧边栏嵌套 ul → depth 与父子关系正确，同域去重。
func TestExtractNavTree(t *testing.T) {
	page := `<html><body>
	<nav class="sidebar"><ul>
	  <li><a href="/overview">Overview</a>
	    <ul><li><a href="/overview/concepts">Concepts</a></li></ul>
	  </li>
	  <li><a href="/guide">Guide</a></li>
	  <li><a href="https://other.example.org/x">External</a></li>
	  <li><a href="/guide">Guide dup</a></li>
	</ul></nav>
	<main><p>body</p></main>
	</body></html>`
	root, _ := html.Parse(strings.NewReader(page))
	base, _ := url.Parse("https://8.8.8.8/")
	tree := extractNavTree(root, base, 200)
	if len(tree) != 3 {
		t.Fatalf("应得 3 个同域去重节点，实际 %d: %+v", len(tree), tree)
	}
	byURL := map[string]crawlNode{}
	for _, n := range tree {
		byURL[n.URL] = n
	}
	concepts := byURL["https://8.8.8.8/overview/concepts"]
	if concepts.Depth != 1 || concepts.ParentURL != "https://8.8.8.8/overview" {
		t.Fatalf("Concepts 应为 depth1 且父级为 Overview，实际 %+v", concepts)
	}
	if byURL["https://8.8.8.8/guide"].Depth != 0 {
		t.Fatalf("Guide 应为顶级 depth0")
	}
}

// 目录树推断：模拟 Antora 文档站（nav.nav-menu，外层有包裹 ul 使 depth 从 2 起），
// 归一化后顶层应为 depth0，父子关系正确，标题保留大小写。
func TestExtractNavTreeNestedWrappers(t *testing.T) {
	page := `<html><body>
	<nav class="navbar"><a href="https://spring.io/why">Why Spring</a><a href="https://spring.io/learn">Learn</a></nav>
	<aside class="nav"><div class="nav-panel-menu"><nav class="nav-menu"><ul class="nav-list"><li><ul>
	  <li><a href="index.html">Overview</a>
	    <ul><li><a href="concepts.html">AI Concepts</a></li></ul>
	  </li>
	  <li><a href="getting-started.html">Getting Started</a>
	    <ul><li><a href="api/chatclient.html">Chat Client API</a>
	      <ul><li><a href="api/advisors.html">Advisors</a></li></ul>
	    </li></ul>
	  </li>
	</ul></li></ul></nav></div></aside>
	</body></html>`
	root, _ := html.Parse(strings.NewReader(page))
	base, _ := url.Parse("https://8.8.8.8/spring-ai/reference/1.1/")
	tree := extractNavTree(root, base, 200)
	byURL := map[string]crawlNode{}
	for _, n := range tree {
		byURL[n.URL] = n
	}
	overview := byURL["https://8.8.8.8/spring-ai/reference/1.1/index.html"]
	if overview.Title != "Overview" || overview.Depth != 0 || overview.ParentURL != "" {
		t.Fatalf("Overview 应为顶层 depth0，实际 %+v", overview)
	}
	concepts := byURL["https://8.8.8.8/spring-ai/reference/1.1/concepts.html"]
	if concepts.Depth != 1 || concepts.ParentURL != overview.URL {
		t.Fatalf("AI Concepts 应为 depth1 且父级 Overview，实际 %+v", concepts)
	}
	advisors := byURL["https://8.8.8.8/spring-ai/reference/1.1/api/advisors.html"]
	chatClient := byURL["https://8.8.8.8/spring-ai/reference/1.1/api/chatclient.html"]
	if advisors.Depth != 2 || advisors.ParentURL != chatClient.URL {
		t.Fatalf("Advisors 应为 depth2 且父级 Chat Client API，实际 %+v", advisors)
	}
	// 外站 navbar 链接（不同域）不应混入
	if _, bad := byURL["https://spring.io/why"]; bad {
		t.Fatal("不应包含外站导航链接")
	}
}

// 采集 slug 由 URL 末段生成并保留大小写（用户明确要求不要转小写）。
func TestCrawlSlugPreservesCase(t *testing.T) {
	if got := crawlSlugFromURL("https://8.8.8.8/reference/AI-Concepts.html"); got != "AI-Concepts" {
		t.Fatalf("应保留大小写 AI-Concepts，实际 %q", got)
	}
	if got := crawlSlugFromURL("https://8.8.8.8/Getting_Started"); got != "Getting-Started" {
		t.Fatalf("下划线转中划线且保留大小写，实际 %q", got)
	}
}

// 整站采集执行：按页面清单抓取→建章节，父子层级映射正确，任务状态与计数正确。
func TestRunSiteCrawlJob(t *testing.T) {
	app, owner, db := newContentImportTestApp(t)
	app.Notifications = newNotificationHub()
	bodies := map[string]string{
		"/overview":          `<main><h1>Overview</h1><p>This is the overview page with enough textual content to be treated as a real article body for markdown conversion.</p></main>`,
		"/overview/concepts": `<main><h1>Concepts</h1><p>Concepts page body with sufficient length to pass content extraction and produce a proper markdown chapter output here.</p></main>`,
		"/guide":             `<main><h1>Guide</h1><p>Guide page body with sufficient length to pass content extraction and produce a proper markdown chapter output for this one.</p></main>`,
	}
	app.WebFetcher = func(_ context.Context, target *url.URL) (webPage, error) {
		html := `<html><head><title>` + target.Path + `</title></head><body>` + bodies[target.Path] + `</body></html>`
		return webPage{HTML: html, FinalURL: target}, nil
	}

	book := models.Book{Title: "采集书", Slug: "crawl-book", UserID: owner.ID, Status: "draft"}
	db.Create(&book)
	job := models.CrawlJob{UserID: owner.ID, BookID: book.ID, Kind: "site", RootURL: "https://8.8.8.8/", RenderMode: "static", Status: "pending", Total: 3}
	db.Create(&job)
	pages := []models.CrawlPage{
		{JobID: job.ID, URL: "https://8.8.8.8/overview", ParentURL: "", Title: "Overview", Depth: 0, SortOrder: 0, Status: "pending"},
		{JobID: job.ID, URL: "https://8.8.8.8/overview/concepts", ParentURL: "https://8.8.8.8/overview", Title: "Concepts", Depth: 1, SortOrder: 1, Status: "pending"},
		{JobID: job.ID, URL: "https://8.8.8.8/guide", ParentURL: "", Title: "Guide", Depth: 0, SortOrder: 2, Status: "pending"},
	}
	db.Create(&pages)

	raw, _ := json.Marshal(siteCrawlJobPayload{JobID: job.ID})
	if err := app.runSiteCrawlJob(context.Background(), raw); err != nil {
		t.Fatalf("采集任务执行失败: %v", err)
	}

	var got models.CrawlJob
	db.First(&got, job.ID)
	if got.Status != "succeeded" || got.Success != 3 || got.Failed != 0 {
		t.Fatalf("任务应全部成功，实际 status=%s success=%d failed=%d", got.Status, got.Success, got.Failed)
	}

	var docs []models.Document
	db.Where("book_id = ?", book.ID).Order("sort_order ASC").Find(&docs)
	if len(docs) != 3 {
		t.Fatalf("应建 3 个章节，实际 %d", len(docs))
	}
	byTitle := map[string]models.Document{}
	for _, d := range docs {
		byTitle[d.Title] = d
	}
	overview := byTitle["Overview"]
	concepts := byTitle["Concepts"]
	if concepts.ParentID == nil || *concepts.ParentID != overview.ID {
		t.Fatalf("Concepts 章节父级应为 Overview，实际 %+v", concepts.ParentID)
	}
	if strings.TrimSpace(overview.Content) == "" {
		t.Fatalf("Overview 章节正文不应为空")
	}
}
