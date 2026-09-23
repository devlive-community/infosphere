package growth

import (
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"knowforge/server/internal/models"
)

// leaderboardPeriods 排行榜周期：all=累计经验；week/month=近 7/30 天新增经验（按流水求和，扣回的负经验同样计入）。
var leaderboardPeriods = map[string]time.Duration{"week": 7 * 24 * time.Hour, "month": 30 * 24 * time.Hour}

type leaderboardUser struct {
	ID       uint   `json:"id"`
	Username string `json:"username"`
	Nickname string `json:"nickname"`
	Avatar   string `json:"avatar"`
}

type leaderboardEntry struct {
	Rank  int                     `json:"rank"`
	XP    int64                   `json:"xp"`
	User  leaderboardUser         `json:"user"`
	Level *models.LevelDefinition `json:"level,omitempty"`
}

type leaderboardRow struct {
	UserID       uint
	XP           int64
	Username     string
	Nickname     string
	Avatar       string
	CurrentLevel int
}

// leaderboardQuery 周期内经验 > 0、公开成长资料且账号启用的用户（按经验倒序、用户 ID 升序以稳定排序）。
func (b *behavior) leaderboardQuery(period string) *gorm.DB {
	db := b.core.Gorm()
	base := db.Table("user_growth_profiles AS p").
		Joins("JOIN users u ON u.id = p.user_id").
		Where("p.public = ? AND u.is_active = ?", true, true)
	if window, ok := leaderboardPeriods[period]; ok {
		sums := db.Model(&models.ExperienceEvent{}).
			Select("user_id, SUM(final_xp) AS xp").
			Where("created_at >= ?", time.Now().Add(-window)).
			Group("user_id")
		return base.Joins("JOIN (?) s ON s.user_id = p.user_id", sums).
			Where("s.xp > 0").
			Select("p.user_id, s.xp AS xp, u.username, u.nickname, u.avatar, p.current_level")
	}
	return base.Where("p.lifetime_xp > 0").
		Select("p.user_id, p.lifetime_xp AS xp, u.username, u.nickname, u.avatar, p.current_level")
}

// Leaderboard GET /growth/leaderboard?period=all|week|month&page=&page_size=
// 公开经验排行榜（仅统计公开成长资料的启用用户）；已登录时附带本人名次 me（本人未公开也可见自己的名次）。
func (b *behavior) Leaderboard(c *gin.Context) {
	core := b.core
	period := c.DefaultQuery("period", "all")
	if _, ok := leaderboardPeriods[period]; !ok {
		period = "all"
	}
	page, pageSize := core.Paginate(c)
	var total int64
	core.Gorm().Table("(?) AS lb", b.leaderboardQuery(period)).Count(&total)
	var rows []leaderboardRow
	b.leaderboardQuery(period).Order("xp DESC, p.user_id ASC").Limit(pageSize).Offset((page - 1) * pageSize).Scan(&rows)

	levels := b.levelsByNumber()
	items := make([]leaderboardEntry, 0, len(rows))
	for i, r := range rows {
		items = append(items, leaderboardEntry{
			Rank: (page-1)*pageSize + i + 1, XP: r.XP,
			User:  leaderboardUser{ID: r.UserID, Username: r.Username, Nickname: r.Nickname, Avatar: r.Avatar},
			Level: levels[r.CurrentLevel],
		})
	}
	out := gin.H{"items": items, "total": total, "page": page, "page_size": pageSize, "period": period}
	if u := core.CurrentUser(c); u != nil {
		out["me"] = b.myLeaderboardRank(u, period, levels)
	}
	core.OK(c, out)
}

// myLeaderboardRank 本人在该周期的经验与名次（名次按公开榜计算：比本人经验高的公开用户数 + 1；本人经验为 0 时无名次）。
func (b *behavior) myLeaderboardRank(u *models.User, period string, levels map[int]*models.LevelDefinition) gin.H {
	db := b.core.Gorm()
	p := b.growthProfile(u.ID)
	xp := p.LifetimeXP
	if window, ok := leaderboardPeriods[period]; ok {
		db.Model(&models.ExperienceEvent{}).Where("user_id = ? AND created_at >= ?", u.ID, time.Now().Add(-window)).
			Select("COALESCE(SUM(final_xp),0)").Scan(&xp)
	}
	me := gin.H{"xp": xp, "public": p.Public, "user": leaderboardUser{ID: u.ID, Username: u.Username, Nickname: u.Nickname, Avatar: u.Avatar}, "level": levels[p.CurrentLevel]}
	if xp > 0 {
		var ahead int64
		db.Table("(?) AS lb", b.leaderboardQuery(period)).Where("lb.xp > ? AND lb.user_id <> ?", xp, u.ID).Count(&ahead)
		me["rank"] = ahead + 1
	}
	return me
}

func (b *behavior) levelsByNumber() map[int]*models.LevelDefinition {
	var defs []models.LevelDefinition
	b.core.Gorm().Find(&defs)
	out := make(map[int]*models.LevelDefinition, len(defs))
	for i := range defs {
		out[defs[i].Level] = &defs[i]
	}
	return out
}
