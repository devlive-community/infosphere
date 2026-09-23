package contentcollect

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"testing"

	"knowforge/server/internal/mdclean"

	"golang.org/x/net/html"
)

func TestExtractWebArticlePreservesMarkdownStructure(t *testing.T) {
	pageURL, _ := url.Parse("https://8.8.8.8/articles/markdown")
	article, err := extractWebArticle(webPage{
		FinalURL: pageURL,
		HTML: `<html><head><title>结构化文章</title></head><body><main><article>
			<h1>结构化文章</h1><h2>安装步骤</h2><p>请先阅读 <strong>注意事项</strong>。</p>
			<ul><li>准备环境</li><li>安装依赖</li></ul>
			<pre><code class="language-go">fmt.Println("ok")</code></pre>
			<table><tr><th>名称</th><th>状态</th></tr><tr><td>导入</td><td>正常</td></tr></table>
		</article></main></body></html>`,
	})
	if err != nil {
		t.Fatalf("网页 Markdown 转换失败: %v", err)
	}
	for _, expected := range []string{"# 结构化文章", "## 安装步骤", "**注意事项**", "- 准备环境", "```go", "| 名称", "|----"} {
		if !strings.Contains(article.Markdown, expected) {
			t.Fatalf("网页结构未转换为 Markdown，缺少 %q:\n%s", expected, article.Markdown)
		}
	}
}

// Docusaurus：<body class="navigation-with-keyboard"> 不能被当成导航整页丢弃；
// Prism 逐行 <div class="token-line">…<br></div> 不应产生空行，<span class="token comment"> 不能被当成评论区删掉。
func TestExtractWebArticleDocusaurusPrismCodeBlock(t *testing.T) {
	pageURL, _ := url.Parse("https://8.8.8.8/docs/overview")
	article, err := extractWebArticle(webPage{
		FinalURL: pageURL,
		HTML: `<html><head><title>Overview</title></head><body class="navigation-with-keyboard"><div id="__docusaurus"><main><article>
			<h2 id="use-cli">Using CLI<a href="#use-cli" class="hash-link" title="Direct link to Using CLI">&#8203;</a></h2>
			<p>The AWS CLI can be used from your local machine.</p>
			<pre class="prism-code language-bash"><code class="codeBlockLines"><div class="token-line"><span class="token comment"># Create a bucket</span><span class="token plain"></span><br></div><div class="token-line"><span class="token plain">aws s3api create-bucket --bucket=s3bucket</span><br></div><div class="token-line"><span class="token plain" style="display:inline-block"></span><br></div><div class="token-line"><span class="token plain">aws s3api list-buckets</span><br></div></code><button class="copyButton">Copy</button></pre>
		</article></main></div></body></html>`,
	})
	if err != nil {
		t.Fatalf("Docusaurus 页面提取失败: %v", err)
	}
	want := "```bash\n# Create a bucket\naws s3api create-bucket --bucket=s3bucket\n\naws s3api list-buckets\n```"
	if !strings.Contains(article.Markdown, want) {
		t.Fatalf("代码块未按原样还原，期望包含:\n%s\n实际:\n%s", want, article.Markdown)
	}
	if cleaned := mdclean.StripPermalinkAnchors(article.Markdown); strings.Contains(cleaned, "Direct link") || !strings.Contains(cleaned, "## Using CLI\n") {
		t.Fatalf("标题永久链接锚点未清理:\n%s", cleaned)
	}
}

func TestWebImportErrorHidesBrowserDiagnostics(t *testing.T) {
	status, message := webImportFailure(errors.New("无法启动 Chromium: [launcher] Failed to get the debug url:\nchrome_crashpad_handler: --database is required\ninternal stack trace"))
	if status != http.StatusUnprocessableEntity {
		t.Fatalf("浏览器启动失败状态码错误: %d", status)
	}
	if strings.Contains(message, "crashpad") || strings.Contains(message, "stack trace") || len([]rune(message)) > 160 {
		t.Fatalf("浏览器内部诊断不应返回前端: %q", message)
	}
	if !strings.Contains(message, "浏览器启动失败") {
		t.Fatalf("应返回可理解的浏览器错误提示: %q", message)
	}
}

// 浏览器渲染依赖无头浏览器插件：未提供浏览器路径时必须返回明确的“未安装插件”错误，
// 且对外文案透出该提示。
func TestRenderDynamicWebPageRequiresPlugin(t *testing.T) {
	target := &url.URL{Scheme: "https", Host: "example.com"}
	if _, err := renderDynamicWebPage(context.Background(), target, ""); !errors.Is(err, errBrowserPluginNotInstalled) {
		t.Fatalf("无浏览器插件时应返回 errBrowserPluginNotInstalled，实际 %v", err)
	}
	if msg := publicWebImportError(errBrowserPluginNotInstalled); msg != errBrowserPluginNotInstalled.Error() {
		t.Fatalf("对外文案应透出插件未安装提示，实际 %q", msg)
	}
}

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
