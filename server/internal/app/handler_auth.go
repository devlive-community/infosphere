package app

import (
	"net/http"

	"infosphere/server/internal/auth"
	"infosphere/server/internal/models"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

func (a *App) issueToken(c *gin.Context, u *models.User) {
	token, err := auth.GenerateToken(a.Config.Secret, u.ID, u.Username, u.Role)
	if err != nil {
		fail(c, http.StatusInternalServerError, "签发令牌失败")
		return
	}
	ok(c, gin.H{"token": token, "user": u})
}

type registerRequest struct {
	Username string `json:"username"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

// Register POST /auth/register
func (a *App) Register(c *gin.Context) {
	var req registerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	if !usernameRegex.MatchString(req.Username) {
		fail(c, http.StatusBadRequest, "用户名需为 3-50 位字母、数字、下划线或中划线")
		return
	}
	if req.Email != "" && !emailRegex.MatchString(req.Email) {
		fail(c, http.StatusBadRequest, "邮箱格式不正确")
		return
	}
	if len(req.Password) < 6 {
		fail(c, http.StatusBadRequest, "密码至少 6 位")
		return
	}

	var count int64
	a.DB.Model(&models.User{}).Where("username = ?", req.Username).Count(&count)
	if count > 0 {
		fail(c, http.StatusConflict, "用户名已被占用")
		return
	}
	if req.Email != "" {
		a.DB.Model(&models.User{}).Where("email = ?", req.Email).Count(&count)
		if count > 0 {
			fail(c, http.StatusConflict, "邮箱已被占用")
			return
		}
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		fail(c, http.StatusInternalServerError, "密码加密失败")
		return
	}
	u := models.User{
		Username: req.Username,
		Email:    req.Email,
		Password: string(hash),
		Role:     "user",
		IsActive: true,
	}
	if err := a.DB.Create(&u).Error; err != nil {
		fail(c, http.StatusInternalServerError, "注册失败: "+err.Error())
		return
	}
	a.issueToken(c, &u)
}

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// Login POST /auth/login
func (a *App) Login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	if req.Username == "" || req.Password == "" {
		fail(c, http.StatusBadRequest, "请输入用户名和密码")
		return
	}

	var u models.User
	if err := a.DB.Where("username = ? OR email = ?", req.Username, req.Username).First(&u).Error; err != nil {
		fail(c, http.StatusUnauthorized, "用户名或密码错误")
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(u.Password), []byte(req.Password)) != nil {
		fail(c, http.StatusUnauthorized, "用户名或密码错误")
		return
	}
	if !u.IsActive {
		fail(c, http.StatusForbidden, "账户已被禁用")
		return
	}

	now := currentTime()
	a.DB.Model(&u).Update("last_login_at", now)
	a.issueToken(c, &u)
}

// Me GET /auth/me
func (a *App) Me(c *gin.Context) {
	ok(c, currentUser(c))
}

type profileUpdate struct {
	Email     *string `json:"email"`
	Avatar    *string `json:"avatar"`
	Bio       *string `json:"bio"`
	GithubURL *string `json:"github_url"`
}

// UpdateProfile PUT /auth/profile
func (a *App) UpdateProfile(c *gin.Context) {
	var req profileUpdate
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	u := currentUser(c)

	if req.Email != nil {
		if *req.Email != "" && !emailRegex.MatchString(*req.Email) {
			fail(c, http.StatusBadRequest, "邮箱格式不正确")
			return
		}
		if *req.Email != u.Email {
			var count int64
			a.DB.Model(&models.User{}).Where("email = ? AND id != ?", *req.Email, u.ID).Count(&count)
			if count > 0 {
				fail(c, http.StatusConflict, "邮箱已被占用")
				return
			}
		}
		u.Email = *req.Email
	}
	if req.Avatar != nil {
		u.Avatar = *req.Avatar
	}
	if req.Bio != nil {
		u.Bio = *req.Bio
	}
	if req.GithubURL != nil {
		u.GithubURL = *req.GithubURL
	}
	if err := a.DB.Save(u).Error; err != nil {
		fail(c, http.StatusInternalServerError, "保存失败: "+err.Error())
		return
	}
	ok(c, u)
}

type passwordUpdate struct {
	OldPassword string `json:"old_password"`
	NewPassword string `json:"new_password"`
}

// ChangePassword PUT /auth/password
func (a *App) ChangePassword(c *gin.Context) {
	var req passwordUpdate
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	if len(req.NewPassword) < 6 {
		fail(c, http.StatusBadRequest, "新密码至少 6 位")
		return
	}
	u := currentUser(c)
	if bcrypt.CompareHashAndPassword([]byte(u.Password), []byte(req.OldPassword)) != nil {
		fail(c, http.StatusBadRequest, "原密码不正确")
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		fail(c, http.StatusInternalServerError, "密码加密失败")
		return
	}
	if err := a.DB.Model(u).Update("password", string(hash)).Error; err != nil {
		fail(c, http.StatusInternalServerError, "修改失败: "+err.Error())
		return
	}
	ok(c, gin.H{"message": "密码已更新"})
}
