package app

import (
	"errors"
	"fmt"
	"math"
	"regexp"
	"sort"
	"strings"
	"unicode"
	"unicode/utf8"

	pdfreader "github.com/ledongthuc/pdf"
)

type pdfLayoutLine struct {
	Text                    string
	Font                    string
	FontSize, X, Y, EndX    float64
	Bold, Italic, Monospace bool
	Page                    int
	GapAfter                float64
}

type pdfTextRow struct {
	Y      float64
	Glyphs []pdfreader.Text
}

var (
	pdfBulletPattern  = regexp.MustCompile(`^[•●▪◦‣·]\s*`)
	pdfNumberPattern  = regexp.MustCompile(`^(?:(\d{1,3})[.)、]|[a-zA-Z][.)])\s*`)
	pdfPageNumPattern = regexp.MustCompile(`(?i)^(?:page\s*)?\d{1,5}(?:\s*(?:/|of)\s*\d{1,5})?$|^第\s*\d{1,5}\s*页$`)
)

// extractPDFText reconstructs a Markdown document from PDF layout information.
// PDFs do not contain semantic headings or paragraphs, so font size, font style,
// coordinates and line gaps are used to infer a stable reading structure.
func extractPDFText(path string) (pdfExtractResult, error) {
	file, reader, err := pdfreader.Open(path)
	if err != nil {
		return pdfExtractResult{}, err
	}
	defer file.Close()

	pages := reader.NumPage()
	pageLines := make([][]pdfLayoutLine, pages)
	for pageNumber := 1; pageNumber <= pages; pageNumber++ {
		content, err := safePDFPageContent(reader.Page(pageNumber))
		if err != nil {
			return pdfExtractResult{}, fmt.Errorf("解析第 %d 页失败: %w", pageNumber, err)
		}
		pageLines[pageNumber-1] = buildPDFLayoutLines(content.Text, pageNumber)
	}
	removeRepeatedPDFMargins(pageLines)
	allLines := make([]pdfLayoutLine, 0)
	for _, lines := range pageLines {
		allLines = append(allLines, refreshPDFLineGaps(orderPDFPageLines(lines))...)
	}
	markdown := renderPDFMarkdown(allLines)
	if len(markdown) > contentImportMaxBytes {
		return pdfExtractResult{}, errors.New("PDF 转换后的 Markdown 超过 64MB")
	}
	return pdfExtractResult{Markdown: markdown, Pages: pages}, nil
}

func safePDFPageContent(page pdfreader.Page) (content pdfreader.Content, err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			content = pdfreader.Content{}
			err = fmt.Errorf("%v", recovered)
		}
	}()
	return page.Content(), nil
}

func buildPDFLayoutLines(source []pdfreader.Text, page int) []pdfLayoutLine {
	glyphs := make([]pdfreader.Text, 0, len(source))
	seen := make(map[string]bool, len(source))
	for _, glyph := range source {
		glyph.S = strings.TrimSpace(strings.ReplaceAll(glyph.S, "\x00", ""))
		if glyph.S == "" || !utf8.ValidString(glyph.S) {
			continue
		}
		key := fmt.Sprintf("%.2f|%.2f|%.2f|%s", glyph.X, glyph.Y, glyph.FontSize, glyph.S)
		if seen[key] {
			continue
		}
		seen[key] = true
		glyphs = append(glyphs, glyph)
	}
	sort.SliceStable(glyphs, func(i, j int) bool {
		if math.Abs(glyphs[i].Y-glyphs[j].Y) > 1.5 {
			return glyphs[i].Y > glyphs[j].Y
		}
		return glyphs[i].X < glyphs[j].X
	})

	rows := make([]pdfTextRow, 0)
	for _, glyph := range glyphs {
		if len(rows) == 0 || math.Abs(rows[len(rows)-1].Y-glyph.Y) > math.Max(1.8, math.Abs(glyph.FontSize)*0.22) {
			rows = append(rows, pdfTextRow{Y: glyph.Y, Glyphs: []pdfreader.Text{glyph}})
			continue
		}
		row := &rows[len(rows)-1]
		row.Glyphs = append(row.Glyphs, glyph)
		row.Y = (row.Y*float64(len(row.Glyphs)-1) + glyph.Y) / float64(len(row.Glyphs))
	}

	lines := make([]pdfLayoutLine, 0, len(rows))
	for _, row := range rows {
		sort.SliceStable(row.Glyphs, func(i, j int) bool { return row.Glyphs[i].X < row.Glyphs[j].X })
		start := 0
		for index := 1; index <= len(row.Glyphs); index++ {
			if index < len(row.Glyphs) {
				previous := row.Glyphs[index-1]
				current := row.Glyphs[index]
				gap := current.X - pdfGlyphEnd(previous)
				if gap <= math.Max(42, math.Abs(previous.FontSize)*4.5) {
					continue
				}
			}
			if line := pdfGlyphRunToLine(row.Glyphs[start:index], row.Y, page); line.Text != "" {
				lines = append(lines, line)
			}
			start = index
		}
	}
	sort.SliceStable(lines, func(i, j int) bool {
		if math.Abs(lines[i].Y-lines[j].Y) > 1.5 {
			return lines[i].Y > lines[j].Y
		}
		return lines[i].X < lines[j].X
	})
	for index := range lines {
		if index+1 < len(lines) && math.Abs(lines[index].X-lines[index+1].X) < 80 {
			lines[index].GapAfter = math.Max(0, lines[index].Y-lines[index+1].Y)
		}
	}
	return lines
}

