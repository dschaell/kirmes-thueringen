# Prüfung: einfachere Redaktion (#72)

Geprüft am 16.10.2026, aufbauend auf #73. Bestehende Gestaltung beibehalten.

## Ergebnis

- Startseite: drei große Aktionen und eine Terminliste, kommende Termine zuerst; vergangene und
  alle Termine über Umschalter. Suche nach Ort, Titel oder Band, zusätzlich genaues Datum.
- Drei Hauptpunkte: Termine, Vorschläge, Orte & Plätze. Weitere Funktionen unter „Mehr“;
  Mitglieder weiterhin ausschließlich für Admins.
- Stift führt direkt zu allen Terminangaben einschließlich angelegter Plätze und Mittagstisch.
  Termin und Speisen werden gemeinsam gespeichert oder gemeinsam zurückgerollt.
- Bestätigen und Löschen mit eigener Rückfrage, ohne JavaScript. Bestehende Ortsansicht,
  Recherche, Sammelbearbeitung und Platzverwaltung bleiben erreichbar.

## Verifikation

- `npm run lint` und `npm run typecheck` grün; ein bestehender Hinweis in `kreise/[kreis].astro`.
- **406 Tests**, einschließlich PostgreSQL, grün. Zusätzlicher echter Rollback-Test für
  Terminänderung plus Speisen sowie Integrationstest für Ort/Titel/Band, Datum und Seiten.
- Coverage gegen `main`: Zeilen **99,93 → 99,94 %**, Statements **99,58 → 99,63 %**,
  Funktionen **100 → 100 %**, Branches **96,77 → 97,01 %**. Auch gegenüber #73 keine Kennzahl gesunken.
- Produktionsimages für API und Website gebaut und im isolierten Compose-Nachbau gestartet.
- E2E im Headless-Chrome mit **deaktiviertem JavaScript**: Liste → Stift → Titel, Band, Uhrzeit,
  Platz, Hinweise, Muttizettel und Speisen ändern → gemeinsam gespeichert.
- E2E: Band- und Datumssuche, Vergangenheit, Paginierung (25 + 6 Treffer), Bestätigen mit Rückfrage,
  Löschen erst nach Rückfrage, Abbrechen verändert nichts; Ortsfunktionen erreichbar.
- Handy **375 px hell/dunkel**, Desktop **1280 px**, kein horizontaler Überlauf, keine Browserfehler.
  Produktions-CSP ohne `unsafe-inline` geprüft. Screenshots und JSON-Protokoll neben dieser Datei.

Keine neue Migration, Abhängigkeit oder Umgebungsvariable. Keine Daten oder Zugänge aus der
Arbeitsdatenbank verwendet. Noch nicht veröffentlicht oder live geprüft; kein Merge ohne Freigabe.
