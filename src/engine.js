// Gemeinsame Analyse-Engine, Datenquellen und Markt-Konfiguration.
// Wird von ScanView (Forex, Metalle, künftig Aktien) genutzt.

// ---------- Local storage helpers ----------
export function storageGet(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw != null ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
export function storageSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota/private mode */ }
}
export function storageHas(key) {
  try { return localStorage.getItem(key) != null; } catch { return false; }
}

export const todayKey = () => new Date().toISOString().slice(0, 10);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Räumt gestrige Tages-Caches und Kontingent-Zähler beider Märkte/Anbieter auf.
export function pruneOldCaches() {
  const today = todayKey();
  try {
    const stale = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith("fsd:")) continue;
      const dated = k.includes(":cache:") || k.startsWith("fsd:quota:") || k.startsWith("fsd:tdquota:");
      if (dated && !k.endsWith(today)) stale.push(k);
    }
    stale.forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
}

// ---------- Trade-Horizont ----------
// Bestimmt, wie viele ATR (mittlere Tagesschwankung) Stop und Ziel entfernt liegen.
export const TRADE_STYLES = {
  scalp: { label: "Scalping", sl: 0.25, tp: 0.35, desc: "sehr eng · Intraday bis 1–2 Tage" },
  kurz: { label: "Kurzfristig", sl: 0.8, tp: 1.2, desc: "enge Level · grob 1–4 Handelstage" },
  swing: { label: "Swing", sl: 1.5, tp: 2.5, desc: "Standard · grob 3–8 Handelstage" },
  position: { label: "Position", sl: 2.5, tp: 4.5, desc: "weite Level · grob 1–3 Wochen" },
};

// ---------- Instrument-Universen ----------
// dec = Nachkommastellen; pip = Pip-Größe (nur Forex; bei Metallen wird die
// Distanz stattdessen als absoluter Preis in USD angezeigt).
export const FOREX_UNIVERSE = [
  { pair: "EUR/USD", from: "EUR", to: "USD", dec: 5, pip: 0.0001 },
  { pair: "GBP/USD", from: "GBP", to: "USD", dec: 5, pip: 0.0001 },
  { pair: "USD/JPY", from: "USD", to: "JPY", dec: 3, pip: 0.01 },
  { pair: "USD/CHF", from: "USD", to: "CHF", dec: 5, pip: 0.0001 },
  { pair: "AUD/USD", from: "AUD", to: "USD", dec: 5, pip: 0.0001 },
  { pair: "USD/CAD", from: "USD", to: "CAD", dec: 5, pip: 0.0001 },
  { pair: "NZD/USD", from: "NZD", to: "USD", dec: 5, pip: 0.0001 },
  { pair: "EUR/GBP", from: "EUR", to: "GBP", dec: 5, pip: 0.0001 },
  { pair: "EUR/JPY", from: "EUR", to: "JPY", dec: 3, pip: 0.01 },
  { pair: "GBP/JPY", from: "GBP", to: "JPY", dec: 3, pip: 0.01 },
];

export const METALS_UNIVERSE = [
  { pair: "XAU/USD", name: "Gold", dec: 2 },
  { pair: "XAG/USD", name: "Silber", dec: 3 },
  { pair: "XPT/USD", name: "Platin", dec: 2 },
  { pair: "XPD/USD", name: "Palladium", dec: 2 },
];

// ---------- Markt-Konfiguration ----------
// provider: "av" = Alpha Vantage (Forex), "td" = Twelve Data (Metalle).
export const MARKETS = {
  forex: {
    id: "forex",
    label: "Forex",
    subtitle: "Forex",
    prefix: "fsd",              // Storage-Präfix (rückwärtskompatibel)
    provider: "av",
    dailyLimit: 25,
    reqDelayMs: 13000,
    universe: FOREX_UNIVERSE,
    defaultSelected: ["EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD", "USD/CAD"],
    dataNote: "kostenlose, verzögerte Alpha-Vantage-Daten",
    watchlistNote: "Alpha Vantage Free-Tier: 5/Min, 25/Tag",
    keyName: "Alpha-Vantage-Key",
  },
  metals: {
    id: "metals",
    label: "Metalle",
    subtitle: "Edelmetalle",
    prefix: "fsd:metals",
    provider: "td",
    dailyLimit: 800,
    reqDelayMs: 8000,
    universe: METALS_UNIVERSE,
    defaultSelected: ["XAU/USD", "XAG/USD"],
    dataNote: "kostenlose Twelve-Data-Daten (Gold, Silber, Platin, Palladium)",
    watchlistNote: "Twelve Data Free-Tier: 8/Min, 800/Tag",
    keyName: "Twelve-Data-Key",
  },
};

