import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";

// Ephemere Tages-Daten (Cache, Kontingent-Zähler) werden nicht exportiert —
// nur dauerhafte Nutzerdaten: Keys, Watchlists, Verlauf, Trade-Journal, Horizont.
const isEphemeral = (k) => k.includes(":cache:") || k.startsWith("fsd:quota:") || k.startsWith("fsd:tdquota:");

function collectData() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith("fsd:") && !isEphemeral(k)) data[k] = localStorage.getItem(k);
  }
  return data;
}

export default function DataSync() {
  const fileRef = useRef(null);
  const [msg, setMsg] = useState(null); // { kind: "ok"|"err", text }

  const doExport = () => {
    const data = collectData();
    if (Object.keys(data).length === 0) { setMsg({ kind: "err", text: "Es sind noch keine Daten zum Exportieren vorhanden." }); return; }
    const payload = { app: "the-daily-trade", version: 1, exportedAt: new Date().toISOString(), data };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `the-daily-trade-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setMsg({ kind: "ok", text: `${Object.keys(data).length} Einträge exportiert.` });
  };

  const onFile = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const data = parsed && parsed.data;
        if (!data || typeof data !== "object") throw new Error("unerwartetes Dateiformat");
        const keys = Object.keys(data).filter((k) => k.startsWith("fsd:") && typeof data[k] === "string");
        if (keys.length === 0) throw new Error("keine gültigen Daten gefunden");
        if (!window.confirm(`${keys.length} Einträge importieren?\nVorhandene Daten in diesem Browser werden überschrieben.`)) return;
        keys.forEach((k) => localStorage.setItem(k, data[k]));
        window.location.reload();
      } catch (err) {
        setMsg({ kind: "err", text: "Import fehlgeschlagen: " + err.message });
      }
    };
    reader.onerror = () => setMsg({ kind: "err", text: "Datei konnte nicht gelesen werden." });
    reader.readAsText(file);
  };

  return (
    <div className="mt-4 pt-4 border-t border-[#232B36]">
      <label className="text-xs text-[#8C96A8] block mb-2">Daten sichern &amp; auf anderen PC übertragen</label>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={doExport}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-[#2A3341] hover:bg-[#1C232D] text-[#B7C0CE] transition-colors"
        >
          <Download size={13} color="#3DBB85" /> Daten exportieren
        </button>
        <button
          onClick={() => fileRef.current && fileRef.current.click()}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-[#2A3341] hover:bg-[#1C232D] text-[#B7C0CE] transition-colors"
        >
          <Upload size={13} color="#5B8CFF" /> Daten importieren
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onFile} />
      </div>
      <p className="text-[10px] text-[#7E8899] mt-2 leading-relaxed">
        Sichert Watchlists, Score-Verlauf, Trade-Journal und deine API-Keys als Datei. Auf dem anderen PC dieselbe Seite öffnen und die Datei importieren. Die Datei bleibt bei dir — nichts wird ins Internet geladen.
      </p>
      {msg && (
        <p className="text-[11px] mt-2" style={{ color: msg.kind === "ok" ? "#3DBB85" : "#F09383" }}>{msg.text}</p>
      )}
    </div>
  );
}
