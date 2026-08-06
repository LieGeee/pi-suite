package api

import (
	"strings"

	"github.com/gin-gonic/gin"
	"pi-monitor/internal/store"
)

// AuthHandler 账号相关接口
type AuthHandler struct {
	Store *store.Store
}

// Register 注册
func (h *AuthHandler) Register(c *gin.Context) {
	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
		Nickname string `json:"nickname"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "参数错误"})
		return
	}
	req.Username = strings.TrimSpace(req.Username)
	if len(req.Username) < 3 || len(req.Username) > 20 {
		c.JSON(400, gin.H{"error": "用户名需 3-20 个字符"})
		return
	}
	if len(req.Password) < 6 {
		c.JSON(400, gin.H{"error": "密码至少 6 位"})
		return
	}
	user, err := h.Store.CreateUser(req.Username, req.Password, req.Nickname)
	if err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	token, err := h.Store.CreateToken(user.ID, 30)
	if err != nil {
		c.JSON(500, gin.H{"error": "注册失败"})
		return
	}
	c.JSON(200, gin.H{"ok": true, "token": token, "user": user})
}

// Login 登录
func (h *AuthHandler) Login(c *gin.Context) {
	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "参数错误"})
		return
	}
	user, err := h.Store.GetUserByUsername(strings.TrimSpace(req.Username))
	if err != nil || !h.Store.VerifyPassword(user, req.Password) {
		c.JSON(401, gin.H{"error": "用户名或密码错误"})
		return
	}
	token, err := h.Store.CreateToken(user.ID, 30)
	if err != nil {
		c.JSON(500, gin.H{"error": "登录失败"})
		return
	}
	c.JSON(200, gin.H{"ok": true, "token": token, "user": user})
}

// Me 当前用户信息
func (h *AuthHandler) Me(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(401, gin.H{"error": "未登录"})
		return
	}
	c.JSON(200, user)
}

// Logout 注销
func (h *AuthHandler) Logout(c *gin.Context) {
	token, _ := c.Get("token")
	if t, ok := token.(string); ok {
		_ = h.Store.LogoutToken(t)
	}
	c.JSON(200, gin.H{"ok": true})
}
