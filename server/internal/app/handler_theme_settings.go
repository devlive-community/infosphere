package app

import (
	"net/http"
	"regexp"

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
var validButtonSizes = map[string]bool{"sm": true, "md": true, "lg": true}
var validFontSizes = map[string]bool{"14": true, "15": true, "16": true}
var validContentWidths = map[string]bool{"narrow": true, "normal": true, "wide": true}
var validNavHeights = map[string]bool{"56": true, "64": true, "72": true}
var validSidebarWidths = map[string]bool{"220": true, "260": true, "300": true}

var hexColorRe = regexp.MustCompile(`^#[0-9A-Fa-f]{6}$`)

func defaultThemeSetting(userID uint) models.UserThemeSetting {
	return models.UserThemeSetting{
		UserID:       userID,
		PrimaryHue:   "blue",
		Radius:       "lg",
		ButtonSize:   "md",
		FontSize:     "15",
		ContentWidth: "normal",
		NavHeight:    "64",
		SidebarWidth: "260",
		PageBg:       "#F7F6F2",
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
		PrimaryHue   *string `json:"primary_hue"`
		Radius       *string `json:"radius"`
		ButtonSize   *string `json:"button_size"`
		FontSize     *string `json:"font_size"`
		ContentWidth *string `json:"content_width"`
		NavHeight    *string `json:"nav_height"`
		SidebarWidth *string `json:"sidebar_width"`
		PageBg       *string `json:"page_bg"`
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
	if req.ButtonSize != nil && validButtonSizes[*req.ButtonSize] {
		s.ButtonSize = *req.ButtonSize
	}
	if req.FontSize != nil && validFontSizes[*req.FontSize] {
		s.FontSize = *req.FontSize
	}
	if req.ContentWidth != nil && validContentWidths[*req.ContentWidth] {
		s.ContentWidth = *req.ContentWidth
	}
	if req.NavHeight != nil && validNavHeights[*req.NavHeight] {
		s.NavHeight = *req.NavHeight
	}
	if req.SidebarWidth != nil && validSidebarWidths[*req.SidebarWidth] {
		s.SidebarWidth = *req.SidebarWidth
	}
	if req.PageBg != nil && hexColorRe.MatchString(*req.PageBg) {
		s.PageBg = *req.PageBg
	}
	if err := a.DB.Save(&s).Error; err != nil {
		fail(c, http.StatusInternalServerError, "保存失败: "+err.Error())
		return
	}
	ok(c, s)
}
