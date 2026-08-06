// Package notify 推送通知(Server酱 + 通用 Webhook)。
package notify

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"pi-monitor/internal/model"
)

// Client 通知客户端
type Client struct {
	HTTP *http.Client
}

// New 创建通知客户端
func New() *Client {
	return &Client{HTTP: &http.Client{Timeout: 15 * time.Second}}
}

// Send 按设置推送一条告警
func (c *Client) Send(st model.Settings, a *model.Alert) {
	if !st.NotifyEnabled {
		return
	}
	title := fmt.Sprintf("[监控] %s", a.ItemName)
	if a.Type == "news_hit" {
		title = "[新闻] " + a.Message
	}
	text := fmt.Sprintf("类型: %s\n时间: %s\n详情: %s", a.Type, a.CreatedAt.Format("2006-01-02 15:04:05"), a.Message)

	var err error
	if st.ServerChanKey != "" {
		err = c.sendServerChan(st.ServerChanKey, title, text)
	}
	if err != nil && st.WebhookURL != "" {
		err = c.sendWebhook(st.WebhookURL, title, text)
	}
	// 只记录错误, 不阻塞主流程
	if err != nil {
		fmt.Printf("[notify] send failed: %v\n", err)
	}
}

func (c *Client) sendServerChan(key, title, text string) error {
	url := fmt.Sprintf("https://sctapi.ftqq.com/%s.send", key)
	body := map[string]string{"title": title, "desp": text}
	b, _ := json.Marshal(body)
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(b))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		rb, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("serverchan %d: %s", resp.StatusCode, string(rb))
	}
	return nil
}

func (c *Client) sendWebhook(url, title, text string) error {
	body := map[string]string{"title": title, "text": text}
	b, _ := json.Marshal(body)
	resp, err := c.HTTP.Post(url, "application/json", bytes.NewReader(b))
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		rb, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("webhook %d: %s", resp.StatusCode, string(rb))
	}
	return nil
}
