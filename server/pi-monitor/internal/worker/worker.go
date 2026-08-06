// Package worker 定时调度执行器: 周期抓取所有监控项。
package worker

import (
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"pi-monitor/internal/model"
	"pi-monitor/internal/notify"
	"pi-monitor/internal/scraper"
	"pi-monitor/internal/store"
	"pi-monitor/internal/aifilter"
)

// Worker 周期抓取器
type Worker struct {
	Store   *store.Store
	Scraper *scraper.Client
	Notify  *notify.Client
	AI      *aifilter.Client
	mu      sync.Mutex
	running bool
}

// New 创建 Worker
func New(st *store.Store, sc *scraper.Client, nt *notify.Client, ai *aifilter.Client) *Worker {
	return &Worker{Store: st, Scraper: sc, Notify: nt, AI: ai}
}

// RunOnce 执行一轮抓取(供定时器与手动触发共用)
func (w *Worker) RunOnce() {
	w.mu.Lock()
	if w.running {
		w.mu.Unlock()
		log.Println("[worker] 上一轮仍在运行, 跳过")
		return
	}
	w.running = true
	w.mu.Unlock()
	defer func() { w.mu.Lock(); w.running = false; w.mu.Unlock() }()

	items, err := w.Store.ListItems()
	if err != nil {
		log.Printf("[worker] 读取监控项失败: %v", err)
		return
	}
	settings, err := w.Store.GetSettings()
	if err != nil {
		log.Printf("[worker] 读取设置失败: %v", err)
		return
	}

	var wg sync.WaitGroup
	for i := range items {
		it := &items[i]
		if !it.Enabled {
			continue
		}
		wg.Add(1)
		go func(item *model.Item) {
			defer wg.Done()
			w.checkItem(item, settings)
		}(it)
	}
	wg.Wait()
	log.Printf("[worker] 本轮完成, 共处理 %d 项", len(items))
}

func (w *Worker) checkItem(it *model.Item, settings model.Settings) {
	var status, detail string
	var value float64
	var newsHits []scraper.NewsHit

	switch it.Type {
	case model.TypeStock:
		sr, err := w.Scraper.FetchStock(it.Target)
		if err != nil {
			status, detail, value = "fail", "抓取失败: "+err.Error(), -1
		} else {
			status = "ok"
			value = sr.Price
			detail = fmt.Sprintf("%s 现价 %.2f (%.2f%% 涨跌%.2f)", sr.Name, sr.Price, sr.ChangePct, sr.Change)
			w.checkStockAlert(it, sr, settings)
		}
	case model.TypeNews:
		newsHits, value, status, detail = w.collectNews(it)
	case model.TypeProduct:
		extra := it.GetExtra()
		pp, err := w.Scraper.FetchProduct(it.Target, extra.PriceRegex, extra.TitleRegex)
		if err != nil {
			status, detail, value = "fail", "抓取失败: "+err.Error(), -1
		} else if !pp.Found {
			// 未提取到价格: 状态标记为 fail 但保留上次数值, 避免误报降价
			status = "fail"
			value = it.LastValue
			detail = "价格提取失败: " + pp.Note
			if pp.Title != "" {
				detail += " | 标题: " + truncate(pp.Title, 30)
			}
		} else {
			status = "ok"
			value = pp.Price
			detail = pp.Describe()
			w.checkProductAlert(it, pp, settings)
		}
	case model.TypeCrypto:
		cq, err := w.Scraper.FetchCrypto(it.Target)
		if err != nil {
			status, detail, value = "fail", "抓取失败: "+err.Error(), -1
		} else {
			status = "ok"
			value = cq.Price
			detail = fmt.Sprintf("%s 现价 %.4f (24h %.2f%%) 高 %.4f 低 %.4f", cq.Pair, cq.Price, cq.ChangePct, cq.High24h, cq.Low24h)
			w.checkValueAlert(it, cq.Price, cq.Pair, settings, "crypto")
		}
	case model.TypeFX:
		fq, err := w.Scraper.FetchFX(it.Target)
		if err != nil {
			status, detail, value = "fail", "抓取失败: "+err.Error(), -1
		} else {
			status = "ok"
			value = fq.Value
			detail = fmt.Sprintf("%s 汇率 %.4f", fq.Code, fq.Value)
			w.checkValueAlert(it, fq.Value, fq.Code, settings, "fx")
		}
	default:
		status, detail = "fail", "未知类型: "+string(it.Type)
	}

	// 记录结果
	_ = w.Store.SetItemResult(it.ID, status, value, detail)
	_ = w.Store.AddPricePoint(&model.PricePoint{ItemID: it.ID, Value: value, Status: status, Detail: detail})

	// 新闻命中入库 + 告警(经 AI 过滤, 不相关不推送)
	for _, nh := range newsHits {
		inserted, err := w.Store.UpsertNews(&model.NewsItem{
			Source: nh.Source, Title: nh.Title, URL: nh.URL, Content: nh.Content,
			Matched: it.Name, Published: time.Now(),
		})
		if err != nil {
			log.Printf("[worker] 新闻入库失败: %v", err)
			continue
		}
		if inserted {
			// AI 过滤: 不相关的不推送
			if w.AI != nil && w.AI.Enabled() {
				f, aerr := w.AI.Judge(nh.Title, nh.Content)
				if aerr != nil {
					log.Printf("[worker] AI 过滤失败(仍推送): %v", aerr)
				} else if !f.Relevant {
					log.Printf("[worker] AI 过滤: 不推送 [%s] %s (%s)", nh.Source, nh.Title, f.Reason)
					continue
				}
			}
			alert := &model.Alert{ItemID: it.ID, ItemName: it.Name, Type: "news_hit",
				Message: fmt.Sprintf("[%s] %s", nh.Source, nh.Title)}
			_ = w.Store.AddAlert(alert)
			w.Notify.Send(settings, alert)
		}
	}
}

