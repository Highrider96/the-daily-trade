import { useState, useEffect } from "react";
import { BookOpen, Plus, Trash2, Pencil, X, TrendingUp, TrendingDown } from "lucide-react";
import { Sparkline } from "./Charts.jsx";
import { TRADE_STYLES, FOREX_UNIVERSE, METALS_UNIVERSE, storageGet, storageSet, todayKey } from "./engine.js";

const TRADES_KEY = "fsd:trades";
const KNOWN_INSTRUMENTS = [...FOREX_UNIVERSE, ...METALS_UNIVERSE].map((u) => u.pair);

// ---------- Kennzahlen pro Trade ----------
function num(v) {
  const n = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function tradeMetrics(t) {
  const entry = num(t.entry), exit = num(t.exit), stop = num(t.stop);
  const closed = exit != null;
  const risk = stop != null ? Math.abs(entry - stop) : null;
  const pl = closed ? (t.direction === "LONG" ? exit - entry : entry - exit) : null;
  const r = closed && risk ? pl / risk : null;
  return { closed, risk, pl, r, win: closed ? pl > 0 : null };
}

const fmtR = (r) => (r == null ? "—" : `${r >= 0 ? "+" : ""}${r.toFixed(2)}R`);
const fmtDate = (iso) => { if (!iso) return ""; const [y, m, d] = iso.split("-"); return `${d}.${m}.${y}`; };

// ---------- Kleine Bausteine ----------
function StatTile({ label, value, sub, color }) {
  return (
    <div className="bg-[#161B22] border border-[#2A3341] rounded-xl px-4 py-3">
      <div className="text-[10px] text-[#8C96A8] uppercase tracking-wide">{label}</div>
      <div className="fsd-mono text-2xl font-bold mt-0.5" style={{ color: color || "#E8ECF2" }}>{value}</div>
      {sub && <div className="text-[10px] text-[#7E8899] mt-0.5">{sub}</div>}
    </div>
  );
}

function BreakdownTable({ title, rows }) {
  if (rows.length === 0) return null;
  return (
    <div className="bg-[#161B22] border border-[#2A3341] rounded-xl p-5">
      <h3 className="fsd-display text-sm font-semibold text-[#E8ECF2] mb-3">{title}</h3>
      <div className="overflow-x-auto fsd-scrollbar">
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
                <td className="py-1.5 text-right" style={{ color: r.avgR == null ? "#6F7A8C" : r.avgR >= 0 ? "#3DBB85" : "#E5695A" }}>{fmtR(r.avgR)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const EMPTY_FORM = { instrument: "", direction: "LONG", entry: "", stop: "", target: "", exit: "", scoreAtEntry: "", style: "", openedAt: todayKey(), note: "" };

// ---------- Journal ----------
export default function Journal({ draft, clearDraft }) {
  const [trades, setTrades] = useState(() => storageGet(TRADES_KEY) ?? []);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [formError, setFormError] = useState("");

  // Vorschlag aus einer Trade-Karte übernehmen
  useEffect(() => {
    if (!draft) return;
    setForm({ ...EMPTY_FORM, openedAt: todayKey(), ...draft });
    setEditingId(null);
    setFormError("");
    clearDraft();
  }, [draft, clearDraft]);

  const persist = (next) => { setTrades(next); storageSet(TRADES_KEY, next); };
  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.instrument.trim()) { setFormError("Bitte ein Instrument angeben."); return; }
    if (num(form.entry) == null) { setFormError("Bitte einen gültigen Einstiegskurs angeben."); return; }
    setFormError("");
    const record = { ...form, instrument: form.instrument.trim().toUpperCase() };
    if (editingId) {
      persist(trades.map((t) => (t.id === editingId ? { ...t, ...record } : t)));
    } else {
      persist([{ ...record, id: Date.now() + ":" + Math.random().toString(36).slice(2, 7) }, ...trades]);
    }
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const editTrade = (t) => { setEditingId(t.id); setForm({ ...EMPTY_FORM, ...t }); setFormError(""); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const cancelEdit = () => { setEditingId(null); setForm(EMPTY_FORM); setFormError(""); };
  const deleteTrade = (t) => {
    if (!window.confirm(`Trade ${t.instrument} vom ${fmtDate(t.openedAt)} wirklich löschen?`)) return;
    persist(trades.filter((x) => x.id !== t.id));
    if (editingId === t.id) cancelEdit();
  };

  // ---------- Auswertung ----------
  const withMetrics = trades.map((t) => ({ t, m: tradeMetrics(t) }));
  const closed = withMetrics.filter((x) => x.m.closed);
  const openCount = trades.length - closed.length;
  const wins = closed.filter((x) => x.m.win).length;
  const winRate = closed.length ? (wins / closed.length) * 100 : null;
  const rVals = closed.filter((x) => x.m.r != null).map((x) => x.m.r);
  const avgR = rVals.length ? rVals.reduce((a, b) => a + b, 0) / rVals.length : null;
  const totalR = rVals.reduce((a, b) => a + b, 0);

  // Kumulierte R-Kurve (geschlossene Trades chronologisch)
  const rCurve = closed
    .filter((x) => x.m.r != null)
    .slice()
    .sort((a, b) => (a.t.openedAt || "").localeCompare(b.t.openedAt || ""));
  let acc = 0;
  const rCurveData = rCurve.map((x) => ({ date: x.t.openedAt || todayKey(), close: (acc += x.m.r) }));

  const groupBy = (keyFn) => {
    const map = new Map();
    closed.forEach((x) => {
      const k = keyFn(x.t);
      if (k == null || k === "") return;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(x);
    });
    return [...map.entries()].map(([key, arr]) => {
      const rs = arr.filter((x) => x.m.r != null).map((x) => x.m.r);
      return {
        key,
        n: arr.length,
        winRate: arr.length ? (arr.filter((x) => x.m.win).length / arr.length) * 100 : null,
        avgR: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null,
      };
    }).sort((a, b) => b.n - a.n);
  };

  const SCORE_BUCKETS = [
    { key: "85+", test: (s) => s >= 85 },
    { key: "70–84", test: (s) => s >= 70 && s < 85 },
    { key: "50–69", test: (s) => s >= 50 && s < 70 },
    { key: "< 50", test: (s) => s < 50 },
  ];
  const byScore = SCORE_BUCKETS.map((b) => {
    const arr = closed.filter((x) => { const s = num(x.t.scoreAtEntry); return s != null && b.test(s); });
    const rs = arr.filter((x) => x.m.r != null).map((x) => x.m.r);
    return { key: b.key, n: arr.length, winRate: arr.length ? (arr.filter((x) => x.m.win).length / arr.length) * 100 : null, avgR: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null };
  }).filter((r) => r.n > 0);

  const byStyle = groupBy((t) => (t.style ? TRADE_STYLES[t.style]?.label : null));
  const byInstrument = groupBy((t) => t.instrument);

  const isEditing = !!editingId;

  return (
    <div className="mt-4 flex flex-col gap-4 pb-4">
      {/* Formular */}
      <div className="bg-[#161B22] border border-[#2A3341] rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="fsd-display text-sm font-semibold flex items-center gap-2">
            <BookOpen size={15} color="#E0A458" /> {isEditing ? "Trade bearbeiten" : "Neuen Trade eintragen"}
          </h3>
          {isEditing && <button onClick={cancelEdit} className="text-[11px] text-[#7E8899] hover:text-[#B7C0CE] flex items-center gap-1"><X size={12} /> Abbrechen</button>}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <div>
            <label className="text-[10px] text-[#8C96A8] block mb-1 uppercase tracking-wide">Instrument</label>
            <input list="fsd-instruments" value={form.instrument} onChange={(e) => setField("instrument", e.target.value)} placeholder="z. B. EUR/USD"
              className="w-full bg-[#1C232D] border border-[#2A3341] rounded-lg px-2.5 py-1.5 text-sm fsd-mono outline-none focus:border-[#5B8CFF]" />
            <datalist id="fsd-instruments">{KNOWN_INSTRUMENTS.map((p) => <option key={p} value={p} />)}</datalist>
          </div>
          <div>
            <label className="text-[10px] text-[#8C96A8] block mb-1 uppercase tracking-wide">Richtung</label>
            <div className="flex gap-1">
              {["LONG", "SHORT"].map((d) => (
                <button key={d} onClick={() => setField("direction", d)}
                  className="flex-1 fsd-mono text-xs py-1.5 rounded-lg border transition-colors"
                  style={form.direction === d
                    ? { background: d === "LONG" ? "#12321F" : "#3A1712", borderColor: d === "LONG" ? "#3DBB85" : "#E5695A", color: d === "LONG" ? "#3DBB85" : "#E5695A" }
                    : { background: "transparent", borderColor: "#2A3341", color: "#7E8899" }}>{d}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] text-[#8C96A8] block mb-1 uppercase tracking-wide">Einstieg</label>
            <input value={form.entry} onChange={(e) => setField("entry", e.target.value)} placeholder="0.00000" inputMode="decimal"
              className="w-full bg-[#1C232D] border border-[#2A3341] rounded-lg px-2.5 py-1.5 text-sm fsd-mono outline-none focus:border-[#5B8CFF]" />
          </div>
          <div>
            <label className="text-[10px] text-[#8C96A8] block mb-1 uppercase tracking-wide">Stop <span className="text-[#5A6472]">(für R)</span></label>
            <input value={form.stop} onChange={(e) => setField("stop", e.target.value)} placeholder="0.00000" inputMode="decimal"
              className="w-full bg-[#1C232D] border border-[#2A3341] rounded-lg px-2.5 py-1.5 text-sm fsd-mono outline-none focus:border-[#5B8CFF]" />
          </div>
          <div>
            <label className="text-[10px] text-[#8C96A8] block mb-1 uppercase tracking-wide">Ziel <span className="text-[#5A6472]">(optional)</span></label>
            <input value={form.target} onChange={(e) => setField("target", e.target.value)} placeholder="0.00000" inputMode="decimal"
              className="w-full bg-[#1C232D] border border-[#2A3341] rounded-lg px-2.5 py-1.5 text-sm fsd-mono outline-none focus:border-[#5B8CFF]" />
          </div>
          <div>
            <label className="text-[10px] text-[#8C96A8] block mb-1 uppercase tracking-wide">Ausstieg <span className="text-[#5A6472]">(leer = offen)</span></label>
            <input value={form.exit} onChange={(e) => setField("exit", e.target.value)} placeholder="0.00000" inputMode="decimal"
              className="w-full bg-[#1C232D] border border-[#2A3341] rounded-lg px-2.5 py-1.5 text-sm fsd-mono outline-none focus:border-[#5B8CFF]" />
          </div>
          <div>
            <label className="text-[10px] text-[#8C96A8] block mb-1 uppercase tracking-wide">Score <span className="text-[#5A6472]">(optional)</span></label>
            <input value={form.scoreAtEntry} onChange={(e) => setField("scoreAtEntry", e.target.value)} placeholder="0–100" inputMode="numeric"
              className="w-full bg-[#1C232D] border border-[#2A3341] rounded-lg px-2.5 py-1.5 text-sm fsd-mono outline-none focus:border-[#5B8CFF]" />
          </div>
          <div>
            <label className="text-[10px] text-[#8C96A8] block mb-1 uppercase tracking-wide">Horizont</label>
            <select value={form.style} onChange={(e) => setField("style", e.target.value)}
              className="w-full bg-[#1C232D] border border-[#2A3341] rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-[#5B8CFF] text-[#B7C0CE]">
              <option value="">—</option>
              {Object.entries(TRADE_STYLES).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-[#8C96A8] block mb-1 uppercase tracking-wide">Datum</label>
            <input type="date" value={form.openedAt} onChange={(e) => setField("openedAt", e.target.value)}
              className="w-full bg-[#1C232D] border border-[#2A3341] rounded-lg px-2.5 py-1.5 text-sm fsd-mono outline-none focus:border-[#5B8CFF] text-[#B7C0CE]" />
          </div>
        </div>

        {formError && <p className="text-xs text-[#F09383] mt-3">{formError}</p>}

        <div className="flex justify-end mt-4">
          <button onClick={submit}
            className="flex items-center gap-2 bg-[#E0A458] hover:bg-[#EAB876] text-[#1A1206] font-semibold text-sm px-5 py-2 rounded-lg transition-colors">
            <Plus size={15} /> {isEditing ? "Änderungen speichern" : "Trade hinzufügen"}
          </button>
        </div>
      </div>

      {/* Auswertung */}
      {trades.length > 0 && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile label="Trades" value={trades.length} sub={`${closed.length} geschlossen · ${openCount} offen`} />
            <StatTile label="Trefferquote" value={winRate == null ? "—" : `${Math.round(winRate)} %`} sub={`${wins} von ${closed.length} im Plus`} color={winRate == null ? undefined : winRate >= 50 ? "#3DBB85" : "#E5695A"} />
            <StatTile label="Ø Ergebnis" value={fmtR(avgR)} sub="pro geschlossenem Trade" color={avgR == null ? undefined : avgR >= 0 ? "#3DBB85" : "#E5695A"} />
            <StatTile label="Summe" value={fmtR(rVals.length ? totalR : null)} sub="kumuliertes R" color={!rVals.length ? undefined : totalR >= 0 ? "#3DBB85" : "#E5695A"} />
          </div>

          {rCurveData.length >= 2 && (
            <div className="bg-[#161B22] border border-[#2A3341] rounded-xl p-5">
              <h3 className="fsd-display text-sm font-semibold text-[#E8ECF2] mb-1">R-Verlauf (kumuliert)</h3>
              <div className="text-[10px] text-[#7E8899] mb-2">Summe deiner Ergebnisse in R über die Zeit</div>
              <Sparkline data={rCurveData} dec={2} height={60} />
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <BreakdownTable title="Nach Score-Klasse" rows={byScore} />
            <BreakdownTable title="Nach Horizont" rows={byStyle} />
            <BreakdownTable title="Nach Instrument" rows={byInstrument} />
          </div>

          {rVals.length === 0 && (
            <p className="text-[11px] text-[#7E8899]">
              Für Trefferquote und R-Auswertung brauchst du geschlossene Trades mit Einstieg, <strong>Stop</strong> und Ausstieg.
              Das R-Vielfache misst deinen Gewinn/Verlust im Verhältnis zum eingegangenen Risiko (Abstand Einstieg → Stop).
            </p>
          )}
        </>
      )}

      {/* Trade-Liste */}
      <div className="bg-[#161B22] border border-[#2A3341] rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#232B36]">
          <h3 className="fsd-display text-sm font-semibold text-[#E8ECF2]">Deine Trades</h3>
        </div>
        {trades.length === 0 ? (
          <div className="text-center py-12">
            <BookOpen size={26} color="#2E3947" className="mx-auto mb-3" />
            <p className="text-sm text-[#7E8899]">Noch keine Trades eingetragen.<br />Trage oben einen Trade ein oder übernimm einen Vorschlag aus dem Forex-/Metalle-Reiter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto fsd-scrollbar">
            <table className="w-full text-xs whitespace-nowrap">
              <thead>
                <tr className="text-left text-[#8C96A8] border-b border-[#232B36]">
                  <th className="py-2 px-3 font-medium">Datum</th>
                  <th className="py-2 px-3 font-medium">Instrument</th>
                  <th className="py-2 px-3 font-medium">Richtung</th>
                  <th className="py-2 px-3 font-medium text-right">Einstieg</th>
                  <th className="py-2 px-3 font-medium text-right">Ausstieg</th>
                  <th className="py-2 px-3 font-medium text-right">Score</th>
                  <th className="py-2 px-3 font-medium text-right">Ergebnis</th>
                  <th className="py-2 px-3 font-medium text-right">Aktion</th>
                </tr>
              </thead>
              <tbody className="fsd-mono">
                {withMetrics.map(({ t, m }) => (
                  <tr key={t.id} className="border-b border-[#232B36] last:border-0 hover:bg-[#1C232D]">
                    <td className="py-2 px-3 text-[#B7C0CE]">{fmtDate(t.openedAt)}</td>
                    <td className="py-2 px-3 text-[#E8ECF2] fsd-display">{t.instrument}</td>
                    <td className="py-2 px-3">
                      <span className="inline-flex items-center gap-1" style={{ color: t.direction === "LONG" ? "#3DBB85" : "#E5695A" }}>
                        {t.direction === "LONG" ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{t.direction}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right text-[#B7C0CE]">{t.entry || "—"}</td>
                    <td className="py-2 px-3 text-right text-[#B7C0CE]">{m.closed ? t.exit : <span className="text-[#E3A94F]">offen</span>}</td>
                    <td className="py-2 px-3 text-right text-[#8C96A8]">{t.scoreAtEntry || "—"}</td>
                    <td className="py-2 px-3 text-right" style={{ color: !m.closed ? "#6F7A8C" : m.win ? "#3DBB85" : "#E5695A" }}>
                      {m.closed ? fmtR(m.r) : "—"}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <div className="inline-flex gap-1.5">
                        <button onClick={() => editTrade(t)} title="Bearbeiten" className="p-1 rounded hover:bg-[#232B36]"><Pencil size={13} color="#8C96A8" /></button>
                        <button onClick={() => deleteTrade(t)} title="Löschen" className="p-1 rounded hover:bg-[#232B36]"><Trash2 size={13} color="#E5695A" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-[10px] text-[#7E8899]">Alle Journal-Einträge werden nur lokal in deinem Browser gespeichert.</p>
    </div>
  );
}
