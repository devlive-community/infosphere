package qa

import (
	"context"
	"math"
	"sort"
	"strings"

	"knowforge/server/internal/models"
	"knowforge/server/internal/plugincore"
)

// 检索：关键词（BM25）与向量（余弦相似度）混合打分，只在读者可阅读全文的章节中检索（经内容门禁过滤）。

const (
	bm25K1 = 1.2
	bm25B  = 0.75
)

// readableDocs 读者在本书中可阅读全文的已发布章节。
func (b *behavior) readableDocs(u *models.User, book *models.Book, docIDs []uint) map[uint]bool {
	out := map[uint]bool{}
	editor := u != nil && (b.core.IsAdmin(u) || b.core.CanEditBookContent(u, book))
	for _, id := range docIDs {
		if out[id] {
			continue
		}
		if editor {
			out[id] = true
			continue
		}
		doc := models.Document{ID: id, BookID: book.ID}
		out[id] = plugincore.CheckContentAccess(b.core, u, book, &doc).Allowed
	}
	return out
}

// loadChunks 本书可检索的分块（已过滤无权阅读的章节）。
func (b *behavior) loadChunks(u *models.User, book *models.Book) []Chunk {
	var chunks []Chunk
	b.core.Gorm().Where("book_id = ?", book.ID).Order("ordinal").Find(&chunks)
	ids := make([]uint, 0, len(chunks))
	for _, c := range chunks {
		ids = append(ids, c.DocID)
	}
	allowed := b.readableDocs(u, book, ids)
	out := chunks[:0]
	for _, c := range chunks {
		if allowed[c.DocID] {
			out = append(out, c)
		}
	}
	return out
}

type scored struct {
	chunk Chunk
	score float64
}

// search 在分块中检索与 query 最相关的 k 个（有向量时混合打分，否则只用关键词），返回命中与检索方式（hybrid | keyword）。
// 计算查询向量的调用记入调用链。
func (b *behavior) search(ctx context.Context, tr *tracer, chunks []Chunk, query string, k int) ([]Chunk, string) {
	if len(chunks) == 0 || strings.TrimSpace(query) == "" {
		return nil, "keyword"
	}
	kw := bm25(chunks, terms(query))
	var vec []float64
	hasVectors := false
	for _, c := range chunks {
		if len(c.Embedding) > 0 {
			hasVectors = true
			break
		}
	}
	if _, embed := b.core.AIStatus(); embed && hasVectors {
		startMs, started := tr.begin()
		qv, usage, err := b.core.AIEmbed(ctx, []string{query})
		step := TraceStep{Type: "embed", Query: truncate(query, 200), InputTokens: usage.InputTokens, Estimated: usage.Estimated}
		if err != nil {
			step.Error, step.Note = userError(err), "fallback_keyword"
		}
		tr.add(step, startMs, started)
		if err == nil && len(qv) == 1 {
			vec = make([]float64, len(chunks))
			for i, c := range chunks {
				if len(c.Embedding) > 0 {
					vec[i] = math.Max(0, cosine(qv[0], decodeVector(c.Embedding)))
				}
			}
		}
	}
	normalize(kw)
	normalize(vec)
	mode := "keyword"
	if vec != nil {
		mode = "hybrid"
	}
	results := make([]scored, 0, len(chunks))
	for i, c := range chunks {
		s := kw[i]
		if vec != nil {
			s = 0.5*kw[i] + 0.5*vec[i]
		}
		if s > 0 {
			results = append(results, scored{chunk: c, score: s})
		}
	}
	sort.SliceStable(results, func(i, j int) bool { return results[i].score > results[j].score })
	out := []Chunk{}
	for i := 0; i < len(results) && i < k; i++ {
		out = append(out, results[i].chunk)
	}
	return out, mode
}

func normalize(v []float64) {
	max := 0.0
	for _, x := range v {
		if x > max {
			max = x
		}
	}
	if max == 0 {
		return
	}
	for i := range v {
		v[i] /= max
	}
}

// bm25 关键词得分。
func bm25(chunks []Chunk, query []string) []float64 {
	scores := make([]float64, len(chunks))
	if len(query) == 0 {
		return scores
	}
	uniq := map[string]bool{}
	for _, q := range query {
		uniq[q] = true
	}
	docTerms := make([]map[string]int, len(chunks))
	lengths := make([]int, len(chunks))
	df := map[string]int{}
	total := 0
	for i, c := range chunks {
		tf := map[string]int{}
		for _, t := range strings.Fields(c.Terms) {
			tf[t]++
			lengths[i]++
		}
		docTerms[i] = tf
		total += lengths[i]
		for t := range uniq {
			if tf[t] > 0 {
				df[t]++
			}
		}
	}
	n := float64(len(chunks))
	avg := float64(total) / n
	if avg == 0 {
		avg = 1
	}
	for i := range chunks {
		for t := range uniq {
			f := float64(docTerms[i][t])
			if f == 0 {
				continue
			}
			idf := math.Log(1 + (n-float64(df[t])+0.5)/(float64(df[t])+0.5))
			scores[i] += idf * f * (bm25K1 + 1) / (f + bm25K1*(1-bm25B+bm25B*float64(lengths[i])/avg))
		}
	}
	return scores
}
