#!/usr/bin/env node
// tunnel-reporter.js
// Starts a localtunnel pointed at the panel port, then writes the live URL
// to a GitHub Gist so Site B (panel-proxy) can read it. Re-reports every
// 5 minutes so the URL is kept fresh in case the tunnel reconnects.
//
// Required env vars (all injected by the GitHub Actions workflow):
//   PANEL_PORT   — port the shikigami panel listens on (default 4590)
//   GIST_ID      — the GitHub Gist ID to update (create one manually, blank file)
//   GIST_TOKEN   — PAT with gist write scope

const { execSync, spawn } = require('child_process');
const https = require('https');

const PANEL_PORT = parseInt(process.env.PANEL_PORT || '4590', 10);
const GIST_ID = process.env.GIST_ID || '';
const GIST_TOKEN = process.env.GIST_TOKEN || '';
const REPORT_INTERVAL_MS = 5 * 60 * 1000; // re-write gist every 5 min

if (!GIST_ID || !GIST_TOKEN) {
  console.error('[TUNNEL] GIST_ID and GIST_TOKEN must be set. Exiting.');
  process.exit(1);
}

// Install localtunnel if not present (Actions runner won't have it)
try {
  execSync('lt --version', { stdio: 'ignore' });
} catch {
  console.log('[TUNNEL] Installing localtunnel...');
  execSync('npm install -g localtunnel', { stdio: 'inherit' });
}

function writeGist(url, status = 'online') {
  const body = JSON.stringify({
    files: {
      'shikigami-tunnel.json': {
        content: JSON.stringify({
          url,
          status,
          port: PANEL_PORT,
          updated: new Date().toISOString(),
        }, null, 2),
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
      res.on('data', (c) => data += c);
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
    console.log(`[TUNNEL] Starting localtunnel on port ${PANEL_PORT}...`);
    const lt = spawn('lt', ['--port', String(PANEL_PORT)], { stdio: ['ignore', 'pipe', 'pipe'] });

    let resolved = false;
    let currentUrl = null;

    lt.stdout.on('data', async (chunk) => {
      const text = chunk.toString();
      // localtunnel prints: "your url is: https://xxxxx.loca.lt"
      const match = text.match(/your url is:\s*(https?:\/\/[^\s]+)/i);
      if (match && !resolved) {
        currentUrl = match[1].trim();
        resolved = true;
        resolve({ lt, getUrl: () => currentUrl });
        try {
          await writeGist(currentUrl, 'online');
        } catch (e) {
          console.error('[TUNNEL] Initial gist write failed:', e.message);
        }
      }
      process.stdout.write('[TUNNEL] ' + text);
    });

    lt.stderr.on('data', (chunk) => {
      process.stderr.write('[TUNNEL] ' + chunk.toString());
    });

    lt.on('exit', (code) => {
      if (!resolved) reject(new Error(`localtunnel exited early with code ${code}`));
      else console.log(`[TUNNEL] localtunnel exited with code ${code}`);
    });

    // Timeout if lt never gives us a URL
    setTimeout(() => {
      if (!resolved) reject(new Error('localtunnel timed out — no URL received after 30s'));
    }, 30000);
  });
}

async function main() {
  const { lt, getUrl } = await startTunnel();

  // Periodically re-write the gist to confirm still alive
  const interval = setInterval(async () => {
    try {
      await writeGist(getUrl(), 'online');
    } catch (e) {
      console.error('[TUNNEL] Periodic gist update failed:', e.message);
    }
  }, REPORT_INTERVAL_MS);

  // On shutdown, mark offline in the gist
  const shutdown = async (signal) => {
    clearInterval(interval);
    console.log(`[TUNNEL] ${signal} received — marking gist offline`);
    try {
      await writeGist(getUrl(), 'offline');
    } catch {}
    lt.kill();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Keep this script alive (the bot process runs concurrently via workflow steps)
  await new Promise(() => {}); // never resolves — workflow timeout kills everything
}

main().catch((err) => {
  console.error('[TUNNEL] Fatal:', err.message);
  process.exit(1);
});
