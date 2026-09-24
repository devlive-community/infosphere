package app

import (
	"encoding/json"
	"strings"
	"testing"

	"knowforge/server/internal/models"
)

type captureMail struct{ subjects, bodies []string }

func (m *captureMail) Send(_, subject, body string) error {
	m.subjects = append(m.subjects, subject)
	m.bodies = append(m.bodies, body)
	return nil
}

// 可翻译通知：Title 存站点默认语言兜底文案，payload 带 i18n；邮件按收件人偏好语言渲染（管理员发布的语言包覆盖优先）。
func TestNotifyI18nTitleAndLocalizedEmail(t *testing.T) {
	a, _, db := newContentImportTestApp(t)
	a.Notifications = newNotificationHub()
	mails := &captureMail{}
	a.MailSender = mails
	_ = a.setSetting("mail_notifications_enabled", "true", "test")
	_ = a.setSetting("site_name", "KF", "test")
	_ = a.setSetting("site_url", "https://kf.test", "test")
	reader := models.User{Username: "en-reader", Email: "en@test.local", IsActive: true, PreferredLocale: "en"}
	db.Create(&reader)

	a.NotifyI18n(reader.ID, "comment", "notify.comment.chapter", map[string]string{"user": "bob", "chapter": "Intro"}, map[string]any{"link": "/x"})
	var n models.Notification
	if err := db.Where("user_id = ?", reader.ID).First(&n).Error; err != nil {
		t.Fatal(err)
	}
	if n.Title != "「bob」评论了你的章节《Intro》" {
		t.Fatalf("兜底标题应为站点默认语言（zh-CN）: %q", n.Title)
	}
	var payload map[string]any
	_ = json.Unmarshal([]byte(n.Payload), &payload)
	i18n := payload["i18n"].(map[string]any)
	if i18n["key"] != "notify.comment.chapter" || i18n["params"].(map[string]any)["chapter"] != "Intro" || payload["link"] != "/x" {
		t.Fatalf("payload 应带 i18n 键与参数并保留 link: %v", payload)
	}
	if len(mails.subjects) != 1 || mails.subjects[0] != `[KF] bob commented on your chapter "Intro"` {
		t.Fatalf("邮件标题应按收件人语言（en）渲染: %v", mails.subjects)
	}
	if !strings.Contains(mails.bodies[0], "Hi,") || !strings.Contains(mails.bodies[0], `<a href="https://kf.test/x">View details</a>`) || !strings.Contains(mails.bodies[0], "sent by KF") {
		t.Fatalf("邮件正文固定文案应本地化: %s", mails.bodies[0])
	}

	// 管理员在语言包中发布的同键翻译优先
	raw, _ := json.Marshal(map[string]string{"notify.comment.reply": "{user} answered you"})
	db.Create(&models.UIMessageBundle{Locale: "en", Published: string(raw), Revision: 1})
	a.NotifyI18n(reader.ID, "comment", "notify.comment.reply", map[string]string{"user": "amy"}, nil)
	if got := mails.subjects[len(mails.subjects)-1]; got != "[KF] amy answered you" {
		t.Fatalf("应使用管理员发布的语言包覆盖: %q", got)
	}
}

// 历史通知回填：按 zh-CN 模板反解析旧标题补上 payload.i18n（含插件登记的模板），无法识别的保持原样，完成后记标记。
func TestNotificationI18nBackfill(t *testing.T) {
	a, owner, db := newContentImportTestApp(t)
	rows := []models.Notification{
		{UserID: owner.ID, Type: "reaction", Title: "「amy」收藏了你的书籍《Go 实战（第 2 版）》", Payload: `{"link":"/book/detail/go"}`},
		{UserID: owner.ID, Type: "collaboration", Title: "「bob」已拒绝《手册》的协作邀请", Payload: `{"link":"/book/settings/m"}`},
		{UserID: owner.ID, Type: "book_update", Title: "《手册》更新了新章节：安装", Payload: `{"link":"/r"}`},
		{UserID: owner.ID, Type: "achievement", Title: "已解锁成就「读完三章」", Payload: `{}`},
		{UserID: owner.ID, Type: "system", Title: "一条无法识别的自定义通知", Payload: `{}`},
	}
	db.Create(&rows)
	if err := a.runNotificationBackfill(t.Context(), nil); err != nil {
		t.Fatal(err)
	}
	want := []struct {
		key    string
		params map[string]string
	}{
		{"notify.reaction.favorite", map[string]string{"user": "amy", "book": "Go 实战（第 2 版）"}},
		{"notify.collab.rejected", map[string]string{"user": "bob", "book": "手册"}},
		{"notify.follow.chapterPublished", map[string]string{"book": "手册", "chapter": "安装"}},
		{"notify.achievement.unlocked", map[string]string{"name": "读完三章"}},
	}
	for i, w := range want {
		var n models.Notification
		db.First(&n, rows[i].ID)
		var payload map[string]any
		_ = json.Unmarshal([]byte(n.Payload), &payload)
		i18n, ok := payload["i18n"].(map[string]any)
		if !ok || i18n["key"] != w.key {
			t.Fatalf("通知 %q 应回填为 %s: %v", rows[i].Title, w.key, payload)
		}
		for k, v := range w.params {
			if i18n["params"].(map[string]any)[k] != v {
				t.Fatalf("通知 %q 参数 %s 应为 %q: %v", rows[i].Title, k, v, i18n)
			}
		}
	}
	var unknown models.Notification
	db.First(&unknown, rows[4].ID)
	if strings.Contains(unknown.Payload, "i18n") {
		t.Fatalf("无法识别的通知不应改动: %s", unknown.Payload)
	}
	if a.getSetting(cfgNotificationBackfilled) != "true" {
		t.Fatal("回填完成后应记标记")
	}
}
