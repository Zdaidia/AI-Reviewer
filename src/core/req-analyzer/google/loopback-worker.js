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

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${server.address().port}`);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');

    if (code) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<html><body><h2>认证成功！</h2><p>可以关闭此页面回到 Dev Quality Inspector。</p></body></html>');
      process.send({ type: 'code', code });
      // 收到 code 后延迟关闭服务器
      setTimeout(() => {
        server.close();
        process.exit(0);
      }, 500);
    } else if (error) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<html><body><h2>认证失败</h2><p>错误: ${error}</p></body></html>`);
      process.send({ type: 'auth_error', error });
      setTimeout(() => {
        server.close();
        process.exit(0);
      }, 500);
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