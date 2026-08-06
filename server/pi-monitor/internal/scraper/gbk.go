package scraper

import (
	"bytes"
	"io"

	"golang.org/x/text/encoding/simplifiedchinese"
	"golang.org/x/text/transform"
)

// gbkDecoder 用 x/text 的 GBK 解码, 失败时返回原始字节
func gbkDecoder(b []byte) (string, error) {
	r := transform.NewReader(bytes.NewReader(b), simplifiedchinese.GBK.NewDecoder())
	out, err := io.ReadAll(r)
	return string(out), err
}
