package app

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/xml"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"path/filepath"
	"regexp"
	"strings"

	"knowforge/server/internal/config"
	"knowforge/server/internal/models"
	"knowforge/server/internal/storage"

	"github.com/gin-gonic/gin"
)

const achievementIconMaxBytes = 512 << 10

var safeSVGElements = map[string]bool{
	"svg": true, "g": true, "path": true, "circle": true, "rect": true,
	"line": true, "polyline": true, "polygon": true, "ellipse": true,
	"title": true, "desc": true, "defs": true, "lineargradient": true,
	"radialgradient": true, "stop": true, "clippath": true, "mask": true,
}

var safeSVGAttributes = map[string]bool{
	"id": true, "xmlns": true, "viewbox": true, "width": true, "height": true,
	"x": true, "y": true, "x1": true, "x2": true, "y1": true, "y2": true,
	"cx": true, "cy": true, "r": true, "rx": true, "ry": true,
	"d": true, "points": true, "fill": true, "stroke": true, "stroke-width": true,
	"stroke-linecap": true, "stroke-linejoin": true, "stroke-dasharray": true,
	"stroke-dashoffset": true, "fill-rule": true, "clip-rule": true,
	"opacity": true, "fill-opacity": true, "stroke-opacity": true, "transform": true,
	"gradientunits": true, "gradienttransform": true, "offset": true,
	"stop-color": true, "stop-opacity": true, "preserveaspectratio": true,
	"role": true, "aria-label": true, "clip-path": true, "mask": true,
}

var safeSVGURL = regexp.MustCompile(`^url\(#[A-Za-z0-9_.:-]+\)$`)

func safeSVGAttributeValue(name, value string) bool {
	if name == "xmlns" {
		return value == "http://www.w3.org/2000/svg"
	}
	lower := strings.ToLower(strings.TrimSpace(value))
	if strings.Contains(lower, "javascript:") || strings.Contains(lower, "data:") || strings.Contains(lower, "http:") || strings.Contains(lower, "https:") || strings.Contains(lower, "//") {
		return false
	}
	if strings.Contains(lower, "url(") {
		return safeSVGURL.MatchString(value)
	}
	return name != "href" && name != "xlink:href"
}

// sanitizeAchievementSVG 采用元素和属性双白名单；遇到未知结构直接拒绝，避免静默改变图标语义。
func sanitizeAchievementSVG(data []byte) ([]byte, error) {
	decoder := xml.NewDecoder(bytes.NewReader(data))
	decoder.Strict = true
	var out bytes.Buffer
	encoder := xml.NewEncoder(&out)
	rootSeen := false
	depth := 0
	tokens := 0
	for {
		token, err := decoder.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("SVG XML 格式无效")
		}
		tokens++
		if tokens > 20000 {
			return nil, fmt.Errorf("SVG 内容过于复杂")
		}
		switch value := token.(type) {
		case xml.StartElement:
			name := strings.ToLower(value.Name.Local)
			if !safeSVGElements[name] {
				return nil, fmt.Errorf("SVG 包含不允许的元素：%s", name)
			}
			if depth == 0 {
				if name != "svg" {
					return nil, fmt.Errorf("文件根元素必须是 svg")
				}
				rootSeen = true
			}
			depth++
			attrs := make([]xml.Attr, 0, len(value.Attr))
			for _, attr := range value.Attr {
				attrName := strings.ToLower(attr.Name.Local)
				if strings.HasPrefix(attrName, "on") || !safeSVGAttributes[attrName] {
					return nil, fmt.Errorf("SVG 包含不允许的属性：%s", attrName)
				}
				if !safeSVGAttributeValue(attrName, attr.Value) {
					return nil, fmt.Errorf("SVG 属性包含外部或危险引用")
				}
				attr.Name.Space = ""
				attrs = append(attrs, attr)
			}
			value.Name.Space = ""
			value.Attr = attrs
			if err := encoder.EncodeToken(value); err != nil {
				return nil, err
			}
		case xml.EndElement:
			depth--
			value.Name.Space = ""
			if err := encoder.EncodeToken(value); err != nil {
				return nil, err
			}
		case xml.CharData:
			if err := encoder.EncodeToken(value); err != nil {
				return nil, err
			}
		case xml.Comment:
			// 注释不进入最终资源。
		case xml.ProcInst:
			if strings.ToLower(value.Target) != "xml" {
				return nil, fmt.Errorf("SVG 不允许包含处理指令")
			}
		case xml.Directive:
			return nil, fmt.Errorf("SVG 不允许包含声明或处理指令")
		}
	}
	if !rootSeen || depth != 0 {
		return nil, fmt.Errorf("SVG 结构不完整")
	}
	if err := encoder.Flush(); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}

