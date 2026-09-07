package app

import (
	"net/http"
	"strconv"

	"infosphere/server/internal/models"

	"github.com/gin-gonic/gin"
)

// AdminListUsers GET /admin/users 管理员分页查询用户（支持关键字与角色/状态筛选）
func (a *App) AdminListUsers(c *gin.Context) {
	page, pageSize := paginate(c)
	query := a.DB.Model(&models.User{})
	if q := c.Query("q"); q != "" {
		like := "%" + q + "%"
		query = query.Where("username LIKE ? OR email LIKE ?", like, like)
	}
	if role := c.Query("role"); role == "admin" || role == "user" {
		query = query.Where("role = ?", role)
	}
	switch c.Query("status") {
	case "active":
		query = query.Where("is_active = ?", true)
	case "inactive":
		query = query.Where("is_active = ?", false)
	}

	var total int64
	query.Count(&total)
	users := []models.User{}
	if err := query.Order("created_at DESC").
		Limit(pageSize).Offset((page - 1) * pageSize).Find(&users).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询失败")
		return
	}
	ok(c, PageResult{Items: users, Total: total, Page: page, PageSize: pageSize})
}

// findManagedUser 载入目标用户并禁止操作自身，返回 nil 时已写出错误响应
func (a *App) findManagedUser(c *gin.Context) *models.User {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		fail(c, http.StatusBadRequest, "用户 ID 无效")
		return nil
	}
	if me := currentUser(c); me != nil && uint64(me.ID) == id {
		fail(c, http.StatusBadRequest, "不能对当前登录的管理员自身执行该操作")
		return nil
	}
	var u models.User
	if err := a.DB.First(&u, id).Error; err != nil {
		fail(c, http.StatusNotFound, "用户不存在")
		return nil
	}
	return &u
}

// activeAdminCount 统计仍处于启用状态的管理员数量，用于防止移除最后一位管理员
func (a *App) activeAdminCount() int64 {
	var n int64
	a.DB.Model(&models.User{}).Where("role = ? AND is_active = ?", "admin", true).Count(&n)
	return n
}

// AdminUpdateUserRole PUT /admin/users/:id/role 变更用户角色
func (a *App) AdminUpdateUserRole(c *gin.Context) {
	var req struct {
		Role string `json:"role"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || (req.Role != "admin" && req.Role != "user") {
		fail(c, http.StatusBadRequest, "角色只能为 admin 或 user")
		return
	}
	u := a.findManagedUser(c)
	if u == nil {
		return
	}
	// 将唯一的启用管理员降级会导致无人可管理后台
	if u.Role == "admin" && req.Role != "admin" && u.IsActive && a.activeAdminCount() <= 1 {
		fail(c, http.StatusBadRequest, "至少需保留一位启用状态的管理员")
		return
	}
	if err := a.DB.Model(u).Update("role", req.Role).Error; err != nil {
		fail(c, http.StatusInternalServerError, "保存失败")
		return
	}
	u.Role = req.Role
	ok(c, u)
}

// AdminUpdateUserStatus PUT /admin/users/:id/status 启用/停用用户
func (a *App) AdminUpdateUserStatus(c *gin.Context) {
	var req struct {
		IsActive *bool `json:"is_active"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.IsActive == nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	u := a.findManagedUser(c)
	if u == nil {
		return
	}
	if !*req.IsActive && u.Role == "admin" && u.IsActive && a.activeAdminCount() <= 1 {
		fail(c, http.StatusBadRequest, "至少需保留一位启用状态的管理员")
		return
	}
	if err := a.DB.Model(u).Update("is_active", *req.IsActive).Error; err != nil {
		fail(c, http.StatusInternalServerError, "保存失败")
		return
	}
	u.IsActive = *req.IsActive
	ok(c, u)
}

// AdminDeleteUser DELETE /admin/users/:id 删除用户（拥有书籍者需先转移或删除书籍）
func (a *App) AdminDeleteUser(c *gin.Context) {
	u := a.findManagedUser(c)
	if u == nil {
		return
	}
	var bookCount int64
	a.DB.Model(&models.Book{}).Where("user_id = ?", u.ID).Count(&bookCount)
	if bookCount > 0 {
		fail(c, http.StatusBadRequest, "该用户仍拥有书籍，请先删除其书籍或改为停用账户")
		return
	}
	if err := a.DB.Delete(u).Error; err != nil {
		fail(c, http.StatusInternalServerError, "删除失败")
		return
	}
	ok(c, gin.H{"message": "已删除"})
}
