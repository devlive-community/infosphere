package app

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"

	"infosphere/server/internal/auth"
	"infosphere/server/internal/models"

	"github.com/gin-gonic/gin"
)

// M12 第三方登录（GitHub OAuth）：
//   - 凭据存站点配置表（oauth_github_client_id/secret/enabled），管理员通过 /admin/oauth 维护
//   - state 防 CSRF：内存态 + 10 分钟 TTL（当前为单实例部署架构，多实例时需外置存储）
//   - 绑定关系存 user_authentications；回调按 GitHub 已验证邮箱自动关联本地账号

const oauthStateTTL = 10 * time.Minute

var oauthHTTPClient = &http.Client{Timeout: 10 * time.Second}

type oauthStateEntry struct {
	Origin    string
	CreatedAt time.Time
}

var oauthStates = struct {
	sync.Mutex
	m map[string]oauthStateEntry
}{m: map[string]oauthStateEntry{}}

func oauthStateSave(origin string) string {
	buf := make([]byte, 16)
	_, _ = rand.Read(buf)
	state := hex.EncodeToString(buf)
	oauthStates.Lock()
	// 顺带清理过期 state，避免长期运行下累积
	now := time.Now()
	for k, v := range oauthStates.m {
		if now.Sub(v.CreatedAt) > oauthStateTTL {
			delete(oauthStates.m, k)
		}
	}
	oauthStates.m[state] = oauthStateEntry{Origin: origin, CreatedAt: now}
	oauthStates.Unlock()
	return state
}

// oauthStateTake 取出并删除 state（一次性），返回关联的前端来源
func oauthStateTake(state string) (string, bool) {
	oauthStates.Lock()
	defer oauthStates.Unlock()
	entry, ok := oauthStates.m[state]
	if !ok {
		return "", false
	}
	delete(oauthStates.m, state)
	if time.Since(entry.CreatedAt) > oauthStateTTL {
		return "", false
	}
	return entry.Origin, true
}

func (a *App) getSetting(key string) string {
	var cfg models.SiteConfig
	if err := a.DB.Where("config_key = ?", key).First(&cfg).Error; err != nil {
		return ""
	}
	return cfg.ConfigValue
}

func (a *App) setSetting(key, value, description string) error {
	var cfg models.SiteConfig
	if err := a.DB.Where("config_key = ?", key).First(&cfg).Error; err != nil {
		cfg = models.SiteConfig{ConfigKey: key, Description: description}
	}
	cfg.ConfigValue = value
	return a.DB.Save(&cfg).Error
}

// oauthGitHubConfig 读取 GitHub OAuth 凭据；ClientID 与 Secret 均非空视为已启用
func (a *App) oauthGitHubConfig() (clientID, clientSecret string, enabled bool) {
	clientID = a.getSetting("oauth_github_client_id")
	clientSecret = a.getSetting("oauth_github_client_secret")
	enabled = a.getSetting("oauth_github_enabled") != "false" && clientID != "" && clientSecret != ""
	return
}

// safeOrigin 仅接受 http(s) 站点根地址，防止 open redirect
func safeOrigin(raw string) string {
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return ""
	}
	return u.Scheme + "://" + u.Host
}

func schemeHost(c *gin.Context) string {
	scheme := "http"
	if c.Request.TLS != nil || c.GetHeader("X-Forwarded-Proto") == "https" {
		scheme = "https"
	}
	return scheme + "://" + c.Request.Host
}

// frontendOrigin 推断发起跳转的前端来源：origin 参数 > Referer > 本请求自身
func frontendOrigin(c *gin.Context) string {
	if o := safeOrigin(c.Query("origin")); o != "" {
		return o
	}
	if ref := c.GetHeader("Referer"); ref != "" {
		if u, err := url.Parse(ref); err == nil {
			if o := safeOrigin(u.Scheme + "://" + u.Host); o != "" {
				return o
			}
		}
	}
	return schemeHost(c)
}

