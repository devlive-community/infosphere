package app

import (
	"net/http"

	"infosphere/server/internal/models"

	"github.com/gin-gonic/gin"
)

var exportPageSizes = map[string]bool{"A4": true, "Letter": true}
var exportMargins = map[string]bool{"narrow": true, "normal": true, "wide": true}
var exportCodeThemes = map[string]bool{"light": true, "dark": true}

// defaultExportSetting 未配置时的默认导出样式
func defaultExportSetting(userID uint) models.UserExportSetting {
	return models.UserExportSetting{
		UserID: userID, PageSize: "A4", IncludeCover: true, IncludeToc: true,
		FontSize: 15, CodeTheme: "light", Margin: "normal",
	}
}

// GetExportSettings GET /me/export-settings 当前用户的导出样式偏好
func (a *App) GetExportSettings(c *gin.Context) {
	u := currentUser(c)
	var s models.UserExportSetting
	if err := a.DB.Where("user_id = ?", u.ID).First(&s).Error; err != nil {
		ok(c, defaultExportSetting(u.ID))
		return
	}
	ok(c, s)
}

// UpdateExportSettings PUT /me/export-settings 保存导出样式偏好
func (a *App) UpdateExportSettings(c *gin.Context) {
	u := currentUser(c)
	var req struct {
		PageSize     *string `json:"page_size"`
		IncludeCover *bool   `json:"include_cover"`
		IncludeToc   *bool   `json:"include_toc"`
		FontSize     *int    `json:"font_size"`
		CodeTheme    *string `json:"code_theme"`
		Margin       *string `json:"margin"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}

	var s models.UserExportSetting
	if err := a.DB.Where("user_id = ?", u.ID).First(&s).Error; err != nil {
		s = defaultExportSetting(u.ID)
	}
	if req.PageSize != nil && exportPageSizes[*req.PageSize] {
		s.PageSize = *req.PageSize
	}
	if req.IncludeCover != nil {
		s.IncludeCover = *req.IncludeCover
	}
	if req.IncludeToc != nil {
		s.IncludeToc = *req.IncludeToc
	}
	if req.FontSize != nil && *req.FontSize >= 12 && *req.FontSize <= 20 {
		s.FontSize = *req.FontSize
	}
	if req.CodeTheme != nil && exportCodeThemes[*req.CodeTheme] {
		s.CodeTheme = *req.CodeTheme
	}
	if req.Margin != nil && exportMargins[*req.Margin] {
		s.Margin = *req.Margin
	}
	if err := a.DB.Save(&s).Error; err != nil {
		fail(c, http.StatusInternalServerError, "保存失败: "+err.Error())
		return
	}
	ok(c, s)
}
