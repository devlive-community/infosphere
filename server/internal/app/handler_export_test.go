package app

import (
	"testing"

	"infosphere/server/internal/models"
)

// canExportBook 的游客门禁：公开可读且开启导出的书籍，未登录游客还需 GuestExportEnabled。
func TestCanExportBookGuestGating(t *testing.T) {
	a := &App{}
	owner := &models.User{}
	owner.ID = 7
	base := models.Book{IsPublic: true, Status: "published", ExportEnabled: true, GuestExportEnabled: true}
	base.ID = 1
	base.UserID = 7

	cases := []struct {
		name          string
		user          *models.User
		exportEnabled bool
		guestEnabled  bool
		want          bool
	}{
		{"游客-全开启", nil, true, true, true},
		{"游客-关闭游客导出", nil, true, false, false},
		{"游客-关闭他人导出", nil, false, true, false},
		{"作者-关闭游客导出仍可导", owner, true, false, true},
		{"作者-全关仍可导", owner, false, false, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			b := base
			b.ExportEnabled = tc.exportEnabled
			b.GuestExportEnabled = tc.guestEnabled
			if got := a.canExportBook(tc.user, &b); got != tc.want {
				t.Fatalf("canExportBook = %v, want %v", got, tc.want)
			}
		})
	}

	// 非公开书籍：即便开启导出，游客也不可导
	priv := base
	priv.IsPublic = false
	if a.canExportBook(nil, &priv) {
		t.Fatal("非公开书籍游客不应可导出")
	}
}
