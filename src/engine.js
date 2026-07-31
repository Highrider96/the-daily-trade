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
      const dated = k.includes(":cache:") || k.includes(":bt:") || k.startsWith("fsd:tdquota:");
      if (dated && !k.endsWith(today)) stale.push(k);
    }
    stale.forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
}

// ---------- Trade-Horizont ----------
// Bestimmt, wie viele ATR (mittlere Kerzen-Schwankung) Stop und Ziel entfernt liegen.
export const TRADE_STYLES = {
  scalp: { label: "Scalping", sl: 0.25, tp: 0.35, desc: "sehr enge Level" },
  kurz: { label: "Kurzfristig", sl: 0.8, tp: 1.2, desc: "enge Level" },
  swing: { label: "Swing", sl: 1.5, tp: 2.5, desc: "Standard" },
  position: { label: "Position", sl: 2.5, tp: 4.5, desc: "weite Level" },
};

// ---------- Zeitrahmen ----------
// volIdeal: typische ATR in % des Kurses je Kerze — Grundlage des Volatilitäts-
// Scores. Muss je Zeitrahmen unterschiedlich sein (eine Stundenkerze schwankt
// naturgemäß viel weniger als eine Tageskerze).
// unit: Einheit der geschätzten Haltedauer auf den Trade-Karten.
export const INTERVALS = {
  "1h": { key: "1h", label: "1 Stunde", short: "1h", bars: 400, btBars: 5000, volIdeal: 0.10, unit: "Stunden", htfLabel: "200-Stunden-Trend" },
  "4h": { key: "4h", label: "4 Stunden", short: "4h", bars: 300, btBars: 3000, volIdeal: 0.25, unit: "4h-Kerzen", htfLabel: "200×4h-Trend" },
  "1day": { key: "1day", label: "1 Tag", short: "1T", bars: 250, btBars: 900, volIdeal: 0.60, unit: "Handelstage", htfLabel: "200-Tage-Trend" },
};
export const DEFAULT_INTERVAL = "1day";

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
// Beide Märkte laufen über Twelve Data (800 Anfragen/Tag, 8/Minute).
export const MARKETS = {
  forex: {
    id: "forex",
    label: "Forex",
    subtitle: "Forex",
    prefix: "fsd",              // Storage-Präfix (rückwärtskompatibel)
    reqDelayMs: 8000,
    universe: FOREX_UNIVERSE,
    defaultSelected: ["EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD", "USD/CAD"],
  },
  metals: {
    id: "metals",
    label: "Metalle",
    subtitle: "Edelmetalle",
    prefix: "fsd:metals",
    reqDelayMs: 8000,
    universe: METALS_UNIVERSE,
    defaultSelected: ["XAU/USD", "XAG/USD"],
  },
};

// Cache/Verlauf sind je Markt UND Zeitrahmen getrennt — Scores aus Stunden-
// und Tagesanalyse dürfen sich nicht vermischen.
export const cacheKeyFor = (market, pair, interval) => `${market.prefix}:cache:${interval}:${pair}:${todayKey()}`;
export const backtestCacheKey = (market, pair, interval) => `${market.prefix}:bt:${interval}:${pair}:${todayKey()}`;
export const watchlistKeyFor = (market) => `${market.prefix}:watchlist`;
export const historyKeyFor = (market, interval) => `${market.prefix}:history:${interval}`;

export const TD_QUOTA_KEY = () => `fsd:tdquota:${todayKey()}`;
export const TD_DAILY_LIMIT = 800;

// ---------- Handelskosten ----------
// Typischer Spread je Instrument in Preis-Einheiten (nicht Pips), als
// Startwert — in den Einstellungen überschreibbar.
export const DEFAULT_SPREADS = {
  "EUR/USD": 0.00010, "GBP/USD": 0.00015, "USD/CHF": 0.00015, "AUD/USD": 0.00015,
  "USD/CAD": 0.00018, "NZD/USD": 0.00020, "EUR/GBP": 0.00018,
  "USD/JPY": 0.010, "EUR/JPY": 0.015, "GBP/JPY": 0.020,
  "XAU/USD": 0.30, "XAG/USD": 0.020, "XPT/USD": 1.50, "XPD/USD": 2.00,
};
export const SPREADS_KEY = "fsd:spreads";
export function getSpread(pair) {
  const custom = storageGet(SPREADS_KEY) || {};
  const v = custom[pair];
  return typeof v === "number" && v >= 0 ? v : (DEFAULT_SPREADS[pair] ?? 0);
}

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

