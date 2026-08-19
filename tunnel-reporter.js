#!/usr/bin/env node
// tunnel-reporter.js
// Uses cloudflared quick tunnels — no account, no confirmation page, stable.

const { execSync, spawn } = require('child_process');
const https = require('https');

const PANEL_PORT  = parseInt(process.env.PANEL_PORT || '4590', 10);
const GIST_ID     = process.env.GIST_ID || '';
const GIST_TOKEN  = process.env.GIST_TOKEN || '';
const REPORT_INTERVAL_MS = 5 * 60 * 1000;

if (!GIST_ID || !GIST_TOKEN) {
  console.error('[TUNNEL] GIST_ID and GIST_TOKEN must be set. Exiting.');
  process.exit(1);
}

// Install cloudflared if not present
try {
  execSync('cloudflared --version', { stdio: 'ignore' });
  console.log('[TUNNEL] cloudflared already installed.');
} catch {
  console.log('[TUNNEL] Installing cloudflared...');
  execSync(
    'curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared',
    { stdio: 'inherit' }
  );
}

function writeGist(url, status = 'online') {
  const body = JSON.stringify({
    files: {
      'shikigami-tunnel.json': {
        content: JSON.stringify({ url, status, port: PANEL_PORT, updated: new Date().toISOString() }, null, 2),
      },
    },
  });

  const opts = {
    hostname: 'api.github.com',
    path: `/gists/${GIST_ID}`,
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `token ${GIST_TOKEN}`,
      'User-Agent': 'shikigami-cloud',
      'Content-Length': Buffer.byteLength(body),
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`[TUNNEL] Gist updated — url: ${url}, status: ${status}`);
          resolve();
        } else {
          reject(new Error(`Gist update failed: ${res.statusCode} ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function startTunnel() {
  return new Promise((resolve, reject) => {
    console.log(`[TUNNEL] Starting cloudflared tunnel on port ${PANEL_PORT}...`);
    const cf = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${PANEL_PORT}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let resolved = false;
    let currentUrl = null;

    const onData = async (chunk) => {
      const text = chunk.toString();
      process.stdout.write('[TUNNEL] ' + text);
      // cloudflared prints the URL to stderr like:
      // INF +--------------------------------------------------------------------------------------------+
      // INF |  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |
      // INF |  https://xxxx.trycloudflare.com                                                            |
      const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (match && !resolved) {
        currentUrl = match[0].trim();
        resolved = true;
        resolve({ cf, getUrl: () => currentUrl });
        try {
          await writeGist(currentUrl, 'online');
        } catch (e) {
          console.error('[TUNNEL] Initial gist write failed:', e.message);
        }
      }
    };

    cf.stdout.on('data', onData);
    cf.stderr.on('data', onData); // cloudflared logs to stderr

    cf.on('exit', (code) => {
      if (!resolved) reject(new Error(`cloudflared exited early with code ${code}`));
      else console.log(`[TUNNEL] cloudflared exited with code ${code}`);
    });

    setTimeout(() => {
      if (!resolved) reject(new Error('cloudflared timed out — no URL after 40s'));
    }, 40000);
  });
}

async function main() {
  const { cf, getUrl } = await startTunnel();

  const interval = setInterval(async () => {
    try { await writeGist(getUrl(), 'online'); }
    catch (e) { console.error('[TUNNEL] Periodic gist update failed:', e.message); }
  }, REPORT_INTERVAL_MS);

  const shutdown = async (signal) => {
    clearInterval(interval);
    console.log(`[TUNNEL] ${signal} — marking gist offline`);
    try { await writeGist(getUrl(), 'offline'); } catch {}
    cf.kill();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  await new Promise(() => {});
}

main().catch(err => {
  console.error('[TUNNEL] Fatal:', err.message);
  process.exit(1);
});