// checkStockAlert 股票告警(带 4 小时冷却去重)
func (w *Worker) checkStockAlert(it *model.Item, sr *scraper.StockResult, st model.Settings) {
	extra := it.GetExtra()
	var msg string
	var alertType string
	switch {
	case extra.AlertDownPct != 0 && sr.ChangePct <= -extra.AlertDownPct:
		msg = fmt.Sprintf("%s(%s) 跌 %.2f%% 现价 %.2f", sr.Name, it.Target, sr.ChangePct, sr.Price)
		alertType = "threshold"
	case extra.AlertUpPct != 0 && sr.ChangePct >= extra.AlertUpPct:
		msg = fmt.Sprintf("%s(%s) 涨 %.2f%% 现价 %.2f", sr.Name, it.Target, sr.ChangePct, sr.Price)
		alertType = "threshold"
	case extra.PriceHigh != 0 && sr.Price >= extra.PriceHigh:
		msg = fmt.Sprintf("%s 达到 %.2f (目标价 %.2f)", sr.Name, sr.Price, extra.PriceHigh)
		alertType = "price_high"
	case extra.PriceLow != 0 && sr.Price <= extra.PriceLow:
		msg = fmt.Sprintf("%s 跌至 %.2f (警戒价 %.2f)", sr.Name, sr.Price, extra.PriceLow)
		alertType = "price_low"
	default:
		return
	}
	w.fireAlert(it, alertType, msg, st, time.Hour*4)
}

// checkProductAlert 商品降价/涨价告警(带 6 小时冷却)
func (w *Worker) checkProductAlert(it *model.Item, pp *scraper.ProductPrice, st model.Settings) {
	if !pp.Found {
		return
	}
	extra := it.GetExtra()
	var msg string
	var alertType string
	switch {
	case extra.MinPrice != 0 && pp.Price <= extra.MinPrice:
		msg = fmt.Sprintf("降价提醒: %s 现价 ¥%.2f ≤ 目标价 ¥%.2f", truncate(pp.Title, 30), pp.Price, extra.MinPrice)
		alertType = "price_low"
	case extra.MaxPrice != 0 && pp.Price >= extra.MaxPrice:
		msg = fmt.Sprintf("涨价提醒: %s 现价 ¥%.2f ≥ 警戒价 ¥%.2f", truncate(pp.Title, 30), pp.Price, extra.MaxPrice)
		alertType = "price_high"
	default:
		return
	}
	w.fireAlert(it, alertType, msg, st, time.Hour*6)
}

