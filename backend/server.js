const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const Datastore = require('nedb-promises');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

// ── DB setup ──
const dbDir = path.join(__dirname, 'data');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir);

const tradesDB  = Datastore.create({ filename: path.join(dbDir, 'trades.db'),  autoload: true });
const journalDB = Datastore.create({ filename: path.join(dbDir, 'journal.db'), autoload: true });

app.use(cors());
app.use(express.json());

// Serve frontend static files
app.use(express.static(path.join(__dirname, 'public')));

// ════════════════════════════════
//  TRADES API
// ════════════════════════════════

// GET all trades (with optional month filter)
app.get('/api/trades', async (req, res) => {
  try {
    const { month } = req.query; // e.g. "2025-04"
    let query = {};
    if (month) query.date = new RegExp('^' + month);
    const trades = await tradesDB.find(query).sort({ date: -1 });
    res.json(trades);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET single trade
app.get('/api/trades/:id', async (req, res) => {
  try {
    const trade = await tradesDB.findOne({ _id: req.params.id });
    if (!trade) return res.status(404).json({ error: 'Not found' });
    res.json(trade);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST create trade
app.post('/api/trades', async (req, res) => {
  try {
    const trade = {
      _id: uuidv4(),
      ...req.body,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    const saved = await tradesDB.insert(trade);
    res.status(201).json(saved);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT update trade
app.put('/api/trades/:id', async (req, res) => {
  try {
    const update = { ...req.body, updatedAt: new Date().toISOString() };
    delete update._id;
    await tradesDB.update({ _id: req.params.id }, { $set: update });
    const updated = await tradesDB.findOne({ _id: req.params.id });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE trade
app.delete('/api/trades/:id', async (req, res) => {
  try {
    await tradesDB.remove({ _id: req.params.id });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET calendar data — daily P&L aggregated for a month
app.get('/api/calendar/:year/:month', async (req, res) => {
  try {
    const { year, month } = req.params;
    const prefix = `${year}-${month.padStart(2,'0')}`;
    const trades = await tradesDB.find({ date: new RegExp('^' + prefix) });

    const daily = {};
    trades.forEach(t => {
      const d = t.date;
      if (!daily[d]) daily[d] = { pnl: 0, trades: 0, wins: 0, losses: 0, be: 0, instruments: [] };
      daily[d].pnl    += (t.pnl || 0);
      daily[d].trades += 1;
      if (t.result === 'Win')       daily[d].wins++;
      if (t.result === 'Loss')      daily[d].losses++;
      if (t.result === 'Breakeven') daily[d].be++;
      if (t.instrument && !daily[d].instruments.includes(t.instrument))
        daily[d].instruments.push(t.instrument);
    });

    // Monthly summary
    const allPnl  = Object.values(daily).reduce((s,d)=>s+d.pnl, 0);
    const tradeDays = Object.keys(daily).length;
    const totalTrades = trades.length;
    const wins  = trades.filter(t=>t.result==='Win').length;
    const losses= trades.filter(t=>t.result==='Loss').length;

    res.json({ daily, summary: { pnl: allPnl, tradeDays, totalTrades, wins, losses } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET stats summary (dashboard)
app.get('/api/stats', async (req, res) => {
  try {
    const trades = await tradesDB.find({}).sort({ date: 1 });
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

    const wins   = trades.filter(t=>t.result==='Win');
    const losses = trades.filter(t=>t.result==='Loss');
    const total  = trades.length;
    const winRate = total ? (wins.length / total * 100).toFixed(1) : 0;
    const netPnl  = trades.reduce((s,t)=>s+(t.pnl||0), 0);
    const grossWin  = wins.reduce((s,t)=>s+(t.pnl||0), 0);
    const grossLoss = Math.abs(losses.reduce((s,t)=>s+(t.pnl||0), 0));
    const pf = grossLoss > 0 ? (grossWin / grossLoss).toFixed(2) : wins.length > 0 ? '∞' : null;
    const rTrades = trades.filter(t=>t.r);
    const avgR = rTrades.length ? (rTrades.reduce((s,t)=>s+(t.r||0),0)/rTrades.length).toFixed(2) : null;
    const thisMonthCount = trades.filter(t=>t.date&&t.date.startsWith(thisMonth)).length;
    const avgWin  = wins.length   ? grossWin / wins.length : null;
    const avgLoss = losses.length ? grossLoss / losses.length : null;
    const bestTrade = trades.length ? Math.max(...trades.map(t=>t.pnl||0)) : null;
    const worstTrade= trades.length ? Math.min(...trades.map(t=>t.pnl||0)) : null;

    // Equity curve points
    let cum = 0;
    const equityCurve = trades.map(t => {
      cum += (t.pnl || 0);
      return { date: t.date, value: +cum.toFixed(2) };
    });

    res.json({
      total, winRate, netPnl, wins: wins.length, losses: losses.length,
      be: trades.filter(t=>t.result==='Breakeven').length,
      pf, avgR, thisMonthCount, avgWin, avgLoss, bestTrade, worstTrade, equityCurve
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════
//  JOURNAL API
// ════════════════════════════════

app.get('/api/journal', async (req, res) => {
  try {
    const entries = await journalDB.find({}).sort({ date: -1 });
    res.json(entries);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/journal', async (req, res) => {
  try {
    const entry = { _id: uuidv4(), ...req.body, createdAt: new Date().toISOString() };
    const saved = await journalDB.insert(entry);
    res.status(201).json(saved);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/journal/:id', async (req, res) => {
  try {
    const update = { ...req.body };
    delete update._id;
    await journalDB.update({ _id: req.params.id }, { $set: update });
    const updated = await journalDB.findOne({ _id: req.params.id });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/journal/:id', async (req, res) => {
  try {
    await journalDB.remove({ _id: req.params.id });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Catch-all → serve index.html (SPA routing)
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 TradeFlow server running on http://localhost:${PORT}`);
});
