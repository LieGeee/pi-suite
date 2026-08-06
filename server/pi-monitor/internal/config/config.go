// Package config 加载运行配置。
package config

import (
	"encoding/json"
	"os"
	"strconv"
)

// Config 进程级配置
type Config struct {
	HTTPAddr  string // HTTP 监听地址
	GRPCAddr  string // gRPC 监听地址
	DBPath    string // SQLite 文件路径
	DataDir   string // 数据目录(新闻缓存等)
	IntervalMin int  // 默认抓取间隔(分钟)
}

// Load 从环境变量读取配置(便于 systemd/容器注入)
func Load() Config {
	return Config{
		HTTPAddr:    getenv("PI_MONITOR_HTTP", ":18080"),
		GRPCAddr:    getenv("PI_MONITOR_GRPC", ":18081"),
		DBPath:      getenv("PI_MONITOR_DB", "./data/monitor.db"),
		DataDir:     getenv("PI_MONITOR_DATA", "./data"),
		IntervalMin: getenvInt("PI_MONITOR_INTERVAL", 15),
	}
}

func getenv(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func getenvInt(k string, def int) int {
	if v := os.Getenv(k); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}

// DefaultSettings 默认全局设置
func DefaultSettings() (map[string]any, error) {
	var m map[string]any
	_ = json.Unmarshal([]byte(`{"interval_min":15,"webhook_url":"","serverchan_key":"","notify_enabled":false}`), &m)
	return m, nil
}
