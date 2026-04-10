# TradeFlow — Trading Journal

A full-stack trading journal web app with EdgeFlo-style P&L calendar.

## 🚀 Deploy Online (3 ways)

---

### Option 1: Railway (Easiest — Free)

1. Create free account at https://railway.app
2. Click **"New Project" → "Deploy from GitHub"**
3. Push this folder to GitHub first:
   ```bash
   git init
   git add .
   git commit -m "TradeFlow trading journal"
   git remote add origin https://github.com/YOURUSERNAME/tradeflow.git
   git push -u origin main
   ```
4. In Railway: select your repo → it auto-detects Node.js
5. Set **Root Directory** to `backend`
6. Set **Start Command**: `node server.js`
7. Railway gives you a free URL like `https://tradeflow-abc123.railway.app`

---

### Option 2: Render (Free)

1. Create free account at https://render.com
2. New → **Web Service** → Connect GitHub repo
3. Set:
   - **Root Directory**: `backend`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
4. Free tier URL: `https://tradeflow-xxxx.onrender.com`
   > ⚠️ Free tier sleeps after 15min inactivity (spins back up in ~30s)

---

### Option 3: Run Locally

```bash
cd backend
npm install
node server.js
# Open http://localhost:3001
```

---

## 📁 Project Structure

```
tradeflow/
├── backend/
│   ├── server.js       # Express API server
│   ├── package.json
│   └── data/           # NeDB database files (auto-created)
│       ├── trades.db
│       └── journal.db
└── frontend/
    └── public/
        └── index.html  # Full SPA frontend
```

## ✅ Features

- **Dashboard** — Net P&L, win rate, profit factor, equity curve, recent trades
- **Trade Log** — Full trade history with filters (date, side, result, month)
- **P&L Calendar** — EdgeFlo-style calendar with:
  - Green/red color-coded profit/loss days
  - Daily P&L + trade count per cell
  - Weekly P&L sidebar
  - Monthly summary strip (total P&L, trade days, win/loss days)
  - R-Multiple toggle mode
  - Click any day → drill-down with all trades
- **Analytics** — P&L by instrument, session, day of week; win rate by side
- **Psychology** — Tilt meter, emotion breakdown, AI insight
- **Journal** — Daily reflections with mood and tags

## 🗄️ Database

Uses **NeDB** (embedded Node.js database — no external database needed).
Data is saved in `backend/data/` as flat files.

For production with persistent data on Railway/Render, mount a volume to `backend/data/`.
