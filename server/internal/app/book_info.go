package app

import (
	"fmt"
	"net/mail"
	"net/url"
	"strings"
	"unicode/utf8"

	"knowforge/server/internal/models"
)

// 书籍「更多信息」：作者为书籍添加附加属性（GitHub 仓库、原始文档地址、许可证等），在书籍详情页展示。
// 预置类型决定前端图标、默认名称与取值校验；custom 为自定义项（需填写名称，值为链接时展示为链接）。

const (
	maxBookInfoItems = 20
	maxBookInfoLabel = 40
	maxBookInfoValue = 500
)

// 取值类型：url 需为 http(s) 链接；email 需为邮箱；text 任意文本。
var bookInfoTypes = map[string]string{
	"github": "url", "gitlab": "url", "gitee": "url", "website": "url", "source": "url", "docs": "url", "demo": "url",
	"email": "email", "license": "text", "author": "text", "version": "text", "isbn": "text", "custom": "text",
}

func isHTTPURL(v string) bool {
	u, err := url.Parse(v)
	return err == nil && (u.Scheme == "http" || u.Scheme == "https") && u.Host != ""
}

// normalizeBookInfo 校验并规范化附加属性（去空白、丢弃空值项）；不合法时返回可展示的错误。
func normalizeBookInfo(items []models.BookInfoItem) (models.BookInfo, error) {
	out := models.BookInfo{}
	for i, it := range items {
		it.Type = strings.TrimSpace(it.Type)
		it.Label = strings.TrimSpace(it.Label)
		it.Value = strings.TrimSpace(it.Value)
		if it.Value == "" {
			continue
		}
		kind, known := bookInfoTypes[it.Type]
		if !known {
			return nil, fmt.Errorf("第 %d 项的类型无效", i+1)
		}
		if it.Type == "custom" && it.Label == "" {
			return nil, fmt.Errorf("第 %d 项为自定义属性，请填写名称", i+1)
		}
		if utf8.RuneCountInString(it.Label) > maxBookInfoLabel {
			return nil, fmt.Errorf("第 %d 项的名称不能超过 %d 个字符", i+1, maxBookInfoLabel)
		}
		if utf8.RuneCountInString(it.Value) > maxBookInfoValue {
			return nil, fmt.Errorf("第 %d 项的内容不能超过 %d 个字符", i+1, maxBookInfoValue)
		}
		switch kind {
		case "url":
			if !isHTTPURL(it.Value) {
				return nil, fmt.Errorf("第 %d 项需为 http(s) 链接", i+1)
			}
		case "email":
			if addr, err := mail.ParseAddress(it.Value); err != nil || addr.Address != it.Value {
				return nil, fmt.Errorf("第 %d 项需为有效的邮箱地址", i+1)
			}
		}
		out = append(out, it)
	}
	if len(out) > maxBookInfoItems {
		return nil, fmt.Errorf("更多信息最多 %d 项", maxBookInfoItems)
	}
	return out, nil
}
