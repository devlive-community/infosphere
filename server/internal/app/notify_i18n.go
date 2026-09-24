package app

import (
	"context"
	"encoding/json"
	"log"
	"strconv"
	"time"

	"knowforge/server/internal/i18ntext"
	"knowforge/server/internal/jobqueue"
	"knowforge/server/internal/models"
)

// 站内通知多语言：通知以 i18n 键 + 参数发送（payload.i18n = {key, params}），前端按界面语言渲染；
// Title 存站点默认语言的兜底文案（旧客户端/无翻译时显示）；通知邮件按收件人偏好语言渲染。
// 模板登记在 i18ntext（核心在此登记，插件在各自 init 中登记），管理员在「语言包」中发布的同键翻译优先。

func init() {
	for key, tpls := range map[string]map[string]string{
		"notify.book.reviewed":     {"zh-CN": "「{user}」评价了你的书籍《{book}》", "en": `{user} reviewed your book "{book}"`},
		"notify.comment.chapter":   {"zh-CN": "「{user}」评论了你的章节《{chapter}》", "en": `{user} commented on your chapter "{chapter}"`},
		"notify.comment.reply":     {"zh-CN": "「{user}」回复了你的评论", "en": "{user} replied to your comment"},
		"notify.reaction.like":     {"zh-CN": "「{user}」点赞了你的书籍《{book}》", "en": `{user} liked your book "{book}"`},
		"notify.reaction.favorite": {"zh-CN": "「{user}」收藏了你的书籍《{book}》", "en": `{user} added your book "{book}" to favorites`},
		"notify.collab.invited":    {"zh-CN": "「{user}」邀请你协作《{book}》", "en": `{user} invited you to collaborate on "{book}"`},
		"notify.collab.accepted":   {"zh-CN": "「{user}」已接受《{book}》的协作邀请", "en": `{user} accepted your invitation to collaborate on "{book}"`},
		"notify.collab.rejected":   {"zh-CN": "「{user}」已拒绝《{book}》的协作邀请", "en": `{user} declined your invitation to collaborate on "{book}"`},
		"notify.report.resolved":   {"zh-CN": "你对“{target}”的举报已处理", "en": `Your report on "{target}" has been handled`},
		"notify.system.upgraded":   {"zh-CN": "系统已升级到 v{version}", "en": "The system has been upgraded to v{version}"},
		// 通知邮件的固定文案
		"notify.email.greeting":    {"zh-CN": "你好，", "en": "Hi,"},
		"notify.email.viewDetails": {"zh-CN": "查看详情", "en": "View details"},
		"notify.email.footer":      {"zh-CN": "这是来自 {site} 的通知邮件。如需关闭，可在账户设置的通知设置中调整。", "en": "This notification was sent by {site}. You can turn these emails off in your account's notification settings."},
	} {
		i18ntext.Register(key, tpls)
	}
}

// NotifyI18n 以可翻译文本发送站内通知（并按偏好发邮件）。params 为插值参数；payload 为附加数据（如 link）。
func (a *App) NotifyI18n(userID uint, ntype, key string, params map[string]string, payload map[string]any) {
	if payload == nil {
		payload = map[string]any{}
	}
	if params == nil {
		params = map[string]string{}
	}
	payload["i18n"] = map[string]any{"key": key, "params": params}
	a.Notify(userID, ntype, a.renderText(key, params, a.siteLocaleChain()), payload)
}

// siteLocaleChain 站点默认语言的回退链（兜底标题用）。
func (a *App) siteLocaleChain() []string {
	rows, err := a.siteLocales()
	if err != nil || len(rows) == 0 {
		return []string{"zh-CN"}
	}
	return localeChain(defaultLocale(rows), rows)
}

// userLocaleChain 用户偏好语言（已启用时）的回退链，未设置时用站点默认语言。
func (a *App) userLocaleChain(u *models.User) []string {
	rows, err := a.siteLocales()
	if err != nil || len(rows) == 0 {
		return []string{"zh-CN"}
	}
	code := defaultLocale(rows)
	if pref, err := canonicalLocale(u.PreferredLocale); err == nil {
		for _, r := range rows {
			if r.Code == pref && r.Enabled {
				code = pref
			}
		}
	}
	return localeChain(code, rows)
}

