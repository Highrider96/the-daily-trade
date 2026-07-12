import { useState, useEffect, useCallback } from "react";
import { Settings2, RefreshCw, TrendingUp, TrendingDown, AlertTriangle, Info, X, ChevronRight, Radio, History } from "lucide-react";
import { Sparkline, ScoreHistoryChart } from "./Charts.jsx";

// ---------- Instrument universe ----------
const UNIVERSE = [
  { pair: "EUR/USD", from: "EUR", to: "USD" },
  { pair: "GBP/USD", from: "GBP", to: "USD" },
  { pair: "USD/JPY", from: "USD", to: "JPY" },
  { pair: "USD/CHF", from: "USD", to: "CHF" },
  { pair: "AUD/USD", from: "AUD", to: "USD" },
  { pair: "USD/CAD", from: "USD", to: "CAD" },
  { pair: "NZD/USD", from: "NZD", to: "USD" },
  { pair: "EUR/GBP", from: "EUR", to: "GBP" },
  { pair: "EUR/JPY", from: "EUR", to: "JPY" },
  { pair: "GBP/JPY", from: "GBP", to: "JPY" },
];
const DEFAULT_SELECTED = ["EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD", "USD/CAD"];

// Trade-Horizont: bestimmt, wie viele ATR (mittlere Tagesschwankung)
// Stop und Ziel vom Einstieg entfernt liegen.
const TRADE_STYLES = {
  kurz: { label: "Kurzfristig", sl: 0.8, tp: 1.2, desc: "enge Level · grob 1–4 Handelstage" },
  swing: { label: "Swing", sl: 1.5, tp: 2.5, desc: "Standard · grob 3–8 Handelstage" },
  position: { label: "Position", sl: 2.5, tp: 4.5, desc: "weite Level · grob 1–3 Wochen" },
};

// ---------- Local storage helpers ----------
function storageGet(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw != null ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function storageSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota/private mode */ }
}
function pruneOldCaches() {
  const prefix = "fsd:cache:";
  const today = todayKey();
  try {
    const stale = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix) && !k.endsWith(today)) stale.push(k);
    }
    stale.forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
}

// ---------- Math helpers ----------
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

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

function decimalsFor(pair) { return pair.includes("JPY") ? 3 : 5; }

function analyzePair(candles, pair) {
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

  return { pair, trendScore, momentumScore, volScore, composite, direction, entry, atr, rsi, histogram, sma20, sma50, spark, lastDate: candles[candles.length - 1].date };
}

// ---------- Alpha Vantage fetch ----------
async function fetchFXDaily(from, to, apiKey) {
  const url = `https://www.alphavantage.co/query?function=FX_DAILY&from_symbol=${from}&to_symbol=${to}&outputsize=compact&apikey=${apiKey}`;
  let res;
  try {
    res = await fetch(url);
  } catch {
    throw new Error(`Verbindung zu Alpha Vantage fehlgeschlagen (${from}/${to}). Bitte Internetverbindung prüfen und erneut versuchen.`);
  }
  if (!res.ok) throw new Error(`HTTP-Fehler (${res.status}) beim Laden von ${from}/${to}.`);
  const data = await res.json();
  if (data["Note"]) throw new Error("Rate-Limit erreicht: " + data["Note"]);
  if (data["Information"]) throw new Error(data["Information"]);
  if (data["Error Message"]) throw new Error("API-Fehler: " + data["Error Message"]);
  const series = data["Time Series FX (Daily)"];
  if (!series) throw new Error(`Keine Daten für ${from}/${to} erhalten.`);
  const dates = Object.keys(series).sort();
  return dates.map((d) => ({
    date: d,
    open: parseFloat(series[d]["1. open"]),
    high: parseFloat(series[d]["2. high"]),
    low: parseFloat(series[d]["3. low"]),
    close: parseFloat(series[d]["4. close"]),
  }));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const todayKey = () => new Date().toISOString().slice(0, 10);

// ---------- Small UI pieces ----------
function ScoreBar({ label, value, tone }) {
  const toneMap = { trend: "#5B8CFF", momentum: "#E0A458", vol: "#2F9E6E" };
  return (
    <div className="flex items-center gap-2">
      <span className="fsd-mono text-[10px] text-[#6B7590] w-20 shrink-0 uppercase tracking-wide">{label}</span>
      <div className="flex-1 h-1.5 bg-[#ECEFF6] rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${value}%`, background: toneMap[tone] }} />
      </div>
      <span className="fsd-mono text-[10px] text-[#4A5570] w-7 text-right">{Math.round(value)}</span>
    </div>
  );
}

function ConvictionDial({ score, direction }) {
  const color = direction === "LONG" ? "#2F9E6E" : "#D6503A";
  const angle = (score / 100) * 270;
  return (
    <div className="relative w-20 h-20 shrink-0">
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `conic-gradient(${color} ${angle}deg, #ECEFF6 ${angle}deg 270deg, transparent 270deg 360deg)`,
          transform: "rotate(135deg)",
        }}
      />
      <div className="absolute inset-[6px] rounded-full bg-[#F5F6FA] flex flex-col items-center justify-center">
        <span className="fsd-mono text-base font-bold" style={{ color }}>{Math.round(score)}</span>
        <span className="text-[8px] text-[#6B7590] uppercase tracking-wide">Score</span>
      </div>
    </div>
  );
}

