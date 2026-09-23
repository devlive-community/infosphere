package app

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"knowforge/server/internal/auth"
	"knowforge/server/internal/models"

	"github.com/gin-gonic/gin"
)

// M12 第三方登录（GitHub / Google / GitLab OAuth）：
//   - 凭据存站点配置表（oauth_<provider>_client_id/secret/enabled），管理员通过 /admin/oauth 维护
//   - state 防 CSRF：入库共享存储（oauth_states 表）+ 10 分钟 TTL，支持多实例部署（回调可能落到另一实例）；只存 state 哈希
//   - 绑定关系存 user_authentications；回调按已验证邮箱自动关联本地账号

const oauthStateTTL = 10 * time.Minute

var oauthHTTPClient = &http.Client{Timeout: 10 * time.Second}

func oauthStateHash(state string) string {
	sum := sha256.Sum256([]byte(state))
	return hex.EncodeToString(sum[:])
}

// oauthStateSave 生成一次性 state 并入库（存哈希，多实例共享），顺带清理过期行。
// oauthStateSave 生成一次性 state 并入库。userID 非 0 表示「为该已登录用户绑定」模式。
func (a *App) oauthStateSave(origin string, userID uint) string {
	buf := make([]byte, 16)
	_, _ = rand.Read(buf)
	state := hex.EncodeToString(buf)
	a.DB.Where("expires_at < ?", time.Now()).Delete(&models.OAuthState{})
	a.DB.Create(&models.OAuthState{StateHash: oauthStateHash(state), Origin: origin, UserID: userID, ExpiresAt: time.Now().Add(oauthStateTTL)})
	return state
}

// oauthStateTake 取出并删除 state（一次性），校验未过期，返回来源与绑定用户 id（0 为登录/注册）。
func (a *App) oauthStateTake(state string) (origin string, userID uint, ok bool) {
	if state == "" {
		return "", 0, false
	}
	var row models.OAuthState
	if err := a.DB.Where("state_hash = ?", oauthStateHash(state)).First(&row).Error; err != nil {
		return "", 0, false
	}
	a.DB.Delete(&models.OAuthState{}, "id = ?", row.ID)
	if time.Now().After(row.ExpiresAt) {
		return "", 0, false
	}
	return row.Origin, row.UserID, true
}

