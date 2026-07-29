import { useState } from "react";
import { FlaskConical, AlertTriangle, Info } from "lucide-react";
import { Sparkline } from "./Charts.jsx";
import {
  TRADE_STYLES, storageGet, storageSet, sleep,
  fetchDailyFull, runBacktest, backtestCacheKey, AV_QUOTA_KEY, TD_QUOTA_KEY, ADX_WEAK,
  weekdayOf, WEEKDAY_NAMES,
} from "./engine.js";

function summarize(trades) {
  const n = trades.length;
  const wins = trades.filter((t) => t.win).length;
  const rs = trades.map((t) => t.r);
  const totalR = rs.reduce((a, b) => a + b, 0);
  return { n, winRate: n ? (wins / n) * 100 : null, avgR: n ? totalR / n : null, totalR };
}

// Score-Schwelle für den Strategie-Vergleich (entspricht grob den Top-Vorschlägen).
const MIN_SCORE = 70;

const SCORE_BUCKETS = [
  { key: "85+", test: (s) => s >= 85 },
  { key: "70–84", test: (s) => s >= 70 && s < 85 },
  { key: "50–69", test: (s) => s >= 50 && s < 70 },
  { key: "< 50", test: (s) => s < 50 },
];

const fmtR = (r) => (r == null ? "—" : `${r >= 0 ? "+" : ""}${r.toFixed(2)}R`);
const rColor = (r) => (r == null ? "#6F7A8C" : r >= 0 ? "#3DBB85" : "#E5695A");

function StatTile({ label, value, sub, color }) {
  return (
    <div className="bg-[#161B22] border border-[#2A3341] rounded-xl px-4 py-3">
      <div className="text-[10px] text-[#8C96A8] uppercase tracking-wide">{label}</div>
      <div className="fsd-mono text-2xl font-bold mt-0.5" style={{ color: color || "#E8ECF2" }}>{value}</div>
      {sub && <div className="text-[10px] text-[#7E8899] mt-0.5">{sub}</div>}
    </div>
  );
}

