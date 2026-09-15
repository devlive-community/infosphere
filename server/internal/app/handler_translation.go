package app

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// 翻译：后台配置翻译方式（Google / OpenAI 协议 / Claude 协议），写作台调用翻译当前内容。
// 凭据存站点配置表，仅管理员可读写，不出现在公开 /site（公开仅暴露是否启用）。

var translationProviders = map[string]bool{"": true, "none": true, "google": true, "openai": true, "claude": true}

func (a *App) translationProvider() string {
	p := a.getSetting("translation_provider")
	if p == "none" {
		return ""
	}
	return p
}

// translationEnabled 是否已配置可用的翻译方式（供公开 /site 暴露给写作台按钮）。
func (a *App) translationEnabled() bool {
	p := a.translationProvider()
	if p == "" {
		return false
	}
	return a.getSetting("translation_api_key") != ""
}

type translationConfigUpdate struct {
	Provider *string `json:"provider"`
	APIKey   *string `json:"api_key"`
	APIBase  *string `json:"api_base"`
	Model    *string `json:"model"`
}

// AdminGetTranslation GET /admin/translation 管理员读取翻译配置
func (a *App) AdminGetTranslation(c *gin.Context) {
	ok(c, gin.H{
		"provider": a.getSetting("translation_provider"),
		"api_key":  a.getSetting("translation_api_key"),
		"api_base": a.getSetting("translation_api_base"),
		"model":    a.getSetting("translation_model"),
	})
}

// AdminSaveTranslation PUT /admin/translation 管理员保存翻译配置
func (a *App) AdminSaveTranslation(c *gin.Context) {
	var req translationConfigUpdate
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	fields := []string{}
	if req.Provider != nil {
		if !translationProviders[*req.Provider] {
			fail(c, http.StatusBadRequest, "翻译方式必须为 none、google、openai 或 claude")
			return
		}
		if err := a.setSetting("translation_provider", *req.Provider, "翻译方式 none|google|openai|claude"); err != nil {
			fail(c, http.StatusInternalServerError, "保存失败: "+err.Error())
			return
		}
		fields = append(fields, "provider")
	}
	if req.APIKey != nil {
		if err := a.setSetting("translation_api_key", strings.TrimSpace(*req.APIKey), "翻译服务 API Key"); err != nil {
			fail(c, http.StatusInternalServerError, "保存失败: "+err.Error())
			return
		}
		fields = append(fields, "api_key")
	}
	if req.APIBase != nil {
		if err := a.setSetting("translation_api_base", strings.TrimSpace(*req.APIBase), "翻译服务 API 地址（OpenAI/Claude 兼容端点）"); err != nil {
			fail(c, http.StatusInternalServerError, "保存失败: "+err.Error())
			return
		}
		fields = append(fields, "api_base")
	}
	if req.Model != nil {
		if err := a.setSetting("translation_model", strings.TrimSpace(*req.Model), "翻译使用的模型（AI 方式）"); err != nil {
			fail(c, http.StatusInternalServerError, "保存失败: "+err.Error())
			return
		}
		fields = append(fields, "model")
	}
	a.recordAudit(c, "translation.updated", "config", "translation", "翻译配置", map[string]any{"changed_fields": fields})
	ok(c, gin.H{"message": "已保存"})
}