// ADX (Wilder, Standard-Periode 14) — misst die Trendstärke (0–100), nicht die
// Richtung. Niedrig (< ~20) = Seitwärts/Range, hoch (> ~25) = ausgeprägter Trend.
function computeADX(candles, period = 14) {
  const len = candles.length;
  if (len < period * 2 + 1) return null;
  const plusDM = new Array(len).fill(0), minusDM = new Array(len).fill(0), tr = new Array(len).fill(0);
  for (let i = 1; i < len; i++) {
    const up = candles[i].high - candles[i - 1].high;
    const down = candles[i - 1].low - candles[i].low;
    plusDM[i] = up > down && up > 0 ? up : 0;
    minusDM[i] = down > up && down > 0 ? down : 0;
    const c = candles[i], p = candles[i - 1];
    tr[i] = Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
  }
  let atr = 0, sPlus = 0, sMinus = 0;
  for (let i = 1; i <= period; i++) { atr += tr[i]; sPlus += plusDM[i]; sMinus += minusDM[i]; }
  const dx = () => {
    const pDI = atr === 0 ? 0 : (100 * sPlus) / atr;
    const mDI = atr === 0 ? 0 : (100 * sMinus) / atr;
    const den = pDI + mDI;
    return den === 0 ? 0 : (100 * Math.abs(pDI - mDI)) / den;
  };
  const dxArr = [dx()];
  for (let i = period + 1; i < len; i++) {
    atr = atr - atr / period + tr[i];
    sPlus = sPlus - sPlus / period + plusDM[i];
    sMinus = sMinus - sMinus / period + minusDM[i];
    dxArr.push(dx());
  }
  if (dxArr.length < period) return dxArr.reduce((a, b) => a + b, 0) / dxArr.length;
  let adx = dxArr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < dxArr.length; i++) adx = (adx * (period - 1) + dxArr[i]) / period;
  return adx;
}

// Regime-Schwellen (Wilder-Konvention): unter WEAK gilt der Markt als
// richtungslos, ab STRONG als klar trendend.
export const ADX_WEAK = 20;
export const ADX_STRONG = 25;
// Gewicht des Regime-Bausteins im Gesamtscore (Rest: bisherige Formel).
const ADX_WEIGHT = 0.2;

// Gewicht des übergeordneten Trends (Multi-Timeframe) im Gesamtscore.
const HTF_WEIGHT = 0.15;
// Länge des übergeordneten Trends in Kerzen des aktuellen Zeitrahmens.
export const HTF_PERIOD = 200;

// Analysiert Kerzen eines Instruments und liefert Scores + Trade-Idee.
// opts.useAdx / opts.useHtf = false rechnen den Score ohne den jeweiligen
// Baustein (für A/B-Vergleiche im Backtest).
// opts.volIdeal: erwartete ATR in % je Kerze des gewählten Zeitrahmens.
export function analyzePair(candles, inst, opts = {}) {
  const useAdx = opts.useAdx !== false;
  const useHtf = opts.useHtf !== false;
  const volIdeal = opts.volIdeal ?? 0.6;
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

  // Volatilität relativ zum erwarteten Wert des Zeitrahmens bewerten.
  const atrPct = (atr / lastClose) * 100;
  const volScore = clamp(100 - (Math.abs(atrPct - volIdeal) / volIdeal) * 80, 0, 100);

  const baseComposite = trendScore * 0.4 + momentumScore * 0.4 + volScore * 0.2;

  // Regime: ADX 15 → 0 Punkte, ADX 40 → 100 Punkte.
  const adx = computeADX(candles, 14);
  const adxScore = adx == null ? null : clamp((adx - 15) * 4, 0, 100);
  let composite = useAdx && adxScore != null
    ? baseComposite * (1 - ADX_WEIGHT) + adxScore * ADX_WEIGHT
    : baseComposite;

  const direction = directionSign > 0 ? "LONG" : "SHORT";

  // Übergeordneter Trend (SMA200 desselben Zeitrahmens): Liegt der Kurs
  // darüber, ist das große Bild aufwärts. Signale gegen dieses Bild werden
  // abgewertet, Signale in seine Richtung aufgewertet.
  let htfDirection = null, htfAligned = null, htfScore = null;
  if (closes.length >= HTF_PERIOD) {
    const sma200 = computeSMA(closes, HTF_PERIOD);
    htfDirection = lastClose >= sma200 ? "LONG" : "SHORT";
    htfAligned = htfDirection === direction;
    htfScore = htfAligned ? 100 : 0;
    if (useHtf) composite = composite * (1 - HTF_WEIGHT) + htfScore * HTF_WEIGHT;
  }

  const entry = lastClose;
  const spark = candles.slice(-100).map((c) => ({ date: c.date, close: c.close }));

  return {
    pair: inst.pair, dec: inst.dec, pip: inst.pip,
    trendScore, momentumScore, volScore, adx, adxScore, baseComposite, composite,
    htfDirection, htfAligned, htfScore,
    direction, entry, atr, rsi, histogram, sma20, sma50, spark,
    lastDate: candles[candles.length - 1].date,
  };
}

