import { useState, useEffect } from "react";
import { RefreshCw, TrendingUp, TrendingDown, AlertTriangle, Info, X, ChevronRight, Radio, History, Zap, BookOpen } from "lucide-react";
import { Sparkline, ScoreHistoryChart } from "./Charts.jsx";
import {
  TRADE_STYLES, storageGet, storageSet, storageHas, todayKey, sleep,
  analyzePair, fetchDaily, fetchLiveRatesRobust,
  cacheKeyFor, watchlistKeyFor, historyKeyFor, AV_QUOTA_KEY, TD_QUOTA_KEY, TD_DAILY_LIMIT,
} from "./engine.js";

// ---------- Kleine UI-Bausteine ----------
function ScoreBar({ label, value, tone }) {
  const toneMap = { trend: "#5B8CFF", momentum: "#E0A458", vol: "#3DBB85" };
  return (
    <div className="flex items-center gap-2">
      <span className="fsd-mono text-[10px] text-[#8C96A8] w-20 shrink-0 uppercase tracking-wide">{label}</span>
      <div className="flex-1 h-1.5 bg-[#232B36] rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${value}%`, background: toneMap[tone] }} />
      </div>
      <span className="fsd-mono text-[10px] text-[#B7C0CE] w-7 text-right">{Math.round(value)}</span>
    </div>
  );
}

function ConvictionDial({ score, direction }) {
  const color = direction === "LONG" ? "#3DBB85" : "#E5695A";
  const angle = (score / 100) * 270;
  return (
    <div className="relative w-20 h-20 shrink-0">
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `conic-gradient(${color} ${angle}deg, #232B36 ${angle}deg 270deg, transparent 270deg 360deg)`,
          transform: "rotate(135deg)",
        }}
      />
      <div className="absolute inset-[6px] rounded-full bg-[#1C232D] flex flex-col items-center justify-center">
        <span className="fsd-mono text-base font-bold" style={{ color }}>{Math.round(score)}</span>
        <span className="text-[8px] text-[#8C96A8] uppercase tracking-wide">Score</span>
      </div>
    </div>
  );
}

