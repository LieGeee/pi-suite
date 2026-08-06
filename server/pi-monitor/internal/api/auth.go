package api

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"pi-monitor/internal/store"
)

// authMiddleware 校验 Bearer Token, 通过后把 user 放入 context
func authMiddleware(st *store.Store) gin.HandlerFunc {
	return func(c *gin.Context) {
		// 放行登录/注册/健康检查
		if c.Request.URL.Path == "/api/v1/auth/register" ||
			c.Request.URL.Path == "/api/v1/auth/login" ||
			c.Request.URL.Path == "/api/v1/auth/me" && c.Request.Method == http.MethodGet {
			c.Next()
			return
		}
		auth := c.GetHeader("Authorization")
		if !strings.HasPrefix(auth, "Bearer ") {
			c.JSON(401, gin.H{"error": "未登录, 请先登录"})
			c.Abort()
			return
		}
		token := strings.TrimPrefix(auth, "Bearer ")
		user, err := st.GetUserByToken(token)
		if err != nil {
			c.JSON(401, gin.H{"error": err.Error()})
			c.Abort()
			return
		}
		c.Set("user", user)
		c.Set("token", token)
		c.Next()
	}
}

// currentUser 从 context 取用户
func currentUser(c *gin.Context) *store.User {
	v, ok := c.Get("user")
	if !ok {
		return nil
	}
	u, _ := v.(*store.User)
	return u
}
