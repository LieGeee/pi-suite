// AgentsView 网关: 复用 pi-monitor 账号登录, 验证通过后代理到 AgentsView。
// 架构: 手机/电脑 -> 网关(校验 pi-monitor token) -> AgentsView(localhost:8765)
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"time"
)

const (
	// 默认 pi-monitor 地址(服务器, 验证 token 用)
	defaultMonitorURL = "http://47.121.197.240:18080"
	// 默认 AgentsView 后端(本机)
	defaultAgentsURL = "http://127.0.0.1:8765"
	// 网关监听端口
	gatewayAddr = ":8766"
)

var (
	monitorBase = getenv("AGW_MONITOR_URL", defaultMonitorURL)
	agentsBase  = getenv("AGW_AGENTS_URL", defaultAgentsURL)
	agentsToken = getenv("AGW_AGENTS_TOKEN", defaultAgentsToken()) // AgentsView 自身 auth token
)

func getenv(k, def string) string {
	if v := osGetenv(k); v != "" {
		return v
	}
	return def
}

func main() {
	// 代理 AgentsView (含静态资源与 API), 注入 AgentsView 的 auth token
	agentsURL, _ := url.Parse(agentsBase)
	proxy := httputil.NewSingleHostReverseProxy(agentsURL)
	proxy.Director = func(req *http.Request) {
		req.URL.Scheme = agentsURL.Scheme
		req.URL.Host = agentsURL.Host
		req.Host = agentsURL.Host
		if agentsToken != "" {
			req.Header.Set("Authorization", "Bearer "+agentsToken)
		}
	}

	// 登录页
	http.HandleFunc("/login", loginHandler)
	http.HandleFunc("/logout", logoutHandler)
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" || r.URL.Path == "" || strings.HasPrefix(r.URL.Path, "/assets/") {
			// 静态页与资源: 校验 token
			if !verifyRequest(r) {
				http.Redirect(w, r, "/login", http.StatusFound)
				return
			}
			proxy.ServeHTTP(w, r)
			return
		}
		// API 请求: 校验 token
		if strings.HasPrefix(r.URL.Path, "/api/") {
			if !verifyRequest(r) {
				writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "未登录"})
				return
			}
			proxy.ServeHTTP(w, r)
			return
		}
		proxy.ServeHTTP(w, r)
	})

	log.Printf("AgentsView 网关 %s -> %s (pi-monitor 验证 %s)", gatewayAddr, agentsBase, monitorBase)
	log.Fatal(http.ListenAndServe(gatewayAddr, nil))
}

// verifyRequest 校验 Bearer token 是否有效(调 pi-monitor /auth/me)
func verifyRequest(r *http.Request) bool {
	auth := r.Header.Get("Authorization")
	if !strings.HasPrefix(auth, "Bearer ") {
		// 从 cookie 取
		if c, err := r.Cookie("agw_token"); err == nil {
			auth = "Bearer " + c.Value
		} else {
			return false
		}
	}
	return verifyToken(strings.TrimPrefix(auth, "Bearer "))
}

func verifyToken(token string) bool {
	req, _ := http.NewRequest(http.MethodGet, monitorBase+"/api/v1/auth/me", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("verify: 无法连接 pi-monitor: %v", err)
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}

// loginHandler 登录页(调 pi-monitor 登录接口)
func loginHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		var body struct {
			Username string `json:"username"`
			Password string `json:"password"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		// 调 pi-monitor 登录
		payload, _ := json.Marshal(body)
		req, _ := http.NewRequest(http.MethodPost, monitorBase+"/api/v1/auth/login", bytes.NewReader(payload))
		req.Header.Set("Content-Type", "application/json")
		client := &http.Client{Timeout: 10 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			writeJSON(w, 502, map[string]string{"error": "无法连接监控服务"})
			return
		}
		defer resp.Body.Close()
		rb, _ := io.ReadAll(resp.Body)
		if resp.StatusCode != http.StatusOK {
			writeJSON(w, resp.StatusCode, map[string]string{"error": "用户名或密码错误"})
			return
		}
		var loginResp struct {
			Token string `json:"token"`
			User  struct {
				Username string `json:"username"`
				Nickname string `json:"nickname"`
			} `json:"user"`
		}
		_ = json.Unmarshal(rb, &loginResp)
		// 设置 cookie
		http.SetCookie(w, &http.Cookie{
			Name:     "agw_token",
			Value:    loginResp.Token,
			Path:     "/",
			HttpOnly: true,
			MaxAge:   60 * 60 * 24 * 30,
		})
		writeJSON(w, 200, map[string]any{"ok": true, "token": loginResp.Token, "user": loginResp.User})
		return
	}
	// GET: 返回登录页
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	fmt.Fprint(w, loginPage)
}

func logoutHandler(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{Name: "agw_token", Value: "", Path: "/", MaxAge: -1})
	http.Redirect(w, r, "/login", http.StatusFound)
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}
