import { useState } from "react";
import { Clock, AlertTriangle, Info } from "lucide-react";
import {
  FOREX_UNIVERSE, METALS_UNIVERSE, storageGet, storageSet, sleep,
  fetchHourly, runHourlyBacktest, hourProfile, todayKey, WEEKDAY_NAMES,
  TD_QUOTA_KEY, TD_DAILY_LIMIT,
} from "./engine.js";

const UNIVERSE = [...FOREX_UNIVERSE, ...METALS_UNIVERSE];
const SEL_KEY = "fsd:hours:selection";
const hourCacheKey = (pair) => `fsd:hours:cache:${pair}:${todayKey()}`;

// Handelssessions in deutscher Zeit (Winterzeit-Näherung; im Sommer ±1 h).
const SESSIONS = [
  { label: "Asien", from: 1, to: 9, color: "#9085e9" },
  { label: "London", from: 9, to: 17, color: "#3987e5" },
  { label: "New York", from: 14, to: 23, color: "#3DBB85" },
];

const fmtR = (r) => (r == null ? "—" : `${r >= 0 ? "+" : ""}${r.toFixed(2)}R`);
const rColor = (r) => (r == null ? "#6F7A8C" : r >= 0 ? "#3DBB85" : "#E5695A");

function summarize(trades) {
  const n = trades.length;
  if (!n) return { n: 0, winRate: null, avgR: null };
  const wins = trades.filter((t) => t.win).length;
  return { n, winRate: (wins / n) * 100, avgR: trades.reduce((a, b) => a + b.r, 0) / n };
}

