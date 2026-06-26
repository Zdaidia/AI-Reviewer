/**
 * Loopback HTTP Server Worker
 *
 * 在独立子进程中运行 HTTP server，接收 Google OAuth2 redirect 回调。
 * 避免在 Electron 主进程创建 HTTP server 导致 Chromium network service 崩溃。
 *
 * 通信协议（通过 IPC message）：
 * - { type: 'ready', port: number }  → 服务器已就绪
 * - { type: 'code', code: string }   → 收到 auth code
 * - { type: 'auth_error', error: string } → 认证错误
 * - { type: 'error', error: string } → 服务器启动错误
 */

const http = require('http');

// 认证成功页面 HTML：仅提示成功 + 尝试自动关闭浏览器标签
// 不使用 dqi:// 协议重定向（会触发"是否打开应用"弹窗，体验差）
// 应用窗口由主进程在收到 code 后主动聚焦
const SUCCESS_HTML = `<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; text-align: center; padding: 60px 20px; background: #f0f9ff; }
  .card { background: white; border-radius: 12px; padding: 40px; max-width: 400px; margin: auto; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
  h2 { color: #16a34a; margin-bottom: 8px; }
  p { color: #6b7280; }
</style>
<script>
  // 尝试自动关闭浏览器标签（仅对 JS 打开的窗口有效）
  setTimeout(function() { window.close(); }, 1500);
</script>
</head>
<body>
<div class="card">
  <h2>✅ 认证成功</h2>
  <p>已返回 Dev Quality Inspector，可关闭此页面</p>
</div>
</body>
</html>`;

// 认证失败页面 HTML
const FAIL_HTML = `<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; text-align: center; padding: 60px 20px; background: #fef2f2; }
  .card { background: white; border-radius: 12px; padding: 40px; max-width: 400px; margin: auto; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
  h2 { color: #dc2626; margin-bottom: 8px; }
  p { color: #6b7280; }
</style>
<script>
  setTimeout(function() { window.close(); }, 3000);
</script>
</head>
<body>
<div class="card">
  <h2>❌ 认证失败</h2>
  <p id="error-msg">请关闭此页面，在应用中重试</p>
</div>
</body>
</html>`;

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${server.address().port}`);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');

    if (code) {
      // 认证成功：返回成功页面 + 将 code 传给主进程
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(SUCCESS_HTML);
      process.send({ type: 'code', code });
      setTimeout(() => { server.close(); process.exit(0); }, 2000);
    } else if (error) {
      // Google 返回错误（如 access_denied）
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(FAIL_HTML.replace('id="error-msg">', `id="error-msg">错误: ${error}`));
      process.send({ type: 'auth_error', error });
      setTimeout(() => { server.close(); process.exit(0); }, 2000);
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  } catch (e) {
    res.writeHead(500);
    res.end('Internal error');
  }
});

// 在随机端口监听
server.listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  process.send({ type: 'ready', port });
});

server.on('error', (e) => {
  process.send({ type: 'error', error: e.message });
  process.exit(1);
});

// 父进程退出时子进程也退出
process.on('disconnect', () => {
  server.close();
  process.exit(0);
});
