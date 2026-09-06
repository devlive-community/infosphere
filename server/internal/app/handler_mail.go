package app

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// M15 管理端：SMTP 与站点地址配置（凭据存站点配置表，不出现在公开 /site）

var mailDrivers = map[string]bool{"log": true, "smtp": true}

type mailConfigUpdate struct {
	Driver   *string `json:"driver"`
	Host     *string `json:"host"`
	Port     *int    `json:"port"`
	Username *string `json:"username"`
	Password *string `json:"password"`
	From     *string `json:"from"`
	SiteURL  *string `json:"site_url"`
}

// AdminGetMail GET /admin/mail 管理员读取邮件配置
func (a *App) AdminGetMail(c *gin.Context) {
	port, _ := strconv.Atoi(a.getSetting("smtp_port"))
	ok(c, gin.H{
		"driver":   a.getSetting("mail_driver"),
		"host":     a.getSetting("smtp_host"),
		"port":     port,
		"username": a.getSetting("smtp_username"),
		"password": a.getSetting("smtp_password"),
		"from":     a.getSetting("smtp_from"),
		"site_url": a.getSetting("site_url"),
	})
}

// AdminSaveMail PUT /admin/mail 管理员保存邮件配置
func (a *App) AdminSaveMail(c *gin.Context) {
	var req mailConfigUpdate
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	if req.Driver != nil {
		driver := *req.Driver
		if !mailDrivers[driver] {
			fail(c, http.StatusBadRequest, "发信驱动必须为 log 或 smtp")
			return
		}
		if err := a.setSetting("mail_driver", driver, "邮件驱动 log|smtp"); err != nil {
			fail(c, http.StatusInternalServerError, "保存失败: "+err.Error())
			return
		}
	}
	if req.Host != nil {
		if err := a.setSetting("smtp_host", *req.Host, "SMTP 主机"); err != nil {
			fail(c, http.StatusInternalServerError, "保存失败: "+err.Error())
			return
		}
	}
	if req.Port != nil {
		if *req.Port < 0 || *req.Port > 65535 {
			fail(c, http.StatusBadRequest, "SMTP 端口不合法")
			return
		}
		if err := a.setSetting("smtp_port", strconv.Itoa(*req.Port), "SMTP 端口"); err != nil {
			fail(c, http.StatusInternalServerError, "保存失败: "+err.Error())
			return
		}
	}
	if req.Username != nil {
		if err := a.setSetting("smtp_username", *req.Username, "SMTP 用户名"); err != nil {
			fail(c, http.StatusInternalServerError, "保存失败: "+err.Error())
			return
		}
	}
	if req.Password != nil {
		if err := a.setSetting("smtp_password", *req.Password, "SMTP 密码"); err != nil {
			fail(c, http.StatusInternalServerError, "保存失败: "+err.Error())
			return
		}
	}
	if req.From != nil {
		if err := a.setSetting("smtp_from", *req.From, "发件人地址"); err != nil {
			fail(c, http.StatusInternalServerError, "保存失败: "+err.Error())
			return
		}
	}
	if req.SiteURL != nil {
		if err := a.setSetting("site_url", *req.SiteURL, "站点访问地址（用于邮件中的链接）"); err != nil {
			fail(c, http.StatusInternalServerError, "保存失败: "+err.Error())
			return
		}
	}
	ok(c, gin.H{"message": "已保存"})
}
