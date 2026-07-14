import { AlertTriangle, TrendingUp, Gauge, Activity, Target, Database, LineChart } from "lucide-react";

function Section({ icon: Icon, iconColor, title, children }) {
  return (
    <div className="bg-[#161B22] border border-[#2A3341] rounded-xl p-5">
      <h3 className="fsd-display text-sm font-semibold text-[#E8ECF2] mb-2 flex items-center gap-2">
        <Icon size={15} color={iconColor} /> {title}
      </h3>
      <div className="text-xs text-[#B7C0CE] leading-relaxed flex flex-col gap-2">{children}</div>
    </div>
  );
}

export default function InfoPage({ styles }) {
  return (
    <div className="mt-4 flex flex-col gap-4 pb-4">
      <Section icon={Target} iconColor="#E0A458" title="Was macht The Daily Trade?">
        <p>
          Die App scannt deine Watchlist aus Forex-Paaren einmal täglich, bewertet jedes Paar mit einem
          Punktwert von 0–100 (dem <strong>Score</strong>) und schlägt die drei aussichtsreichsten Setups
          als Trade-Karten vor — inklusive Richtung (LONG/SHORT), Einstieg, Stop und Ziel. Sie ist ein
          regelbasiertes Analyse- und Lernwerkzeug: Alle Bewertungen folgen festen Formeln, es gibt keine
          Meinung und kein Bauchgefühl.
        </p>
      </Section>

      <Section icon={Database} iconColor="#5B8CFF" title="Woher kommen die Daten?">
        <p>
          Kursdaten (Tageskerzen der letzten ~100 Handelstage) liefert <strong>Alpha Vantage</strong> —
          kostenlos, aber begrenzt auf 25 Anfragen pro Tag. Deshalb merkt sich die App einmal geladene
          Kurse für den Rest des Tages und zeigt dir einen Zähler der verbleibenden Anfragen.
        </p>
        <p>
          Optional holt der Button <strong>„Live-Kurse holen"</strong> über einen zweiten kostenlosen
          Anbieter (<strong>Twelve Data</strong>, 800 Anfragen/Tag) den aktuellen Kurs und verankert
          Einstieg, Stop und Ziel am Jetzt-Preis statt am gestrigen Tagesschluss.
        </p>
      </Section>

      <Section icon={Gauge} iconColor="#3DBB85" title="Wie entsteht der Score?">
        <p>Jedes Paar wird nach drei Bausteinen bewertet, die zum Gesamt-Score gewichtet werden:</p>
        <div className="flex flex-col gap-1.5 mt-1">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: "#5B8CFF" }} />
            <span><strong>Trend (40 %):</strong> Liegt der 20-Tage-Durchschnitt über dem 50-Tage-Durchschnitt, gilt der Trend als aufwärts (LONG) — je größer der Abstand, desto mehr Punkte. Umgekehrt SHORT.</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: "#E0A458" }} />
            <span><strong>Momentum (40 %):</strong> RSI (14) und MACD messen, ob die Bewegung gerade Schwung in Trendrichtung hat oder ausläuft.</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: "#3DBB85" }} />
            <span><strong>Volatilität (20 %):</strong> Die mittlere Tagesschwankung (ATR) sollte weder eingeschlafen noch hektisch sein — Ideal ist ein mittlerer Bereich (~0,6 % pro Tag).</span>
          </div>
        </div>
        <p className="mt-1">
          Die drei besten Paare erscheinen als Karten, der Rest in der Rangliste darunter.
        </p>
      </Section>

      <Section icon={TrendingUp} iconColor="#E5695A" title="Entry, Stop und Ziel">
        <p>
          Der <strong>Entry</strong> ist der letzte Kurs (Tagesschluss oder Live-Kurs). Stop und Ziel
          werden als Vielfaches der ATR gesetzt — wie weit, bestimmt dein <strong>Trade-Horizont</strong> in
          den Einstellungen:
        </p>
        <div className="overflow-x-auto fsd-scrollbar">
          <table className="w-full text-[11px] mt-1">
            <thead>
              <tr className="text-left text-[#8C96A8] border-b border-[#232B36]">
                <th className="py-1.5 pr-3 font-medium">Horizont</th>
                <th className="py-1.5 pr-3 font-medium">Stop</th>
                <th className="py-1.5 pr-3 font-medium">Ziel</th>
                <th className="py-1.5 font-medium">Typische Dauer</th>
              </tr>
            </thead>
            <tbody className="fsd-mono">
              {Object.values(styles).map((s) => (
                <tr key={s.label} className="border-b border-[#232B36] last:border-0">
                  <td className="py-1.5 pr-3 text-[#E8ECF2]">{s.label}</td>
                  <td className="py-1.5 pr-3">{s.sl.toLocaleString("de-DE")}× ATR</td>
                  <td className="py-1.5 pr-3">{s.tp.toLocaleString("de-DE")}× ATR</td>
                  <td className="py-1.5">{s.desc.split("·")[1]?.trim() ?? s.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Die Karten zeigen zusätzlich die Distanz in Pips und das Chance-Risiko-Verhältnis (CRV).
          Beim Scalping-Horizont gilt: Basis bleiben Tageskerzen — sehr enge Level bedeuten, dass
          Spread und Slippage stärker ins Gewicht fallen.
        </p>
      </Section>

      <Section icon={LineChart} iconColor="#9085e9" title="Score-Verlauf">
        <p>
          Jeder Scan speichert die Scores aller Paare lokal in deinem Browser (bis zu 90 Tage).
          Der Verlaufs-Chart unten auf der Scan-Seite zeigt, wie sich die Bewertung jedes Paares
          über die Zeit entwickelt — so erkennst du, ob ein Setup gerade stärker oder schwächer wird.
        </p>
      </Section>

      <Section icon={Activity} iconColor="#6F7A8C" title="Gut zu wissen">
        <p>
          Alle Daten (API-Keys, Watchlist, Verlauf) bleiben ausschließlich in deinem Browser —
          nichts wird auf einem Server gespeichert. Jeder Nutzer der App braucht daher seine
          eigenen kostenlosen API-Keys.
        </p>
      </Section>

      <div className="flex items-start gap-2 bg-[#2A2113] border border-[#4D3B17] rounded-lg px-3 py-2.5">
        <AlertTriangle size={14} color="#E3A94F" className="mt-0.5 shrink-0" />
        <p className="text-[11px] text-[#D9B36A] leading-relaxed">
          The Daily Trade ist ein Bildungs-Werkzeug. Technische Indikatoren beschreiben die
          Vergangenheit — sie garantieren keine künftigen Kursbewegungen. Keine Anlageberatung;
          Trading birgt Verlustrisiko. Triff Entscheidungen eigenverantwortlich und riskiere nur
          Geld, dessen Verlust du verkraften kannst.
        </p>
      </div>
    </div>
  );
}
