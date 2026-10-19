# Rechte (Issue #198)

Einzige Quelle: `packages/core/src/application/rechte.ts` (`darf`, `darfOrt`, `nurEigenerOrt`).
API-Routen, Use Cases und Web-Middleware fragen nur dort nach – keine eigenen Rollenvergleiche.

| Aktion            | Admin | Redaktion | Kirmesgesellschaft |
| ----------------- | :---: | :-------: | :----------------: |
| Redaktion nutzen  |   ✓   |     ✓     |         ✓          |
| Termine           |   ✓   |     ✓     |    eigener Ort     |
| Plätze            |   ✓   |     ✓     |    eigener Ort     |
| Vorschläge        |   ✓   |     ✓     |    eigener Ort     |
| Korrekturen       |   ✓   |     ✓     |    eigener Ort     |
| Orte anlegen      |   ✓   |     ✓     |         –          |
| Mitteilungen      |   ✓   |     ✓     |         –          |
| Bearbeitungslinks |   ✓   |     ✓     |         –          |
| Import            |   ✓   |     ✓     |         –          |
| Orte löschen      |   ✓   |     –     |         –          |
| Mitglieder        |   ✓   |     –     |         –          |
| Sicherungen       |   ✓   |     –     |         –          |

Zusätzlich gilt für die Kirmesgesellschaft **standardmäßig verboten**: Die API lässt nur
freigegebene Routen zu (`KG_ROUTEN` in `admin-routen.ts`) und prüft dort den Ort aus Body, Query
oder Pfad. Die Web-Middleware leitet andere Redaktionsseiten auf die Startseite.

Keine Rechte, sondern Datenregeln (bleiben bei der Mitgliederverwaltung): mindestens ein Admin
bleibt, Kirmesgesellschaft nur per Einladung mit Ort, Rolle/Ort beim Kontoanlegen aus der
Einladung.
