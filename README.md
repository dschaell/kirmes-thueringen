# Kirmeskalender Thüringen

Eigenständige Neuauflage des Thüringer Kirmeskalenders (bisher Unterseite von
mauersberger-haarhausen.de/kirmes, krankheitsbedingt eingestellt).

Statische Website mit [Astro](https://astro.build) – schnell, ohne Datenbank, kostenlos hostbar.

## Funktionen
- Startseite mit Terminen der nächsten 3 Wochen
- `/termine`: Volltextsuche (Ort, Band, Veranstaltung) + Filter nach Landkreis, Zeitraum, Art, „nur bestätigt“; Filter stehen in der URL (teilbar)
- `/orte/<ort>`: eigene Seite pro Ort (~900) → gefunden bei Google-Suche „Kirmes Mühlberg 2026“
- `/kreise/<kreis>`: Seiten pro Landkreis
- `/kalender.ics`: alle Termine als Kalender-Abo (Handy, Outlook, Google)
- schema.org-Events (Google-Rich-Results), Sitemap, robots.txt
- „unbestätigt“-Kennzeichnung für aus Vorjahren hochgerechnete Termine
- `/termin-melden`: Formular für Kirmesgesellschaften (öffnet E-Mail)
- Dark Mode, mobil optimiert, keine Cookies/Tracking

## Entwicklung
```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # statische Seite nach dist/
```

## Daten
Die Termindaten sind **nicht** im Repository, bis der bisherige Betreiber der Übernahme zugestimmt hat.
Lokal erzeugen (vor `npm run build` nötig):
```bash
curl -sL -o scripts/quelle-2026.html https://www.mauersberger-haarhausen.de/kirmes/kirmes-2026.html
npm run import:alt   # schreibt src/data/termine.json (per .gitignore ausgeschlossen)
```
Felder: `datum` (ISO, `null` = offen), `bestaetigt`, `zeit`, `ort`, `ortSlug`, `kreis`, `location`, `titel`, `kategorie`.

## Vor dem Livegang (TODO)
- [ ] Einverständnis des bisherigen Betreibers zur Datenübernahme einholen
- [ ] Domain registrieren, in `astro.config.mjs` + `public/robots.txt` eintragen
- [ ] Impressum + Datenschutz ausfüllen
- [ ] Kontaktadresse in `src/pages/termin-melden.astro`
- [ ] Hosting (Netlify / Cloudflare Pages / GitHub Pages) + täglicher Rebuild (damit „ab heute“ stimmt)
- [ ] Termine pflegen: einfaches Admin-Werkzeug (z. B. Decap CMS oder Google-Sheet-Import)
- [ ] Karte (Leaflet + OpenStreetMap) mit Orts-Koordinaten