// orderPDFPageLines detects a stable two-column gutter from rows that contain
// text on both sides. It then keeps full-width headings in place while reading
// each column from top to bottom instead of interleaving both columns by row.
func orderPDFPageLines(lines []pdfLayoutLine) []pdfLayoutLine {
	if len(lines) < 6 {
		return lines
	}
	type gapCandidate struct {
		LeftEnd, RightStart float64
	}
	gaps := make([]gapCandidate, 0)
	for index := 0; index < len(lines); {
		end := index + 1
		for end < len(lines) && math.Abs(lines[index].Y-lines[end].Y) <= 1.5 {
			end++
		}
		if end-index == 2 {
			left, right := lines[index], lines[index+1]
			if left.X > right.X {
				left, right = right, left
			}
			if right.X-left.EndX >= 36 {
				gaps = append(gaps, gapCandidate{LeftEnd: left.EndX, RightStart: right.X})
			}
		}
		index = end
	}
	if len(gaps) < 3 {
		return lines
	}
	sort.Slice(gaps, func(i, j int) bool {
		return (gaps[i].LeftEnd+gaps[i].RightStart)/2 < (gaps[j].LeftEnd+gaps[j].RightStart)/2
	})
	middle := gaps[len(gaps)/2]
	boundary := (middle.LeftEnd + middle.RightStart) / 2
	gutterWidth := middle.RightStart - middle.LeftEnd
	if gutterWidth < 24 {
		return lines
	}

	ordered := make([]pdfLayoutLine, 0, len(lines))
	pending := make([]pdfLayoutLine, 0)
	flushColumns := func() {
		if len(pending) == 0 {
			return
		}
		left := make([]pdfLayoutLine, 0, len(pending))
		right := make([]pdfLayoutLine, 0, len(pending))
		for _, line := range pending {
			if (line.X+line.EndX)/2 < boundary {
				left = append(left, line)
			} else {
				right = append(right, line)
			}
		}
		ordered = append(ordered, left...)
		ordered = append(ordered, right...)
		pending = pending[:0]
	}
	for _, line := range lines {
		spansGutter := line.X < middle.LeftEnd-gutterWidth*.25 && line.EndX > middle.RightStart+gutterWidth*.25
		if spansGutter {
			flushColumns()
			ordered = append(ordered, line)
			continue
		}
		pending = append(pending, line)
	}
	flushColumns()
	return ordered
}

func refreshPDFLineGaps(lines []pdfLayoutLine) []pdfLayoutLine {
	for index := range lines {
		lines[index].GapAfter = 0
		if index+1 < len(lines) && lines[index].Page == lines[index+1].Page && math.Abs(lines[index].X-lines[index+1].X) < 80 {
			lines[index].GapAfter = math.Max(0, lines[index].Y-lines[index+1].Y)
		}
	}
	return lines
}

