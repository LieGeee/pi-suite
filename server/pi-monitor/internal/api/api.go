// Package api gin HTTP API + gRPC 服务。
package api

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"pi-monitor/internal/aifilter"
	"pi-monitor/internal/model"
	"pi-monitor/internal/scraper"
	"pi-monitor/internal/store"
	"pi-monitor/internal/worker"
)

// Server HTTP API 处理器
type Server struct {
	Store   *store.Store
	Worker  *worker.Worker
	Scraper *scraper.Client
}

// NewRouter 构造 gin 路由
func NewRouter(st *store.Store, wk *worker.Worker, sc *scraper.Client) *gin.Engine {
	s := &Server{Store: st, Worker: wk, Scraper: sc}
	r := gin.Default()
	r.GET("/healthz", func(c *gin.Context) { c.JSON(200, gin.H{"ok": true}) })
	s.registerDashboard(r)

	// 账号
	auth := &AuthHandler{Store: st}
	r.POST("/api/v1/auth/register", auth.Register)
	r.POST("/api/v1/auth/login", auth.Login)

	// 需要登录的 API
	api := r.Group("/api/v1")
	api.Use(authMiddleware(st))
	{
		api.GET("/auth/me", auth.Me)
		api.POST("/auth/logout", auth.Logout)

		// 监控项 CRUD
		api.GET("/items", s.listItems)
		api.POST("/items", s.createItem)
		api.PUT("/items/:id", s.updateItem)
		api.DELETE("/items/:id", s.deleteItem)

		// 数据
		api.GET("/items/:id/history", s.itemHistory)
		api.GET("/news", s.listNews)
		api.GET("/alerts", s.listAlerts)
		api.GET("/alerts/:id", s.alertDetail)

		// 设置
		api.GET("/settings", s.getSettings)
		api.PUT("/settings", s.saveSettings)

		// 动作
		api.POST("/run", s.triggerRun)
		api.POST("/test", s.testFetch)
	}
	return r
}

func (s *Server) listItems(c *gin.Context) {
	its, err := s.Store.ListItems()
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"items": its})
}

func (s *Server) createItem(c *gin.Context) {
	var it model.Item
	if err := c.ShouldBindJSON(&it); err != nil {
		c.JSON(400, gin.H{"error": "参数错误: " + err.Error()})
		return
	}
	if !it.Type.Valid() {
		c.JSON(400, gin.H{"error": "类型必须为 stock/news/product"})
		return
	}
	if strings.TrimSpace(it.Name) == "" {
		c.JSON(400, gin.H{"error": "名称不能为空"})
		return
	}
	if strings.TrimSpace(it.Target) == "" {
		c.JSON(400, gin.H{"error": "目标不能为空"})
		return
	}
	if it.Type == model.TypeStock {
		// 试抓一次验证代码
		if _, err := s.Scraper.FetchStock(it.Target); err != nil {
			c.JSON(400, gin.H{"error": "股票代码验证失败: " + err.Error()})
			return
		}
	}
	it.Enabled = true
	if err := s.Store.CreateItem(&it); err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"ok": true, "item": it})
}

func (s *Server) updateItem(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(400, gin.H{"error": "id 无效"})
		return
	}
	var it model.Item
	if err := c.ShouldBindJSON(&it); err != nil {
		c.JSON(400, gin.H{"error": "参数错误: " + err.Error()})
		return
	}
	it.ID = id
	if !it.Type.Valid() {
		c.JSON(400, gin.H{"error": "类型无效"})
		return
	}
	if err := s.Store.UpdateItem(&it); err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"ok": true})
}

func (s *Server) deleteItem(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(400, gin.H{"error": "id 无效"})
		return
	}
	if err := s.Store.DeleteItem(id); err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"ok": true})
}

func (s *Server) itemHistory(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(400, gin.H{"error": "id 无效"})
		return
	}
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	if limit <= 0 || limit > 500 {
		limit = 50
	}
	pts, err := s.Store.ListPricePoints(id, limit)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"points": pts})
}

func (s *Server) listNews(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	if limit <= 0 || limit > 500 {
		limit = 50
	}
	ns, err := s.Store.ListNews(limit)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"news": ns})
}

