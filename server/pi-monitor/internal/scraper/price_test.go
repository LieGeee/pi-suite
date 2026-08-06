package scraper

import "testing"

func TestExtractJSONPrice(t *testing.T) {
	body := `{"data":{"result":{"price":1299.50,"title":"机械键盘"},"code":0}}`
	res := &ProductPrice{}
	ok := extractFromJSON(body, res)
	if !ok || res.Price != 1299.5 {
		t.Fatalf("json price extraction failed: ok=%v price=%v", ok, res.Price)
	}
	if res.Title != "机械键盘" {
		t.Fatalf("json title extraction failed: %q", res.Title)
	}
}

func TestExtractJSONLDPage(t *testing.T) {
	body := `<html><script type="application/ld+json">{"@type":"Product","name":"小米手机","offers":{"@type":"Offer","price":1999,"priceCurrency":"CNY"}}</script></html>`
	if p := extractJSONLDPrice(body); p != 1999 {
		t.Fatalf("jsonld price: got %v", p)
	}
	if t2 := extractJSONLDTitle(body); t2 != "小米手机" {
		t.Fatalf("jsonld title: got %q", t2)
	}
}

func TestCleanURL(t *testing.T) {
	in := "https://item.taobao.com/item.htm?id=123456&spm=abc.def.ghi&scm=1007.123&utparam=xyz#hash"
	out := CleanURL(in)
	if out != "https://item.taobao.com/item.htm?id=123456" {
		t.Fatalf("clean url: got %q", out)
	}
}
