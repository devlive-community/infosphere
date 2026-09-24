package app

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"knowforge/server/internal/config"
	"knowforge/server/internal/models"
)

func TestLocalizeBookImages(t *testing.T) {
	t.Setenv("KNOWFORGE_DATA", t.TempDir())
	a, _, _ := newContentImportTestApp(t)
	a.Config = &config.Config{Installed: true, Secret: "localize-test"}

	pngBytes := append([]byte("\x89PNG\r\n\x1a\n"), make([]byte, 64)...)
	hits := map[string]int{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits[r.URL.Path]++
		switch r.URL.Path {
		case "/a.png":
			w.Header().Set("Content-Type", "image/png")
			_, _ = w.Write(pngBytes)
		case "/sniff":
			_, _ = w.Write(pngBytes) // 无 Content-Type，按内容识别
		case "/page.html":
			w.Header().Set("Content-Type", "text/html")
			_, _ = w.Write([]byte("<html></html>"))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()

	// 默认客户端拒绝访问本机地址（SSRF 防护）
	if _, err := localizeHTTPClient(context.Background(), 1<<20).Get(srv.URL + "/a.png"); err == nil {
		t.Fatal("默认下载客户端应拒绝本机地址")
	}
	old := localizeHTTPClient
	localizeHTTPClient = func(context.Context, int64) *http.Client { return srv.Client() }
	defer func() { localizeHTTPClient = old }()

	user := models.User{Username: "img-owner", Email: "img@test.local", Role: "user", IsActive: true}
	a.DB.Create(&user)
	book := models.Book{Title: "图", Slug: "img-book", UserID: user.ID}
	a.DB.Create(&book)
	doc1 := models.Document{BookID: book.ID, Title: "一", Slug: "one", UserID: user.ID, Status: "draft",
		Content: "![a](" + srv.URL + "/a.png) 再次 ![b](" + srv.URL + "/a.png \"标题\") ![站内](/uploads/x.png) ![网页](" + srv.URL + "/page.html)"}
	doc2 := models.Document{BookID: book.ID, Title: "二", Slug: "two", UserID: user.ID, Status: "draft",
		Content: `<img src="` + srv.URL + `/sniff" alt="x"> ![坏](` + srv.URL + `/missing.png)`}
	doc3 := models.Document{BookID: book.ID, Title: "三", Slug: "three", UserID: user.ID, Status: "draft", Content: "无图片"}
	a.DB.Create(&doc1)
	a.DB.Create(&doc2)
	a.DB.Create(&doc3)

	res, err := a.localizeBookImages(context.Background(), &book, &user)
	if err != nil {
		t.Fatal(err)
	}
	if res.Localized != 2 || res.Failed != 2 || res.DocsChanged != 2 || hits["/a.png"] != 1 {
		t.Fatalf("结果错误（同一外链只下载一次）: %+v hits=%v", res, hits)
	}
	a.DB.First(&doc1, doc1.ID)
	a.DB.First(&doc2, doc2.ID)
	if strings.Count(doc1.Content, "](/uploads/") != 3 || strings.Contains(doc1.Content, srv.URL+"/a.png") || !strings.Contains(doc1.Content, srv.URL+"/page.html") {
		t.Fatalf("图片引用应改写为本地地址（非图片保留原链接）: %q", doc1.Content)
	}
	if !strings.Contains(doc2.Content, `<img src="/uploads/`) || !strings.Contains(doc2.Content, srv.URL+"/missing.png") {
		t.Fatalf("HTML 图片应改写、失败的保留: %q", doc2.Content)
	}
	var revisions int64
	a.DB.Model(&models.DocumentRevision{}).Where("document_id IN ?", []uint{doc1.ID, doc2.ID}).Count(&revisions)
	if revisions != 2 {
		t.Fatalf("改动的章节应生成版本记录，实际 %d", revisions)
	}
	// 再次执行：已是本地地址，不再下载
	res, _ = a.localizeBookImages(context.Background(), &book, &user)
	if res.Localized != 0 || hits["/a.png"] != 1 {
		t.Fatalf("重复执行不应再次下载: %+v", res)
	}
}
