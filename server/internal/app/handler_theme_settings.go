package app

import (
	"net/http"

	"infosphere/server/internal/models"

	"github.com/gin-gonic/gin"
)

var validPrimaryHues = map[string]bool{
	"blue": true, "indigo": true, "violet": true,
	"emerald": true, "rose": true, "amber": true,
}
var validRadii = map[string]bool{
	"sm": true, "md": true, "lg": true, "xl": true, "2xl": true,
}

func defaultThemeSetting(userID uint) models.UserThemeSetting {
	return models.UserThemeSetting{
		UserID:     userID,
		PrimaryHue: "blue",
		Radius:     "lg",
	}
}

// GetThemeSettings GET /auth/theme-settings
func (a *App) GetThemeSettings(c *gin.Context) {
	u := currentUser(c)
	var s models.UserThemeSetting
	if err := a.DB.Where("user_id = ?", u.ID).First(&s).Error; err != nil {
		ok(c, defaultThemeSetting(u.ID))
		return
	}
	ok(c, s)
}

// UpdateThemeSettings PUT /auth/theme-settings
func (a *App) UpdateThemeSettings(c *gin.Context) {
	u := currentUser(c)
	var req struct {
		PrimaryHue *string `json:"primary_hue"`
		Radius     *string `json:"radius"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}

	var s models.UserThemeSetting
	if err := a.DB.Where("user_id = ?", u.ID).First(&s).Error; err != nil {
		s = defaultThemeSetting(u.ID)
	}
	if req.PrimaryHue != nil && validPrimaryHues[*req.PrimaryHue] {
		s.PrimaryHue = *req.PrimaryHue
	}
	if req.Radius != nil && validRadii[*req.Radius] {
		s.Radius = *req.Radius
	}
	if err := a.DB.Save(&s).Error; err != nil {
		fail(c, http.StatusInternalServerError, "保存失败: "+err.Error())
		return
	}
	ok(c, s)
}