// renderText 按语言链渲染可翻译文本：每种语言先看管理员发布的语言包覆盖，再看登记的模板；都没有时用 zh-CN 模板，最后回退键本身。
func (a *App) renderText(key string, params map[string]string, chain []string) string {
	overrides := map[string]map[string]string{}
	if len(chain) > 0 {
		var bundles []models.UIMessageBundle
		a.DB.Where("locale IN ?", chain).Find(&bundles)
		for _, b := range bundles {
			overrides[b.Locale] = decodeMessages(b.Published)
		}
	}
	for _, locale := range chain {
		if tpl := overrides[locale][key]; tpl != "" {
			return i18ntext.Interpolate(tpl, params)
		}
		if tpl, ok := i18ntext.Template(key, locale); ok {
			return i18ntext.Interpolate(tpl, params)
		}
	}
	if tpl, ok := i18ntext.Template(key, "zh-CN"); ok {
		return i18ntext.Interpolate(tpl, params)
	}
	return key
}

// notificationI18n 从通知 payload 取出 i18n 键与参数。
func notificationI18n(payload map[string]any) (string, map[string]string, bool) {
	raw, ok := payload["i18n"].(map[string]any)
	if !ok {
		return "", nil, false
	}
	key, _ := raw["key"].(string)
	if key == "" {
		return "", nil, false
	}
	params := map[string]string{}
	switch p := raw["params"].(type) {
	case map[string]string:
		params = p
	case map[string]any:
		for k, v := range p {
			switch vv := v.(type) {
			case string:
				params[k] = vv
			case float64:
				params[k] = strconv.FormatFloat(vv, 'f', -1, 64)
			case int:
				params[k] = strconv.Itoa(vv)
			}
		}
	}
	return key, params, true
}

// —— 历史通知回填：用 zh-CN 模板反解析旧标题，为其补上 payload.i18n（一次性后台任务，完成后记标记）——

const (
	notificationBackfillJobType = "notification.i18n_backfill"
	cfgNotificationBackfilled   = "notifications_i18n_backfilled"
	notificationBackfillBatch   = 500
)

func (a *App) enqueueNotificationBackfillIfNeeded(ctx context.Context, queue *jobqueue.Queue) {
	if queue == nil || a.getSetting(cfgNotificationBackfilled) == "true" {
		return
	}
	if _, _, err := queue.EnqueueIfDue(ctx, notificationBackfillJobType, struct{}{}, 3, time.Hour); err != nil {
		log.Printf("[jobs] enqueue notification i18n backfill failed: %v", err)
	}
}

// runNotificationBackfill 为没有 i18n 的历史通知补上键与参数（无法识别的标题保持原样），完成后写标记不再执行。
func (a *App) runNotificationBackfill(ctx context.Context, _ json.RawMessage) error {
	for lastID := uint(0); ; {
		var rows []models.Notification
		if err := a.DB.WithContext(ctx).Where("id > ?", lastID).Order("id ASC").Limit(notificationBackfillBatch).Find(&rows).Error; err != nil {
			return err
		}
		for _, n := range rows {
			lastID = n.ID
			payload := map[string]any{}
			if n.Payload != "" && json.Unmarshal([]byte(n.Payload), &payload) != nil {
				continue
			}
			if _, has := payload["i18n"]; has {
				continue
			}
			key, params, ok := i18ntext.Parse("zh-CN", n.Title)
			if !ok {
				continue
			}
			payload["i18n"] = map[string]any{"key": key, "params": params}
			raw, _ := json.Marshal(payload)
			if err := a.DB.WithContext(ctx).Model(&models.Notification{}).Where("id = ?", n.ID).Update("payload", string(raw)).Error; err != nil {
				return err
			}
		}
		if len(rows) < notificationBackfillBatch {
			return a.setSetting(cfgNotificationBackfilled, "true", "历史通知已回填多语言键")
		}
	}
}