// checkValueAlert 加密货币/汇率通用阈值告警(低于/高于, 带 4 小时冷却)
func (w *Worker) checkValueAlert(it *model.Item, val float64, label string, st model.Settings, kind string) {
	extra := it.GetExtra()
	var msg string
	var alertType string
	switch {
	case extra.AlertBelow != 0 && val <= extra.AlertBelow:
		msg = fmt.Sprintf("%s %s 跌至 %.4f (警戒值 %.4f)", kind, label, val, extra.AlertBelow)
		alertType = "price_low"
	case extra.AlertAbove != 0 && val >= extra.AlertAbove:
		msg = fmt.Sprintf("%s %s 涨至 %.4f (目标值 %.4f)", kind, label, val, extra.AlertAbove)
		alertType = "price_high"
	default:
		return
	}
	w.fireAlert(it, alertType, msg, st, time.Hour*4)
}

// fireAlert 带冷却的告警: 相同 item+type 在冷却期内不重复推送
func (w *Worker) fireAlert(it *model.Item, alertType, msg string, st model.Settings, cooldown time.Duration) {
	last, err := w.Store.RecentAlert(it.ID, alertType)
	if err == nil && !last.IsZero() && time.Since(last) < cooldown {
		log.Printf("[worker] 告警冷却中, 跳过重复推送: %s %s", it.Name, alertType)
		return
	}
	a := &model.Alert{ItemID: it.ID, ItemName: it.Name, Type: alertType, Message: msg}
	_ = w.Store.AddAlert(a)
	w.Notify.Send(st, a)
}

// collectNews 抓取全部新闻源并匹配关键词
func (w *Worker) collectNews(it *model.Item) (hits []scraper.NewsHit, value float64, status, detail string) {
	keywords := splitKeywords(it.Target)
	sources := scraper.NewsSources
	extra := it.GetExtra()
	if extra.Sources != "" {
		want := map[string]bool{}
		for _, s := range splitKeywords(extra.Sources) {
			want[s] = true
		}
		filtered := []struct{ Name, URL string }{}
		for _, s := range sources {
			if want[s.Name] || want[strings.ToLower(s.Name)] {
				filtered = append(filtered, s)
			}
		}
		if len(filtered) > 0 {
			sources = filtered
		}
	}

	status = "ok"
	value = 0
	seen := map[string]bool{}
	success := 0
	for _, src := range sources {
		items, err := w.Scraper.FetchNewsRSS(src.Name, src.URL)
		if err != nil {
			log.Printf("[worker] 新闻源 %s 抓取失败: %v", src.Name, err)
			continue
		}
		success++
		for _, itm := range items {
			if seen[itm.URL] {
				continue
			}
			seen[itm.URL] = true
			matched := matchKeywords(itm.Title+" "+itm.Content, keywords)
			if len(matched) > 0 {
				itm.Content = truncate(itm.Content, 300)
				hits = append(hits, itm)
				value++
			}
		}
	}
	if success == 0 {
		status = "fail"
	}
	detail = fmt.Sprintf("本轮命中 %d 条(源 %d/%d)", len(hits), success, len(sources))
	return
}

func splitKeywords(s string) []string {
	parts := strings.FieldsFunc(s, func(r rune) bool {
		return r == ',' || r == '，' || r == ';' || r == '；' || r == ' ' || r == '\n'
	})
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func matchKeywords(text string, keywords []string) []string {
	var matched []string
	for _, k := range keywords {
		if strings.Contains(text, k) {
			matched = append(matched, k)
		}
	}
	return matched
}

func truncate(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + "…"
}