func achievementRasterType(data []byte) (mimeType, extension string, ok bool) {
	switch {
	case len(data) >= 8 && bytes.Equal(data[:8], []byte{0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a}):
		return "image/png", ".png", true
	case len(data) >= 3 && data[0] == 0xff && data[1] == 0xd8 && data[2] == 0xff:
		return "image/jpeg", ".jpg", true
	case len(data) >= 6 && (string(data[:6]) == "GIF87a" || string(data[:6]) == "GIF89a"):
		return "image/gif", ".gif", true
	case len(data) >= 12 && string(data[:4]) == "RIFF" && string(data[8:12]) == "WEBP":
		return "image/webp", ".webp", true
	default:
		return "", "", false
	}
}

func achievementImageDimensions(data []byte, mimeType string) (int, int) {
	if mimeType == "image/webp" {
		return 0, 0
	}
	config, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return 0, 0
	}
	return config.Width, config.Height
}

// AdminUploadAchievementIcon POST /admin/achievement-icons。
func (a *App) AdminUploadAchievementIcon(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, achievementIconMaxBytes+(64<<10))
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		fail(c, http.StatusBadRequest, "请选择成就图标")
		return
	}
	defer file.Close()
	if header.Size <= 0 || header.Size > achievementIconMaxBytes {
		fail(c, http.StatusBadRequest, "成就图标不能超过 512 KB")
		return
	}
	data, err := io.ReadAll(io.LimitReader(file, achievementIconMaxBytes+1))
	if err != nil || len(data) > achievementIconMaxBytes {
		fail(c, http.StatusBadRequest, "读取成就图标失败")
		return
	}

	kind := "image"
	mimeType, extension, raster := achievementRasterType(data)
	if !raster {
		if strings.ToLower(filepath.Ext(header.Filename)) != ".svg" && !bytes.Contains(bytes.ToLower(data[:minInt(len(data), 512)]), []byte("<svg")) {
			fail(c, http.StatusBadRequest, "仅支持 PNG、JPEG、GIF、WebP 或 SVG 图标")
			return
		}
		data, err = sanitizeAchievementSVG(data)
		if err != nil {
			fail(c, http.StatusBadRequest, err.Error())
			return
		}
		kind, mimeType, extension = "svg", "image/svg+xml", ".svg"
	}
	width, height := achievementImageDimensions(data, mimeType)
	if raster && mimeType != "image/webp" && (width < 32 || height < 32 || width > 1024 || height > 1024) {
		fail(c, http.StatusBadRequest, "栅格图标尺寸必须在 32×32 到 1024×1024 之间")
		return
	}
	sum := sha256.Sum256(data)
	hash := hex.EncodeToString(sum[:])
	var existing models.AchievementAsset
	if err := a.DB.Where("sha256 = ?", hash).First(&existing).Error; err == nil {
		ok(c, existing)
		return
	}
	name := "achievement-" + hash[:20] + extension
	uploader := storage.FromSettings(a.DB, config.DataDir())
	url, err := uploader.Upload(name, data)
	if err != nil {
		fail(c, http.StatusInternalServerError, "保存成就图标失败")
		return
	}
	asset := models.AchievementAsset{Kind: kind, URL: url, MimeType: mimeType, Width: width, Height: height, SHA256: hash, UploadedBy: currentUser(c).ID}
	if err := a.DB.Create(&asset).Error; err != nil {
		fail(c, http.StatusInternalServerError, "记录成就图标失败")
		return
	}
	a.recordAudit(c, "achievement.icon_uploaded", "achievement_asset", auditID(asset.ID), name, map[string]any{"kind": kind, "mime_type": mimeType})
	ok(c, asset)
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}
