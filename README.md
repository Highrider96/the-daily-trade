# FX Signal Desk

Regelbasierte Tages-Analyse für Forex-Paare. Lädt Tageskerzen von Alpha Vantage,
berechnet technische Indikatoren (SMA 20/50, RSI 14, MACD, ATR 14) und rankt die
Watchlist nach einem Composite-Score aus Trend, Momentum und Volatilität.
Die Top 3 werden als Trade-Setups mit Entry, Stop und Ziel angezeigt. Deren Abstand
richtet sich nach dem gewählten **Trade-Horizont** (Einstellungen): Scalping
(0,25×/0,35× ATR), Kurzfristig (0,8×/1,2×), Swing (1,5×/2,5×) oder Position
(2,5×/4,5×) — inkl. Pip-Distanz und grober Haltedauer-Schätzung auf den Karten.

**Kein Anlagetool** — Bildungs-/Analysewerkzeug auf Basis kostenloser, verzögerter Daten.

## Stack

- React 19 + Vite 8
- Tailwind CSS 4 (`@tailwindcss/vite`)
- lucide-react (Icons)
- Persistenz (API-Key, Watchlist, Tages-Cache) über `localStorage`

## Starten

```sh
npm install
npm run dev
```

Dann http://localhost:5173 öffnen, in den Einstellungen einen kostenlosen
[Alpha-Vantage-API-Key](https://www.alphavantage.co/support/#api-key) eintragen
und den Markt-Scan starten.

## Hinweise

- **Rate-Limit (Free-Tier):** 5 Anfragen/Minute, 25/Tag. Die App wartet deshalb
  13 s zwischen den Abrufen, cacht Kursdaten pro Tag in `localStorage` und zeigt
  einen lokalen Zähler der heute verbrauchten/verbleibenden Anfragen an
  (Schätzung — Abrufe von anderen Geräten zählt er nicht mit).
- Der API-Key wird nur lokal im Browser gespeichert und direkt an
  `alphavantage.co` gesendet (kein Proxy).

## Build

```sh
npm run build   # Produktions-Build nach dist/
npm run preview # Build lokal testen
```
