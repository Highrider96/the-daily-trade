import { useState, useEffect } from "react";
import { Settings2, Radio } from "lucide-react";
import ScanView from "./ScanView.jsx";
import InfoPage from "./InfoPage.jsx";
import Journal from "./Journal.jsx";
import HourAnalysis from "./HourAnalysis.jsx";
import { MARKETS, TRADE_STYLES, INTERVALS, DEFAULT_INTERVAL, storageGet, storageSet, pruneOldCaches } from "./engine.js";

export default function TheDailyTrade() {
  const [view, setView] = useState("forex"); // forex | metals | trades | hours | info
  const [showSettings, setShowSettings] = useState(true);
  const [journalDraft, setJournalDraft] = useState(null);
  const [tdKey, setTdKeyState] = useState(() => storageGet("fsd:tdKey") ?? "");
  const [tradeStyle, setTradeStyleState] = useState(() => {
    const s = storageGet("fsd:tradeStyle");
    return TRADE_STYLES[s] ? s : "swing";
  });
  const [interval, setIntervalState] = useState(() => {
    const s = storageGet("fsd:interval");
    return INTERVALS[s] ? s : DEFAULT_INTERVAL;
  });

  useEffect(() => { pruneOldCaches(); }, []);

  // API-Key, Trade-Horizont und Zeitrahmen sind global (für alle Reiter).
  const setTdKey = (v) => { setTdKeyState(v); storageSet("fsd:tdKey", v); };
  const setTradeStyle = (v) => { setTradeStyleState(v); storageSet("fsd:tradeStyle", v); };
  const setInterval = (v) => { setIntervalState(v); storageSet("fsd:interval", v); };

  const isScan = view === "forex" || view === "metals";
  const activeMarket = view === "metals" ? MARKETS.metals : MARKETS.forex;
  const subtitle = view === "info"
    ? "Regelbasierte Tages-Analyse"
    : view === "trades"
      ? "Handels-Journal & Auswertung"
      : view === "hours"
        ? "Handelszeiten-Analyse"
        : `Regelbasierte Analyse · ${activeMarket.subtitle} · ${INTERVALS[interval].label}`;

  const logTrade = (prefill) => { setJournalDraft(prefill); setView("trades"); };

  const tabs = [["forex", "Forex"], ["metals", "Metalle"], ["trades", "Journal"], ["hours", "Zeiten"], ["info", "Funktionsweise"]];

  return (
    <div className="fsd-root min-h-screen bg-[#0E1116] text-[#E8ECF2] pb-16">
      {/* Header */}
      <div className="border-b border-[#232B36] sticky top-0 bg-[#0E1116]/95 backdrop-blur z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio size={20} color="#E0A458" />
            <div>
              <div className="fsd-display text-lg font-semibold leading-none">The Daily Trade</div>
              <div className="text-[11px] text-[#7E8899] mt-0.5">{subtitle}</div>
            </div>
          </div>
          <button
            onClick={() => {
              if (!isScan) { setView("forex"); setShowSettings(true); }
              else setShowSettings((s) => !s);
            }}
            className="p-2 rounded-lg border border-[#2A3341] hover:bg-[#1C232D] transition-colors"
          >
            <Settings2 size={16} color="#8C96A8" />
          </button>
        </div>
        {/* Reiter-Navigation */}
        <div className="max-w-5xl mx-auto px-4 flex gap-1 overflow-x-auto fsd-scrollbar">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className="px-3 sm:px-4 py-2 text-xs font-semibold -mb-px border-b-2 transition-colors whitespace-nowrap shrink-0"
              style={view === key
                ? { borderColor: "#E0A458", color: "#E8ECF2" }
                : { borderColor: "transparent", color: "#7E8899" }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4">
        {view === "info" && <InfoPage styles={TRADE_STYLES} />}
        {view === "trades" && <Journal draft={journalDraft} clearDraft={() => setJournalDraft(null)} />}
        {view === "hours" && <HourAnalysis tdKey={tdKey} />}
        {isScan && (
          <ScanView
            key={activeMarket.id + ":" + interval}
            market={activeMarket}
            tdKey={tdKey}
            setTdKey={setTdKey}
            tradeStyle={tradeStyle}
            setTradeStyle={setTradeStyle}
            interval={interval}
            setInterval={setInterval}
            showSettings={showSettings}
            setShowSettings={setShowSettings}
            onLogTrade={logTrade}
          />
        )}
      </div>
    </div>
  );
}