function Table({ title, subtitle, rows }) {
  if (!rows.length) return null;
  return (
    <div className="bg-[#161B22] border border-[#2A3341] rounded-xl p-5">
      <h3 className="fsd-display text-sm font-semibold text-[#E8ECF2]">{title}</h3>
      {subtitle && <div className="text-[10px] text-[#7E8899] mt-0.5 mb-2">{subtitle}</div>}
      <div className="overflow-x-auto fsd-scrollbar mt-2">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-left text-[#8C96A8] border-b border-[#232B36]">
              <th className="py-1.5 pr-3 font-medium">Kategorie</th>
              <th className="py-1.5 pr-3 font-medium text-right">Trades</th>
              <th className="py-1.5 pr-3 font-medium text-right">Trefferquote</th>
              <th className="py-1.5 font-medium text-right">Ø R</th>
            </tr>
          </thead>
          <tbody className="fsd-mono">
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-[#232B36] last:border-0">
                <td className="py-1.5 pr-3 text-[#E8ECF2]">{r.key}</td>
                <td className="py-1.5 pr-3 text-right text-[#B7C0CE]">{r.n}</td>
                <td className="py-1.5 pr-3 text-right text-[#B7C0CE]">{r.winRate == null ? "—" : `${Math.round(r.winRate)} %`}</td>
                <td className="py-1.5 text-right" style={{ color: rColor(r.avgR) }}>{fmtR(r.avgR)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Backtest({ market, avKey, tdKey, tradeStyle, selected }) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const provider = market.provider;
  const instruments = market.universe.filter((u) => selected.includes(u.pair));

  const bump = () => {
    const key = provider === "av" ? AV_QUOTA_KEY() : TD_QUOTA_KEY();
    storageSet(key, (storageGet(key) ?? 0) + 1);
  };

  const run = async () => {
    if (provider === "av" && !avKey) { setError("Für den Forex-Backtest bitte einen Alpha-Vantage-Key in den Einstellungen eintragen."); return; }
    if (provider === "td" && !tdKey) { setError("Für den Metalle-Backtest bitte einen Twelve-Data-Key in den Einstellungen eintragen."); return; }
    if (instruments.length === 0) { setError("Bitte mindestens ein Instrument in der Watchlist wählen."); return; }
    setError(""); setRunning(true); setResult(null);

    const allTrades = [];
    const baselineTrades = [];   // jedes Signal, Score ohne Regime-Anteil
    const adxTrades = [];        // nur ab ADX-Schwelle
    const scoreTrades = [];      // nur ab Score-Schwelle
    const bothTrades = [];       // beide Filter kombiniert
    let skippedTotal = 0;
    const perInstrument = [];
    for (let idx = 0; idx < instruments.length; idx++) {
      const inst = instruments[idx];
      setProgress(`${inst.pair} (${idx + 1}/${instruments.length})…`);
      try {
        const ck = backtestCacheKey(market, inst.pair);
        let candles = storageGet(ck);
        if (!candles) {
          bump();
          candles = await fetchDailyFull(inst, market, { avKey, tdKey });
          storageSet(ck, candles);
          if (idx < instruments.length - 1) {
            setProgress(`${inst.pair} geladen. Warte auf Rate-Limit…`);
            await sleep(market.reqDelayMs);
          }
        }
        if (candles.length < 80) { setError((p) => (p ? p + " · " : "") + `${inst.pair}: zu wenig Historie`); continue; }
        const trades = runBacktest(candles, tradeStyle, inst);
        allTrades.push(...trades);
        perInstrument.push({ key: inst.pair, ...summarize(trades) });
        baselineTrades.push(...runBacktest(candles, tradeStyle, inst, { useAdx: false }));
        const adxOnly = runBacktest(candles, tradeStyle, inst, { minAdx: ADX_WEAK });
        adxTrades.push(...adxOnly);
        skippedTotal += adxOnly.skipped || 0;
        scoreTrades.push(...runBacktest(candles, tradeStyle, inst, { minScore: MIN_SCORE }));
        bothTrades.push(...runBacktest(candles, tradeStyle, inst, { minAdx: ADX_WEAK, minScore: MIN_SCORE }));
      } catch (e) {
        setError((p) => (p ? p + " · " : "") + e.message);
      }
    }

    const overall = summarize(allTrades);
    const byScore = SCORE_BUCKETS.map((b) => {
      const t = allTrades.filter((x) => b.test(x.score));
      return { key: b.key, ...summarize(t) };
    }).filter((r) => r.n > 0);

    // Equity-Kurve: alle Trades chronologisch nach Ausstieg, kumuliertes R
    const seq = allTrades.slice().sort((a, b) => (a.exitDate || "").localeCompare(b.exitDate || ""));
    let acc = 0;
    const equity = seq.map((t) => ({ date: t.exitDate, close: (acc += t.r) }));

    const variants = [
      { key: "Jedes Signal (Basis)", ...summarize(baselineTrades) },
      { key: `Nur bei Trendstärke ADX ≥ ${ADX_WEAK}`, ...summarize(adxTrades) },
      { key: `Nur bei Score ≥ ${MIN_SCORE}`, ...summarize(scoreTrades) },
      { key: `Score ≥ ${MIN_SCORE} + ADX ≥ ${ADX_WEAK}`, ...summarize(bothTrades) },
    ];

    const byWeekday = [1, 2, 3, 4, 5, 0, 6]
      .map((wd) => ({ key: WEEKDAY_NAMES[wd], ...summarize(allTrades.filter((t) => weekdayOf(t.entryDate) === wd)) }))
      .filter((r) => r.n > 0);

    setResult({ overall, byScore, perInstrument: perInstrument.sort((a, b) => b.n - a.n), byWeekday, equity, variants, skippedTotal, style: tradeStyle });
    setProgress("");
    setRunning(false);
  };

  const s = result?.overall;

  return (
    <div className="mt-4 flex flex-col gap-4 pb-4">
      <div className="bg-[#161B22] border border-[#2A3341] rounded-xl p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="fsd-display text-sm font-semibold flex items-center gap-2">
              <FlaskConical size={15} color="#E0A458" /> Historischer Backtest
            </h3>
            <p className="text-[11px] text-[#7E8899] mt-1 max-w-xl leading-relaxed">
              Simuliert die aktuelle Strategie (Horizont: <strong>{TRADE_STYLES[tradeStyle].label}</strong>) über die vergangenen ~800 Tageskerzen deiner Watchlist — ohne Zukunfts-Blick. Lädt dafür einmal pro Tag die volle Historie ({instruments.length} Instrument{instruments.length === 1 ? "" : "e"} = {instruments.length} API-Anfrage{instruments.length === 1 ? "" : "n"}).
            </p>
          </div>
          <button
            onClick={run}
            disabled={running}
            className="flex items-center justify-center gap-2 bg-[#E0A458] hover:bg-[#EAB876] disabled:opacity-50 disabled:cursor-not-allowed text-[#1A1206] font-semibold text-sm px-5 py-2.5 rounded-lg transition-colors shrink-0"
            style={{ boxShadow: "0 0 24px rgba(224,164,88,0.25)" }}
          >
            <FlaskConical size={15} /> {running ? "Läuft…" : "Backtest starten"}
          </button>
        </div>
        {running && (
          <div className="mt-3">
            <div className="relative h-1 bg-[#232B36] rounded-full overflow-hidden mb-2">
              <div className="fsd-sweep absolute top-0 left-0 h-full w-1/5 bg-[#E0A458] rounded-full" />
            </div>
            <div className="fsd-mono text-xs text-[#8C96A8]">{progress}</div>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-[#2C1613] border border-[#5A2A22] rounded-lg px-3 py-2.5">
          <Info size={14} color="#E5695A" className="mt-0.5 shrink-0" />
          <p className="text-xs text-[#F09383]">{error}</p>
        </div>
      )}

      {s && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile label="Trades gesamt" value={s.n} sub="über alle Instrumente" />
            <StatTile label="Trefferquote" value={s.winRate == null ? "—" : `${Math.round(s.winRate)} %`} color={s.winRate == null ? undefined : s.winRate >= 50 ? "#3DBB85" : "#E5695A"} />
            <StatTile label="Erwartungswert" value={fmtR(s.avgR)} sub="Ø R pro Trade" color={rColor(s.avgR)} />
            <StatTile label="Summe" value={fmtR(s.totalR)} sub="kumuliertes R" color={rColor(s.totalR)} />
          </div>

          {result.equity.length >= 2 && (
            <div className="bg-[#161B22] border border-[#2A3341] rounded-xl p-5">
              <h3 className="fsd-display text-sm font-semibold text-[#E8ECF2] mb-1">Equity-Kurve (kumuliertes R)</h3>
              <div className="text-[10px] text-[#7E8899] mb-2">Summe aller simulierten Ergebnisse über die Zeit</div>
              <Sparkline data={result.equity} dec={2} height={70} />
            </div>
          )}

          <Table
            title="Strategie-Vergleich (A/B)"
            subtitle={`Dieselben Daten, vier Varianten — höherer Ø R = besser. Weniger Trades bei besserem Ø R bedeutet: der Filter sortiert die schlechten Signale aus. (ADX-Filter übersprang ${result.skippedTotal} Signal${result.skippedTotal === 1 ? "" : "e"}.)`}
            rows={result.variants}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Table title="Nach Score-Klasse" subtitle="Steigt Trefferquote/Ø R mit dem Score, hat der Score Vorhersagewert." rows={result.byScore} />
            <Table title="Nach Instrument" rows={result.perInstrument} />
          </div>

          <Table title="Nach Einstiegs-Wochentag" subtitle="Nur aussagekräftig, wenn je Tag genügend Trades zusammenkommen." rows={result.byWeekday} />

          <div className="flex items-start gap-2 bg-[#2A2113] border border-[#4D3B17] rounded-lg px-3 py-2.5">
            <AlertTriangle size={14} color="#E3A94F" className="mt-0.5 shrink-0" />
            <p className="text-[11px] text-[#D9B36A] leading-relaxed">
              Wichtig: Der Backtest ignoriert <strong>Spread, Slippage und Gebühren</strong> (gerade bei Scalping stark verzerrend), nutzt nur Tageskerzen und ein begrenztes Zeitfenster. <strong>Vergangene Ergebnisse sind keine Garantie für die Zukunft.</strong> Der Wert liegt im Vergleich — ob eine Änderung die Kennzahlen verbessert —, nicht in der absoluten Zahl.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