// Entscheidet für EINE Kerze, ob Stop oder Ziel zuerst berührt wurde.
// Aus OHLC allein ist die Reihenfolge innerhalb der Kerze nicht ableitbar; wir
// nutzen die übliche Pfad-Annahme: eine steigende Kerze lief zuerst zum Tief,
// eine fallende zuerst zum Hoch. Das ist fair für beide Seiten — die frühere
// Regel "im Zweifel Stop" führte bei engen Zielen (Scalping) systematisch zu
// 100 % Verlusten, weil beide Level in dieselbe Kerze fallen.
function resolveCandle(c, isLong, stop, target) {
  const hitStop = isLong ? c.low <= stop : c.high >= stop;
  const hitTarget = isLong ? c.high >= target : c.low <= target;
  if (!hitStop && !hitTarget) return null;
  if (hitStop && !hitTarget) return "loss";
  if (hitTarget && !hitStop) return "win";
  // Beide in derselben Kerze → Pfad-Annahme entscheidet.
  const bullish = c.close >= c.open;
  const lowFirst = bullish; // steigende Kerze: erst Tief, dann Hoch
  if (isLong) return lowFirst ? "loss" : "win";
  return lowFirst ? "win" : "loss"; // Short: Tief zuerst = Ziel zuerst
}

// Walk-Forward-Backtest: geht chronologisch durch die Historie, bewertet an jedem
// Tag NUR mit den bis dahin bekannten Kerzen (kein Zukunfts-Blick) und simuliert
// nacheinander nicht-überlappende Trades mit Stop/Ziel des gewählten Horizonts.
// Ausstieg: Stop oder Ziel je nachdem, was zuerst berührt wird (Gleichzeitig = Stop).
// opts.useAdx / opts.useHtf: Score-Bausteine an/aus; opts.minAdx: Trendstärke-
// Filter; opts.minScore: nur Signale ab diesem Gesamtscore; opts.htfOnly: nur
// Signale in Richtung des übergeordneten Trends; opts.spread: Handelskosten in
// Preis-Einheiten (werden vom Ergebnis abgezogen); opts.volIdeal: Zeitrahmen.
export function runBacktest(candles, style, inst, opts = {}) {
  const { sl: slMult, tp: tpMult } = TRADE_STYLES[style];
  const spread = opts.spread || 0;
  const warmup = 55; // genug für SMA50 + MACD/ATR
  const trades = [];
  let skipped = 0;
  let i = warmup;
  while (i < candles.length - 1) {
    const a = analyzePair(candles.slice(0, i + 1), inst, { useAdx: opts.useAdx, useHtf: opts.useHtf, volIdeal: opts.volIdeal });
    if (!(a.atr > 0)) { i++; continue; }
    if (opts.minAdx != null && a.adx != null && a.adx < opts.minAdx) { skipped++; i++; continue; }
    if (opts.minScore != null && a.composite < opts.minScore) { skipped++; i++; continue; }
    if (opts.htfOnly && a.htfAligned === false) { skipped++; i++; continue; }
    const isLong = a.direction === "LONG";
    const entry = candles[i].close;
    const risk = slMult * a.atr;
    const stop = isLong ? entry - risk : entry + risk;
    const target = isLong ? entry + tpMult * a.atr : entry - tpMult * a.atr;

    let j = i + 1, outcome = null;
    for (; j < candles.length; j++) {
      outcome = resolveCandle(candles[j], isLong, stop, target);
      if (outcome) break;
    }
    // Rohergebnis in Preis-Einheiten, dann Handelskosten (ein voller Spread
    // je Trade: beim Einstieg und beim Ausstieg jeweils die schlechtere Seite).
    let gross;
    if (outcome === "win") gross = tpMult * a.atr;
    else if (outcome === "loss") gross = -risk;
    else {
      j = candles.length - 1;
      const last = candles[j].close;
      gross = isLong ? last - entry : entry - last;
    }
    const r = (gross - spread) / risk;
    trades.push({ pair: inst.pair, entryDate: candles[i].date, exitDate: candles[j].date, direction: a.direction, r, win: r > 0, score: a.composite, adx: a.adx, htfAligned: a.htfAligned, bars: j - i });
    i = j + 1; // nächster Trade erst nach dem Schließen
  }
  trades.skipped = skipped;
  return trades;
}

