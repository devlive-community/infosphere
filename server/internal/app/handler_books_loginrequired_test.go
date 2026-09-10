package app

import (
	"testing"

	"infosphere/server/internal/models"
)

// canReadBook 的「仅登录可读」门禁：公开可读书籍开启 LoginRequired 后，未登录游客不可读，
// 登录用户与作者不受影响。
func TestCanReadBookLoginRequired(t *testing.T) {
	a := &App{}
	owner := &models.User{}
	owner.ID = 3
	reader := &models.User{}
	reader.ID = 9

	pub := models.Book{IsPublic: true, Status: "published", LoginRequired: true}
	pub.ID = 1
	pub.UserID = 3

	if a.canReadBook(nil, &pub) {
		t.Fatal("未登录游客不应能读「仅登录可读」的公开书籍")
	}
	if !a.canReadBook(reader, &pub) {
		t.Fatal("登录用户应能读「仅登录可读」的公开书籍")
	}
	if !a.canReadBook(owner, &pub) {
		t.Fatal("作者应始终能读自己的书籍")
	}

	// 未开启 LoginRequired 时游客仍可读
	open := pub
	open.LoginRequired = false
	if !a.canReadBook(nil, &open) {
		t.Fatal("未开启仅登录时游客应能读公开书籍")
	}
}