function TopPickCard({ result, rank, style }) {
  const isLong = result.direction === "LONG";
  const color = isLong ? "#2F9E6E" : "#D6503A";
  const dec = decimalsFor(result.pair);
  const { sl: slMult, tp: tpMult } = TRADE_STYLES[style];
  const sl = isLong ? result.entry - slMult * result.atr : result.entry + slMult * result.atr;
  const tp = isLong ? result.entry + tpMult * result.atr : result.entry - tpMult * result.atr;
  const pipSize = result.pair.includes("JPY") ? 0.01 : 0.0001;
  const slPips = Math.round((slMult * result.atr) / pipSize);
  const tpPips = Math.round((tpMult * result.atr) / pipSize);
  const crv = (tpMult / slMult).toFixed(2).replace(".", ",");
  // Grobe Haltedauer: Ziel liegt tpMult ATR entfernt; Kurse laufen selten
  // geradlinig, daher Spanne von 1x bis 3x der Ideal-Dauer.
  const minDays = Math.max(1, Math.ceil(tpMult));
  const maxDays = Math.ceil(tpMult * 3);
  return (
    <div className="bg-[#FFFFFF] border border-[#E1E5F0] rounded-xl p-5 flex flex-col gap-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 text-[10px] fsd-mono text-[#8892A8] px-3 py-1 border-r border-b border-[#E1E5F0] rounded-br-lg">
        RANG {rank}
      </div>
      <div className="flex items-start justify-between pt-4">
        <div>
          <div className="fsd-display text-xl font-semibold text-[#1D2433]">{result.pair}</div>
          <div className="flex items-center gap-1.5 mt-1">
            {isLong ? <TrendingUp size={14} color={color} /> : <TrendingDown size={14} color={color} />}
            <span className="fsd-mono text-xs font-semibold tracking-wide" style={{ color }}>{result.direction}</span>
          </div>
        </div>
        <ConvictionDial score={result.composite} direction={result.direction} />
      </div>

      <div>
        <div className="text-[9px] text-[#6B7590] uppercase tracking-wide mb-1">Kursverlauf · 100 Tage</div>
        <Sparkline data={result.spark} dec={dec} height={44} />
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-[#F5F6FA] rounded-lg py-2 border border-[#ECEFF6]">
          <div className="text-[9px] text-[#6B7590] uppercase">Entry</div>
          <div className="fsd-mono text-sm text-[#1D2433]">{result.entry.toFixed(dec)}</div>
        </div>
        <div className="bg-[#F5F6FA] rounded-lg py-2 border border-[#ECEFF6]">
          <div className="text-[9px] text-[#6B7590] uppercase">Stop</div>
          <div className="fsd-mono text-sm text-[#D6503A]">{sl.toFixed(dec)}</div>
          <div className="fsd-mono text-[9px] text-[#8892A8]">−{slPips} Pips</div>
        </div>
        <div className="bg-[#F5F6FA] rounded-lg py-2 border border-[#ECEFF6]">
          <div className="text-[9px] text-[#6B7590] uppercase">Ziel</div>
          <div className="fsd-mono text-sm text-[#2F9E6E]">{tp.toFixed(dec)}</div>
          <div className="fsd-mono text-[9px] text-[#8892A8]">+{tpPips} Pips</div>
        </div>
      </div>

      <div className="flex flex-col gap-2 pt-1 border-t border-[#ECEFF6]">
        <ScoreBar label="Trend" value={result.trendScore} tone="trend" />
        <ScoreBar label="Momentum" value={result.momentumScore} tone="momentum" />
        <ScoreBar label="Volatilität" value={result.volScore} tone="vol" />
      </div>
      <div className="text-[10px] text-[#7B8399] fsd-mono">CRV 1:{crv} · grob {minDays}–{maxDays} Handelstage · Stand {result.lastDate}</div>
    </div>
  );
}

// ---------- Main App ----------
export default function FXSignalDesk() {
  const [apiKey, setApiKey] = useState(() => storageGet("fsd:apiKey") ?? "");
  const [selected, setSelected] = useState(() => storageGet("fsd:watchlist") ?? DEFAULT_SELECTED);
  const [showSettings, setShowSettings] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [progressMsg, setProgressMsg] = useState("");
  const [results, setResults] = useState([]);
  const [error, setError] = useState("");
  const [lastRun, setLastRun] = useState(null);
  const [history, setHistory] = useState(() => storageGet("fsd:history") ?? []);
  const [tradeStyle, setTradeStyle] = useState(() => {
    const s = storageGet("fsd:tradeStyle");
    return TRADE_STYLES[s] ? s : "swing";
  });

  const changeTradeStyle = (key) => {
    setTradeStyle(key);
    storageSet("fsd:tradeStyle", key);
  };

  useEffect(() => { pruneOldCaches(); }, []);

  const saveSettings = useCallback((key, list) => {
    storageSet("fsd:apiKey", key);
    storageSet("fsd:watchlist", list);
  }, []);

  const toggleSymbol = (pair) => {
    const next = selected.includes(pair) ? selected.filter((p) => p !== pair) : [...selected, pair];
    setSelected(next);
    saveSettings(apiKey, next);
  };

  const runAnalysis = async () => {
    if (!apiKey) { setError("Bitte zuerst einen Alpha-Vantage-API-Key eintragen."); return; }
    if (selected.length === 0) { setError("Bitte mindestens ein Instrument auswählen."); return; }
    setError("");
    setAnalyzing(true);
    setResults([]);
    const collected = [];
    const instruments = UNIVERSE.filter((u) => selected.includes(u.pair));

    for (let i = 0; i < instruments.length; i++) {
      const inst = instruments[i];
      setProgressMsg(`Analysiere ${inst.pair} (${i + 1}/${instruments.length})...`);
      try {
        const cacheKey = `fsd:cache:${inst.pair}:${todayKey()}`;
        let candles = storageGet(cacheKey);

        if (!candles) {
          candles = await fetchFXDaily(inst.from, inst.to, apiKey);
          storageSet(cacheKey, candles);
          if (i < instruments.length - 1) {
            setProgressMsg(`${inst.pair} geladen. Warte auf Rate-Limit (${instruments.length - i - 1} verbleibend)...`);
            await sleep(13000);
          }
        }
        if (candles.length < 26) throw new Error(`Zu wenig Historie für ${inst.pair}`);
        collected.push(analyzePair(candles, inst.pair));
      } catch (e) {
        setError((prev) => (prev ? prev + " · " + e.message : e.message));
      }
    }

    collected.sort((a, b) => b.composite - a.composite);
    setResults(collected);
    if (collected.length > 0) {
      const entry = {
        date: todayKey(),
        scores: Object.fromEntries(collected.map((r) => [r.pair, { c: Math.round(r.composite * 10) / 10, d: r.direction }])),
      };
      const nextHistory = [...history.filter((h) => h.date !== entry.date), entry]
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-90);
      setHistory(nextHistory);
      storageSet("fsd:history", nextHistory);
    }
    setLastRun(new Date());
    setProgressMsg("");
    setAnalyzing(false);
  };

  const top3 = results.slice(0, 3);
  const rest = results.slice(3);
  const historyPairs = UNIVERSE.map((u) => u.pair).filter((p) => history.some((h) => h.scores[p]));

  return (
    <div className="fsd-root min-h-screen bg-[#F7F8FC] text-[#1D2433] pb-16">
      {/* Header */}
      <div className="border-b border-[#ECEFF6] sticky top-0 bg-[#F7F8FC]/95 backdrop-blur z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio size={20} color="#E0A458" />
            <div>
              <div className="fsd-display text-lg font-semibold leading-none">FX Signal Desk</div>
              <div className="text-[11px] text-[#7B8399] mt-0.5">Regelbasierte Tages-Analyse · Forex</div>
            </div>
          </div>
          <button
            onClick={() => setShowSettings((s) => !s)}
            className="p-2 rounded-lg border border-[#E1E5F0] hover:bg-[#F0F2F8] transition-colors"
          >
            <Settings2 size={16} color="#6B7590" />
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4">
        {/* Disclaimer */}
        <div className="mt-4 flex items-start gap-2 bg-[#FFF6E9] border border-[#F0DBAE] rounded-lg px-3 py-2.5">
          <AlertTriangle size={14} color="#C9862E" className="mt-0.5 shrink-0" />
          <p className="text-[11px] text-[#8A6420] leading-relaxed">
            Bildungs-Werkzeug auf Basis technischer Indikatoren (kostenlose, verzögerte Alpha-Vantage-Daten). Keine Anlageberatung und keine Ausführungsgarantie. Trading birgt Verlustrisiko — triff Entscheidungen eigenverantwortlich.
          </p>
        </div>

        {/* Settings panel */}
        {showSettings && (
          <div className="mt-4 bg-[#FFFFFF] border border-[#E1E5F0] rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="fsd-display text-sm font-semibold">Einstellungen</h3>
              <button onClick={() => setShowSettings(false)}><X size={16} color="#7B8399" /></button>
            </div>

            <label className="text-xs text-[#6B7590] block mb-1.5">Alpha Vantage API-Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); saveSettings(e.target.value, selected); }}
              placeholder="Dein kostenloser API-Key"
              className="w-full bg-[#F5F6FA] border border-[#E1E5F0] rounded-lg px-3 py-2 text-sm fsd-mono outline-none focus:border-[#5B8CFF] mb-1"
            />
            <a href="https://www.alphavantage.co/support/#api-key" target="_blank" rel="noopener noreferrer" className="text-[11px] text-[#5B8CFF] hover:underline flex items-center gap-0.5 mb-4">
              Kostenlosen Key holen <ChevronRight size={12} />
            </a>

            <label className="text-xs text-[#6B7590] block mb-2">Trade-Horizont (Abstand von Stop &amp; Ziel, in ATR)</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
              {Object.entries(TRADE_STYLES).map(([key, s]) => {
                const active = tradeStyle === key;
                return (
                  <button
                    key={key}
                    onClick={() => changeTradeStyle(key)}
                    className="text-left px-3 py-2 rounded-lg border transition-colors"
                    style={active
                      ? { background: "#EAF0FF", borderColor: "#5B8CFF" }
                      : { background: "transparent", borderColor: "#E1E5F0" }}
                  >
                    <div className="text-xs font-semibold" style={{ color: active ? "#2B4FDB" : "#4A5570" }}>{s.label}</div>
                    <div className="text-[10px] text-[#7B8399] mt-0.5">Stop {s.sl.toLocaleString("de-DE")}× · Ziel {s.tp.toLocaleString("de-DE")}× ATR</div>
                    <div className="text-[10px] text-[#7B8399]">{s.desc}</div>
                  </button>
                );
              })}
            </div>

            <label className="text-xs text-[#6B7590] block mb-2">Watchlist (max. Anfragen = Instrumente; Free-Tier: 5/Min, 25/Tag)</label>
            <div className="flex flex-wrap gap-2">
              {UNIVERSE.map((u) => {
                const active = selected.includes(u.pair);
                return (
                  <button
                    key={u.pair}
                    onClick={() => toggleSymbol(u.pair)}
                    className="fsd-mono text-xs px-3 py-1.5 rounded-full border transition-colors"
                    style={active
                      ? { background: "#EAF0FF", borderColor: "#5B8CFF", color: "#2B4FDB" }
                      : { background: "transparent", borderColor: "#E1E5F0", color: "#7B8399" }}
                  >
                    {u.pair}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Run bar */}
        <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div className="text-xs text-[#7B8399]">
            {lastRun ? `Letzter Scan: ${lastRun.toLocaleString("de-DE")}` : "Noch kein Scan durchgeführt."}
          </div>
          <button
            onClick={runAnalysis}
            disabled={analyzing}
            className="flex items-center justify-center gap-2 bg-[#E0A458] hover:bg-[#EAB876] disabled:opacity-50 disabled:cursor-not-allowed text-[#1A1206] font-semibold text-sm px-5 py-2.5 rounded-lg transition-colors"
          >
            <RefreshCw size={15} className={analyzing ? "animate-spin" : ""} />
            {analyzing ? "Analysiere..." : "Markt-Scan starten"}
          </button>
        </div>

        {/* Progress */}
        {analyzing && (
          <div className="mt-3 bg-[#FFFFFF] border border-[#E1E5F0] rounded-lg px-4 py-3">
            <div className="relative h-1 bg-[#ECEFF6] rounded-full overflow-hidden mb-2">
              <div className="fsd-sweep absolute top-0 left-0 h-full w-1/5 bg-[#E0A458] rounded-full" />
            </div>
            <div className="fsd-mono text-xs text-[#6B7590]">{progressMsg}</div>
          </div>
        )}

        {/* Error */}
        {error && !analyzing && (
          <div className="mt-3 flex items-start gap-2 bg-[#FDEEEC] border border-[#F5C6BE] rounded-lg px-3 py-2.5">
            <Info size={14} color="#D6503A" className="mt-0.5 shrink-0" />
            <p className="text-xs text-[#B23A26]">{error}</p>
          </div>
        )}

        {/* Top picks */}
        {top3.length > 0 && (
          <div className="mt-6">
            <h2 className="fsd-display text-sm font-semibold text-[#6B7590] uppercase tracking-wide mb-3">Top {top3.length} Trade-Vorschläge</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {top3.map((r, i) => <TopPickCard key={r.pair} result={r} rank={i + 1} style={tradeStyle} />)}
            </div>
          </div>
        )}

        {/* Full ranking */}
        {rest.length > 0 && (
          <div className="mt-8">
            <h2 className="fsd-display text-sm font-semibold text-[#6B7590] uppercase tracking-wide mb-3">Weitere gescannte Instrumente</h2>
            <div className="bg-[#FFFFFF] border border-[#E1E5F0] rounded-xl overflow-hidden">
              {rest.map((r, i) => (
                <div key={r.pair} className={`flex items-center justify-between px-4 py-3 ${i !== rest.length - 1 ? "border-b border-[#ECEFF6]" : ""}`}>
                  <div className="flex items-center gap-3">
                    <span className="fsd-mono text-xs text-[#8892A8] w-5">{i + 4}</span>
                    <span className="fsd-display text-sm font-medium">{r.pair}</span>
                    <span className="fsd-mono text-[10px]" style={{ color: r.direction === "LONG" ? "#2F9E6E" : "#D6503A" }}>{r.direction}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-24 hidden sm:block">
                      <Sparkline data={r.spark} dec={decimalsFor(r.pair)} height={24} showArea={false} />
                    </div>
                    <span className="fsd-mono text-sm text-[#6B7590] w-8 text-right">{Math.round(r.composite)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Score history */}
        {history.length > 0 && (
          <div className="mt-8">
            <h2 className="fsd-display text-sm font-semibold text-[#6B7590] uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <History size={14} /> Score-Verlauf
            </h2>
            <div className="bg-[#FFFFFF] border border-[#E1E5F0] rounded-xl p-5">
              <ScoreHistoryChart history={history} pairs={historyPairs} />
            </div>
          </div>
        )}

        {/* Empty state */}
        {results.length === 0 && !analyzing && (
          <div className="mt-10 text-center py-12 border border-dashed border-[#E1E5F0] rounded-xl">
            <Radio size={28} color="#D3D8E4" className="mx-auto mb-3" />
            <p className="text-sm text-[#7B8399]">Trage deinen API-Key ein und starte den ersten Scan,<br />um deine Top-Trade-Vorschläge zu sehen.</p>
          </div>
        )}
      </div>
    </div>
  );
}
