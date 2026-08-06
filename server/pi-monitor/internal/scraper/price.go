package scraper

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

// ProductPrice 商品抓取结果
type ProductPrice struct {
	Title string
	Price float64
	Found bool
	Note  string
}

// 常见价格正则(HTML)
var pricePatterns = []struct {
	re  *regexp.Regexp
	idx int
}{
	{regexp.MustCompile(`(?:¥|￥|元)?\s*([0-9]+(?:\.[0-9]{1,2})?)\s*元`), 1},
	{regexp.MustCompile(`"price"\s*[:=]\s*"?([0-9]+(?:\.[0-9]{1,2})?)`), 1},
	{regexp.MustCompile(`"p"\s*:\s*"?([0-9]+(?:\.[0-9]{1,2})?)`), 1},
	{regexp.MustCompile(`(?:¥|￥)\s*([0-9]+(?:\.[0-9]{1,2})?)`), 1},
	{regexp.MustCompile(`([0-9]+(?:\.[0-9]{1,2})?)\s*元`), 1},
}

var titlePatterns = []*regexp.Regexp{
	regexp.MustCompile(`<title[^>]*>([^<]{5,120})</title>`),
	regexp.MustCompile(`"title"\s*:\s*"([^"]{5,120})"`),
	regexp.MustCompile(`"itemTitle"\s*:\s*"([^"]{5,120})"`),
	regexp.MustCompile(`"rawTitle"\s*:\s*"([^"]{5,120})"`),
}

// JSON 价格常见键路径(用于 JSON API 数据源)
var jsonPriceKeys = []string{
	"data.result.price", "data.price", "data.currentPrice", "price", "currentPrice", "p", "data.p",
	"data.sku.price", "data.info.price", "result.price",
}
var jsonTitleKeys = []string{"data.result.title", "data.title", "data.name", "title", "name", "data.sku.name", "data.info.title"}

// FetchProduct 抓取商品页/JSON API 并提取标题/价格
func (c *Client) FetchProduct(rawURL string, customPriceRe, customTitleRe string) (*ProductPrice, error) {
	rawURL = CleanURL(rawURL)
	body, err := c.get(rawURL)
	if err != nil {
		return nil, err
	}
	res := &ProductPrice{}

	// 先尝试 JSON 数据源(响应是 JSON 且能提取到价格)
	if strings.HasPrefix(strings.TrimSpace(body), "{") || strings.HasPrefix(strings.TrimSpace(body), "[") {
		if ok := extractFromJSON(body, res); ok {
			return res, nil
		}
	}

	// 标题
	if customTitleRe != "" {
		if re, e := regexp.Compile(customTitleRe); e == nil {
			if m := re.FindStringSubmatch(body); len(m) > 1 {
				res.Title = htmlUnescape(strings.TrimSpace(m[1]))
			}
		}
	}
	if res.Title == "" {
		for _, re := range titlePatterns {
			if m := re.FindStringSubmatch(body); len(m) > 1 {
				t := htmlUnescape(strings.TrimSpace(m[1]))
				t = strings.TrimSuffix(t, " - 京东")
				t = strings.TrimSuffix(t, " - 淘宝")
				t = strings.TrimSuffix(t, "-淘宝网")
				t = strings.TrimSuffix(t, " - 闲鱼")
				t = strings.TrimSpace(t)
				if len(t) >= 5 {
					res.Title = t
					break
				}
			}
		}
	}
	// JSON-LD 标题兜底
	if res.Title == "" {
		res.Title = extractJSONLDTitle(body)
	}

	// 价格
	if customPriceRe != "" {
		if re, e := regexp.Compile(customPriceRe); e == nil {
			if m := re.FindStringSubmatch(body); len(m) > 1 {
				if p, e := strconv.ParseFloat(strings.TrimSpace(m[1]), 64); e == nil {
					res.Price, res.Found = p, true
				}
			}
		}
	}
	if !res.Found {
		for _, pat := range pricePatterns {
			if m := pat.re.FindStringSubmatch(body); len(m) > pat.idx {
				if p, e := strconv.ParseFloat(strings.TrimSpace(m[pat.idx]), 64); e == nil && p > 0 && p < 100_000_000 {
					res.Price, res.Found = p, true
					break
				}
			}
		}
	}
	// JSON-LD 价格兜底
	if !res.Found {
		if p := extractJSONLDPrice(body); p > 0 {
			res.Price, res.Found = p, true
		}
	}

	if !res.Found {
		res.Note = "未提取到价格(需要登录/反爬, 或可用自定义正则)"
	}
	return res, nil
}

// extractFromJSON 从 JSON 响应提取价格/标题
func extractFromJSON(body string, res *ProductPrice) bool {
	var root any
	if err := json.Unmarshal([]byte(body), &root); err != nil {
		return false
	}
	foundPrice := false
	for _, k := range jsonPriceKeys {
		if v := lookupPath(root, strings.Split(k, ".")); v != nil {
			if p, ok := toFloat(v); ok && p > 0 && p < 100_000_000 {
				res.Price, res.Found, foundPrice = p, true, true
				break
			}
		}
	}
	for _, k := range jsonTitleKeys {
		if v := lookupPath(root, strings.Split(k, ".")); v != nil {
			if s, ok := v.(string); ok && len(s) >= 5 {
				res.Title = s
				break
			}
		}
	}
	return foundPrice
}

// lookupPath 按点分路径查找 map 值
func lookupPath(node any, path []string) any {
	cur := node
	for _, key := range path {
		m, ok := cur.(map[string]any)
		if !ok {
			return nil
		}
		cur, ok = m[key]
		if !ok {
			return nil
		}
	}
	return cur
}

func toFloat(v any) (float64, bool) {
	switch t := v.(type) {
	case float64:
		return t, true
	case json.Number:
		f, err := t.Float64()
		return f, err == nil
	case string:
		f, err := strconv.ParseFloat(strings.TrimSpace(t), 64)
		return f, err == nil
	}
	return 0, false
}

// extractJSONLDPrice 从 JSON-LD schema.org 提取价格
func extractJSONLDPrice(body string) float64 {
	re := regexp.MustCompile(`"@type"\s*:\s*"Product"[\s\S]{0,900}?"offers"[\s\S]{0,500}?"price"\s*:\s*"?([0-9]+(?:\.[0-9]+)?)`)
	if m := re.FindStringSubmatch(body); len(m) > 1 {
		if p, err := strconv.ParseFloat(m[1], 64); err == nil && p > 0 {
			return p
		}
	}
	return 0
}

func extractJSONLDTitle(body string) string {
	re := regexp.MustCompile(`"@type"\s*:\s*"Product"[\s\S]{0,700}?"name"\s*:\s*"([^"]{3,120})"`)
	if m := re.FindStringSubmatch(body); len(m) > 1 {
		return htmlUnescape(m[1])
	}
	return ""
}

// Describe 人类可读摘要
func (p *ProductPrice) Describe() string {
	if !p.Found {
		return "价格未知"
	}
	return fmt.Sprintf("%s (¥%.2f)", truncate(p.Title, 40), p.Price)
}

func truncate(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + "…"
}
