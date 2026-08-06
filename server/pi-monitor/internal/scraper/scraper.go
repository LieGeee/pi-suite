// Package scraper 抓取器: 股票行情 / 新闻 / 商品价格。
package scraper

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

// Client 抓取 HTTP 客户端
type Client struct {
	HTTP *http.Client
	UA   string
}

// New 创建抓取客户端
func New() *Client {
	return &Client{
		HTTP: &http.Client{Timeout: 20 * time.Second},
		UA:   "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
	}
}

// Result 一次抓取结果
type Result struct {
	Value  float64 // 数值(-1 表示失败)
	Status string  // ok / fail
	Detail string  // 摘要
	// 新闻专用
	News []NewsHit
}

// NewsHit 命中的新闻条目
type NewsHit struct {
	Source  string
	Title   string
	URL     string
	Content string
}

// StockResult 行情详情
type StockResult struct {
	Name   string
	Price  float64
	Change float64 // 涨跌额
	ChangePct float64 // 涨跌幅%
	High   float64
	Low    float64
	Open   float64
	PrevClose float64
	Time   time.Time
}

// ---------- 股票行情 ----------

var (
	// 正则: 大小写不敏感匹配 v_xxx 前缀, 代码保持原始大小写(美股 usAAPL 区分大小写)
	reQuote = regexp.MustCompile(`(?i)v_([a-z]{2}[a-z0-9]+)="([^"]*)"`)
)

// FetchStock 从腾讯行情接口抓取股票/指数
// 代码格式:
//   A股: sh600519 / sz000001 / bj830799 (也支持纯6位数字自动判断)
//   港股: hk00700
//   美股: usAAPL / usNVDA
//   指数: sh000001 / sz399006 / hkHSI / usDJI
func (c *Client) FetchStock(code string) (*StockResult, error) {
	code = strings.TrimSpace(code)
	key := code
	// 纯数字6位 -> A股自动补前缀
	if len(code) == 6 && isAllDigit(code) {
		switch code[0] {
		case '6', '9', '5':
			key = "sh" + code
		case '0', '2', '3':
			key = "sz" + code
		case '4', '8':
			key = "bj" + code
		default:
			return nil, fmt.Errorf("无法识别股票代码前缀: %s", code)
		}
	} else {
		// 非纯数字(含字母): 美股 usAAPL 区分大小写需保留; A股/港股/指数前缀转小写更稳
		key = strings.ToLower(key)
		// 美股特殊: 前缀 us 后跟的代码要保留大写
		if strings.HasPrefix(key, "us") && len(key) > 2 {
			key = "us" + code[2:]
		}
	}
	api := fmt.Sprintf("https://qt.gtimg.cn/q=%s", key)
	resp, err := c.get(api)
	if err != nil {
		return nil, err
	}
	m := reQuote.FindStringSubmatch(resp)
	if len(m) < 3 {
		return nil, fmt.Errorf("行情解析失败: %s", code)
	}
	fields := strings.Split(m[2], "~")
	if len(fields) < 40 {
		return nil, fmt.Errorf("行情字段不足: %s", code)
	}
	// 腾讯字段: 1名称 2代码 3现价 4昨收 5今开 6成交量 ... 31涨跌 32涨跌% 33最高 34最低
	f := func(i int) float64 {
		v := 0.0
		fmt.Sscanf(strings.TrimSpace(fields[i]), "%f", &v)
		return v
	}
	return &StockResult{
		Name:      fields[1],
		Price:     f(3),
		PrevClose: f(4),
		Open:      f(5),
		Change:    f(31),
		ChangePct: f(32),
		High:      f(33),
		Low:       f(34),
		Time:      time.Now(),
	}, nil
}

func isAllDigit(s string) bool {
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

// ---------- 新闻 RSS ----------

// 常见中文财经/科技新闻源(2026-08 已验证可用)
var NewsSources = []struct {
	Name string
	URL  string
}{
	{"36氪", "https://36kr.com/feed"},
	{"IT之家", "https://www.ithome.com/rss/"},
	{"cnBeta", "https://www.cnbeta.com.tw/backend.php"},
	{"少数派", "https://sspai.com/feed"},
	{"爱范儿", "https://www.ifanr.com/feed"},
	{"搜狐科技", "https://it.sohu.com/rss"},
	{"雪球", "https://xueqiu.com/hots/topic/rss"},
	{"华尔街见闻", "https://wallstreetcn.com/rss"},
}

// FetchNewsRSS 抓取一个 RSS 源并返回标题列表
func (c *Client) FetchNewsRSS(name, url string) ([]NewsHit, error) {
	resp, err := c.get(url)
	if err != nil {
		return nil, err
	}
	hits := []NewsHit{}
	// 极简 XML 解析: 提取 <item><title>...</title><link>...</link><description>...</description>
	items := regexp.MustCompile(`(?s)<item>(.*?)</item>`).FindAllStringSubmatch(resp, -1)
	for _, it := range items {
		body := it[1]
		title := extractTag(body, "title")
		link := extractTag(body, "link")
		desc := extractTag(body, "description")
		if title == "" || link == "" {
			continue
		}
		title = htmlUnescape(title)
		link = htmlUnescape(link)
		hits = append(hits, NewsHit{Source: name, Title: title, URL: link, Content: htmlUnescape(desc)})
	}
	return hits, nil
}

func extractTag(s, tag string) string {
	re := regexp.MustCompile(`(?s)<` + tag + `[^>]*>(.*?)</` + tag + `>`)
	m := re.FindStringSubmatch(s)
	if len(m) < 2 {
		return ""
	}
	return strings.TrimSpace(m[1])
}

// htmlUnescape 处理 &lt; &amp; 等
func htmlUnescape(s string) string {
	r := strings.NewReplacer(
		"&lt;", "<", "&gt;", ">", "&amp;", "&", "&quot;", `"`, "&#39;", "'", "&nbsp;", " ",
	)
	return r.Replace(s)
}

// ---------- 通用抓取 ----------

func (c *Client) get(rawURL string) (string, error) {
	req, err := http.NewRequest(http.MethodGet, rawURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", c.UA)
	req.Header.Set("Accept", "*/*")
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("HTTP %d: %s", resp.StatusCode, rawURL)
	}
	// 尝试按 charset 解码; 腾讯接口是 GBK, 先假设 utf-8 再兜底
	b, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		return "", err
	}
	return decodeText(b, resp.Header.Get("Content-Type")), nil
}