function TopPickCard({ result, rank, style, live, onLog }) {
  const isLong = result.direction === "LONG";
  const color = isLong ? "#3DBB85" : "#E5695A";
  const dec = result.dec;
  const { sl: slMult, tp: tpMult } = TRADE_STYLES[style];
  const anchor = live ? live.price : result.entry;
  const sl = isLong ? anchor - slMult * result.atr : anchor + slMult * result.atr;
  const tp = isLong ? anchor + tpMult * result.atr : anchor - tpMult * result.atr;
  // Distanz: Forex in Pips, Metalle als absoluter Preis in USD.
  const fmtDist = (d) => (result.pip ? `${Math.round(d / result.pip)} Pips` : `${d.toFixed(dec)} $`);
  const slDist = fmtDist(slMult * result.atr);
  const tpDist = fmtDist(tpMult * result.atr);
  const crv = (tpMult / slMult).toFixed(2).replace(".", ",");
  const minDays = Math.max(1, Math.ceil(tpMult));
  const maxDays = Math.ceil(tpMult * 3);
  return (
    <div className="bg-[#161B22] border border-[#2A3341] rounded-xl p-5 flex flex-col gap-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 text-[10px] fsd-mono text-[#6F7A8C] px-3 py-1 border-r border-b border-[#2A3341] rounded-br-lg">
        RANG {rank}
      </div>
      <div className="flex items-start justify-between pt-4">
        <div>
          <div className="fsd-display text-xl font-semibold text-[#E8ECF2]">{result.pair}</div>
          <div className="flex items-center gap-1.5 mt-1">
            {isLong ? <TrendingUp size={14} color={color} /> : <TrendingDown size={14} color={color} />}
            <span className="fsd-mono text-xs font-semibold tracking-wide" style={{ color }}>{result.direction}</span>
          </div>
        </div>
        <ConvictionDial score={result.composite} direction={result.direction} />
      </div>

      <div>
        <div className="text-[9px] text-[#8C96A8] uppercase tracking-wide mb-1">Kursverlauf · 100 Tage</div>
        <Sparkline data={result.spark} dec={dec} height={44} />
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-[#1C232D] rounded-lg py-2 border border-[#232B36]">
          <div className="text-[9px] text-[#8C96A8] uppercase">Entry</div>
          <div className="fsd-mono text-sm text-[#E8ECF2]">{anchor.toFixed(dec)}</div>
          <div className="fsd-mono text-[9px]" style={{ color: live ? "#47C08D" : "#6F7A8C" }}>
            {live ? `live ${live.at.toLocaleTimeString("de-DE")}` : "Tagesschluss"}
          </div>
        </div>
        <div className="bg-[#1C232D] rounded-lg py-2 border border-[#232B36]">
          <div className="text-[9px] text-[#8C96A8] uppercase">Stop</div>
          <div className="fsd-mono text-sm text-[#E5695A]">{sl.toFixed(dec)}</div>
          <div className="fsd-mono text-[9px] text-[#6F7A8C]">−{slDist}</div>
        </div>
        <div className="bg-[#1C232D] rounded-lg py-2 border border-[#232B36]">
          <div className="text-[9px] text-[#8C96A8] uppercase">Ziel</div>
          <div className="fsd-mono text-sm text-[#3DBB85]">{tp.toFixed(dec)}</div>
          <div className="fsd-mono text-[9px] text-[#6F7A8C]">+{tpDist}</div>
        </div>
      </div>

      <div className="flex flex-col gap-2 pt-1 border-t border-[#232B36]">
        <ScoreBar label="Trend" value={result.trendScore} tone="trend" />
        <ScoreBar label="Momentum" value={result.momentumScore} tone="momentum" />
        <ScoreBar label="Volatilität" value={result.volScore} tone="vol" />
      </div>
      <div className="text-[10px] text-[#7E8899] fsd-mono">CRV 1:{crv} · grob {minDays}–{maxDays} Handelstage · Stand {result.lastDate}</div>
      <button
        onClick={() => onLog({
          instrument: result.pair,
          direction: result.direction,
          entry: anchor.toFixed(dec),
          stop: sl.toFixed(dec),
          target: tp.toFixed(dec),
          scoreAtEntry: String(Math.round(result.composite)),
          style,
        })}
        className="flex items-center justify-center gap-1.5 text-[11px] font-medium py-1.5 rounded-lg border border-[#2A3341] hover:bg-[#1C232D] text-[#B7C0CE] transition-colors"
      >
        <BookOpen size={12} color="#E0A458" /> Ins Journal übernehmen
      </button>
    </div>
  );
}

// ---------- Wiederverwendbare Scan-Ansicht (Forex / Metalle / …) ----------
export default function ScanView({ market, avKey, setAvKey, tdKey, setTdKey, tradeStyle, setTradeStyle, showSettings, setShowSettings, onLogTrade }) {
  const uni = market.universe;
  const provider = market.provider;

  const [selected, setSelected] = useState(() => storageGet(watchlistKeyFor(market)) ?? market.defaultSelected);
  const [analyzing, setAnalyzing] = useState(false);
  const [progressMsg, setProgressMsg] = useState("");
  const [results, setResults] = useState([]);
  const [error, setError] = useState("");
  const [lastRun, setLastRun] = useState(null);
  const [history, setHistory] = useState(() => storageGet(historyKeyFor(market)) ?? []);
  const [liveRates, setLiveRates] = useState({});
  const [liveUpdating, setLiveUpdating] = useState(false);
  const [avUsed, setAvUsed] = useState(() => storageGet(AV_QUOTA_KEY()) ?? 0);
  const [tdUsed, setTdUsed] = useState(() => storageGet(TD_QUOTA_KEY()) ?? 0);

  const quotaUsed = provider === "av" ? avUsed : tdUsed;
  const quotaLimit = market.dailyLimit;

  const bumpAv = () => { const n = (storageGet(AV_QUOTA_KEY()) ?? 0) + 1; storageSet(AV_QUOTA_KEY(), n); setAvUsed(n); };
  const bumpTd = (k) => { const n = (storageGet(TD_QUOTA_KEY()) ?? 0) + k; storageSet(TD_QUOTA_KEY(), n); setTdUsed(n); };

  const toggleSymbol = (pair) => {
    const next = selected.includes(pair) ? selected.filter((p) => p !== pair) : [...selected, pair];
    setSelected(next);
    storageSet(watchlistKeyFor(market), next);
  };

  // Kern-Scan. cacheOnly=true stellt Ergebnisse nur aus dem Tages-Cache her
  // (kein Netz, kein Kontingent) — für automatisches Wiederherstellen beim Reiterwechsel.
  const runAnalysis = async (opts = {}) => {
    const cacheOnly = opts.cacheOnly;
    if (!cacheOnly) {
      if (provider === "av" && !avKey) { setError("Bitte zuerst einen Alpha-Vantage-API-Key eintragen."); return; }
      if (provider === "td" && !tdKey) { setError("Bitte zuerst einen Twelve-Data-API-Key eintragen."); setShowSettings(true); return; }
      if (selected.length === 0) { setError("Bitte mindestens ein Instrument auswählen."); return; }
      setError("");
      setAnalyzing(true);
      setResults([]);
      setLiveRates({});
    }
    const collected = [];
    const instruments = uni.filter((u) => selected.includes(u.pair));

    for (let i = 0; i < instruments.length; i++) {
      const inst = instruments[i];
      if (!cacheOnly) setProgressMsg(`Analysiere ${inst.pair} (${i + 1}/${instruments.length})...`);
      try {
        const ck = cacheKeyFor(market, inst.pair);
        let candles = storageGet(ck);

        if (!candles) {
          if (cacheOnly) continue; // im Cache-Modus nichts nachladen
          if (provider === "av") bumpAv(); else bumpTd(1);
          candles = await fetchDaily(inst, market, { avKey, tdKey });
          storageSet(ck, candles);
          if (i < instruments.length - 1) {
            setProgressMsg(`${inst.pair} geladen. Warte auf Rate-Limit (${instruments.length - i - 1} verbleibend)...`);
            await sleep(market.reqDelayMs);
          }
        }
        if (candles.length < 26) throw new Error(`Zu wenig Historie für ${inst.pair}`);
        collected.push(analyzePair(candles, inst));
      } catch (e) {
        if (!cacheOnly) setError((prev) => (prev ? prev + " · " + e.message : e.message));
      }
    }

    collected.sort((a, b) => b.composite - a.composite);
    if (cacheOnly && collected.length === 0) return; // nichts im Cache → Empty-State behalten
    setResults(collected);
    if (collected.length > 0 && !cacheOnly) {
      const entry = {
        date: todayKey(),
        scores: Object.fromEntries(collected.map((r) => [r.pair, { c: Math.round(r.composite * 10) / 10, d: r.direction }])),
      };
      const nextHistory = [...history.filter((h) => h.date !== entry.date), entry]
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-90);
      setHistory(nextHistory);
      storageSet(historyKeyFor(market), nextHistory);
    }
    if (!cacheOnly) {
      setLastRun(new Date());
      setProgressMsg("");
      setAnalyzing(false);
    }
  };

  // Beim Öffnen des Reiters Ergebnisse aus dem Tages-Cache wiederherstellen.
  useEffect(() => { runAnalysis({ cacheOnly: true }); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const refreshLive = async () => {
    if (!tdKey) {
      setError("Für Live-Kurse bitte zuerst einen Twelve-Data-API-Key in den Einstellungen eintragen.");
      setShowSettings(true);
      return;
    }
    if (results.length === 0 || liveUpdating) return;
    setError("");
    setLiveUpdating(true);
    try {
      const pairs = results.map((r) => r.pair).slice(0, 8); // Free-Tier: max. 8/Min
      bumpTd(pairs.length);
      const rates = await fetchLiveRatesRobust(pairs, tdKey);
      setLiveRates((prev) => ({ ...prev, ...rates }));
    } catch (e) {
      setError(e.message);
    }
    setLiveUpdating(false);
  };

  const top3 = results.slice(0, 3);
  const rest = results.slice(3);
  const historyPairs = uni.map((u) => u.pair).filter((p) => history.some((h) => h.scores[p]));

  const remaining = Math.max(0, quotaLimit - quotaUsed);
  const nextScanNeeds = selected.filter((p) => !storageHas(cacheKeyFor(market, p))).length;
  const low = remaining < nextScanNeeds;

  return (
    <>
      {/* Disclaimer */}
      <div className="mt-4 flex items-start gap-2 bg-[#2A2113] border border-[#4D3B17] rounded-lg px-3 py-2.5">
        <AlertTriangle size={14} color="#E3A94F" className="mt-0.5 shrink-0" />
        <p className="text-[11px] text-[#D9B36A] leading-relaxed">
          Bildungs-Werkzeug auf Basis technischer Indikatoren ({market.dataNote}). Keine Anlageberatung und keine Ausführungsgarantie. Trading birgt Verlustrisiko — triff Entscheidungen eigenverantwortlich.
        </p>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="mt-4 bg-[#161B22] border border-[#2A3341] rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="fsd-display text-sm font-semibold">Einstellungen</h3>
            <button onClick={() => setShowSettings(false)}><X size={16} color="#7E8899" /></button>
          </div>

          {provider === "av" && (
            <>
              <label className="text-xs text-[#8C96A8] block mb-1.5">Alpha Vantage API-Key (Forex-Datenquelle)</label>
              <input
                type="password"
                value={avKey}
                onChange={(e) => setAvKey(e.target.value)}
                placeholder="Dein kostenloser API-Key"
                className="w-full bg-[#1C232D] border border-[#2A3341] rounded-lg px-3 py-2 text-sm fsd-mono outline-none focus:border-[#5B8CFF] mb-1"
              />
              <a href="https://www.alphavantage.co/support/#api-key" target="_blank" rel="noopener noreferrer" className="text-[11px] text-[#5B8CFF] hover:underline flex items-center gap-0.5 mb-4">
                Kostenlosen Key holen <ChevronRight size={12} />
              </a>
            </>
          )}

          <label className="text-xs text-[#8C96A8] block mb-1.5">
            Twelve Data API-Key {provider === "td" ? "(Datenquelle & Live-Kurse)" : "(optional — für Live-Kurse)"}
          </label>
          <input
            type="password"
            value={tdKey}
            onChange={(e) => setTdKey(e.target.value)}
            placeholder={provider === "td" ? "Erforderlich für Metalle" : "Optionaler zweiter Key für Live-Entries"}
            className="w-full bg-[#1C232D] border border-[#2A3341] rounded-lg px-3 py-2 text-sm fsd-mono outline-none focus:border-[#5B8CFF] mb-1"
          />
          <a href="https://twelvedata.com/register" target="_blank" rel="noopener noreferrer" className="text-[11px] text-[#5B8CFF] hover:underline flex items-center gap-0.5 mb-4">
            Kostenlosen Key holen (800 Anfragen/Tag) <ChevronRight size={12} />
          </a>

          <label className="text-xs text-[#8C96A8] block mb-2">Trade-Horizont (Abstand von Stop &amp; Ziel, in ATR)</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
            {Object.entries(TRADE_STYLES).map(([key, s]) => {
              const active = tradeStyle === key;
              return (
                <button
                  key={key}
                  onClick={() => setTradeStyle(key)}
                  className="text-left px-3 py-2 rounded-lg border transition-colors"
                  style={active
                    ? { background: "#1D2B4A", borderColor: "#5B8CFF" }
                    : { background: "transparent", borderColor: "#2A3341" }}
                >
                  <div className="text-xs font-semibold" style={{ color: active ? "#9DB8FF" : "#B7C0CE" }}>{s.label}</div>
                  <div className="text-[10px] text-[#7E8899] mt-0.5">Stop {s.sl.toLocaleString("de-DE")}× · Ziel {s.tp.toLocaleString("de-DE")}× ATR</div>
                  <div className="text-[10px] text-[#7E8899]">{s.desc}</div>
                </button>
              );
            })}
          </div>

          {tradeStyle === "scalp" && (
            <div className="flex items-start gap-2 bg-[#2A2113] border border-[#4D3B17] rounded-lg px-3 py-2 mb-4">
              <AlertTriangle size={13} color="#E3A94F" className="mt-0.5 shrink-0" />
              <p className="text-[10px] text-[#D9B36A] leading-relaxed">
                Scalping-Hinweis: Die Analyse basiert auf <strong>Tageskerzen</strong> — echtes Sekunden-/Minuten-Scalping bräuchte Intraday-Daten. Die Level sind hier sehr eng, dadurch fallen Spread &amp; Slippage deutlich stärker ins Gewicht.
              </p>
            </div>
          )}

          <label className="text-xs text-[#8C96A8] block mb-2">Watchlist ({market.watchlistNote})</label>
          <div className="flex flex-wrap gap-2">
            {uni.map((u) => {
              const active = selected.includes(u.pair);
              return (
                <button
                  key={u.pair}
                  onClick={() => toggleSymbol(u.pair)}
                  title={u.name || u.pair}
                  className="fsd-mono text-xs px-3 py-1.5 rounded-full border transition-colors"
                  style={active
                    ? { background: "#1D2B4A", borderColor: "#5B8CFF", color: "#9DB8FF" }
                    : { background: "transparent", borderColor: "#2A3341", color: "#7E8899" }}
                >
                  {u.pair}{u.name ? ` · ${u.name}` : ""}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Run bar */}
      <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="text-xs text-[#7E8899]">
          <div>{lastRun ? `Letzter Scan: ${lastRun.toLocaleString("de-DE")}` : "Noch kein Scan durchgeführt."}</div>
          <div className="mt-0.5">
            API-Anfragen heute: <span className="fsd-mono" style={{ color: low ? "#E3A94F" : "#B7C0CE" }}>{quotaUsed}/{quotaLimit}</span>
            {" · "}noch <span className="fsd-mono" style={{ color: low ? "#E3A94F" : "#B7C0CE" }}>{remaining}</span> übrig (geschätzt)
            {nextScanNeeds > 0 && <> · nächster Scan braucht bis zu <span className="fsd-mono">{nextScanNeeds}</span></>}
            {nextScanNeeds === 0 && selected.length > 0 && <> · nächster Scan läuft komplett aus dem Tages-Cache</>}
          </div>
          {low && (
            <div className="mt-0.5 text-[#E3A94F]">Achtung: Das Tageslimit reicht evtl. nicht für alle gewählten Instrumente.</div>
          )}
        </div>
        <button
          onClick={() => runAnalysis()}
          disabled={analyzing}
          className="flex items-center justify-center gap-2 bg-[#E0A458] hover:bg-[#EAB876] disabled:opacity-50 disabled:cursor-not-allowed text-[#1A1206] font-semibold text-sm px-5 py-2.5 rounded-lg transition-colors"
          style={{ boxShadow: "0 0 24px rgba(224,164,88,0.25)" }}
        >
          <RefreshCw size={15} className={analyzing ? "animate-spin" : ""} />
          {analyzing ? "Analysiere..." : "Markt-Scan starten"}
        </button>
      </div>

      {/* Progress */}
      {analyzing && (
        <div className="mt-3 bg-[#161B22] border border-[#2A3341] rounded-lg px-4 py-3">
          <div className="relative h-1 bg-[#232B36] rounded-full overflow-hidden mb-2">
            <div className="fsd-sweep absolute top-0 left-0 h-full w-1/5 bg-[#E0A458] rounded-full" />
          </div>
          <div className="fsd-mono text-xs text-[#8C96A8]">{progressMsg}</div>
        </div>
      )}

      {/* Error */}
      {error && !analyzing && (
        <div className="mt-3 flex items-start gap-2 bg-[#2C1613] border border-[#5A2A22] rounded-lg px-3 py-2.5">
          <Info size={14} color="#E5695A" className="mt-0.5 shrink-0" />
          <p className="text-xs text-[#F09383]">{error}</p>
        </div>
      )}

      {/* Top picks */}
      {top3.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <h2 className="fsd-display text-sm font-semibold text-[#8C96A8] uppercase tracking-wide">Top {top3.length} Trade-Vorschläge</h2>
            <div className="flex items-center gap-2">
              {tdUsed > 0 && (
                <span className="fsd-mono text-[10px] text-[#6F7A8C]">{tdUsed}/{TD_DAILY_LIMIT} heute</span>
              )}
              <button
                onClick={refreshLive}
                disabled={liveUpdating}
                className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-lg border border-[#2A3341] hover:bg-[#1C232D] text-[#B7C0CE] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Zap size={12} color="#E0A458" />
                {liveUpdating ? "Hole Live-Kurse..." : "Live-Kurse holen"}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {top3.map((r, i) => <TopPickCard key={r.pair} result={r} rank={i + 1} style={tradeStyle} live={liveRates[r.pair]} onLog={onLogTrade} />)}
          </div>
        </div>
      )}

      {/* Full ranking */}
      {rest.length > 0 && (
        <div className="mt-8">
          <h2 className="fsd-display text-sm font-semibold text-[#8C96A8] uppercase tracking-wide mb-3">Weitere gescannte Instrumente</h2>
          <div className="bg-[#161B22] border border-[#2A3341] rounded-xl overflow-hidden">
            {rest.map((r, i) => (
              <div key={r.pair} className={`flex items-center justify-between px-4 py-3 ${i !== rest.length - 1 ? "border-b border-[#232B36]" : ""}`}>
                <div className="flex items-center gap-3">
                  <span className="fsd-mono text-xs text-[#6F7A8C] w-5">{i + 4}</span>
                  <span className="fsd-display text-sm font-medium">{r.pair}</span>
                  <span className="fsd-mono text-[10px]" style={{ color: r.direction === "LONG" ? "#3DBB85" : "#E5695A" }}>{r.direction}</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-24 hidden sm:block">
                    <Sparkline data={r.spark} dec={r.dec} height={24} showArea={false} />
                  </div>
                  <span className="fsd-mono text-sm text-[#8C96A8] w-8 text-right">{Math.round(r.composite)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Score history */}
      {history.length > 0 && (
        <div className="mt-8">
          <h2 className="fsd-display text-sm font-semibold text-[#8C96A8] uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <History size={14} /> Score-Verlauf
          </h2>
          <div className="bg-[#161B22] border border-[#2A3341] rounded-xl p-5">
            <ScoreHistoryChart history={history} pairs={historyPairs} />
          </div>
        </div>
      )}

      {/* Empty state */}
      {results.length === 0 && !analyzing && (
        <div className="mt-10 text-center py-12 border border-dashed border-[#2A3341] rounded-xl">
          <Radio size={28} color="#2E3947" className="mx-auto mb-3" />
          <p className="text-sm text-[#7E8899]">Trage deinen {market.keyName} ein und starte den ersten Scan,<br />um deine Top-Trade-Vorschläge zu sehen.</p>
        </div>
      )}
    </>
  );
}
