// desktop/check.mjs — boot the Next standalone server, poll it, then kill it.
import { fork } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 34115;
const standaloneDir = path.join(__dirname, '..', 'frontend', '.next', 'standalone');

const server = fork(path.join(standaloneDir, 'server.js'), {
  cwd: standaloneDir,
  env: {
    ...process.env,
    GATEWAY_URL: 'http://85.192.26.113:8080',
    NEXT_PUBLIC_API_URL: '',
    PORT: String(PORT),
    HOSTNAME: '127.0.0.1',
  },
});

function poll(n) {
  http
    .get(`http://127.0.0.1:${PORT}/`, (res) => {
      res.resume();
      const ok = res.statusCode < 500;
      console.log(ok ? `OK ${res.statusCode}` : `BAD ${res.statusCode}`);
      server.kill();
      process.exit(ok ? 0 : 1);
    })
    .on('error', () => {
      if (n <= 0) {
        console.error('server did not start');
        server.kill();
        process.exit(1);
      }
      setTimeout(() => poll(n - 1), 100);
    });
}
poll(100);
