package app

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
)

// oauthUserInfo 各 provider 归一化后的用户信息。
type oauthUserInfo struct {
	ID         string // provider 侧唯一 ID（字符串）
	Login      string // 用户名提示
	Email      string // 已验证邮箱（未验证则为空）
	AvatarURL  string
	ProfileURL string
}

// oauthProviderDef 一个第三方登录 provider 的接入定义。
type oauthProviderDef struct {
	Key       string
	Label     string
	AuthURL   string
	TokenURL  string
	Scopes    string
	FetchUser func(token string) (*oauthUserInfo, error)
}

var oauthProviderRegistry = map[string]oauthProviderDef{
	"github": {Key: "github", Label: "GitHub", AuthURL: "https://github.com/login/oauth/authorize", TokenURL: "https://github.com/login/oauth/access_token", Scopes: "read:user user:email", FetchUser: fetchGithubUser},
	"google": {Key: "google", Label: "Google", AuthURL: "https://accounts.google.com/o/oauth2/v2/auth", TokenURL: "https://oauth2.googleapis.com/token", Scopes: "openid email profile", FetchUser: fetchGoogleUser},
	"gitlab": {Key: "gitlab", Label: "GitLab", AuthURL: "https://gitlab.com/oauth/authorize", TokenURL: "https://gitlab.com/oauth/token", Scopes: "read_user", FetchUser: fetchGitlabUser},
}

// oauthProviderOrder 稳定的展示顺序。
var oauthProviderOrder = []string{"github", "google", "gitlab"}

func oauthBearerGet(url, token string) (*http.Response, error) {
	req, _ := http.NewRequest(http.MethodGet, url, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")
	return oauthHTTPClient.Do(req)
}

func fetchGithubUser(token string) (*oauthUserInfo, error) {
	gh, err := ghFetchUser(token)
	if err != nil {
		return nil, err
	}
	return &oauthUserInfo{
		ID:         strconv.FormatInt(gh.ID, 10),
		Login:      gh.Login,
		Email:      ghPrimaryEmail(token, gh.Email),
		AvatarURL:  gh.AvatarURL,
		ProfileURL: "https://github.com/" + gh.Login,
	}, nil
}

func fetchGoogleUser(token string) (*oauthUserInfo, error) {
	resp, err := oauthBearerGet("https://www.googleapis.com/oauth2/v3/userinfo", token)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("google userinfo 返回 %d", resp.StatusCode)
	}
	var g struct {
		Sub           string `json:"sub"`
		Email         string `json:"email"`
		EmailVerified bool   `json:"email_verified"`
		Name          string `json:"name"`
		Picture       string `json:"picture"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&g); err != nil {
		return nil, err
	}
	if g.Sub == "" {
		return nil, fmt.Errorf("google 用户资料缺少 sub")
	}
	email := ""
	if g.EmailVerified {
		email = g.Email
	}
	login := g.Name
	if login == "" && g.Email != "" {
		login = strings.Split(g.Email, "@")[0]
	}
	return &oauthUserInfo{ID: g.Sub, Login: login, Email: email, AvatarURL: g.Picture}, nil
}

func fetchGitlabUser(token string) (*oauthUserInfo, error) {
	resp, err := oauthBearerGet("https://gitlab.com/api/v4/user", token)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("gitlab user 返回 %d", resp.StatusCode)
	}
	var g struct {
		ID        int64  `json:"id"`
		Username  string `json:"username"`
		Email     string `json:"email"`
		AvatarURL string `json:"avatar_url"`
		WebURL    string `json:"web_url"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&g); err != nil {
		return nil, err
	}
	if g.ID == 0 {
		return nil, fmt.Errorf("gitlab 用户资料缺少 id")
	}
	return &oauthUserInfo{ID: strconv.FormatInt(g.ID, 10), Login: g.Username, Email: g.Email, AvatarURL: g.AvatarURL, ProfileURL: g.WebURL}, nil
}

// oauthProviderConfig 读取某 provider 的凭据：ClientID 与 Secret 均非空且未显式停用视为已启用。
func (a *App) oauthProviderConfig(provider string) (clientID, clientSecret string, enabled bool) {
	clientID = a.getSetting("oauth_" + provider + "_client_id")
	clientSecret = a.getSetting("oauth_" + provider + "_client_secret")
	enabled = a.getSetting("oauth_"+provider+"_enabled") != "false" && clientID != "" && clientSecret != ""
	return
}
