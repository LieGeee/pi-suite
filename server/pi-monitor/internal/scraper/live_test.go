package scraper

import (
	"fmt"
	"testing"
)

func TestFetchStockMultiMarket(t *testing.T) {
	c := New()
	for _, code := range []string{"sh600519", "hk00700", "usAAPL", "sh000001", "sz399006"} {
		sr, err := c.FetchStock(code)
		if err != nil {
			t.Fatalf("%s: %v", code, err)
		}
		fmt.Printf("LIVE %s: %s price=%.2f pct=%.2f%%\n", code, sr.Name, sr.Price, sr.ChangePct)
		if sr.Price <= 0 {
			t.Fatalf("%s price <= 0", code)
		}
	}
}

func TestFetchCryptoLive(t *testing.T) {
	c := New()
	for _, pair := range []string{"BTC_USDT", "ETH_USDT"} {
		q, err := c.FetchCrypto(pair)
		if err != nil {
			t.Fatalf("%s: %v", pair, err)
		}
		fmt.Printf("LIVE crypto %s: price=%.2f chg=%.2f%%\n", q.Pair, q.Price, q.ChangePct)
		if q.Price <= 0 {
			t.Fatalf("%s price <= 0", pair)
		}
	}
}

func TestFetchFXLive(t *testing.T) {
	c := New()
	q, err := c.FetchFX("susdcny")
	if err != nil {
		t.Fatalf("fx: %v", err)
	}
	fmt.Printf("LIVE fx %s: %.4f\n", q.Code, q.Value)
	if q.Value <= 0 {
		t.Fatal("fx value <= 0")
	}
}