// ---------- Balkendiagramm je Tagesstunde ----------
function HourChart({ rows, valueKey, label, formatValue, colorFor }) {
  const [hi, setHi] = useState(null);
  const W = 720, H = 190, padL = 38, padR = 8, padT = 12, padB = 34;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const vals = rows.map((r) => r[valueKey]).filter((v) => v != null);
  if (!vals.length) return null;
  const maxV = Math.max(...vals, 0);
  const minV = Math.min(...vals, 0);
  const span = maxV - minV || 1;
  const y0 = padT + (maxV / span) * plotH; // Nulllinie
  const bw = plotW / 24;

  return (
    <div className="relative" onPointerLeave={() => setHi(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="block">
        {/* Session-Bänder */}
        {SESSIONS.map((s) => (
          <rect key={s.label} x={padL + s.from * bw} y={padT} width={(s.to - s.from) * bw} height={plotH}
            fill={s.color} opacity="0.07" />
        ))}
        {/* Nulllinie / Basis */}
        <line x1={padL} y1={y0} x2={W - padR} y2={y0} stroke="#3A4553" strokeWidth="1" />
        <text x={padL - 6} y={padT + 4} textAnchor="end" fontSize="9" fill="#6F7A8C" fontFamily="'JetBrains Mono', monospace">{formatValue(maxV)}</text>
        {minV < 0 && <text x={padL - 6} y={padT + plotH} textAnchor="end" fontSize="9" fill="#6F7A8C" fontFamily="'JetBrains Mono', monospace">{formatValue(minV)}</text>}
        {/* Balken */}
        {rows.map((r) => {
          const v = r[valueKey];
          if (v == null) return null;
          const h = (Math.abs(v) / span) * plotH;
          const y = v >= 0 ? y0 - h : y0;
          return (
            <g key={r.hour} onPointerEnter={() => setHi(r.hour)}>
              <rect x={padL + r.hour * bw} y={padT} width={bw} height={plotH} fill="transparent" />
              <rect x={padL + r.hour * bw + 1.5} y={y} width={bw - 3} height={Math.max(1, h)} rx="2"
                fill={colorFor(v)} opacity={hi == null || hi === r.hour ? 1 : 0.45} />
            </g>
          );
        })}
        {/* Stunden-Achse (alle 3 h) */}
        {rows.filter((r) => r.hour % 3 === 0).map((r) => (
          <text key={r.hour} x={padL + r.hour * bw + bw / 2} y={H - 16} textAnchor="middle" fontSize="9" fill="#6F7A8C" fontFamily="'JetBrains Mono', monospace">{String(r.hour).padStart(2, "0")}</text>
        ))}
        <text x={padL + plotW / 2} y={H - 3} textAnchor="middle" fontSize="9" fill="#7E8899">Tagesstunde (deutsche Zeit)</text>
      </svg>
      {hi != null && rows[hi] && rows[hi][valueKey] != null && (
        <div className="absolute top-0 right-0 bg-[#232B36] rounded px-2 py-1 pointer-events-none">
          <span className="fsd-mono text-[10px] text-white">
            {String(hi).padStart(2, "0")}:00 · {label}: {formatValue(rows[hi][valueKey])}
            {rows[hi].n != null ? ` · ${rows[hi].n} Trades` : ""}
          </span>
        </div>
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
      {SESSIONS.map((s) => (
        <div key={s.label} className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm" style={{ background: s.color, opacity: 0.35 }} />
          <span className="text-[10px] text-[#7E8899]">{s.label} ({String(s.from).padStart(2, "0")}–{String(s.to).padStart(2, "0")} Uhr)</span>
        </div>
      ))}
    </div>
  );
}

function Table({ title, subtitle, rows, firstCol }) {
  if (!rows.length) return null;
  return (
    <div className="bg-[#161B22] border border-[#2A3341] rounded-xl p-5">
      <h3 className="fsd-display text-sm font-semibold text-[#E8ECF2]">{title}</h3>
      {subtitle && <div className="text-[10px] text-[#7E8899] mt-0.5">{subtitle}</div>}
      <div className="overflow-x-auto fsd-scrollbar mt-2">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-left text-[#8C96A8] border-b border-[#232B36]">
              <th className="py-1.5 pr-3 font-medium">{firstCol}</th>
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

export default function HourAnalysis({ tdKey }) {
  const [selected, setSelected] = useState(() => storageGet(SEL_KEY) ?? ["EUR/USD", "GBP/USD"]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const toggle = (pair) => {
    const next = selected.includes(pair) ? selected.filter((p) => p !== pair) : [...selected, pair];
    setSelected(next);
    storageSet(SEL_KEY, next);
  };

  const run = async () => {
    if (!tdKey) { setError("Für die Handelszeiten-Analyse wird ein Twelve-Data-Key benötigt (Einstellungen im Forex- oder Metalle-Reiter)."); return; }
    if (!selected.length) { setError("Bitte mindestens ein Instrument auswählen."); return; }
    setError(""); setRunning(true); setResult(null);

    const instruments = UNIVERSE.filter((u) => selected.includes(u.pair));
    const allTrades = [];
    const profileSum = new Array(24).fill(0), profileCnt = new Array(24).fill(0);
    let bars = 0, von = null, bis = null;

    for (let idx = 0; idx < instruments.length; idx++) {
      const inst = instruments[idx];
      setProgress(`${inst.pair} (${idx + 1}/${instruments.length})…`);
      try {
        const ck = hourCacheKey(inst.pair);
        let candles = storageGet(ck);
        if (!candles) {
          const qk = TD_QUOTA_KEY();
          storageSet(qk, (storageGet(qk) ?? 0) + 1);
          candles = await fetchHourly(inst, tdKey);
          storageSet(ck, candles);
          if (idx < instruments.length - 1) { setProgress(`${inst.pair} geladen. Warte auf Rate-Limit…`); await sleep(8000); }
        }
        if (candles.length < 200) { setError((p) => (p ? p + " · " : "") + `${inst.pair}: zu wenig Stundendaten`); continue; }
        bars += candles.length;
        if (!von || candles[0].date < von) von = candles[0].date;
        if (!bis || candles[candles.length - 1].date > bis) bis = candles[candles.length - 1].date;

        hourProfile(candles).forEach((h) => {
          if (h.avgRangePct != null) { profileSum[h.hour] += h.avgRangePct; profileCnt[h.hour]++; }
        });
        allTrades.push(...runHourlyBacktest(candles, inst));
      } catch (e) {
        setError((p) => (p ? p + " · " : "") + e.message);
      }
    }

    if (allTrades.length === 0) { setRunning(false); setProgress(""); return; }

    const movement = profileSum.map((s, h) => ({ hour: h, avgRangePct: profileCnt[h] ? s / profileCnt[h] : null }));
    const perf = Array.from({ length: 24 }, (_, h) => {
      const t = allTrades.filter((x) => x.hour === h);
      return { hour: h, ...summarize(t) };
    });
    const byWeekday = [1, 2, 3, 4, 5, 0, 6]
      .map((wd) => ({ key: WEEKDAY_NAMES[wd], ...summarize(allTrades.filter((t) => t.weekday === wd)) }))
      .filter((r) => r.n > 0);
    const topHours = perf.filter((p) => p.n >= 10).sort((a, b) => b.avgR - a.avgR).slice(0, 5)
      .map((p) => ({ key: `${String(p.hour).padStart(2, "0")}:00 – ${String((p.hour + 1) % 24).padStart(2, "0")}:00`, ...p }));
    const worstHours = perf.filter((p) => p.n >= 10).sort((a, b) => a.avgR - b.avgR).slice(0, 3)
      .map((p) => ({ key: `${String(p.hour).padStart(2, "0")}:00 – ${String((p.hour + 1) % 24).padStart(2, "0")}:00`, ...p }));
    const bestMoveHour = movement.filter((m) => m.avgRangePct != null).sort((a, b) => b.avgRangePct - a.avgRangePct)[0];

    setResult({ movement, perf, byWeekday, topHours, worstHours, bestMoveHour, total: allTrades.length, bars, von, bis });
    setProgress(""); setRunning(false);
  };

  return (
    <div className="mt-4 flex flex-col gap-4 pb-4">
      <div className="bg-[#161B22] border border-[#2A3341] rounded-xl p-5">
        <h3 className="fsd-display text-sm font-semibold flex items-center gap-2">
          <Clock size={15} color="#E0A458" /> Handelszeiten-Analyse
        </h3>
        <p className="text-[11px] text-[#7E8899] mt-1 leading-relaxed max-w-2xl">
          Holt echte <strong>Stundenkerzen</strong> (~7 Monate, deutsche Zeit) und misst, wann sich der Markt am stärksten bewegt
          und zu welcher Tagesstunde Einstiege in Trendrichtung am besten liefen. Ein Abruf je Instrument.
        </p>

        <label className="text-xs text-[#8C96A8] block mt-4 mb-2">Instrumente</label>
        <div className="flex flex-wrap gap-2">
          {UNIVERSE.map((u) => {
            const active = selected.includes(u.pair);
            return (
              <button key={u.pair} onClick={() => toggle(u.pair)}
                className="fsd-mono text-xs px-3 py-1.5 rounded-full border transition-colors"
                style={active ? { background: "#1D2B4A", borderColor: "#5B8CFF", color: "#9DB8FF" } : { background: "transparent", borderColor: "#2A3341", color: "#7E8899" }}>
                {u.pair}
              </button>
            );
          })}
        </div>

        <div className="flex justify-end mt-4">
          <button onClick={run} disabled={running}
            className="flex items-center gap-2 bg-[#E0A458] hover:bg-[#EAB876] disabled:opacity-50 disabled:cursor-not-allowed text-[#1A1206] font-semibold text-sm px-5 py-2.5 rounded-lg transition-colors"
            style={{ boxShadow: "0 0 24px rgba(224,164,88,0.25)" }}>
            <Clock size={15} /> {running ? "Analysiere…" : "Handelszeiten analysieren"}
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

      {result && (
        <>
          <div className="bg-[#161B22] border border-[#2A3341] rounded-xl p-5">
            <h3 className="fsd-display text-sm font-semibold text-[#E8ECF2]">Wann bewegt sich der Markt?</h3>
            <div className="text-[10px] text-[#7E8899] mt-0.5 mb-1">
              Ø Schwankungsbreite je Stundenkerze. Stärkste Stunde: <strong>{String(result.bestMoveHour.hour).padStart(2, "0")}:00 Uhr</strong>. (0,10 % ≈ 10 Pips bei EUR/USD)
            </div>
            <HourChart rows={result.movement} valueKey="avgRangePct" label="Ø Bewegung"
              formatValue={(v) => `${v.toFixed(3)} %`} colorFor={() => "#3987e5"} />
            <Legend />
          </div>

          <div className="bg-[#161B22] border border-[#2A3341] rounded-xl p-5">
            <h3 className="fsd-display text-sm font-semibold text-[#E8ECF2]">Wie liefen Einstiege je Tagesstunde?</h3>
            <div className="text-[10px] text-[#7E8899] mt-0.5 mb-1">
              Ø Ergebnis (R) simulierter Trendfolge-Einstiege · {result.total} Trades aus {result.bars.toLocaleString("de-DE")} Stundenkerzen
            </div>
            <HourChart rows={result.perf} valueKey="avgR" label="Ø R"
              formatValue={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}R`} colorFor={(v) => (v >= 0 ? "#3DBB85" : "#E5695A")} />
            <Legend />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Table title="Beste Einstiegsstunden" subtitle="Mindestens 10 Trades je Stunde" rows={result.topHours} firstCol="Uhrzeit" />
            <Table title="Schwächste Einstiegsstunden" rows={result.worstHours} firstCol="Uhrzeit" />
          </div>

          <Table title="Nach Wochentag" subtitle="Einstiegstag der simulierten Trades" rows={result.byWeekday} firstCol="Wochentag" />

          <div className="flex items-start gap-2 bg-[#2A2113] border border-[#4D3B17] rounded-lg px-3 py-2.5">
            <AlertTriangle size={14} color="#E3A94F" className="mt-0.5 shrink-0" />
            <p className="text-[11px] text-[#D9B36A] leading-relaxed">
              Einordnung: Der Test nutzt eine <strong>vereinfachte Stunden-Strategie</strong> (Trend aus SMA 20/50 auf Stundenbasis, Stop 1× / Ziel 1,5× Stunden-ATR, max. 24 h) — nicht die Tages-Strategie der Scan-Reiter. Er ignoriert <strong>Spread, Slippage und Swap</strong>, was gerade in ruhigen Nachtstunden die Ergebnisse beschönigt. Zeitraum ist mit ~7 Monaten kurz, Stunden mit wenigen Trades sind <strong>Zufall statt Signal</strong>. Nutze das Ergebnis als Orientierung, nicht als Regel.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
