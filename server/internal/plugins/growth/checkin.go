package growth

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"

	"knowforge/server/internal/models"
	"knowforge/server/internal/plugincore"
)

// 每日签到：每用户每个自然日（服务器本地时区）一次；连续签到天数按「昨天有签到则 +1，否则从 1 开始」累计。
// 签到发出业务活动 checkin.created（经验规则 checkin.daily、成就评估），连续签到每满 N 天另发 checkin.streak_milestone
// （经验规则 checkin.streak_bonus）。经验由规则目录统一发放，管理员可在经验规则中调整或停用。

const dayLayout = "2006-01-02"

func dayString(t time.Time) string { return t.In(time.Local).Format(dayLayout) }

type checkinStatus struct {
	Enabled       bool     `json:"enabled"`
	Today         string   `json:"today"`
	CheckedToday  bool     `json:"checked_today"`
	Streak        int      `json:"streak"`         // 当前连续天数（今天或昨天签到时有效，否则 0）
	LongestStreak int      `json:"longest_streak"` // 历史最长连续天数
	TotalDays     int64    `json:"total_days"`
	StreakDays    int      `json:"streak_bonus_days"` // 连续签到奖励周期 N
	NextBonusIn   int      `json:"next_bonus_in"`     // 再签到几天（含今天未签的这一次）可得下一次连续奖励
	Month         string   `json:"month"`             // YYYY-MM
	Days          []string `json:"days"`              // 该月已签到的日期
}

type checkinResult struct {
	checkinStatus
	Already   bool  `json:"already"`    // 今天此前已签到（本次未新增）
	XPAwarded int64 `json:"xp_awarded"` // 本次签到获得的经验（含连续奖励）
	Milestone bool  `json:"milestone"`  // 本次达成连续签到奖励
}

// currentStreak 当前连续签到天数：最近一次签到是今天或昨天时取其 Streak，否则已中断为 0。
func (b *behavior) currentStreak(userID uint, now time.Time) (int, bool) {
	var last models.UserCheckin
	if b.core.Gorm().Where("user_id = ?", userID).Order("day DESC").First(&last).Error != nil {
		return 0, false
	}
	today := dayString(now)
	if last.Day == today {
		return last.Streak, true
	}
	if last.Day == dayString(now.AddDate(0, 0, -1)) {
		return last.Streak, false
	}
	return 0, false
}

func (b *behavior) checkinStatus(userID uint, month string, now time.Time) checkinStatus {
	db := b.core.Gorm()
	settings := b.settings()
	if _, err := time.ParseInLocation("2006-01", month, time.Local); err != nil {
		month = now.In(time.Local).Format("2006-01")
	}
	streak, checkedToday := b.currentStreak(userID, now)
	st := checkinStatus{
		Enabled: settings.CheckinEnabled, Today: dayString(now), CheckedToday: checkedToday, Streak: streak,
		StreakDays: settings.CheckinStreakDays, Month: month, Days: []string{},
	}
	db.Model(&models.UserCheckin{}).Where("user_id = ?", userID).Count(&st.TotalDays)
	db.Model(&models.UserCheckin{}).Where("user_id = ?", userID).Select("COALESCE(MAX(streak),0)").Scan(&st.LongestStreak)
	db.Model(&models.UserCheckin{}).Where("user_id = ? AND day LIKE ?", userID, month+"-%").Order("day ASC").Pluck("day", &st.Days)
	// 已签到：再签 N - streak%N 天达成下一次奖励；未签到：今天签后 streak+1，剩余天数（含今天）同样是 N - streak%N
	n := settings.CheckinStreakDays
	st.NextBonusIn = n - streak%n
	return st
}

// MyCheckin GET /users/me/checkin?month=YYYY-MM 签到状态与当月签到日历。
func (b *behavior) MyCheckin(c *gin.Context) {
	u := b.core.CurrentUser(c)
	b.core.OK(c, b.checkinStatus(u.ID, c.Query("month"), time.Now()))
}

// Checkin POST /users/me/checkin 今日签到（幂等：今天已签到时返回 already=true，不重复发经验）。
func (b *behavior) Checkin(c *gin.Context) {
	core := b.core
	u := core.CurrentUser(c)
	settings := b.settings()
	if !settings.CheckinEnabled {
		core.Fail(c, http.StatusNotFound, "签到未开放")
		return
	}
	now := time.Now()
	db := core.Gorm()
	before := b.growthProfile(u.ID).LifetimeXP
	res := checkinResult{}
	today := dayString(now)

	var existing models.UserCheckin
	if db.Where("user_id = ? AND day = ?", u.ID, today).First(&existing).Error == nil {
		res.Already = true
	} else {
		streak := 1
		var prev models.UserCheckin
		if db.Where("user_id = ? AND day = ?", u.ID, dayString(now.AddDate(0, 0, -1))).First(&prev).Error == nil {
			streak = prev.Streak + 1
		}
		row := models.UserCheckin{UserID: u.ID, Day: today, Streak: streak}
		if err := db.Create(&row).Error; err != nil {
			// 并发重复签到：唯一索引 (user_id, day) 冲突，视为已签到
			res.Already = true
		} else {
			id := strconv.FormatUint(uint64(row.ID), 10)
			plugincore.FireActivity(core, plugincore.ActivityEvent{UserID: u.ID, Type: "checkin.created", SourceType: "checkin", SourceID: id, DedupeKey: "checkin.created:" + id})
			if streak%settings.CheckinStreakDays == 0 {
				res.Milestone = true
				plugincore.FireActivity(core, plugincore.ActivityEvent{UserID: u.ID, Type: "checkin.streak_milestone", SourceType: "checkin", SourceID: id, DedupeKey: "checkin.streak_milestone:" + id})
			}
		}
	}
	res.checkinStatus = b.checkinStatus(u.ID, "", now)
	res.XPAwarded = b.growthProfile(u.ID).LifetimeXP - before
	core.OK(c, res)
}
