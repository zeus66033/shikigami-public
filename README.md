# shikigami-cloud

Public scaffolding for running the Shikigami mineflayer bot via GitHub Actions.
The actual bot logic lives in a **separate private repo** — this repo is useless without it.

## Setup (one-time)

### 1. Create the Gist
- Go to https://gist.github.com and create a **public** gist.
- Filename: `shikigami-tunnel.json`, content: `{}`
- Copy the Gist ID from the URL: `gist.github.com/yourname/GIST_ID_HERE`

### 2. Create PATs (Personal Access Tokens)
Go to GitHub → Settings → Developer settings → Fine-grained tokens (or classic tokens):

| Token | Scopes needed | Used for |
|---|---|---|
| `PRIVATE_REPO_TOKEN` | Contents: read (private repo only) | Checkout private bot repo in Actions |
| `GIST_TOKEN` | Gist: write | tunnel-reporter.js writes tunnel URL |
| `ACTIONS_DISPATCH_TOKEN` | Actions: write (this public repo only) | index.html triggers workflow from browser |

### 3. Add secrets to this public repo
Repo → Settings → Secrets and variables → Actions:

| Secret | Value |
|---|---|
| `PRIVATE_REPO_NAME` | `yourname/shikigami-private` |
| `PRIVATE_REPO_TOKEN` | PAT from step 2 |
| `GIST_ID` | Gist ID from step 1 |
| `GIST_TOKEN` | PAT from step 2 |
| `MC_SERVER` | Minecraft server IP |
| `MC_PORT` | Server port (usually 25565) |
| `MC_VERSION` | e.g. `1.21.11` |
| `MC_ADAPTER` | `vanilla` or `forge` |
| `GROQ_API_KEY` | Your Groq API key |
| `COMMANDER_KEY` | Your passphrase from world.txt |
| `COMMANDER_NAME` | Your in-game username |
| `SHIKIGAMI_NAME` | 3-6 letter name for the bot (e.g. `Rally`) |

### 4. Edit index.html and panel.html
Fill in these three values in **both files**:

```js
// index.html
const GITHUB_REPO  = 'yourname/shikigami-cloud';
const GITHUB_TOKEN = 'your_ACTIONS_DISPATCH_TOKEN';
const GIST_ID      = 'your_gist_id';

// panel.html
const GIST_ID = 'your_gist_id'; // same gist
```

### 5. Enable GitHub Pages
Repo → Settings → Pages → Source: Deploy from branch `main`, folder `/` (root).
Your sites will be at:
- `https://yourname.github.io/shikigami-cloud/` (launcher)
- `https://yourname.github.io/shikigami-cloud/panel.html` (remote panel)

### 6. Test a run
- Go to this repo → Actions → "Shikigami Bot" → Run workflow → pick task → Run.
- Watch the logs. After ~15s the tunnel URL appears. Open panel.html to see it live.

## Default password
Both sites: `Swr_4590`

To change it, get the SHA-256 of your new password and replace `PASSWORD_HASH` in both HTML files:
```js
// Run in browser console:
crypto.subtle.digest('SHA-256', new TextEncoder().encode('YourNewPassword'))
  .then(b => console.log([...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')))
```

## Minute budget (private repo = 2,000 free min/month)
| Runtime | Days/month | Minutes used |
|---|---|---|
| 60 min/day | 30 | 1,800 ✓ |
| 90 min/day | 22 | 1,980 ✓ |
| 120 min/day | 16 | 1,920 ✓ |

Stay under 2,000 or switch the repo to public (unlimited minutes, but code visible).