// decodeText 简单编码兜底: 若含 GBK 编码声明或无法 utf-8 解析则转码
func decodeText(b []byte, contentType string) string {
	if strings.Contains(strings.ToLower(contentType), "charset=gb") || strings.Contains(strings.ToLower(contentType), "gb2312") {
		return gbkToUTF8(b)
	}
	s := string(b)
	if strings.Contains(strings.ToLower(s), "charset=gb") {
		return gbkToUTF8(b)
	}
	return s
}

// gbkToUTF8 使用 golang.org/x/text 转码(见 init 注册)
func gbkToUTF8(b []byte) string {
	out, err := gbkDecoder(b)
	if err != nil {
		return string(b)
	}
	return out
}

// ---------- 加密货币 + 汇率 ----------

// CryptoQuote 加密货币行情(Gate.io 公开 API, 国内可达)
type CryptoQuote struct {
	Pair    string  // BTC_USDT
	Price   float64 // 最新价(USDT)
	ChangePct float64 // 24h 涨跌%
	High24h float64
	Low24h  float64
}

// FetchCrypto 抓取 Gate.io 加密货币行情
// 格式: BTC_USDT / ETH_USDT 等 (token 默认兑 USDT, 也可指定 quote 如 BTC_CNY)
func (c *Client) FetchCrypto(pair string) (*CryptoQuote, error) {
	pair = strings.ToUpper(strings.TrimSpace(pair))
	if !strings.Contains(pair, "_") {
		pair = pair + "_USDT"
	}
	api := "https://api.gateio.ws/api/v4/spot/tickers?currency_pair=" + url.QueryEscape(pair)
	resp, err := c.get(api)
	if err != nil {
		return nil, err
	}
	var arr []struct {
		CurrencyPair     string `json:"currency_pair"`
		Last             string `json:"last"`
		ChangePercentage string `json:"change_percentage"`
		High24h          string `json:"high_24h"`
		Low24h           string `json:"low_24h"`
	}
	if err := json.Unmarshal([]byte(resp), &arr); err != nil {
		return nil, fmt.Errorf("crypto 解析失败: %v", err)
	}
	if len(arr) == 0 {
		return nil, fmt.Errorf("crypto 无数据: %s", pair)
	}
	q := arr[0]
	toF := func(s string) float64 {
		v := 0.0
		fmt.Sscanf(strings.TrimSpace(s), "%f", &v)
		return v
	}
	return &CryptoQuote{
		Pair:      q.CurrencyPair,
		Price:     toF(q.Last),
		ChangePct: toF(q.ChangePercentage),
		High24h:   toF(q.High24h),
		Low24h:    toF(q.Low24h),
	}, nil
}

// FXQuote 汇率(新浪财经, 国内可达)
type FXQuote struct {
	Code  string  // 如 susdcny
	Value float64 // 汇率值
}

// FetchFX 抓取新浪汇率
// 格式: susdcny(美元/人民币) / eurusd / gbpusd / jpycny 等
func (c *Client) FetchFX(code string) (*FXQuote, error) {
	code = strings.ToLower(strings.TrimSpace(code))
	if !strings.HasPrefix(code, "fx_") {
		code = "fx_" + code
	}
	api := "https://hq.sinajs.cn/list=" + code
	req, err := http.NewRequest(http.MethodGet, api, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", c.UA)
	req.Header.Set("Referer", "https://finance.sina.com.cn")
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(io.LimitReader(resp.Body, 1<<16))
	if err != nil {
		return nil, err
	}
	body := decodeText(b, resp.Header.Get("Content-Type"))
	// var hq_str_fx_susdcny="时间,现价,开盘,最高,最低,..."
	m := regexp.MustCompile(`"([^"]*)"`).FindStringSubmatch(body)
	if len(m) < 2 {
		return nil, fmt.Errorf("汇率解析失败: %s", code)
	}
	fields := strings.Split(m[1], ",")
	if len(fields) < 2 || fields[0] == "" {
		return nil, fmt.Errorf("汇率无数据: %s", code)
	}
	val := 0.0
	fmt.Sscanf(strings.TrimSpace(fields[1]), "%f", &val)
	if val == 0 {
		return nil, fmt.Errorf("汇率值无效: %s", code)
	}
	return &FXQuote{Code: code, Value: val}, nil
}

// CleanURL 把商品链接里常见的跟踪参数去掉, 保留 canonical 链接
func CleanURL(raw string) string {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return strings.TrimSpace(raw)
	}
	// 保留原 query 中最可能指向商品的关键参数
	q := u.Query()
	keep := []string{"id", "itemId", "skuId", "goodsId", "spuId", "auctionId"}
	clean := url.Values{}
	for _, k := range keep {
		if v := q.Get(k); v != "" {
			clean.Set(k, v)
		}
	}
	u.RawQuery = clean.Encode()
	u.Fragment = ""
	return u.String()
}
