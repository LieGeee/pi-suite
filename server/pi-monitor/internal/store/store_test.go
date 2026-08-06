package store

import (
	"path/filepath"
	"testing"
	"time"

	"pi-monitor/internal/model"
)

func TestItemCRUD(t *testing.T) {
	dir := t.TempDir()
	st, err := Open(filepath.Join(dir, "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()

	it := &model.Item{Type: model.TypeStock, Name: "茅台", Target: "sh600519", Enabled: true}
	if err := st.CreateItem(it); err != nil {
		t.Fatal(err)
	}
	if it.ID <= 0 {
		t.Fatal("no id")
	}
	got, err := st.GetItem(it.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Name != "茅台" || got.Target != "sh600519" {
		t.Fatalf("bad item: %+v", got)
	}
	got.Enabled = false
	if err := st.UpdateItem(got); err != nil {
		t.Fatal(err)
	}
	got2, _ := st.GetItem(it.ID)
	if got2.Enabled {
		t.Fatal("update failed")
	}
	if err := st.DeleteItem(it.ID); err != nil {
		t.Fatal(err)
	}
	all, _ := st.ListItems()
	if len(all) != 0 {
		t.Fatal("delete failed")
	}
}

func TestSettingsRoundTrip(t *testing.T) {
	dir := t.TempDir()
	st, _ := Open(filepath.Join(dir, "t.db"))
	defer st.Close()

	in := model.Settings{IntervalMin: 30, WebhookURL: "https://x", ServerChanKey: "sk", NotifyEnabled: true}
	if err := st.SaveSettings(in); err != nil {
		t.Fatal(err)
	}
	out, err := st.GetSettings()
	if err != nil {
		t.Fatal(err)
	}
	if out.IntervalMin != 30 || out.WebhookURL != "https://x" || !out.NotifyEnabled || out.ServerChanKey != "sk" {
		t.Fatalf("roundtrip mismatch: %+v", out)
	}
}

func TestNewsDedup(t *testing.T) {
	dir := t.TempDir()
	st, _ := Open(filepath.Join(dir, "t.db"))
	defer st.Close()

	n := &model.NewsItem{Source: "测试", Title: "标题", URL: "https://a/1", Published: time.Now()}
	ok1, _ := st.UpsertNews(n)
	ok2, _ := st.UpsertNews(n)
	if !ok1 || ok2 {
		t.Fatalf("dedup failed: %v %v", ok1, ok2)
	}
	all, _ := st.ListNews(10)
	if len(all) != 1 {
		t.Fatalf("want 1, got %d", len(all))
	}
}

func TestPricePoints(t *testing.T) {
	dir := t.TempDir()
	st, _ := Open(filepath.Join(dir, "t.db"))
	defer st.Close()

	for i := 0; i < 5; i++ {
		_ = st.AddPricePoint(&model.PricePoint{ItemID: 1, Value: float64(i), Status: "ok"})
	}
	pts, err := st.ListPricePoints(1, 3)
	if err != nil {
		t.Fatal(err)
	}
	if len(pts) != 3 {
		t.Fatalf("want 3, got %d", len(pts))
	}
}

func TestRecentAlertCooldown(t *testing.T) {
	dir := t.TempDir()
	st, _ := Open(dir + "/t.db")
	defer st.Close()

	// 无记录
	lt, err := st.RecentAlert(1, "threshold")
	if err != nil || !lt.IsZero() {
		t.Fatalf("no-record: %v %v", err, lt)
	}
	// 加一条
	_ = st.AddAlert(&model.Alert{ItemID: 1, ItemName: "x", Type: "threshold", Message: "m"})
	lt2, _ := st.RecentAlert(1, "threshold")
	if lt2.IsZero() {
		t.Fatal("should have recent alert")
	}
	// 其他 item 无
	lt3, _ := st.RecentAlert(2, "threshold")
	if !lt3.IsZero() {
		t.Fatal("item2 should have none")
	}
}

func TestCleanupOld(t *testing.T) {
	dir := t.TempDir()
	st, _ := Open(dir + "/t.db")
	defer st.Close()
	it := &model.Item{Type: model.TypeStock, Name: "x", Target: "sh600519", Enabled: true}
	_ = st.CreateItem(it)
	_ = st.AddPricePoint(&model.PricePoint{ItemID: it.ID, Value: 1, Status: "ok"})
	_ = st.AddPricePoint(&model.PricePoint{ItemID: it.ID, Value: 2, Status: "ok"})
	// 手工把一条改成 40 天前
	old := time.Now().AddDate(0, 0, -40).Format(tsFmt)
	st.db.Exec(`UPDATE price_points SET created_at=? WHERE value=1`, old)
	res, err := st.CleanupOld(30)
	if err != nil {
		t.Fatal(err)
	}
	if res["price_points"] != 1 {
		t.Fatalf("want 1 cleaned, got %v", res)
	}
	pts, _ := st.ListPricePoints(it.ID, 10)
	if len(pts) != 1 {
		t.Fatalf("want 1 remaining, got %d", len(pts))
	}
}