export const cacheKeyFor = (market, pair) => `${market.prefix}:cache:${pair}:${todayKey()}`;
export const watchlistKeyFor = (market) => `${market.prefix}:watchlist`;
export const historyKeyFor = (market) => `${market.prefix}:history`;

export const AV_QUOTA_KEY = () => `fsd:quota:${todayKey()}`;
export const TD_QUOTA_KEY = () => `fsd:tdquota:${todayKey()}`;
export const TD_DAILY_LIMIT = 800;

// ---------- Math helpers ----------
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function computeSMA(closes, period) {
  const last = closes.slice(-period);
  return last.reduce((a, b) => a + b, 0) / last.length;
}

function computeRSI(closes, period = 14) {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  const avgGain = gains / period, avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function computeATR(candles, period = 14) {
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], p = candles[i - 1];
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
  }
  const last = trs.slice(-period);
  return last.reduce((a, b) => a + b, 0) / last.length;
}

function computeEMAArray(values, period) {
  const out = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

// Analysiert Tageskerzen eines Instruments und liefert Scores + Trade-Idee.
export function analyzePair(candles, inst) {
  const closes = candles.map((c) => c.close);
  const lastClose = closes[closes.length - 1];
  const sma20 = computeSMA(closes, 20);
  const sma50 = computeSMA(closes, Math.min(50, closes.length));
  const rsi = computeRSI(closes, 14);
  const atr = computeATR(candles, 14);

  const ema12 = computeEMAArray(closes, 12);
  const ema26 = computeEMAArray(closes, 26);
  const macdLine = closes.map((_, i) => (ema12[i] != null && ema26[i] != null ? ema12[i] - ema26[i] : null));
  const macdValues = macdLine.filter((v) => v != null);
  const signalArr = computeEMAArray(macdValues, 9);
  const macdLast = macdValues.length ? macdValues[macdValues.length - 1] : 0;
  const signalLast = signalArr.length ? signalArr[signalArr.length - 1] : 0;
  const histogram = (macdLast ?? 0) - (signalLast ?? 0);

  const directionSign = sma20 - sma50 >= 0 ? 1 : -1;
  const trendPct = Math.abs((sma20 - sma50) / sma50) * 100;
  const trendScore = clamp(trendPct * 50, 0, 100);

  const rsiAligned = directionSign > 0 ? rsi - 50 : 50 - rsi;
  const macdComponent = directionSign > 0 ? (histogram > 0 ? 75 : 25) : histogram < 0 ? 75 : 25;
  const momentumScore = clamp(clamp(50 + rsiAligned * 1.4, 0, 100) * 0.6 + macdComponent * 0.4, 0, 100);

  const atrPct = (atr / lastClose) * 100;
  const volScore = clamp(100 - Math.abs(atrPct - 0.6) * 80, 0, 100);

  const composite = trendScore * 0.4 + momentumScore * 0.4 + volScore * 0.2;
  const direction = directionSign > 0 ? "LONG" : "SHORT";
  const entry = lastClose;

  const spark = candles.slice(-100).map((c) => ({ date: c.date, close: c.close }));

  return {
    pair: inst.pair, dec: inst.dec, pip: inst.pip,
    trendScore, momentumScore, volScore, composite, direction, entry, atr, rsi, histogram, sma20, sma50, spark,
    lastDate: candles[candles.length - 1].date,
  };
}

// ---------- Datenquellen ----------
// Alpha Vantage FX_DAILY (Forex)
async function fetchFXDaily(inst, apiKey) {
  const url = `https://www.alphavantage.co/query?function=FX_DAILY&from_symbol=${inst.from}&to_symbol=${inst.to}&outputsize=compact&apikey=${apiKey}`;
  let res;
  try {
    res = await fetch(url);
  } catch {
    throw new Error(`Verbindung zu Alpha Vantage fehlgeschlagen (${inst.pair}). Bitte Internetverbindung prüfen.`);
  }
  if (!res.ok) throw new Error(`HTTP-Fehler (${res.status}) beim Laden von ${inst.pair}.`);
  const data = await res.json();
  if (data["Note"]) throw new Error("Rate-Limit erreicht: " + data["Note"]);
  if (data["Information"]) throw new Error(data["Information"]);
  if (data["Error Message"]) throw new Error("API-Fehler: " + data["Error Message"]);
  const series = data["Time Series FX (Daily)"];
  if (!series) throw new Error(`Keine Daten für ${inst.pair} erhalten.`);
  const dates = Object.keys(series).sort();
  return dates.map((d) => ({
    date: d,
    open: parseFloat(series[d]["1. open"]),
    high: parseFloat(series[d]["2. high"]),
    low: parseFloat(series[d]["3. low"]),
    close: parseFloat(series[d]["4. close"]),
  }));
}

// Twelve Data time_series (Metalle; liefert neueste zuerst → umkehren)
async function fetchTDDaily(inst, tdKey) {
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(inst.pair)}&interval=1day&outputsize=120&apikey=${tdKey}`;
  let res;
  try {
    res = await fetch(url);
  } catch {
    throw new Error(`Verbindung zu Twelve Data fehlgeschlagen (${inst.pair}). Bitte Internetverbindung prüfen.`);
  }
  if (!res.ok) throw new Error(`Twelve-Data-HTTP-Fehler (${res.status}) bei ${inst.pair}.`);
  const data = await res.json();
  if (data.status === "error") throw new Error(`Twelve Data (${inst.pair}): ` + (data.message || "unbekannter Fehler"));
  const values = data.values;
  if (!values || !values.length) throw new Error(`Keine Daten für ${inst.pair} erhalten.`);
  return values
    .map((v) => ({
      date: v.datetime,
      open: parseFloat(v.open),
      high: parseFloat(v.high),
      low: parseFloat(v.low),
      close: parseFloat(v.close),
    }))
    .reverse();
}

// Wählt die Datenquelle nach Markt-Provider.
export function fetchDaily(inst, market, keys) {
  return market.provider === "av"
    ? fetchFXDaily(inst, keys.avKey)
    : fetchTDDaily(inst, keys.tdKey);
}

// ---------- Twelve Data: aktuelle Kurse (Live, für beide Märkte) ----------
async function fetchLiveRates(pairs, tdKey) {
  const url = `https://api.twelvedata.com/price?symbol=${encodeURIComponent(pairs.join(","))}&apikey=${tdKey}&dp=5`;
  let res;
  try {
    res = await fetch(url);
  } catch {
    throw new Error("Verbindung zu Twelve Data fehlgeschlagen — bitte Internetverbindung prüfen.");
  }
  if (!res.ok) throw new Error(`Twelve-Data-HTTP-Fehler (${res.status}).`);
  const data = await res.json();
  if (data.status === "error") throw new Error("Twelve Data: " + (data.message || "unbekannter Fehler"));
  const at = new Date();
  const out = {};
  if (pairs.length === 1) {
    if (data.price) out[pairs[0]] = { price: parseFloat(data.price), at };
  } else {
    for (const p of pairs) {
      if (data[p] && data[p].price) out[p] = { price: parseFloat(data[p].price), at };
    }
  }
  if (Object.keys(out).length === 0) throw new Error("Twelve Data lieferte keine Kurse (Key korrekt?).");
  return out;
}

// Manche Keys/Tarife mögen keine Batch-Abfragen — dann einzeln nachladen.
export async function fetchLiveRatesRobust(pairs, tdKey) {
  try {
    return await fetchLiveRates(pairs, tdKey);
  } catch (e) {
    if (pairs.length === 1) throw e;
    const out = {};
    for (const p of pairs) {
      try { Object.assign(out, await fetchLiveRates([p], tdKey)); } catch { /* Instrument überspringen */ }
    }
    if (Object.keys(out).length === 0) throw e;
    return out;
  }
}
