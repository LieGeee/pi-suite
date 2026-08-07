package main

import (
	"os"
	"strings"
)

// osGetenv 环境变量读取
func osGetenv(k string) string { return os.Getenv(k) }

// defaultAgentsToken 从 AgentsView config 读取 auth token
func defaultAgentsToken() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	data, err := os.ReadFile(home + "/.agentsview/config.toml")
	if err != nil {
		return ""
	}
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "auth_token") && strings.Contains(line, "=") {
			v := strings.Trim(strings.SplitN(line, "=", 2)[1], " \"")
			return v
		}
	}
	return ""
}

// loginPage 登录页面(移动端友好)
const loginPage = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<title>pi 会话中心登录</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; background:#f5f6f8; min-height:100vh; display:flex; align-items:center; justify-content:center; }
.card { background:#fff; border-radius:16px; padding:32px 28px; width:min(92vw,380px); box-shadow:0 8px 30px rgba(0,0,0,.08); }
.logo { text-align:center; font-size:44px; margin-bottom:8px; }
h1 { text-align:center; font-size:20px; color:#17191c; margin-bottom:4px; }
.sub { text-align:center; font-size:13px; color:#8a9099; margin-bottom:24px; }
label { display:block; font-size:13px; color:#555; margin-bottom:6px; }
input { width:100%; padding:12px 14px; border:1px solid #e2e4e8; border-radius:10px; font-size:15px; margin-bottom:16px; outline:none; background:#fafbfc; }
input:focus { border-color:#17191c; background:#fff; }
button { width:100%; padding:13px; background:#17191c; color:#fff; border:none; border-radius:12px; font-size:15px; font-weight:600; cursor:pointer; }
button:disabled { opacity:.5; }
.error { color:#e5484d; font-size:13px; margin-bottom:12px; text-align:center; display:none; }
.hint { text-align:center; font-size:12px; color:#8a9099; margin-top:16px; }
</style>
</head>
<body>
<div class="card">
  <div class="logo">📊</div>
  <h1>pi 会话中心</h1>
  <div class="sub">使用 pi 监控账号登录, 查看历史会话</div>
  <div class="error" id="err"></div>
  <form id="f">
    <label>用户名</label>
    <input id="u" type="text" autocomplete="username" placeholder="用户名" required>
    <label>密码</label>
    <input id="p" type="password" autocomplete="current-password" placeholder="密码" required>
    <button id="btn" type="submit">登录</button>
  </form>
  <div class="hint">未注册? 可在 pi 监控 App 内注册, 或联系管理员</div>
</div>
<script>
const $ = id => document.getElementById(id);
$('f').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('btn'); btn.disabled = true; btn.textContent = '登录中…';
  $('err').style.display = 'none';
  try {
    const r = await fetch('/login', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({username:$('u').value.trim(), password:$('p').value})
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || '登录失败');
    location.href = '/';
  } catch (err) {
    $('err').textContent = err.message;
    $('err').style.display = 'block';
  } finally {
    btn.disabled = false; btn.textContent = '登录';
  }
});
</script>
</body>
</html>`