// OAuthProviders GET /auth/oauth/providers 公开：各第三方登录是否启用
func (a *App) OAuthProviders(c *gin.Context) {
	_, _, githubEnabled := a.oauthGitHubConfig()
	ok(c, gin.H{"providers": []gin.H{
		{"provider": "github", "enabled": githubEnabled},
	}})
}

// OAuthStart GET /auth/oauth/:provider 发起第三方登录，302 到授权页
func (a *App) OAuthStart(c *gin.Context) {
	provider := c.Param("provider")
	origin := frontendOrigin(c)
	if provider != "github" {
		c.Redirect(http.StatusFound, origin+"/login?oauth_error=unsupported_provider")
		return
	}
	clientID, _, enabled := a.oauthGitHubConfig()
	if !enabled {
		c.Redirect(http.StatusFound, origin+"/login?oauth_error=not_configured")
		return
	}
	state := oauthStateSave(origin)
	redirect := "https://github.com/login/oauth/authorize" +
		"?client_id=" + url.QueryEscape(clientID) +
		"&redirect_uri=" + url.QueryEscape(schemeHost(c)+"/api/v1/auth/oauth/github/callback") +
		"&scope=" + url.QueryEscape("read:user user:email") +
		"&state=" + state
	c.Redirect(http.StatusFound, redirect)
}

type ghTokenResponse struct {
	AccessToken string `json:"access_token"`
}

type ghUser struct {
	Login     string `json:"login"`
	ID        int64  `json:"id"`
	AvatarURL string `json:"avatar_url"`
	Email     string `json:"email"`
}

type ghEmail struct {
	Email    string `json:"email"`
	Primary  bool   `json:"primary"`
	Verified bool   `json:"verified"`
}