func (a *App) getSetting(key string) string {
	if a.DB == nil {
		return ""
	}
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

// frontendOrigin 只使用管理员配置的站点地址或当前服务地址。
// 禁止信任 query/Referer，否则 OAuth JWT 与找回密码令牌可被重定向到攻击者域名。
func (a *App) frontendOrigin(c *gin.Context) string {
	if configured := safeOrigin(a.getSetting("site_url")); configured != "" {
		return configured
	}
	return schemeHost(c)
}

// OAuthProviders GET /auth/oauth/providers 公开：各第三方登录是否启用
func (a *App) OAuthProviders(c *gin.Context) {
	list := make([]gin.H, 0, len(oauthProviderOrder))
	for _, key := range oauthProviderOrder {
		_, _, enabled := a.oauthProviderConfig(key)
		list = append(list, gin.H{
			"provider":   key,
			"enabled":    enabled,
			"icon_type":  a.getSetting("oauth_" + key + "_icon_type"),
			"icon_value": a.getSetting("oauth_" + key + "_icon_value"),
		})
	}
	ok(c, gin.H{"providers": list, "display_mode": oauthDisplayMode(a)})
}

// oauthRedirectURI 某 provider 的回调地址（须与授权时一致）
func (a *App) oauthRedirectURI(c *gin.Context, provider string) string {
	return schemeHost(c) + "/api/v1/auth/oauth/" + provider + "/callback"
}

// OAuthStart GET /auth/oauth/:provider 发起第三方登录，302 到授权页
func (a *App) OAuthStart(c *gin.Context) {
	provider := c.Param("provider")
	origin := a.frontendOrigin(c)
	def, defOK := oauthProviderRegistry[provider]
	if !defOK {
		c.Redirect(http.StatusFound, origin+"/login?oauth_error=unsupported_provider")
		return
	}
	clientID, _, enabled := a.oauthProviderConfig(provider)
	if !enabled {
		c.Redirect(http.StatusFound, origin+"/login?oauth_error=not_configured")
		return
	}
	state := a.oauthStateSave(origin, 0)
	c.Redirect(http.StatusFound, a.oauthAuthorizeURL(c, def, clientID, provider, state))
}

// oauthAuthorizeURL 拼接第三方授权页地址（登录与绑定复用）。
func (a *App) oauthAuthorizeURL(c *gin.Context, def oauthProviderDef, clientID, provider, state string) string {
	return def.AuthURL +
		"?client_id=" + url.QueryEscape(clientID) +
		"&redirect_uri=" + url.QueryEscape(a.oauthRedirectURI(c, provider)) +
		"&response_type=code" +
		"&scope=" + url.QueryEscape(def.Scopes) +
		"&state=" + state
}

// OAuthLinkStart POST /auth/oauth/:provider/link 已登录用户绑定第三方账号：
// 用带当前用户 id 的 state 走授权流程，回调时按该 id 绑定（不依赖邮箱匹配），返回授权地址供前端跳转。
func (a *App) OAuthLinkStart(c *gin.Context) {
	provider := c.Param("provider")
	def, defOK := oauthProviderRegistry[provider]
	if !defOK {
		fail(c, http.StatusBadRequest, "不支持的第三方登录方式")
		return
	}
	clientID, _, enabled := a.oauthProviderConfig(provider)
	if !enabled {
		fail(c, http.StatusBadRequest, "该第三方登录未启用")
		return
	}
	u := currentUser(c)
	state := a.oauthStateSave(a.frontendOrigin(c), u.ID)
	ok(c, gin.H{"redirect": a.oauthAuthorizeURL(c, def, clientID, provider, state)})
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
	origin := a.frontendOrigin(c)
	def, defOK := oauthProviderRegistry[provider]
	if !defOK {
		c.Redirect(http.StatusFound, origin+"/login?oauth_error=unsupported_provider")
		return
	}
	stateOrigin, linkUserID, valid := a.oauthStateTake(c.Query("state"))
	if !valid {
		c.Redirect(http.StatusFound, origin+"/login?oauth_error=invalid_state")
		return
	}
	// state 里记录的来源才是可信回跳地址
	origin = stateOrigin
	// 绑定模式（已登录用户）失败回跳账户页，登录/注册模式失败回跳登录页。
	// 带上 provider 标签，前端错误文案按实际第三方名展示（避免所有 provider 都显示 GitHub）。
	failRedirect := func(code string) {
		q := "oauth_error=" + code + "&provider=" + url.QueryEscape(def.Label)
		if linkUserID != 0 {
			c.Redirect(http.StatusFound, origin+"/user/oauth?"+q)
			return
		}
		c.Redirect(http.StatusFound, origin+"/login?"+q)
	}

	clientID, clientSecret, enabled := a.oauthProviderConfig(provider)
	if !enabled {
		failRedirect("not_configured")
		return
	}
	code := c.Query("code")
	if code == "" {
		failRedirect("missing_code")
		return
	}

	// 1. 换取 access token（Google/GitLab 需 grant_type + redirect_uri，GitHub 也兼容）
	form := url.Values{
		"client_id": {clientID}, "client_secret": {clientSecret}, "code": {code},
		"grant_type": {"authorization_code"}, "redirect_uri": {a.oauthRedirectURI(c, provider)},
	}
	req, _ := http.NewRequest(http.MethodPost, def.TokenURL, strings.NewReader(form.Encode()))
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

	// 2. 读取归一化用户资料
	info, err := def.FetchUser(tokenResp.AccessToken)
	if err != nil || info == nil {
		failRedirect("profile_fetch_failed")
		return
	}
	email := info.Email

	// 绑定模式：为已登录用户显式绑定该第三方账号（不依赖邮箱匹配）
	if linkUserID != 0 {
		var linkUser models.User
		if err := a.DB.First(&linkUser, linkUserID).Error; err != nil || !linkUser.IsActive {
			failRedirect("account_disabled")
			return
		}
		var exist models.UserAuthentication
		if err := a.DB.Where("provider = ? AND provider_id = ?", provider, info.ID).First(&exist).Error; err == nil {
			if exist.UserID == linkUserID {
				c.Redirect(http.StatusFound, origin+"/user/oauth?linked="+provider) // 已绑定到本账号
				return
			}
			failRedirect("already_bound") // 该第三方账号已被其他账号绑定
			return
		}
		a.createBinding(linkUserID, provider, info, tokenResp.AccessToken)
		c.Redirect(http.StatusFound, origin+"/user/oauth?linked="+provider)
		return
	}

	// 3. 已绑定 → 直接登录
	var binding models.UserAuthentication
	if err := a.DB.Where("provider = ? AND provider_id = ?", provider, info.ID).First(&binding).Error; err == nil {
		var u models.User
		if err := a.DB.First(&u, binding.UserID).Error; err != nil || !u.IsActive {
			failRedirect("account_disabled")
			return
		}
		a.DB.Model(&u).Update("last_login_at", currentTime())
		a.DB.Model(&binding).Updates(map[string]any{
			"provider_username": info.Login, "provider_email": email,
			"access_token": tokenResp.AccessToken,
		})
		a.oauthFinish(c, origin, &u)
		return
	}

	// 4. 未绑定：已验证邮箱命中本地账号 → 自动关联
	var u models.User
	if email != "" {
		if err := a.DB.Where("email = ?", email).First(&u).Error; err == nil {
			if !u.IsActive {
				failRedirect("account_disabled")
				return
			}
			a.createBinding(u.ID, provider, info, tokenResp.AccessToken)
			a.DB.Model(&u).Update("last_login_at", currentTime())
			a.oauthFinish(c, origin, &u)
			return
		}
	}

	// 5. 全新用户：注册（无本地密码，可在资料页补设）
	// 受注册方式门禁：关闭注册禁止新号；邀请制无邀请码输入渠道，同样禁止 OAuth 新注册。
	switch a.registrationMode() {
	case "closed":
		failRedirect("registration_closed")
		return
	case "invite", "open_invite":
		failRedirect("registration_invite_required")
		return
	}
	username := oauthUsername(a, info.Login)
	if email == "" {
		email = fmt.Sprintf("%s-%s@users.noreply.local", info.ID, provider)
	}
	u = models.User{
		Username: username, Email: email, Password: "", Role: "user", IsActive: true,
		// 第三方登录视为可信身份，直接标记邮箱已激活（不再要求二次激活）
		EmailVerified: true,
		Avatar:        info.AvatarURL,
	}
	if provider == "github" {
		u.GithubURL = info.ProfileURL
	}
	if err := a.DB.Create(&u).Error; err != nil {
		failRedirect("register_failed")
		return
	}
	a.createBinding(u.ID, provider, info, tokenResp.AccessToken)
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

// oauthUsername 由第三方登录名生成合规且唯一的本地用户名
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
		clean = fmt.Sprintf("%s-%d", base, i)
	}
}

