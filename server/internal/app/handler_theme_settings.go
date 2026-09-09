package app

import (
	"net/http"
	"regexp"

	"infosphere/server/internal/models"

	"github.com/gin-gonic/gin"
)

var validPrimaryHues = map[string]bool{
	"blue": true, "indigo": true, "violet": true,
	"emerald": true, "rose": true, "amber": true, "custom": true,
}
var validRadii = map[string]bool{
	"sm": true, "md": true, "lg": true, "xl": true, "2xl": true, "custom": true,
}
var validButtonSizes = map[string]bool{"sm": true, "md": true, "lg": true, "custom": true}
var validFontSizes = map[string]bool{"14": true, "15": true, "16": true, "custom": true}
var validContentWidths = map[string]bool{"narrow": true, "normal": true, "wide": true, "custom": true}
var validNavHeights = map[string]bool{"56": true, "64": true, "72": true, "custom": true}
var validSidebarWidths = map[string]bool{"220": true, "260": true, "300": true, "custom": true}
var validPageBgs = map[string]bool{
	"#F7F6F2": true, "#F8FAFC": true, "#FFFFFF": true, "#F1F5F9": true, "#FAFAF9": true, "custom": true,
}

var hexColorRe = regexp.MustCompile(`^#[0-9A-Fa-f]{6}$`)

func defaultThemeSetting(userID uint) models.UserThemeSetting {
	return models.UserThemeSetting{
		UserID:       userID,
		PrimaryHue:   "blue",
		CustomColor:  "",
		Radius:       "lg",
		CustomRadius: "",
		ButtonSize:   "md",
		CustomControlHeight: "",
		FontSize:     "15",
		CustomFontSize:      "",
		ContentWidth: "normal",
		CustomContentWidth:  "",
		NavHeight:    "64",
		CustomNavHeight:     "",
		SidebarWidth: "260",
		CustomSidebarWidth:  "",
		PageBg:       "#F7F6F2",
		CustomPageBg: "",
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
		PrimaryHue         *string `json:"primary_hue"`
		CustomColor        *string `json:"custom_color"`
		Radius             *string `json:"radius"`
		CustomRadius       *string `json:"custom_radius"`
		ButtonSize         *string `json:"button_size"`
		CustomControlHeight *string `json:"custom_control_height"`
		FontSize           *string `json:"font_size"`
		CustomFontSize     *string `json:"custom_font_size"`
		ContentWidth       *string `json:"content_width"`
		CustomContentWidth *string `json:"custom_content_width"`
		NavHeight          *string `json:"nav_height"`
		CustomNavHeight    *string `json:"custom_nav_height"`
		SidebarWidth       *string `json:"sidebar_width"`
		CustomSidebarWidth *string `json:"custom_sidebar_width"`
		PageBg             *string `json:"page_bg"`
		CustomPageBg       *string `json:"custom_page_bg"`
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
	if req.CustomColor != nil {
		if s.PrimaryHue == "custom" && hexColorRe.MatchString(*req.CustomColor) {
			s.CustomColor = *req.CustomColor
		} else if s.PrimaryHue != "custom" {
			s.CustomColor = ""
		}
	}
	if req.Radius != nil && validRadii[*req.Radius] {
		s.Radius = *req.Radius
	}
	if req.CustomRadius != nil && s.Radius == "custom" {
		s.CustomRadius = *req.CustomRadius
	}
	if req.ButtonSize != nil && validButtonSizes[*req.ButtonSize] {
		s.ButtonSize = *req.ButtonSize
	}
	if req.CustomControlHeight != nil && s.ButtonSize == "custom" {
		s.CustomControlHeight = *req.CustomControlHeight
	}
	if req.FontSize != nil && validFontSizes[*req.FontSize] {
		s.FontSize = *req.FontSize
	}
	if req.CustomFontSize != nil && s.FontSize == "custom" {
		s.CustomFontSize = *req.CustomFontSize
	}
	if req.ContentWidth != nil && validContentWidths[*req.ContentWidth] {
		s.ContentWidth = *req.ContentWidth
	}
	if req.CustomContentWidth != nil && s.ContentWidth == "custom" {
		s.CustomContentWidth = *req.CustomContentWidth
	}
	if req.NavHeight != nil && validNavHeights[*req.NavHeight] {
		s.NavHeight = *req.NavHeight
	}
	if req.CustomNavHeight != nil && s.NavHeight == "custom" {
		s.CustomNavHeight = *req.CustomNavHeight
	}
	if req.SidebarWidth != nil && validSidebarWidths[*req.SidebarWidth] {
		s.SidebarWidth = *req.SidebarWidth
	}
	if req.CustomSidebarWidth != nil && s.SidebarWidth == "custom" {
		s.CustomSidebarWidth = *req.CustomSidebarWidth
	}
	if req.PageBg != nil {
		if validPageBgs[*req.PageBg] {
			s.PageBg = *req.PageBg
		} else if hexColorRe.MatchString(*req.PageBg) {
			s.PageBg = *req.PageBg
		}
	}
	if req.CustomPageBg != nil && s.PageBg == "custom" && hexColorRe.MatchString(*req.CustomPageBg) {
		s.CustomPageBg = *req.CustomPageBg
	}
	if err := a.DB.Save(&s).Error; err != nil {
		fail(c, http.StatusInternalServerError, "保存失败: "+err.Error())
		return
	}
	ok(c, s)
}