// OAuthCallback GET /auth/oauth/:provider/callback 换取用户信息并登录/绑定
func (a *App) OAuthCallback(c *gin.Context) {
	provider := c.Param("provider")
	origin := frontendOrigin(c)
	if provider != "github" {
		c.Redirect(http.StatusFound, origin+"/login?oauth_error=unsupported_provider")
		return
	}
	stateOrigin, valid := oauthStateTake(c.Query("state"))
	if !valid {
		c.Redirect(http.StatusFound, origin+"/login?oauth_error=invalid_state")
		return
	}
	// state 里记录的来源才是可信回跳地址
	origin = stateOrigin
	failRedirect := func(code string) {
		c.Redirect(http.StatusFound, origin+"/login?oauth_error="+code)
	}

	clientID, clientSecret, enabled := a.oauthGitHubConfig()
	if !enabled {
		failRedirect("not_configured")
		return
	}
	code := c.Query("code")
	if code == "" {
		failRedirect("missing_code")
		return
	}

	// 1. 换取 access token
	form := url.Values{"client_id": {clientID}, "client_secret": {clientSecret}, "code": {code}}
	req, _ := http.NewRequest(http.MethodPost, "https://github.com/login/oauth/access_token", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")
	resp, err := oauthHTTPClient.Do(req)
	if err != nil {
		failRedirect("provider_unreachable")
		return
	}
	var tokenResp ghTokenResponse
	err = json.NewDecoder(resp.Body).Decode(&tokenResp)
	resp.Body.Close()
	if err != nil || tokenResp.AccessToken == "" {
		failRedirect("token_exchange_failed")
		return
	}

	// 2. 读取 GitHub 用户资料与邮箱
	gh, err := ghFetchUser(tokenResp.AccessToken)
	if err != nil {
		failRedirect("profile_fetch_failed")
		return
	}
	email := ghPrimaryEmail(tokenResp.AccessToken, gh.Email)

	// 3. 已绑定 → 直接登录
	var binding models.UserAuthentication
	if err := a.DB.Where("provider = ? AND provider_id = ?", provider, fmt.Sprintf("%d", gh.ID)).First(&binding).Error; err == nil {
		var u models.User
		if err := a.DB.First(&u, binding.UserID).Error; err != nil || !u.IsActive {
			failRedirect("account_disabled")
			return
		}
		a.DB.Model(&u).Update("last_login_at", currentTime())
		a.DB.Model(&binding).Updates(map[string]any{
			"provider_username": gh.Login, "provider_email": email,
			"access_token": tokenResp.AccessToken,
		})
		a.oauthFinish(c, origin, &u)
		return
	}

	// 4. 未绑定：GitHub 已验证邮箱命中本地账号 → 自动关联
	var u models.User
	if email != "" {
		if err := a.DB.Where("email = ?", email).First(&u).Error; err == nil {
			if !u.IsActive {
				failRedirect("account_disabled")
				return
			}
			a.createBinding(u.ID, provider, gh, email, tokenResp.AccessToken)
			a.DB.Model(&u).Update("last_login_at", currentTime())
			a.oauthFinish(c, origin, &u)
			return
		}
	}

	// 5. 全新用户：注册（无本地密码，可在资料页补设）
	username := oauthUsername(a, gh.Login)
	if email == "" {
		email = fmt.Sprintf("%d@users.noreply.github.com", gh.ID)
	}
	u = models.User{
		Username: username, Email: email, Password: "", Role: "user", IsActive: true,
		Avatar: gh.AvatarURL, GithubURL: "https://github.com/" + gh.Login,
	}
	if err := a.DB.Create(&u).Error; err != nil {
		failRedirect("register_failed")
		return
	}
	a.createBinding(u.ID, provider, gh, email, tokenResp.AccessToken)
	a.DB.Model(&u).Update("last_login_at", currentTime())
	a.oauthFinish(c, origin, &u)
}

// ghFetchUser 读取 GitHub 用户资料
func ghFetchUser(accessToken string) (ghUser, error) {
	var gh ghUser
	req, _ := http.NewRequest(http.MethodGet, "https://api.github.com/user", nil)
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/vnd.github+json")
	resp, err := oauthHTTPClient.Do(req)
	if err != nil {
		return gh, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return gh, fmt.Errorf("github /user 返回 %d", resp.StatusCode)
	}
	if err := json.NewDecoder(resp.Body).Decode(&gh); err != nil {
		return gh, err
	}
	if gh.ID == 0 {
		return gh, fmt.Errorf("github 用户资料缺少 id")
	}
	return gh, nil
}

// ghPrimaryEmail 取 GitHub 已验证的首选邮箱
func ghPrimaryEmail(accessToken, fallback string) string {
	req, _ := http.NewRequest(http.MethodGet, "https://api.github.com/user/emails", nil)
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/vnd.github+json")
	resp, err := oauthHTTPClient.Do(req)
	if err != nil {
		return fallback
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fallback
	}
	var emails []ghEmail
	if err := json.NewDecoder(resp.Body).Decode(&emails); err != nil {
		return fallback
	}
	for _, e := range emails {
		if e.Primary && e.Verified {
			return e.Email
		}
	}
	for _, e := range emails {
		if e.Verified {
			return e.Email
		}
	}
	return fallback
}

var oauthUsernamePattern = regexp.MustCompile(`[^A-Za-z0-9_-]+`)

// oauthUsername 由 GitHub login 生成合规且唯一的本地用户名
func oauthUsername(a *App, login string) string {
	clean := oauthUsernamePattern.ReplaceAllString(login, "-")
	clean = strings.Trim(clean, "-_")
	if len(clean) < 3 {
		clean = "user-" + clean
	}
	if len(clean) > 40 {
		clean = clean[:40]
	}
	base := clean
	for i := 1; ; i++ {
		var count int64
		a.DB.Model(&models.User{}).Where("username = ?", clean).Count(&count)
		if count == 0 {
			return clean
		}
		clean = fmt.Sprintf("%s-gh%d", base, i)
	}
}

func (a *App) createBinding(userID uint, provider string, gh ghUser, email, accessToken string) {
	binding := models.UserAuthentication{
		UserID: userID, Provider: provider, ProviderID: fmt.Sprintf("%d", gh.ID),
		ProviderUsername: gh.Login, ProviderEmail: email, AccessToken: accessToken,
	}
	a.DB.Create(&binding)
}

// oauthFinish 签发令牌（含 Cookie）并回跳前端落地页
func (a *App) oauthFinish(c *gin.Context, origin string, u *models.User) {
	token, err := auth.GenerateToken(a.Config.Secret, u.ID, u.Username, u.Role)
	if err != nil {
		c.Redirect(http.StatusFound, origin+"/login?oauth_error=token_issue_failed")
		return
	}
	c.SetCookie("infosphere_token", token, 7*24*3600, "/", "", false, false)
	c.Redirect(http.StatusFound, origin+"/oauth/callback?token="+url.QueryEscape(token))
}

// OAuthBindings GET /auth/oauth/bindings 当前用户的第三方绑定列表
func (a *App) OAuthBindings(c *gin.Context) {
	u := currentUser(c)
	bindings := []models.UserAuthentication{}
	a.DB.Where("user_id = ?", u.ID).
		Select("provider", "provider_username", "provider_email", "created_at").Find(&bindings)
	ok(c, gin.H{"bindings": bindings})
}

// OAuthUnbind DELETE /auth/oauth/:provider 解绑第三方登录
func (a *App) OAuthUnbind(c *gin.Context) {
	u := currentUser(c)
	if u.Password == "" {
		fail(c, http.StatusBadRequest, "尚未设置登录密码，请先在个人资料页设置密码后再解绑")
		return
	}
	result := a.DB.Where("user_id = ? AND provider = ?", u.ID, c.Param("provider")).Delete(&models.UserAuthentication{})
	if result.Error != nil {
		fail(c, http.StatusInternalServerError, "解绑失败")
		return
	}
	if result.RowsAffected == 0 {
		fail(c, http.StatusNotFound, "未绑定该第三方账号")
		return
	}
	ok(c, gin.H{"message": "已解绑"})
}

type oauthConfigUpdate struct {
	ClientID     *string `json:"client_id"`
	ClientSecret *string `json:"client_secret"`
	Enabled      *bool   `json:"enabled"`
}

// AdminGetOAuth GET /admin/oauth 管理员读取 GitHub OAuth 配置
func (a *App) AdminGetOAuth(c *gin.Context) {
	clientID, clientSecret, _ := a.oauthGitHubConfig()
	ok(c, gin.H{
		"provider":      "github",
		"client_id":     clientID,
		"client_secret": clientSecret,
	})
}

// AdminSaveOAuth PUT /admin/oauth 管理员保存 GitHub OAuth 配置
func (a *App) AdminSaveOAuth(c *gin.Context) {
	var req oauthConfigUpdate
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	if req.ClientID != nil {
		if err := a.setSetting("oauth_github_client_id", *req.ClientID, "GitHub OAuth Client ID"); err != nil {
			fail(c, http.StatusInternalServerError, "保存失败: "+err.Error())
			return
		}
	}
	if req.ClientSecret != nil {
		if err := a.setSetting("oauth_github_client_secret", *req.ClientSecret, "GitHub OAuth Client Secret"); err != nil {
			fail(c, http.StatusInternalServerError, "保存失败: "+err.Error())
			return
		}
	}
	if req.Enabled != nil {
		value := "false"
		if *req.Enabled {
			value = "true"
		}
		if err := a.setSetting("oauth_github_enabled", value, "GitHub OAuth 启用开关"); err != nil {
			fail(c, http.StatusInternalServerError, "保存失败: "+err.Error())
			return
		}
	}
	ok(c, gin.H{"message": "已保存"})
}
