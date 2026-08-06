// Package model 定义 pi-monitor 的数据模型。
package model

import (
	"encoding/json"
	"time"
)

// ItemType 监控项类型
type ItemType string

const (
	TypeStock   ItemType = "stock"   // 股票行情
	TypeNews    ItemType = "news"    // 新闻关键词
	TypeProduct ItemType = "product" // 商品价格
	TypeCrypto  ItemType = "crypto"  // 加密货币(Gate.io)
	TypeFX      ItemType = "fx"      // 外汇汇率(新浪)
)

func (t ItemType) Valid() bool {
	switch t {
	case TypeStock, TypeNews, TypeProduct, TypeCrypto, TypeFX:
		return true
	}
	return false
}

// Item 一条监控配置
type Item struct {
	ID          int64     `json:"id"`
	Type        ItemType  `json:"type"`
	Name        string    `json:"name"`   // 展示名
	Target      string    `json:"target"` // stock: 代码(如 sh600519) / news: 关键词(逗号分隔) / product: URL
	Extra       string    `json:"extra"`  // ItemExtra 的 JSON 序列化
	Enabled     bool      `json:"enabled"`
	LastStatus  string    `json:"last_status"`  // ok / fail / pending
	LastValue   float64   `json:"last_value"`   // 最新数值(价格/涨跌幅等)
	LastDetail  string    `json:"last_detail"`  // 最新摘要
	LastChecked time.Time `json:"last_checked"` // 最近检查时间
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// ItemExtra 附加配置(存入 Item.Extra)
type ItemExtra struct {
	// 股票
	AlertDownPct float64 `json:"alert_down_pct,omitempty"` // 单日跌幅超过 % 告警
	AlertUpPct   float64 `json:"alert_up_pct,omitempty"`   // 单日涨幅超过 % 告警
	PriceLow     float64 `json:"price_low,omitempty"`      // 现价低于该值告警
	PriceHigh    float64 `json:"price_high,omitempty"`     // 现价高于该值告警

	// 商品
	MinPrice   float64 `json:"min_price,omitempty"`   // 价格低于该值告警(降价提醒)
	MaxPrice   float64 `json:"max_price,omitempty"`   // 价格高于该值告警
	PriceRegex string  `json:"price_regex,omitempty"` // 自定义价格提取正则
	TitleRegex string  `json:"title_regex,omitempty"` // 自定义标题提取正则

	// 新闻
	Sources string `json:"sources,omitempty"` // 指定新闻源, 逗号分隔; 空=全部

	// 加密货币/汇率(通用阈值: 低于或高于某价格/值)
	AlertBelow float64 `json:"alert_below,omitempty"` // 值低于该值告警
	AlertAbove float64 `json:"alert_above,omitempty"` // 值高于该值告警
}

func (it *Item) GetExtra() ItemExtra {
	var e ItemExtra
	if it.Extra != "" {
		_ = json.Unmarshal([]byte(it.Extra), &e)
	}
	return e
}

func (it *Item) SetExtra(e ItemExtra) {
	b, _ := json.Marshal(e)
	it.Extra = string(b)
}

// PricePoint 价格/数值历史点
type PricePoint struct {
	ID        int64     `json:"id"`
	ItemID    int64     `json:"item_id"`
	Value     float64   `json:"value"`   // -1 表示抓取失败
	Status    string    `json:"status"`  // ok / fail
	Detail    string    `json:"detail"`  // 当时的摘要(标题/价格文本等)
	CreatedAt time.Time `json:"created_at"`
}

// NewsItem 采集到的新闻
type NewsItem struct {
	ID        int64     `json:"id"`
	Source    string    `json:"source"`
	Title     string    `json:"title"`
	URL       string    `json:"url"`
	Content   string    `json:"content"`
	Published time.Time `json:"published"`
	Matched   string    `json:"matched"` // 命中的关键词(逗号分隔)
	CreatedAt time.Time `json:"created_at"`
}

// Alert 告警记录
type Alert struct {
	ID        int64     `json:"id"`
	ItemID    int64     `json:"item_id"`
	ItemName  string    `json:"item_name"`
	Type      string    `json:"type"` // price_drop / price_up / threshold / news_hit / product_change / check_fail
	Message   string    `json:"message"`
	CreatedAt time.Time `json:"created_at"`
}

// Settings 全局设置
type Settings struct {
	IntervalMin    int    `json:"interval_min"`    // 抓取间隔(分钟), 默认 15
	WebhookURL     string `json:"webhook_url"`     // 通用 webhook 推送地址
	ServerChanKey  string `json:"serverchan_key"`  // Server酱 sendkey
	NotifyEnabled  bool   `json:"notify_enabled"`  // 是否启用推送
	AIFilterURL    string `json:"ai_filter_url"`    // AI 过滤接口(OpenAI 兼容, 如 http://YOUR_SERVER:8888/v1/chat/completions)
	AIFilterKey    string `json:"ai_filter_key"`    // AI 过滤 API key
	AIFilterModel  string `json:"ai_filter_model"`  // AI 过滤模型名(如 deepseek-v4-flash)
	AIFilterPrompt string `json:"ai_filter_prompt"` // 自定义过滤提示词(默认: 技术相关才有意义)
}