func (s *Server) listAlerts(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	if limit <= 0 || limit > 500 {
		limit = 50
	}
	as, err := s.Store.ListAlerts(limit)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, gin.H{"alerts": as})
}

// alertDetail 单条告警详情(含关联新闻全文)
func (s *Server) alertDetail(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(400, gin.H{"error": "id 无效"})
		return
	}
	a, err := s.Store.GetAlert(id)
	if err != nil {
		c.JSON(404, gin.H{"error": "告警不存在"})
		return
	}
	c.JSON(200, a)
}

func (s *Server) getSettings(c *gin.Context) {
	st, err := s.Store.GetSettings()
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, st)
}

func (s *Server) saveSettings(c *gin.Context) {
	var st model.Settings
	if err := c.ShouldBindJSON(&st); err != nil {
		c.JSON(400, gin.H{"error": "参数错误: " + err.Error()})
		return
	}
	if err := s.Store.SaveSettings(st); err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	// 重建 AI 过滤器(设置变更后生效)
	if s.Worker != nil {
		s.Worker.AI = aifilter.New(st.AIFilterURL, st.AIFilterKey, st.AIFilterModel, st.AIFilterPrompt)
	}
	c.JSON(200, gin.H{"ok": true})
}

func (s *Server) triggerRun(c *gin.Context) {
	go s.Worker.RunOnce()
	c.JSON(200, gin.H{"ok": true, "msg": "已触发一轮抓取"})
}

// testFetch 前端测试抓取(不落库)
func (s *Server) testFetch(c *gin.Context) {
	var req struct {
		Type   string `json:"type"`
		Target string `json:"target"`
		Extra  string `json:"extra"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "参数错误"})
		return
	}
	switch req.Type {
	case string(model.TypeStock):
		sr, err := s.Scraper.FetchStock(req.Target)
		if err != nil {
			c.JSON(200, gin.H{"ok": false, "error": err.Error()})
			return
		}
		c.JSON(200, gin.H{"ok": true, "detail": fmt.Sprintf("%s 现价 %.2f (%.2f%%)", sr.Name, sr.Price, sr.ChangePct)})
	case string(model.TypeProduct):
		var extra model.ItemExtra
		if req.Extra != "" {
			_ = jsonUnmarshal(req.Extra, &extra)
		}
		pp, err := s.Scraper.FetchProduct(req.Target, extra.PriceRegex, extra.TitleRegex)
		if err != nil {
			c.JSON(200, gin.H{"ok": false, "error": err.Error()})
			return
		}
		if !pp.Found {
			c.JSON(200, gin.H{"ok": false, "error": pp.Note, "title": pp.Title})
			return
		}
		c.JSON(200, gin.H{"ok": true, "detail": pp.Describe()})
	case string(model.TypeCrypto):
		cq, err := s.Scraper.FetchCrypto(req.Target)
		if err != nil {
			c.JSON(200, gin.H{"ok": false, "error": err.Error()})
			return
		}
		c.JSON(200, gin.H{"ok": true, "detail": fmt.Sprintf("%s 现价 %.4f (24h %.2f%%)", cq.Pair, cq.Price, cq.ChangePct)})
	case string(model.TypeFX):
		fq, err := s.Scraper.FetchFX(req.Target)
		if err != nil {
			c.JSON(200, gin.H{"ok": false, "error": err.Error()})
			return
		}
		c.JSON(200, gin.H{"ok": true, "detail": fmt.Sprintf("%s 汇率 %.4f", fq.Code, fq.Value)})
	case string(model.TypeNews):
		c.JSON(200, gin.H{"ok": true, "detail": "新闻抓取请通过添加监控项后查看结果"})
	default:
		c.JSON(400, gin.H{"error": "未知类型"})
	}
}

func jsonUnmarshal(s string, v any) error {
	return json.Unmarshal([]byte(s), v)
}

// grpcService 占位: gRPC 服务后续接入
type grpcService struct{}

func (s *Server) grpcInfo() map[string]any {
	return map[string]any{"ok": true, "service": "pi-monitor", "time": time.Now().Format(time.RFC3339)}
}
