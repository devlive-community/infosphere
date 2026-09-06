package app

import (
	"net/http"
	"strconv"
	"strings"

	"infosphere/server/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// M14 协作与团队：
//   - 书籍所有者（book.user_id）或管理员可增删协作者；协作者可查看列表、可自行退出
//   - editor 可编辑章节内容；viewer 可访问私有协作书籍的已发布章节
//   - 添加协作者时通过 Notify 发送协作邀请通知

var collaboratorRoles = map[string]bool{"editor": true, "viewer": true}

// ListCollaborators GET /books/:id/collaborators
func (a *App) ListCollaborators(c *gin.Context) {
	book, status := a.findBook(c)
	if book == nil {
		fail(c, status, "书籍不存在")
		return
	}
	u := currentUser(c)
	if !a.canManageBook(u, book) {
		if _, ok := a.collaboratorRole(u, book.ID); !ok {
			fail(c, http.StatusForbidden, "无权查看协作者")
			return
		}
	}

	collaborators := []models.BookCollaborator{}
	a.DB.Preload("User", func(tx *gorm.DB) *gorm.DB {
		return tx.Select("id", "username", "avatar", "bio")
	}).Where("book_id = ?", book.ID).Order("created_at ASC").Find(&collaborators)
	ok(c, gin.H{"collaborators": collaborators})
}

type collaboratorPayload struct {
	Username string `json:"username"`
	Role     string `json:"role"`
}

// AddCollaborator POST /books/:id/collaborators 添加或更新协作者（同名覆盖角色）
func (a *App) AddCollaborator(c *gin.Context) {
	book, status := a.findBook(c)
	if book == nil {
		fail(c, status, "书籍不存在")
		return
	}
	u := currentUser(c)
	if !a.canManageBook(u, book) {
		fail(c, http.StatusForbidden, "仅书籍所有者可管理协作者")
		return
	}
	var req collaboratorPayload
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	req.Role = strings.ToLower(strings.TrimSpace(req.Role))
	req.Username = strings.TrimSpace(req.Username)
	if !collaboratorRoles[req.Role] {
		fail(c, http.StatusBadRequest, "角色必须为 editor 或 viewer")
		return
	}
	var target models.User
	if err := a.DB.Where("username = ?", req.Username).First(&target).Error; err != nil {
		fail(c, http.StatusNotFound, "用户不存在")
		return
	}
	if target.ID == book.UserID {
		fail(c, http.StatusBadRequest, "书籍所有者无需添加为协作者")
		return
	}
	if !target.IsActive {
		fail(c, http.StatusForbidden, "该账户已被禁用")
		return
	}

	var collab models.BookCollaborator
	if err := a.DB.Where("book_id = ? AND user_id = ?", book.ID, target.ID).First(&collab).Error; err == nil {
		// 已是协作者：更新角色
		if collab.Role == req.Role {
			ok(c, collab)
			return
		}
		collab.Role = req.Role
		if err := a.DB.Model(&collab).Update("role", req.Role).Error; err != nil {
			fail(c, http.StatusInternalServerError, "保存失败")
			return
		}
		ok(c, collab)
		return
	}

	collab = models.BookCollaborator{BookID: book.ID, UserID: target.ID, Role: req.Role}
	if err := a.DB.Create(&collab).Error; err != nil {
		fail(c, http.StatusInternalServerError, "添加失败: "+err.Error())
		return
	}
	a.Notify(target.ID, "collaboration",
		"「"+u.Username+"」邀请你协作《"+book.Title+"》",
		map[string]any{
			"link": "/book/writer/" + book.Slug,
			"role": req.Role,
		})
	ok(c, collab)
}

// RemoveCollaborator DELETE /books/:id/collaborators/:userId 移除协作者（协作者可自行退出）
func (a *App) RemoveCollaborator(c *gin.Context) {
	book, status := a.findBook(c)
	if book == nil {
		fail(c, status, "书籍不存在")
		return
	}
	u := currentUser(c)
	targetID, err := strconv.ParseUint(c.Param("userId"), 10, 64)
	if err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	// 所有者/管理员可移除任意协作者；协作者只能移除自己（退出协作）
	if !a.canManageBook(u, book) && u.ID != uint(targetID) {
		fail(c, http.StatusForbidden, "仅书籍所有者可移除协作者")
		return
	}
	result := a.DB.Where("book_id = ? AND user_id = ?", book.ID, targetID).Delete(&models.BookCollaborator{})
	if result.Error != nil {
		fail(c, http.StatusInternalServerError, "移除失败")
		return
	}
	if result.RowsAffected == 0 {
		fail(c, http.StatusNotFound, "该用户不是协作者")
		return
	}
	ok(c, gin.H{"message": "已移除"})
}
