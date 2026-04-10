require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Validate environment variables on startup ──
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ MISSING ENV VARS:');
  console.error('   SUPABASE_URL:', SUPABASE_URL ? '✓ set' : '✗ MISSING');
  console.error('   SUPABASE_KEY:', SUPABASE_KEY ? '✓ set' : '✗ MISSING');
  console.error('   Add these in Render → Environment tab');
}

// ── Supabase client ──
const supabase = createClient(
  SUPABASE_URL || 'missing',
  SUPABASE_KEY || 'missing',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Health check — shows if everything is working ──
app.get('/ping', async (req, res) => {
  let dbStatus = 'unknown';
  try {
    const { data, error } = await supabase.from('trades').select('id').limit(1);
    dbStatus = error ? 'error: ' + error.message : 'connected';
  } catch(e) {
    dbStatus = 'failed: ' + e.message;
  }
  res.json({
    ok: true,
    time: new Date().toISOString(),
    supabase_url: SUPABASE_URL ? SUPABASE_URL.substring(0,30)+'...' : 'MISSING',
    supabase_key: SUPABASE_KEY ? SUPABASE_KEY.substring(0,15)+'...' : 'MISSING',
    database: dbStatus
  });
});

// ── Debug endpoint — check exactly what's wrong ──
app.get('/api/debug', async (req, res) => {
  const results = {};
  try {
    const { data, error } = await supabase.from('trades').select('count').limit(1);
    results.trades_table = error ? 'ERROR: ' + error.message : 'OK';
  } catch(e) { results.trades_table = 'EXCEPTION: ' + e.message; }
  try {
    const { data, error } = await supabase.from('journal').select('count').limit(1);
    results.journal_table = error ? 'ERROR: ' + error.message : 'OK';
  } catch(e) { results.journal_table = 'EXCEPTION: ' + e.message; }
  res.json({
    env: {
      SUPABASE_URL: SUPABASE_URL ? '✓ ' + SUPABASE_URL : '✗ MISSING',
      SUPABASE_KEY: SUPABASE_KEY ? '✓ ' + SUPABASE_KEY.substring(0,20)+'...' : '✗ MISSING',
    },
    tables: results
  });
});

// ── Supabase keep-alive every 4 days ──
const FOUR_DAYS_MS = 4 * 24 * 60 * 60 * 1000;
async function keepSupabaseAlive() {
  try {
    const { data, error } = await supabase.from('trades').select('id').limit(1);
    console.log(`[${new Date().toISOString()}] Keep-alive: ${error ? 'error - ' + error.message : 'ok'}`);
  } catch (e) {
    console.log(`[${new Date().toISOString()}] Keep-alive failed: ${e.message}`);
  }
}
keepSupabaseAlive();
setInterval(keepSupabaseAlive, FOUR_DAYS_MS);

// ════════════════════════════════
//  TRADES
// ════════════════════════════════
app.get('/api/trades', async (req, res) => {
  try {
    let query = supabase.from('trades').select('*').order('date', { ascending: false });
    if (req.query.month) query = query.like('date', req.query.month + '%');
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/trades', async (req, res) => {
  try {
    const { data, error } = await supabase.from('trades').insert([req.body]).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/trades/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('trades').update(req.body).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/trades/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('trades').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════
//  CALENDAR
// ════════════════════════════════
app.get('/api/calendar/:year/:month', async (req, res) => {
  try {
    const { year, month } = req.params;
    const prefix = `${year}-${month.padStart(2,'0')}`;
    const { data: trades, error } = await supabase
      .from('trades').select('*').like('date', prefix + '%');
    if (error) throw error;
    const daily = {};
    trades.forEach(t => {
      const d = t.date;
      if (!daily[d]) daily[d] = { pnl:0, trades:0, wins:0, losses:0, be:0, rTotal:0, instruments:[] };
      daily[d].pnl    += (t.pnl || 0);
      daily[d].trades += 1;
      daily[d].rTotal += (t.r   || 0);
      if (t.result === 'Win')       daily[d].wins++;
      if (t.result === 'Loss')      daily[d].losses++;
      if (t.result === 'Breakeven') daily[d].be++;
      if (t.instrument && !daily[d].instruments.includes(t.instrument))
        daily[d].instruments.push(t.instrument);
    });
    const allPnl      = Object.values(daily).reduce((s,d) => s + d.pnl, 0);
    const tradeDays   = Object.keys(daily).length;
    const totalTrades = trades.length;
    const wins        = trades.filter(t => t.result === 'Win').length;
    const losses      = trades.filter(t => t.result === 'Loss').length;
    res.json({ daily, summary: { pnl: allPnl, tradeDays, totalTrades, wins, losses } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════
//  STATS
// ════════════════════════════════
app.get('/api/stats', async (req, res) => {
  try {
    const { data: trades, error } = await supabase
      .from('trades').select('*').order('date', { ascending: true });
    if (error) throw error;
    const now        = new Date();
    const thisMonth  = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const wins       = trades.filter(t => t.result === 'Win');
    const losses     = trades.filter(t => t.result === 'Loss');
    const total      = trades.length;
    const winRate    = total ? (wins.length / total * 100).toFixed(1) : 0;
    const netPnl     = trades.reduce((s,t) => s + (t.pnl||0), 0);
    const grossWin   = wins.reduce((s,t) => s + (t.pnl||0), 0);
    const grossLoss  = Math.abs(losses.reduce((s,t) => s + (t.pnl||0), 0));
    const pf         = grossLoss > 0 ? (grossWin/grossLoss).toFixed(2) : wins.length > 0 ? '∞' : null;
    const rTrades    = trades.filter(t => t.r);
    const avgR       = rTrades.length ? (rTrades.reduce((s,t)=>s+(t.r||0),0)/rTrades.length).toFixed(2) : null;
    const avgWin     = wins.length   ? grossWin  / wins.length   : null;
    const avgLoss    = losses.length ? grossLoss / losses.length : null;
    const bestTrade  = trades.length ? Math.max(...trades.map(t => t.pnl||0)) : null;
    const worstTrade = trades.length ? Math.min(...trades.map(t => t.pnl||0)) : null;
    const thisMonthCount = trades.filter(t => t.date && t.date.startsWith(thisMonth)).length;
    let cum = 0;
    const equityCurve = trades.map(t => {
      cum += (t.pnl || 0);
      return { date: t.date, value: +cum.toFixed(2) };
    });
    res.json({
      total, winRate, netPnl, wins: wins.length, losses: losses.length,
      be: trades.filter(t => t.result === 'Breakeven').length,
      pf, avgR, avgWin, avgLoss, bestTrade, worstTrade,
      thisMonthCount, equityCurve
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════
//  JOURNAL
// ════════════════════════════════
app.get('/api/journal', async (req, res) => {
  try {
    const { data, error } = await supabase.from('journal').select('*').order('date', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/journal', async (req, res) => {
  try {
    const payload = { ...req.body, tags: req.body.tags || [] };
    const { data, error } = await supabase.from('journal').insert([payload]).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/journal/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('journal').update(req.body).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/journal/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('journal').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Catch-all → SPA
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 TradeFlow running on port ${PORT}`);
  console.log(`📦 SUPABASE_URL: ${SUPABASE_URL ? '✓ ' + SUPABASE_URL : '✗ MISSING'}`);
  console.log(`🔑 SUPABASE_KEY: ${SUPABASE_KEY ? '✓ set (' + SUPABASE_KEY.substring(0,15) + '...)' : '✗ MISSING'}`);
});
