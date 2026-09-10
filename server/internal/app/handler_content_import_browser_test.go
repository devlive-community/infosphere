package app

import (
	"context"
	"errors"
	"net/url"
	"testing"
)

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
