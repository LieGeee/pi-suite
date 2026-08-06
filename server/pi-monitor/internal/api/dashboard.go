package api

import (
	_ "embed"

	"github.com/gin-gonic/gin"
)

//go:embed dashboard.html
var dashboardHTML []byte

// registerDashboard 注册首页仪表盘
func (s *Server) registerDashboard(r *gin.Engine) {
	r.GET("/", func(c *gin.Context) {
		c.Data(200, "text/html; charset=utf-8", dashboardHTML)
	})
}