// ---------- Datenquelle: Twelve Data (einheitlich für alle Märkte) ----------
// Ein Abruf = 1 Credit. Zeiten kommen in deutscher Zeit zurück, damit
// Stunden-Zeitrahmen direkt lesbar sind.
export async function fetchSeries(inst, interval, outputsize, tdKey) {
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(inst.pair)}`
    + `&interval=${interval}&outputsize=${outputsize}&timezone=Europe/Berlin&apikey=${tdKey}`;
  let res;
  try { res = await fetch(url); } catch { throw new Error(`Verbindung zu Twelve Data fehlgeschlagen (${inst.pair}). Bitte Internetverbindung prüfen.`); }
  if (!res.ok) throw new Error(`Twelve-Data-HTTP-Fehler (${res.status}) bei ${inst.pair}.`);
  const data = await res.json();
  if (data.status === "error") throw new Error(`Twelve Data (${inst.pair}): ` + (data.message || "unbekannter Fehler"));
  if (!data.values || !data.values.length) throw new Error(`Keine Daten für ${inst.pair} erhalten.`);
  return data.values.map((v) => ({
    date: v.datetime,
    open: parseFloat(v.open), high: parseFloat(v.high), low: parseFloat(v.low), close: parseFloat(v.close),
  })).reverse(); // Twelve Data liefert neueste zuerst
}

// Kerzen für den Scan (aktueller Zeitrahmen).
export function fetchScanSeries(inst, interval, tdKey) {
  return fetchSeries(inst, interval, INTERVALS[interval].bars, tdKey);
}
// Lange Historie für den Backtest.
export function fetchBacktestSeries(inst, interval, tdKey) {
  return fetchSeries(inst, interval, INTERVALS[interval].btBars, tdKey);
}

// ---------- Stundendaten (Handelszeiten-Analyse) ----------
export const HOURLY_BARS = 5000; // ~7 Monate à 24h × 5 Tage
export const fetchHourly = (inst, tdKey) => fetchSeries(inst, "1h", HOURLY_BARS, tdKey);

// "2026-07-29 21:00:00" → 21 (Stunde in deutscher Zeit)
export const hourOf = (s) => parseInt(s.slice(11, 13), 10);
// Wochentag deterministisch aus dem Datumsteil (0 = So … 6 = Sa)
export function weekdayOf(s) {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
export const WEEKDAY_NAMES = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

// Bewegungsprofil: durchschnittliche Kerzen-Spanne je Tagesstunde (in % des Kurses).
export function hourProfile(candles) {
  const sum = new Array(24).fill(0), cnt = new Array(24).fill(0);
  for (const c of candles) {
    const h = hourOf(c.date);
    if (!(c.close > 0)) continue;
    sum[h] += ((c.high - c.low) / c.close) * 100;
    cnt[h]++;
  }
  return sum.map((s, h) => ({ hour: h, avgRangePct: cnt[h] ? s / cnt[h] : null, n: cnt[h] }));
}

// Walk-Forward-Test auf Stundenkerzen: Einstieg in Richtung des kurzfristigen
// Stundentrends (SMA20 vs SMA50), Stop 1× / Ziel 1,5× Stunden-ATR, max. 24h
// Haltedauer. Liefert je Trade die Einstiegsstunde — daraus entsteht das
// Ranking "beste Handelszeit".
export function runHourlyBacktest(candles, inst) {
  const slMult = 1.0, tpMult = 1.5, maxHold = 24, warmup = 55;
  const trades = [];
  const closes = candles.map((c) => c.close);
  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;

  let i = warmup;
  while (i < candles.length - 1) {
    const sma20 = avg(closes.slice(i - 19, i + 1));
    const sma50 = avg(closes.slice(i - 49, i + 1));
    // ATR über die letzten 14 Stunden
    let tr = 0;
    for (let k = i - 13; k <= i; k++) {
      const c = candles[k], p = candles[k - 1];
      tr += Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
    }
    const atr = tr / 14;
    if (!(atr > 0)) { i++; continue; }

    const isLong = sma20 >= sma50;
    const entry = candles[i].close;
    const risk = slMult * atr;
    const stop = isLong ? entry - risk : entry + risk;
    const target = isLong ? entry + tpMult * atr : entry - tpMult * atr;

    let j = i + 1, outcome = null;
    const limit = Math.min(candles.length - 1, i + maxHold);
    for (; j <= limit; j++) {
      outcome = resolveCandle(candles[j], isLong, stop, target);
      if (outcome) break;
    }
    let r;
    if (outcome === "win") r = tpMult;
    else if (outcome === "loss") r = -1;
    else { j = Math.min(j, candles.length - 1); r = ((isLong ? candles[j].close - entry : entry - candles[j].close) / risk); }

    trades.push({ pair: inst.pair, hour: hourOf(candles[i].date), weekday: weekdayOf(candles[i].date), r, win: r > 0 });
    i = j + 1; // nicht überlappend
  }
  return trades;
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