func (a *App) createBinding(userID uint, provider string, info *oauthUserInfo, accessToken string) {
	binding := models.UserAuthentication{
		UserID: userID, Provider: provider, ProviderID: info.ID,
		ProviderUsername: info.Login, ProviderEmail: info.Email, AccessToken: accessToken,
	}
	if err := a.DB.Create(&binding).Error; err == nil {
		a.recordAchievementEvent(userID, "account.oauth_bound", "user_authentication", strconv.FormatUint(uint64(binding.ID), 10), fmt.Sprintf("account.oauth_bound:%d", binding.ID))
	}
}

// oauthFinish 签发令牌（含 Cookie）并回跳前端落地页
func (a *App) oauthFinish(c *gin.Context, origin string, u *models.User) {
	token, err := auth.GenerateToken(a.Config.Secret, u.ID, u.Username, u.Role)
	if err != nil {
		c.Redirect(http.StatusFound, origin+"/login?oauth_error=token_issue_failed")
		return
	}
	c.SetCookie("knowforge_token", token, 7*24*3600, "/", "", false, false)
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
	if !a.requireStepUp(c, tfOpUnbindExport) {
		return
	}
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
	Provider     string  `json:"provider"`
	ClientID     *string `json:"client_id"`
	ClientSecret *string `json:"client_secret"`
	Enabled      *bool   `json:"enabled"`
	IconType     *string `json:"icon_type"`  // '' | fa | image | svg，自定义登录图标
	IconValue    *string `json:"icon_value"` // fa 类名或已上传图片地址
	DisplayMode  *string `json:"display_mode"` // 全局：button（按钮，默认）| icon（图标）
}