func pdfGlyphRunToLine(glyphs []pdfreader.Text, y float64, page int) pdfLayoutLine {
	if len(glyphs) == 0 {
		return pdfLayoutLine{}
	}
	var text strings.Builder
	var sizeWeight, boldWeight, italicWeight, monoWeight float64
	fontWeights := map[string]float64{}
	for index, glyph := range glyphs {
		if index > 0 && shouldSpacePDFGlyphs(glyphs[index-1], glyph) {
			text.WriteByte(' ')
		}
		text.WriteString(glyph.S)
		weight := math.Max(1, float64(utf8.RuneCountInString(glyph.S)))
		sizeWeight += math.Abs(glyph.FontSize) * weight
		fontWeights[glyph.Font] += weight
		fontName := strings.ToLower(glyph.Font)
		if containsAny(fontName, "bold", "black", "semibold", "demi") {
			boldWeight += weight
		}
		if containsAny(fontName, "italic", "oblique") {
			italicWeight += weight
		}
		if containsAny(fontName, "mono", "courier", "consolas", "menlo") {
			monoWeight += weight
		}
	}
	value := strings.TrimSpace(strings.Join(strings.Fields(text.String()), " "))
	totalWeight := math.Max(1, float64(utf8.RuneCountInString(value)))
	dominantFont := ""
	dominantWeight := 0.0
	for font, weight := range fontWeights {
		if weight > dominantWeight {
			dominantFont, dominantWeight = font, weight
		}
	}
	return pdfLayoutLine{
		Text: value, Font: dominantFont, FontSize: sizeWeight / totalWeight,
		X: glyphs[0].X, Y: y, EndX: pdfGlyphEnd(glyphs[len(glyphs)-1]), Page: page,
		Bold: boldWeight/totalWeight >= 0.55, Italic: italicWeight/totalWeight >= 0.55,
		Monospace: monoWeight/totalWeight >= 0.55,
	}
}

func pdfGlyphEnd(glyph pdfreader.Text) float64 {
	width := math.Abs(glyph.W)
	if width < 0.1 {
		width = math.Max(1, math.Abs(glyph.FontSize)*0.55*float64(utf8.RuneCountInString(glyph.S)))
	}
	return glyph.X + width
}

func shouldSpacePDFGlyphs(previous, current pdfreader.Text) bool {
	if strings.HasSuffix(previous.S, " ") || strings.HasPrefix(current.S, " ") {
		return false
	}
	gap := current.X - pdfGlyphEnd(previous)
	if gap <= math.Max(1.4, math.Abs(previous.FontSize)*0.16) {
		return false
	}
	return needsWordSpace(lastRune(previous.S), firstRune(current.S))
}

func needsWordSpace(left, right rune) bool {
	return isLatinWordRune(left) && isLatinWordRune(right)
}

func isLatinWordRune(value rune) bool {
	return (unicode.IsLetter(value) && value <= unicode.MaxLatin1) || unicode.IsDigit(value)
}

func firstRune(value string) rune {
	for _, current := range value {
		return current
	}
	return 0
}

func lastRune(value string) rune {
	var result rune
	for _, current := range value {
		result = current
	}
	return result
}

func containsAny(value string, candidates ...string) bool {
	for _, candidate := range candidates {
		if strings.Contains(value, candidate) {
			return true
		}
	}
	return false
}

func removeRepeatedPDFMargins(pages [][]pdfLayoutLine) {
	occurrences := map[string]map[int]bool{}
	for pageIndex, lines := range pages {
		for _, index := range pdfMarginIndexes(len(lines)) {
			key := normalizePDFMarginText(lines[index].Text)
			if key == "" {
				continue
			}
			if occurrences[key] == nil {
				occurrences[key] = map[int]bool{}
			}
			occurrences[key][pageIndex] = true
		}
	}
	for pageIndex, lines := range pages {
		filtered := make([]pdfLayoutLine, 0, len(lines))
		marginIndexes := map[int]bool{}
		for _, index := range pdfMarginIndexes(len(lines)) {
			marginIndexes[index] = true
		}
		for index, line := range lines {
			key := normalizePDFMarginText(line.Text)
			repeated := marginIndexes[index] && len(occurrences[key]) >= 2
			if pdfPageNumPattern.MatchString(strings.TrimSpace(line.Text)) || repeated {
				continue
			}
			filtered = append(filtered, line)
		}
		pages[pageIndex] = filtered
	}
}

func pdfMarginIndexes(length int) []int {
	indexes := make([]int, 0, 4)
	for index := 0; index < length && index < 2; index++ {
		indexes = append(indexes, index)
	}
	for index := length - 2; index < length; index++ {
		if index >= 2 && index >= 0 {
			indexes = append(indexes, index)
		}
	}
	return indexes
}

