package scraper

import (
	"fmt"
	"testing"
)

func TestFetchStockLive(t *testing.T) {
	c := New()
	sr, err := c.FetchStock("sh600519")
	if err != nil {
		t.Fatalf("stock fetch failed: %v", err)
	}
	fmt.Printf("LIVE STOCK: %s price=%.2f pct=%.2f%% high=%.2f low=%.2f\n", sr.Name, sr.Price, sr.ChangePct, sr.High, sr.Low)
	if sr.Price <= 0 {
		t.Fatal("price <= 0")
	}
}
