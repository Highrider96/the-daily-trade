import { useState } from "react";

// Feste Farbzuordnung pro Instrument (validierte kategoriale Palette).
// Die beiden JPY-Kreuze teilen sich Hue mit dem jeweiligen Major und
// werden zur Unterscheidung gestrichelt gezeichnet (Komposit-Kodierung).
export const PAIR_STYLE = {
  "EUR/USD": { color: "#3987e5" },
  "GBP/USD": { color: "#199e70" },
  "USD/JPY": { color: "#c98500" },
  "USD/CHF": { color: "#008300" },
  "AUD/USD": { color: "#9085e9" },
  "USD/CAD": { color: "#e66767" },
  "NZD/USD": { color: "#d55181" },
  "EUR/GBP": { color: "#d95926" },
  "EUR/JPY": { color: "#3987e5", dash: true },
  "GBP/JPY": { color: "#199e70", dash: true },
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function fmtDate(iso) {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

// ---------- Kurs-Sparkline (eine Serie, mit Hover-Tooltip) ----------
export function Sparkline({ data, dec = 5, height = 44, showArea = true }) {
  const [hover, setHover] = useState(null);
  if (!data || data.length < 2) return null;

  const W = 260, H = 44, pad = 3;
  const vals = data.map((d) => d.close);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1e-9;
  const x = (i) => (i / (data.length - 1)) * W;
  const y = (v) => pad + (1 - (v - min) / span) * (H - 2 * pad);
  const pts = data.map((d, i) => `${x(i)},${y(d.close)}`).join(" ");

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const fx = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const i = clamp(Math.round(fx * (data.length - 1)), 0, data.length - 1);
    setHover({ i, xPct: (x(i) / W) * 100, yPct: (y(data[i].close) / H) * 100 });
  };

  const tipAlign = hover
    ? hover.xPct < 20 ? "translateX(0)" : hover.xPct > 80 ? "translateX(-100%)" : "translateX(-50%)"
    : "";

  return (
    <div
      className="relative w-full"
      style={{ height }}
      onPointerMove={onMove}
      onPointerLeave={() => setHover(null)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" preserveAspectRatio="none" className="block">
        {showArea && (
          <polygon points={`0,${H} ${pts} ${W},${H}`} fill="rgba(57,135,229,0.15)" />
        )}
        <polyline
          points={pts}
          fill="none"
          stroke="#3987e5"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {hover && (
        <>
          <div
            className="absolute w-2 h-2 rounded-full border-2 border-[#0E1116] pointer-events-none"
            style={{ background: "#3987e5", left: `${hover.xPct}%`, top: `${hover.yPct}%`, transform: "translate(-50%,-50%)", boxShadow: "0 0 0 1px rgba(57,135,229,0.45)" }}
          />
          <div
            className="absolute bottom-full mb-1 pointer-events-none bg-[#232B36] text-white rounded px-2 py-1 whitespace-nowrap z-20"
            style={{ left: `${hover.xPct}%`, transform: tipAlign }}
          >
            <span className="fsd-mono text-[10px]">{fmtDate(data[hover.i].date)} · {data[hover.i].close.toFixed(dec)}</span>
          </div>
        </>
      )}
    </div>
  );
}

// ---------- Score-Historie (eine Linie pro Instrument) ----------
export function ScoreHistoryChart({ history, pairs }) {
  const [hi, setHi] = useState(null);
  if (!history || history.length === 0 || pairs.length === 0) return null;

  const W = 720, H = 230, padL = 30, padR = 78, padT = 10, padB = 24;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const n = history.length;
  const x = (i) => padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v) => padT + (1 - v / 100) * plotH;

  // Pro Paar zusammenhängende Segmente (Lücken, wenn an einem Tag nicht gescannt)
  const seriesSegments = pairs.map((pair) => {
    const segs = [];
    let cur = [];
    history.forEach((h, i) => {
      const s = h.scores[pair];
      if (s) cur.push({ i, v: s.c, d: s.d });
      else if (cur.length) { segs.push(cur); cur = []; }
    });
    if (cur.length) segs.push(cur);
    return { pair, segs, ...PAIR_STYLE[pair] };
  });

  // Direkt-Beschriftung am Linienende, mit einfacher Kollisionsvermeidung
  const labels = seriesSegments
    .map((s) => {
      const seg = s.segs[s.segs.length - 1];
      if (!seg) return null;
      const last = seg[seg.length - 1];
      return { pair: s.pair, color: s.color, lx: x(last.i), ly: y(last.v) };
    })
    .filter(Boolean)
    .sort((a, b) => a.ly - b.ly);
  for (let i = 1; i < labels.length; i++) {
    if (labels[i].ly - labels[i - 1].ly < 12) labels[i].ly = labels[i - 1].ly + 12;
  }

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const fx = clamp((px - padL) / plotW, 0, 1);
    setHi(n === 1 ? 0 : clamp(Math.round(fx * (n - 1)), 0, n - 1));
  };

  const hovered = hi != null ? history[hi] : null;
  const hoverRows = hovered
    ? pairs
        .filter((p) => hovered.scores[p])
        .map((p) => ({ pair: p, ...PAIR_STYLE[p], c: hovered.scores[p].c, d: hovered.scores[p].d }))
        .sort((a, b) => b.c - a.c)
    : [];
  const hiXPct = hi != null ? (x(hi) / W) * 100 : 0;
  const tipLeft = hiXPct < 55;

  // X-Achsen-Beschriftung: erster / mittlerer / letzter Scan-Tag
  const xTicks = n === 1 ? [0] : n === 2 ? [0, n - 1] : [0, Math.floor((n - 1) / 2), n - 1];

  return (
    <div>
      {/* Legende */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-3">
        {seriesSegments.map((s) => (
          <div key={s.pair} className="flex items-center gap-1.5">
            <svg width="16" height="6" className="shrink-0">
              <line x1="0" y1="3" x2="16" y2="3" stroke={s.color} strokeWidth="2.5" strokeDasharray={s.dash ? "4 3" : "none"} strokeLinecap="round" />
            </svg>
            <span className="fsd-mono text-[10px] text-[#B7C0CE]">{s.pair}</span>
          </div>
        ))}
      </div>

      <div className="relative" onPointerMove={onMove} onPointerLeave={() => setHi(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="block">
          {/* Gitter + Y-Achse */}
          {[0, 25, 50, 75, 100].map((v) => (
            <g key={v}>
              <line x1={padL} y1={y(v)} x2={W - padR} y2={y(v)} stroke="#232B36" strokeWidth="1" />
              <text x={padL - 6} y={y(v) + 3} textAnchor="end" fontSize="9" fill="#6F7A8C" fontFamily="'JetBrains Mono', monospace">{v}</text>
            </g>
          ))}
          {/* X-Achsen-Daten */}
          {xTicks.map((i) => (
            <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="9" fill="#6F7A8C" fontFamily="'JetBrains Mono', monospace">
              {fmtDate(history[i].date)}
            </text>
          ))}
          {/* Crosshair */}
          {hi != null && (
            <line x1={x(hi)} y1={padT} x2={x(hi)} y2={padT + plotH} stroke="#3A4553" strokeWidth="1" strokeDasharray="3 3" />
          )}
          {/* Serien */}
          {seriesSegments.map((s) =>
            s.segs.map((seg, k) => (
              <g key={s.pair + k}>
                {seg.length > 1 && (
                  <polyline
                    points={seg.map((p) => `${x(p.i)},${y(p.v)}`).join(" ")}
                    fill="none"
                    stroke={s.color}
                    strokeWidth="2"
                    strokeDasharray={s.dash ? "6 4" : "none"}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                )}
                {seg.map((p) => (
                  <circle
                    key={p.i}
                    cx={x(p.i)}
                    cy={y(p.v)}
                    r={hi === p.i ? 4 : seg.length === 1 ? 3.5 : 2}
                    fill={s.color}
                    stroke="#161B22"
                    strokeWidth={hi === p.i ? 1.5 : 0}
                  />
                ))}
              </g>
            ))
          )}
          {/* Direkt-Beschriftung */}
          {labels.map((l) => (
            <g key={l.pair}>
              <circle cx={l.lx + 8} cy={l.ly} r="2.5" fill={l.color} />
              <text x={l.lx + 14} y={l.ly + 3} fontSize="9" fill="#B7C0CE" fontFamily="'JetBrains Mono', monospace">{l.pair}</text>
            </g>
          ))}
        </svg>

        {/* Tooltip */}
        {hovered && (
          <div
            className="absolute top-2 pointer-events-none bg-[#232B36] text-white rounded-lg px-3 py-2 z-20"
            style={tipLeft ? { left: `calc(${hiXPct}% + 12px)` } : { right: `calc(${100 - hiXPct}% + 12px)` }}
          >
            <div className="fsd-mono text-[10px] text-[#8C96A8] mb-1">{fmtDate(hovered.date)}</div>
            {hoverRows.map((r) => (
              <div key={r.pair} className="flex items-center gap-2 leading-5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: r.color }} />
                <span className="fsd-mono text-[10px] w-16">{r.pair}</span>
                <span className="fsd-mono text-[10px] w-8 text-right">{Math.round(r.c)}</span>
                <span className="fsd-mono text-[9px]" style={{ color: r.d === "LONG" ? "#7BD8AC" : "#F2A093" }}>{r.d}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {n === 1 && (
        <p className="text-[11px] text-[#7E8899] mt-2">
          Bisher ist erst ein Scan-Tag gespeichert — mit jedem weiteren Tag, an dem du scannst, wächst der Verlauf.
        </p>
      )}
    </div>
  );
}