func normalizePDFMarginText(value string) string {
	value = strings.ToLower(strings.Join(strings.Fields(value), " "))
	if utf8.RuneCountInString(value) > 120 {
		return ""
	}
	return strings.Map(func(current rune) rune {
		if unicode.IsDigit(current) {
			return '#'
		}
		return current
	}, value)
}

func renderPDFMarkdown(lines []pdfLayoutLine) string {
	if len(lines) == 0 {
		return ""
	}
	bodySize := medianPDFFontSize(lines)
	blocks := make([]string, 0, len(lines))
	paragraph := ""
	codeLines := make([]string, 0)
	lastPage := lines[0].Page
	flushParagraph := func() {
		if strings.TrimSpace(paragraph) != "" {
			blocks = append(blocks, strings.TrimSpace(paragraph))
		}
		paragraph = ""
	}
	flushCode := func() {
		if len(codeLines) > 0 {
			blocks = append(blocks, "~~~\n"+strings.Join(codeLines, "\n")+"\n~~~")
		}
		codeLines = codeLines[:0]
	}

	for _, line := range lines {
		value := strings.TrimSpace(line.Text)
		if value == "" {
			continue
		}
		if line.Page != lastPage {
			flushParagraph()
			flushCode()
			lastPage = line.Page
		}
		if line.Monospace {
			flushParagraph()
			codeLines = append(codeLines, value)
			continue
		}
		flushCode()
		if headingLevel := pdfHeadingLevel(line, bodySize); headingLevel > 0 {
			flushParagraph()
			blocks = append(blocks, strings.Repeat("#", headingLevel)+" "+strings.TrimLeft(value, "# "))
			continue
		}
		if pdfBulletPattern.MatchString(value) {
			flushParagraph()
			blocks = append(blocks, "- "+pdfBulletPattern.ReplaceAllString(value, ""))
			continue
		}
		if matches := pdfNumberPattern.FindStringSubmatchIndex(value); matches != nil {
			flushParagraph()
			marker := "- "
			if matches[2] >= 0 {
				marker = value[matches[2]:matches[3]] + ". "
			}
			blocks = append(blocks, marker+strings.TrimSpace(value[matches[1]:]))
			continue
		}
		if strings.HasPrefix(value, "> ") {
			flushParagraph()
			blocks = append(blocks, value)
			continue
		}
		if line.Bold && utf8.RuneCountInString(value) <= 120 {
			flushParagraph()
			blocks = append(blocks, "**"+value+"**")
			continue
		}
		if line.Italic && !line.Bold && utf8.RuneCountInString(value) <= 160 {
			flushParagraph()
			blocks = append(blocks, "*"+value+"*")
			continue
		}
		paragraph = joinPDFParagraphLine(paragraph, value)
		if line.GapAfter > bodySize*1.7 {
			flushParagraph()
		}
	}
	flushParagraph()
	flushCode()
	return strings.TrimSpace(strings.Join(blocks, "\n\n"))
}

func medianPDFFontSize(lines []pdfLayoutLine) float64 {
	values := make([]float64, 0, len(lines)*4)
	for _, line := range lines {
		if line.FontSize <= 0 {
			continue
		}
		weight := utf8.RuneCountInString(line.Text)
		if weight > 12 {
			weight = 12
		}
		for index := 0; index < weight; index++ {
			values = append(values, line.FontSize)
		}
	}
	if len(values) == 0 {
		return 12
	}
	sort.Float64s(values)
	return values[len(values)/2]
}

func pdfHeadingLevel(line pdfLayoutLine, bodySize float64) int {
	value := strings.TrimSpace(strings.TrimLeft(line.Text, "#"))
	length := utf8.RuneCountInString(value)
	if length == 0 || length > 160 {
		return 0
	}
	if pdfChapterHeading.MatchString(value) {
		return 2
	}
	ratio := line.FontSize / math.Max(bodySize, 1)
	switch {
	case ratio >= 1.65:
		return 1
	case ratio >= 1.38:
		return 2
	case ratio >= 1.18:
		return 3
	case line.Bold && length <= 80:
		return 3
	default:
		return 0
	}
}

func joinPDFParagraphLine(paragraph, line string) string {
	if paragraph == "" {
		return line
	}
	if strings.HasSuffix(paragraph, "-") && isLatinWordRune(firstRune(line)) {
		return strings.TrimSuffix(paragraph, "-") + line
	}
	if needsWordSpace(lastRune(paragraph), firstRune(line)) {
		return paragraph + " " + line
	}
	return paragraph + line
}
