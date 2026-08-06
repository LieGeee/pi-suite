// Package aifilter AI 新闻过滤: 调用 OpenAI 兼容接口判断新闻是否有意义(默认技术相关)。
package aifilter

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// Filter 过滤判断结果
type Filter struct {
	Relevant bool   // 是否有意义
	Reason   string // AI 判断理由
}

// Client AI 过滤客户端
type Client struct {
	HTTP   *http.Client
	URL    string
	Key    string
	Model  string
	Prompt string
}

// New 创建客户端
func New(url, key, model, prompt string) *Client {
	if prompt == "" {
		prompt = "你是新闻编辑。判断下面的新闻标题与内容是否与「科技/AI/半导体/新能源/公司经营」等技术或财经相关, 以及是否有信息价值(非八卦、非娱乐、非纯广告)。只回复 JSON: {\"relevant\": true/false, \"reason\": \"简短理由\"}。"
	}
	return &Client{
		HTTP:   &http.Client{Timeout: 20 * time.Second},
		URL:    url,
		Key:    key,
		Model:  model,
		Prompt: prompt,
	}
}

// Enabled 是否配置了可用过滤
func (c *Client) Enabled() bool {
	return c != nil && c.URL != "" && c.Key != ""
}

// Judge 判断一条新闻是否值得推送
func (c *Client) Judge(title, content string) (*Filter, error) {
	if !c.Enabled() {
		return &Filter{Relevant: true}, nil
	}
	text := fmt.Sprintf("标题: %s\n内容: %s", title, truncate(content, 300))
	body := map[string]any{
		"model": c.Model,
		"messages": []map[string]string{
			{"role": "system", "content": c.Prompt},
			{"role": "user", "content": text},
		},
		"temperature": 0.2,
		"max_tokens":  120,
	}
	b, _ := json.Marshal(body)
	req, err := http.NewRequest(http.MethodPost, c.URL, bytes.NewReader(b))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.Key)
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	rb, _ := io.ReadAll(io.LimitReader(resp.Body, 8192))
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("AI 接口 %d: %s", resp.StatusCode, string(rb))
	}
	// 解析响应: 取 content 中的 JSON
	var rr struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(rb, &rr); err != nil || len(rr.Choices) == 0 {
		return nil, fmt.Errorf("AI 响应解析失败")
	}
	respBody := rr.Choices[0].Message.Content
	// 提取 JSON 对象
	start := strings.Index(respBody, "{")
	end := strings.LastIndex(respBody, "}")
	if start >= 0 && end > start {
		var f Filter
		if err := json.Unmarshal([]byte(respBody[start:end+1]), &f); err == nil {
			return &f, nil
		}
	}
	// 兜底: 关键词判断
	return &Filter{Relevant: strings.Contains(respBody, `"relevant":true`) || strings.Contains(respBody, "true") && !strings.Contains(respBody, "false")}, nil
}

func truncate(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + "…"
}
