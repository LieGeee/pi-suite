// Package store SQLite 存储层(纯 Go, 无 CGO, 便于 Linux 部署)。
package store

import (
	"strings"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"pi-monitor/internal/model"

	_ "modernc.org/sqlite"
)

// Store 数据访问对象
type Store struct {
	db *sql.DB
}

// Open 打开数据库并建表
func Open(dbPath string) (*Store, error) {
	if dir := filepath.Dir(dbPath); dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return nil, fmt.Errorf("mkdir: %w", err)
		}
	}
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}
	db.SetMaxOpenConns(1) // sqlite 单写者
	s := &Store{db: db}
	if err := s.migrate(); err != nil {
		db.Close()
		return nil, err
	}
	return s, nil
}

func (s *Store) migrate() error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS items (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			type TEXT NOT NULL,
			name TEXT NOT NULL,
			target TEXT NOT NULL,
			extra TEXT NOT NULL DEFAULT '',
			enabled INTEGER NOT NULL DEFAULT 1,
			last_status TEXT NOT NULL DEFAULT 'pending',
			last_value REAL NOT NULL DEFAULT 0,
			last_detail TEXT NOT NULL DEFAULT '',
			last_checked DATETIME,
			created_at DATETIME NOT NULL,
			updated_at DATETIME NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS price_points (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			item_id INTEGER NOT NULL,
			value REAL NOT NULL,
			status TEXT NOT NULL,
			detail TEXT NOT NULL DEFAULT '',
			created_at DATETIME NOT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS idx_price_points_item ON price_points(item_id, created_at)`,
		`CREATE TABLE IF NOT EXISTS news_items (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			source TEXT NOT NULL,
			title TEXT NOT NULL,
			url TEXT NOT NULL,
			content TEXT NOT NULL DEFAULT '',
			published DATETIME,
			matched TEXT NOT NULL DEFAULT '',
			created_at DATETIME NOT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS idx_news_url ON news_items(url)`,
		`CREATE TABLE IF NOT EXISTS alerts (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			item_id INTEGER NOT NULL,
			item_name TEXT NOT NULL,
			type TEXT NOT NULL,
			message TEXT NOT NULL,
			created_at DATETIME NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS settings (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			username TEXT NOT NULL UNIQUE,
			password_hash TEXT NOT NULL,
			nickname TEXT NOT NULL DEFAULT '',
			created_at DATETIME NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS tokens (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			token TEXT NOT NULL UNIQUE,
			expires_at DATETIME NOT NULL,
			created_at DATETIME NOT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS idx_tokens_user ON tokens(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_tokens_token ON tokens(token)`,
	}
	for _, q := range stmts {
		if _, err := s.db.Exec(q); err != nil {
			return fmt.Errorf("migrate: %w", err)
		}
	}
	return nil
}

// Close 关闭连接
func (s *Store) Close() error { return s.db.Close() }

// ---------- Items ----------

// ListItems 返回全部监控项
func (s *Store) ListItems() ([]model.Item, error) {
	rows, err := s.db.Query(`SELECT id,type,name,target,extra,enabled,last_status,last_value,last_detail,last_checked,created_at,updated_at FROM items ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []model.Item{}
	for rows.Next() {
		var it model.Item
		var enabled int
		var lc, ca, ua sql.NullString
		if err := rows.Scan(&it.ID, &it.Type, &it.Name, &it.Target, &it.Extra, &enabled, &it.LastStatus, &it.LastValue, &it.LastDetail, &lc, &ca, &ua); err != nil {
			return nil, err
		}
		it.Enabled = enabled == 1
		it.LastChecked = parseTime(lc)
		it.CreatedAt = parseTime(ca)
		it.UpdatedAt = parseTime(ua)
		out = append(out, it)
	}
	return out, rows.Err()
}

// GetItem 单条
func (s *Store) GetItem(id int64) (*model.Item, error) {
	its, err := s.ListItems()
	if err != nil {
		return nil, err
	}
	for i := range its {
		if its[i].ID == id {
			return &its[i], nil
		}
	}
	return nil, errors.New("item not found")
}

// CreateItem 新增
func (s *Store) CreateItem(it *model.Item) error {
	now := time.Now()
	it.CreatedAt, it.UpdatedAt = now, now
	it.LastChecked = now
	res, err := s.db.Exec(`INSERT INTO items(type,name,target,extra,enabled,last_status,last_value,last_detail,last_checked,created_at,updated_at)
		VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
		it.Type, it.Name, it.Target, it.Extra, boolInt(it.Enabled), it.LastStatus, it.LastValue, it.LastDetail, now.Format(tsFmt), now.Format(tsFmt), now.Format(tsFmt))
	if err != nil {
		return err
	}
	it.ID, _ = res.LastInsertId()
	return nil
}

// UpdateItem 更新
func (s *Store) UpdateItem(it *model.Item) error {
	it.UpdatedAt = time.Now()
	_, err := s.db.Exec(`UPDATE items SET type=?,name=?,target=?,extra=?,enabled=?,last_status=?,last_value=?,last_detail=?,last_checked=?,updated_at=? WHERE id=?`,
		it.Type, it.Name, it.Target, it.Extra, boolInt(it.Enabled), it.LastStatus, it.LastValue, it.LastDetail, it.LastChecked.Format(tsFmt), it.UpdatedAt.Format(tsFmt), it.ID)
	return err
}

// DeleteItem 删除
func (s *Store) DeleteItem(id int64) error {
	_, err := s.db.Exec(`DELETE FROM items WHERE id=?`, id)
	return err
}

// SetItemResult 只更新抓取结果(由抓取协程调用)
func (s *Store) SetItemResult(id int64, status string, value float64, detail string) error {
	now := time.Now()
	_, err := s.db.Exec(`UPDATE items SET last_status=?,last_value=?,last_detail=?,last_checked=? WHERE id=?`,
		status, value, detail, now.Format(tsFmt), id)
	return err
}

// ---------- Price Points ----------

// AddPricePoint 记录一次抓取数值
func (s *Store) AddPricePoint(p *model.PricePoint) error {
	_, err := s.db.Exec(`INSERT INTO price_points(item_id,value,status,detail,created_at) VALUES(?,?,?,?,?)`,
		p.ItemID, p.Value, p.Status, p.Detail, time.Now().Format(tsFmt))
	return err
}

// ListPricePoints 最近 N 条
func (s *Store) ListPricePoints(itemID int64, limit int) ([]model.PricePoint, error) {
	rows, err := s.db.Query(`SELECT id,item_id,value,status,detail,created_at FROM price_points WHERE item_id=? ORDER BY id DESC LIMIT ?`, itemID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []model.PricePoint{}
	for rows.Next() {
		var p model.PricePoint
		var ca sql.NullString
		if err := rows.Scan(&p.ID, &p.ItemID, &p.Value, &p.Status, &p.Detail, &ca); err != nil {
			return nil, err
		}
		p.CreatedAt = parseTime(ca)
		out = append(out, p)
	}
	return out, rows.Err()
}

// ---------- News ----------

// UpsertNews 去重插入新闻(url 唯一)
func (s *Store) UpsertNews(n *model.NewsItem) (bool, error) {
	var cnt int
	_ = s.db.QueryRow(`SELECT COUNT(*) FROM news_items WHERE url=?`, n.URL).Scan(&cnt)
	if cnt > 0 {
		return false, nil
	}
	n.CreatedAt = time.Now()
	_, err := s.db.Exec(`INSERT INTO news_items(source,title,url,content,published,matched,created_at) VALUES(?,?,?,?,?,?,?)`,
		n.Source, n.Title, n.URL, n.Content, n.Published.Format(tsFmt), n.Matched, n.CreatedAt.Format(tsFmt))
	return err == nil, err
}

// ListNews 最近新闻
func (s *Store) ListNews(limit int) ([]model.NewsItem, error) {
	rows, err := s.db.Query(`SELECT id,source,title,url,content,published,matched,created_at FROM news_items ORDER BY id DESC LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []model.NewsItem{}
	for rows.Next() {
		var n model.NewsItem
		var pub sql.NullString
		if err := rows.Scan(&n.ID, &n.Source, &n.Title, &n.URL, &n.Content, &pub, &n.Matched, &n.CreatedAt); err != nil {
			return nil, err
		}
		n.Published = parseTime(pub)
		out = append(out, n)
	}
	return out, rows.Err()
}

// ---------- Alerts ----------

// AddAlert 记录告警
func (s *Store) AddAlert(a *model.Alert) error {
	a.CreatedAt = time.Now()
	_, err := s.db.Exec(`INSERT INTO alerts(item_id,item_name,type,message,created_at) VALUES(?,?,?,?,?)`,
		a.ItemID, a.ItemName, a.Type, a.Message, a.CreatedAt.Format(tsFmt))
	return err
}

// CleanupOld 清理超过 N 天的历史数据(价格点/告警/旧新闻)
func (s *Store) CleanupOld(days int) (map[string]int64, error) {
	cutoff := time.Now().AddDate(0, 0, -days).Format(tsFmt)
	res := map[string]int64{}
	for _, t := range []struct {
		table string
		col   string
	}{
		{"price_points", "created_at"},
		{"alerts", "created_at"},
		{"news_items", "created_at"},
	} {
		r, err := s.db.Exec(`DELETE FROM `+t.table+` WHERE `+t.col+` < ?`, cutoff)
		if err != nil {
			return res, fmt.Errorf("cleanup %s: %w", t.table, err)
		}
		n, _ := r.RowsAffected()
		res[t.table] = n
	}
	return res, nil
}

// GetAlert 单条告警
func (s *Store) GetAlert(id int64) (*model.Alert, error) {
	var a model.Alert
	var ca sql.NullString
	err := s.db.QueryRow(`SELECT id,item_id,item_name,type,message,created_at FROM alerts WHERE id=?`, id).Scan(
		&a.ID, &a.ItemID, &a.ItemName, &a.Type, &a.Message, &ca)
	if err != nil {
		return nil, err
	}
	a.CreatedAt = parseTime(ca)
	return &a, nil
}

// ListAlerts 最近告警
func (s *Store) ListAlerts(limit int) ([]model.Alert, error) {
	rows, err := s.db.Query(`SELECT id,item_id,item_name,type,message,created_at FROM alerts ORDER BY id DESC LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []model.Alert{}
	for rows.Next() {
		var a model.Alert
		var ca sql.NullString
		if err := rows.Scan(&a.ID, &a.ItemID, &a.ItemName, &a.Type, &a.Message, &ca); err != nil {
			return nil, err
		}
		a.CreatedAt = parseTime(ca)
		out = append(out, a)
	}
	return out, rows.Err()
}

// RecentAlert 返回该 item+type 最近一条告警时间(用于冷却去重)
func (s *Store) RecentAlert(itemID int64, alertType string) (time.Time, error) {
	var ca sql.NullString
	err := s.db.QueryRow(`SELECT created_at FROM alerts WHERE item_id=? AND type=? ORDER BY id DESC LIMIT 1`, itemID, alertType).Scan(&ca)
	if err == sql.ErrNoRows {
		return time.Time{}, nil
	}
	if err != nil {
		return time.Time{}, err
	}
	return parseTime(ca), nil
}

// ---------- Settings ----------

// GetSettings 读取全局设置
func (s *Store) GetSettings() (model.Settings, error) {
	var st model.Settings
	rows, err := s.db.Query(`SELECT key,value FROM settings`)
	if err != nil {
		return st, err
	}
	defer rows.Close()
	m := map[string]string{}
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			return st, err
		}
		m[k] = v
	}
	if v, ok := m["interval_min"]; ok {
		fmt.Sscanf(v, "%d", &st.IntervalMin)
	} else {
		st.IntervalMin = 15
	}
	st.WebhookURL = m["webhook_url"]
	st.ServerChanKey = m["serverchan_key"]
	st.NotifyEnabled = m["notify_enabled"] == "1"
	st.AIFilterURL = m["ai_filter_url"]
	st.AIFilterKey = m["ai_filter_key"]
	st.AIFilterModel = m["ai_filter_model"]
	st.AIFilterPrompt = m["ai_filter_prompt"]
	return st, nil
}

// SaveSettings 保存全局设置
func (s *Store) SaveSettings(st model.Settings) error {
	if st.IntervalMin <= 0 {
		st.IntervalMin = 15
	}
	pairs := map[string]string{
		"interval_min":     fmt.Sprintf("%d", st.IntervalMin),
		"webhook_url":      st.WebhookURL,
		"serverchan_key":   st.ServerChanKey,
		"notify_enabled":   boolStr(st.NotifyEnabled),
		"ai_filter_url":    st.AIFilterURL,
		"ai_filter_key":    st.AIFilterKey,
		"ai_filter_model":  st.AIFilterModel,
		"ai_filter_prompt": st.AIFilterPrompt,
	}
	for k, v := range pairs {
		if _, err := s.db.Exec(`INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`, k, v); err != nil {
			return err
		}
	}
	return nil
}

const tsFmt = "2006-01-02 15:04:05"

func parseTime(ns sql.NullString) time.Time {
	if !ns.Valid || ns.String == "" {
		return time.Time{}
	}
	s := ns.String
	// modernc sqlite 驱动对 DATETIME 列输出 RFC3339(如 2026-08-05T18:57:42Z)
	if t, err := time.Parse(time.RFC3339Nano, s); err == nil {
		return t
	}
	if t, err := time.Parse(tsFmt, s); err == nil {
		return t
	}
	// 兜底: 去掉时区部分再试
	s = strings.TrimSuffix(s, "Z")
	if t, err := time.Parse(tsFmt, s); err == nil {
		return t
	}
	return time.Time{}
}

func boolInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

func boolStr(b bool) string {
	if b {
		return "1"
	}
	return "0"
}
