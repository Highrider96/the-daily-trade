import { useState, useEffect } from "react";
import { Settings2, Radio } from "lucide-react";
import ScanView from "./ScanView.jsx";
import InfoPage from "./InfoPage.jsx";
import { MARKETS, TRADE_STYLES, storageGet, storageSet, pruneOldCaches } from "./engine.js";

export default function TheDailyTrade() {
  const [view, setView] = useState("forex"); // forex | metals | info
  const [showSettings, setShowSettings] = useState(true);
  const [avKey, setAvKeyState] = useState(() => storageGet("fsd:apiKey") ?? "");
  const [tdKey, setTdKeyState] = useState(() => storageGet("fsd:tdKey") ?? "");
  const [tradeStyle, setTradeStyleState] = useState(() => {
    const s = storageGet("fsd:tradeStyle");
    return TRADE_STYLES[s] ? s : "swing";
  });

  useEffect(() => { pruneOldCaches(); }, []);

  // API-Keys und Trade-Horizont sind global (einmal eingetragen, für alle Reiter).
  const setAvKey = (v) => { setAvKeyState(v); storageSet("fsd:apiKey", v); };
  const setTdKey = (v) => { setTdKeyState(v); storageSet("fsd:tdKey", v); };
  const setTradeStyle = (v) => { setTradeStyleState(v); storageSet("fsd:tradeStyle", v); };

  const activeMarket = view === "metals" ? MARKETS.metals : MARKETS.forex;
  const subtitle = view === "info"
    ? "Regelbasierte Tages-Analyse"
    : `Regelbasierte Tages-Analyse · ${activeMarket.subtitle}`;

  const tabs = [["forex", "Forex"], ["metals", "Metalle"], ["info", "Funktionsweise"]];

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
              if (view === "info") { setView("forex"); setShowSettings(true); }
              else setShowSettings((s) => !s);
            }}
            className="p-2 rounded-lg border border-[#2A3341] hover:bg-[#1C232D] transition-colors"
          >
            <Settings2 size={16} color="#8C96A8" />
          </button>
        </div>
        {/* Reiter-Navigation */}
        <div className="max-w-5xl mx-auto px-4 flex gap-1">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className="px-4 py-2 text-xs font-semibold -mb-px border-b-2 transition-colors"
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
        {view !== "info" && (
          <ScanView
            key={activeMarket.id}
            market={activeMarket}
            avKey={avKey}
            setAvKey={setAvKey}
            tdKey={tdKey}
            setTdKey={setTdKey}
            tradeStyle={tradeStyle}
            setTradeStyle={setTradeStyle}
            showSettings={showSettings}
            setShowSettings={setShowSettings}
          />
        )}
      </div>
    </div>
  );
}