// Translate POST /translate 用后台配置的翻译方式翻译一段文本
func (a *App) Translate(c *gin.Context) {
	provider := a.translationProvider()
	if provider == "" {
		fail(c, http.StatusForbidden, "站点未配置翻译方式")
		return
	}
	apiKey := a.getSetting("translation_api_key")
	if apiKey == "" {
		fail(c, http.StatusForbidden, "翻译服务未配置 API Key")
		return
	}
	var req struct {
		Text        string `json:"text"`
		TargetLang  string `json:"target_lang"`  // 语言代码，如 en / zh-CN（Google 使用）
		TargetLabel string `json:"target_label"` // 语言名称，如 English / 简体中文（AI 使用）
		SourceLang  string `json:"source_lang"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		fail(c, http.StatusBadRequest, "参数错误")
		return
	}
	req.Text = strings.TrimSpace(req.Text)
	req.TargetLang = strings.TrimSpace(req.TargetLang)
	req.TargetLabel = strings.TrimSpace(req.TargetLabel)
	if req.Text == "" {
		fail(c, http.StatusBadRequest, "请提供待翻译文本")
		return
	}
	if req.TargetLang == "" && req.TargetLabel == "" {
		fail(c, http.StatusBadRequest, "请指定目标语言")
		return
	}
	// AI 用语言名称更自然，Google 需语言代码；互相回退
	aiTarget := req.TargetLabel
	if aiTarget == "" {
		aiTarget = req.TargetLang
	}
	googleTarget := req.TargetLang
	if googleTarget == "" {
		googleTarget = req.TargetLabel
	}
	if len([]rune(req.Text)) > 20000 {
		fail(c, http.StatusBadRequest, "单次翻译文本过长（上限 20000 字）")
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 60*time.Second)
	defer cancel()

	var (
		translated string
		err        error
	)
	base := a.getSetting("translation_api_base")
	model := a.getSetting("translation_model")
	switch provider {
	case "google":
		translated, err = translateGoogle(ctx, apiKey, base, req.Text, googleTarget)
	case "openai":
		translated, err = translateOpenAI(ctx, apiKey, base, model, req.Text, aiTarget)
	case "claude":
		translated, err = translateClaude(ctx, apiKey, base, model, req.Text, aiTarget)
	default:
		err = errors.New("不支持的翻译方式")
	}
	if err != nil {
		fail(c, http.StatusBadGateway, "翻译失败: "+err.Error())
		return
	}
	ok(c, gin.H{"text": translated})
}

func httpPostJSON(ctx context.Context, url string, headers map[string]string, payload any) ([]byte, int, error) {
	body, _ := json.Marshal(payload)
	r, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, 0, err
	}
	r.Header.Set("Content-Type", "application/json")
	for k, v := range headers {
		r.Header.Set(k, v)
	}
	resp, err := http.DefaultClient.Do(r)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	return data, resp.StatusCode, nil
}

func translateGoogle(ctx context.Context, apiKey, base, text, target string) (string, error) {
	if base == "" {
		base = "https://translation.googleapis.com"
	}
	url := strings.TrimRight(base, "/") + "/language/translate/v2?key=" + apiKey
	data, status, err := httpPostJSON(ctx, url, nil, map[string]any{"q": text, "target": target, "format": "text"})
	if err != nil {
		return "", err
	}
	if status != http.StatusOK {
		return "", errors.New("Google 翻译返回状态 " + http.StatusText(status))
	}
	var out struct {
		Data struct {
			Translations []struct {
				TranslatedText string `json:"translatedText"`
			} `json:"translations"`
		} `json:"data"`
	}
	if err := json.Unmarshal(data, &out); err != nil || len(out.Data.Translations) == 0 {
		return "", errors.New("Google 翻译响应解析失败")
	}
	return out.Data.Translations[0].TranslatedText, nil
}

func translationPrompt(target string) string {
	return "You are a professional translator. Translate the user's text into " + target +
		". Preserve Markdown formatting, code blocks and inline code verbatim. Output only the translation without any explanation."
}

func translateOpenAI(ctx context.Context, apiKey, base, model, text, target string) (string, error) {
	if base == "" {
		base = "https://api.openai.com/v1"
	}
	if model == "" {
		model = "gpt-4o-mini"
	}
	url := strings.TrimRight(base, "/") + "/chat/completions"
	payload := map[string]any{
		"model": model,
		"messages": []map[string]string{
			{"role": "system", "content": translationPrompt(target)},
			{"role": "user", "content": text},
		},
		"temperature": 0.2,
	}
	data, status, err := httpPostJSON(ctx, url, map[string]string{"Authorization": "Bearer " + apiKey}, payload)
	if err != nil {
		return "", err
	}
	if status != http.StatusOK {
		return "", errors.New("OpenAI 接口返回状态 " + http.StatusText(status))
	}
	var out struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(data, &out); err != nil || len(out.Choices) == 0 {
		return "", errors.New("OpenAI 响应解析失败")
	}
	return strings.TrimSpace(out.Choices[0].Message.Content), nil
}

func translateClaude(ctx context.Context, apiKey, base, model, text, target string) (string, error) {
	if base == "" {
		base = "https://api.anthropic.com"
	}
	if model == "" {
		model = "claude-3-5-sonnet-latest"
	}
	url := strings.TrimRight(base, "/") + "/v1/messages"
	payload := map[string]any{
		"model":      model,
		"max_tokens": 8192,
		"system":     translationPrompt(target),
		"messages": []map[string]string{
			{"role": "user", "content": text},
		},
	}
	headers := map[string]string{"x-api-key": apiKey, "anthropic-version": "2023-06-01"}
	data, status, err := httpPostJSON(ctx, url, headers, payload)
	if err != nil {
		return "", err
	}
	if status != http.StatusOK {
		return "", errors.New("Claude 接口返回状态 " + http.StatusText(status))
	}
	var out struct {
		Content []struct {
			Text string `json:"text"`
		} `json:"content"`
	}
	if err := json.Unmarshal(data, &out); err != nil || len(out.Content) == 0 {
		return "", errors.New("Claude 响应解析失败")
	}
	return strings.TrimSpace(out.Content[0].Text), nil
}
