package app

import (
	"archive/zip"
	"bytes"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"infosphere/server/internal/models"

	"github.com/gin-gonic/gin"
)

// batchExportMaxBooks 单次批量导出的书籍数量上限，防止过大打包。
const batchExportMaxBooks = 100

// BatchExportMyBooks GET /users/me/export/books?ids=1,2,3
// 将本人（可编辑的）多本书各自打包为独立 markdown zip，再合并到一个外层 zip 中；
// 每本书是自包含的 <slug>.zip，可原样单独重新导入，保证往返无损。ids 省略时导出全部自有书籍。
func (a *App) BatchExportMyBooks(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		fail(c, http.StatusUnauthorized, "请先登录")
		return
	}

	// 解析可选 ids（逗号分隔）；省略则导出全部自有书籍。
	var books []models.Book
	query := a.DB.Preload("Tags").Order("id ASC")
	if raw := strings.TrimSpace(c.Query("ids")); raw != "" {
		ids := []uint{}
		for _, part := range strings.Split(raw, ",") {
			part = strings.TrimSpace(part)
			if part == "" {
				continue
			}
			id, err := strconv.ParseUint(part, 10, 64)
			if err != nil {
				fail(c, http.StatusBadRequest, "书籍标识无效")
				return
			}
			ids = append(ids, uint(id))
		}
		if len(ids) == 0 {
			fail(c, http.StatusBadRequest, "未选择任何书籍")
			return
		}
		if len(ids) > batchExportMaxBooks {
			fail(c, http.StatusBadRequest, fmt.Sprintf("单次最多导出 %d 本书", batchExportMaxBooks))
			return
		}
		query = query.Where("id IN ?", ids)
	} else {
		query = query.Where("user_id = ?", user.ID).Limit(batchExportMaxBooks)
	}
	if err := query.Find(&books).Error; err != nil {
		fail(c, http.StatusInternalServerError, "查询书籍失败")
		return
	}

	// 仅导出当前用户「自己的」书籍：作者本人或编辑协作者。
	// 不走管理员越权（本接口语义是导出「我的书籍」，管理员也不应借此打包他人作品）。
	exportable := books[:0]
	for _, b := range books {
		owned := b.UserID == user.ID
		if !owned {
			if role, ok := a.collaboratorRole(user, b.ID); ok && role == "editor" {
				owned = true
			}
		}
		if owned {
			exportable = append(exportable, b)
		}
	}
	if len(exportable) == 0 {
		fail(c, http.StatusForbidden, "没有可导出的书籍")
		return
	}

	buf := &bytes.Buffer{}
	outer := zip.NewWriter(buf)
	manifest := &strings.Builder{}
	usedNames := map[string]bool{}
	for _, b := range exportable {
		book := b
		data, err := a.buildBookMarkdownZip(&book)
		if err != nil {
			fail(c, http.StatusInternalServerError, "打包失败: "+err.Error())
			return
		}
		base := book.Slug
		if base == "" {
			base = fmt.Sprintf("book-%d", book.ID)
		}
		name := base + ".zip"
		for i := 2; usedNames[name]; i++ { // slug 冲突时追加序号
			name = fmt.Sprintf("%s-%d.zip", base, i)
		}
		usedNames[name] = true
		f, err := outer.Create(name)
		if err != nil {
			fail(c, http.StatusInternalServerError, "打包失败: "+err.Error())
			return
		}
		if _, err := f.Write(data); err != nil {
			fail(c, http.StatusInternalServerError, "打包失败: "+err.Error())
			return
		}
		fmt.Fprintf(manifest, "%s\t%s\n", name, book.Title)
	}

	mf, err := outer.Create("manifest.txt")
	if err == nil {
		_, _ = mf.Write([]byte("# InfoSphere 批量导出\n# 每个 .zip 为一本书，可单独重新导入\n\n" + manifest.String()))
	}
	if err := outer.Close(); err != nil {
		fail(c, http.StatusInternalServerError, "打包失败: "+err.Error())
		return
	}

	filename := fmt.Sprintf("books-export-%s.zip", time.Now().Format("20060102"))
	c.Header("Content-Disposition", "attachment; filename="+filename)
	c.Data(http.StatusOK, "application/zip", buf.Bytes())
}
