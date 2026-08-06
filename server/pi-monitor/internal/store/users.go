package store

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// User 用户
type User struct {
	ID           int64     `json:"id"`
	Username     string    `json:"username"`
	PasswordHash string    `json:"-"`
	Nickname     string    `json:"nickname"`
	CreatedAt    time.Time `json:"created_at"`
}

var (
	ErrUserExists   = errors.New("用户名已存在")
	ErrUserNotFound = errors.New("用户不存在")
	ErrBadPassword  = errors.New("用户名或密码错误")
	ErrBadToken     = errors.New("登录已过期, 请重新登录")
)

// CreateUser 注册用户(密码自动 bcrypt 哈希)
func (s *Store) CreateUser(username, password, nickname string) (*User, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}
	now := time.Now()
	var id int64
	err = s.db.QueryRow(`SELECT id FROM users WHERE username=?`, username).Scan(&id)
	if err == nil {
		return nil, ErrUserExists
	}
	res, err := s.db.Exec(`INSERT INTO users(username,password_hash,nickname,created_at) VALUES(?,?,?,?)`,
		username, string(hash), nickname, now.Format(tsFmt))
	if err != nil {
		// 唯一约束兜底
		if isUniqueViolation(err) {
			return nil, ErrUserExists
		}
		return nil, err
	}
	uid, _ := res.LastInsertId()
	return &User{ID: uid, Username: username, Nickname: nickname, CreatedAt: now}, nil
}

// GetUserByUsername 按用户名查用户
func (s *Store) GetUserByUsername(username string) (*User, error) {
	row := s.db.QueryRow(`SELECT id,username,password_hash,nickname,created_at FROM users WHERE username=?`, username)
	var u User
	var ca sql.NullString
	if err := row.Scan(&u.ID, &u.Username, &u.PasswordHash, &u.Nickname, &ca); err != nil {
		if err == sql.ErrNoRows {
			return nil, ErrUserNotFound
		}
		return nil, err
	}
	u.CreatedAt = parseTime(ca)
	return &u, nil
}

// VerifyPassword 校验密码
func (s *Store) VerifyPassword(user *User, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)) == nil
}

// CreateToken 生成登录 token(随机 32 字节 hex, 默认 30 天)
func (s *Store) CreateToken(userID int64, days int) (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	token := hex.EncodeToString(b)
	now := time.Now()
	exp := now.AddDate(0, 0, days)
	if _, err := s.db.Exec(`INSERT INTO tokens(user_id,token,expires_at,created_at) VALUES(?,?,?,?)`,
		userID, token, exp.Format(tsFmt), now.Format(tsFmt)); err != nil {
		return "", err
	}
	return token, nil
}

// GetUserByToken 按 token 查用户(校验未过期)
func (s *Store) GetUserByToken(token string) (*User, error) {
	row := s.db.QueryRow(`SELECT u.id,u.username,u.password_hash,u.nickname,u.created_at,t.expires_at
		FROM tokens t JOIN users u ON u.id=t.user_id WHERE t.token=? ORDER BY t.id DESC LIMIT 1`, token)
	var u User
	var ca, ea sql.NullString
	if err := row.Scan(&u.ID, &u.Username, &u.PasswordHash, &u.Nickname, &ca, &ea); err != nil {
		return nil, ErrBadToken
	}
	u.CreatedAt = parseTime(ca)
	exp := parseTime(ea)
	if !exp.IsZero() && time.Now().After(exp) {
		return nil, ErrBadToken
	}
	return &u, nil
}

// LogoutToken 注销 token
func (s *Store) LogoutToken(token string) error {
	_, err := s.db.Exec(`DELETE FROM tokens WHERE token=?`, token)
	return err
}

func isUniqueViolation(err error) bool {
	return err != nil && (contains(err.Error(), "UNIQUE") || contains(err.Error(), "unique"))
}

func contains(s, sub string) bool {
	return len(sub) == 0 || (len(s) >= len(sub) && indexOf(s, sub) >= 0)
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}

// EnsureDemoUser 若没有用户则创建一个演示账号(便于快速体验)
func (s *Store) EnsureDemoUser() error {
	var cnt int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&cnt); err != nil {
		return err
	}
	if cnt > 0 {
		return nil
	}
	_, err := s.CreateUser("admin", "admin123", "管理员")
	if err != nil {
		return fmt.Errorf("创建演示账号失败: %w", err)
	}
	return nil
}