// AdminGetOAuth GET /admin/oauth 管理员读取各 provider 的 OAuth 配置
func (a *App) AdminGetOAuth(c *gin.Context) {
	list := make([]gin.H, 0, len(oauthProviderOrder))
	for _, key := range oauthProviderOrder {
		id, secret, _ := a.oauthProviderConfig(key)
		list = append(list, gin.H{
			"provider":      key,
			"label":         oauthProviderRegistry[key].Label,
			"client_id":     id,
			"client_secret": secret,
			"enabled":       a.getSetting("oauth_"+key+"_enabled") != "false",
			"icon_type":     a.getSetting("oauth_" + key + "_icon_type"),
			"icon_value":    a.getSetting("oauth_" + key + "_icon_value"),
		})
	}
	ok(c, gin.H{"providers": list, "display_mode": oauthDisplayMode(a)})
}

// oauthDisplayMode 第三方登录显示方式：button（默认）| icon。
func oauthDisplayMode(a *App) string {
	if a.getSetting("oauth_display_mode") == "icon" {
		return "icon"
	}
	return "button"
}

// AdminSaveOAuth PUT /admin/oauth 管理员保存单个 provider 的 OAuth 配置
func (a *App) AdminSaveOAuth(c *gin.Context) {
	var req oauthConfigUpdate
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	// 全局显示方式（按钮/图标）：与 provider 无关，可单独保存。
	if req.DisplayMode != nil {
		mode := "button"
		if strings.TrimSpace(*req.DisplayMode) == "icon" {
			mode = "icon"
		}
		if err := a.setSetting("oauth_display_mode", mode, "第三方登录显示方式"); err != nil {
			fail(c, http.StatusInternalServerError, "保存失败: "+err.Error())
			return
		}
	}
	if req.Provider == "" { // 仅保存全局设置
		a.AdminGetOAuth(c)
		return
	}
	def, ok2 := oauthProviderRegistry[req.Provider]
	if !ok2 {
		fail(c, http.StatusBadRequest, "不支持的第三方登录")
		return
	}
	fields := []string{}
	if req.ClientID != nil {
		fields = append(fields, "client_id")
		if err := a.setSetting("oauth_"+req.Provider+"_client_id", *req.ClientID, def.Label+" OAuth Client ID"); err != nil {
			fail(c, http.StatusInternalServerError, "保存失败: "+err.Error())
			return
		}
	}
	if req.ClientSecret != nil {
		fields = append(fields, "client_secret")
		if err := a.setSetting("oauth_"+req.Provider+"_client_secret", *req.ClientSecret, def.Label+" OAuth Client Secret"); err != nil {
			fail(c, http.StatusInternalServerError, "保存失败: "+err.Error())
			return
		}
	}
	if req.Enabled != nil {
		fields = append(fields, "enabled")
		value := "false"
		if *req.Enabled {
			value = "true"
		}
		if err := a.setSetting("oauth_"+req.Provider+"_enabled", value, def.Label+" OAuth 启用开关"); err != nil {
			fail(c, http.StatusInternalServerError, "保存失败: "+err.Error())
			return
		}
	}
	if req.IconType != nil {
		fields = append(fields, "icon_type")
		_ = a.setSetting("oauth_"+req.Provider+"_icon_type", strings.TrimSpace(*req.IconType), def.Label+" 登录图标类型")
	}
	if req.IconValue != nil {
		fields = append(fields, "icon_value")
		_ = a.setSetting("oauth_"+req.Provider+"_icon_value", strings.TrimSpace(*req.IconValue), def.Label+" 登录图标")
	}
	a.recordAudit(c, "oauth.updated", "config", "oauth/"+req.Provider, def.Label+" OAuth", map[string]any{"changed_fields": fields})
	a.AdminGetOAuth(c)
}
