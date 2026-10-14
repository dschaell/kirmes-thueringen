# Termine recherchieren und einpflegen

Der Kalender enthält ausschließlich **eigene Recherche** und Einträge der Kirmesgesellschaften.
Es gibt drei Wege, wie Termine hineinkommen:

| Weg                               | Wer                | Status im Kalender                                |
| --------------------------------- | ------------------ | ------------------------------------------------- |
| 1. Recherche-Tabelle (CSV-Import) | Redaktion          | „bestätigt“ nur, wenn die Spalte _Bestätigt_ = ja |
| 2. Persönlicher Link              | Kirmesgesellschaft | immer „bestätigt“                                 |
| 3. „Termin melden“ (E-Mail)       | alle               | Redaktion trägt per Tabelle ein                   |

Der wirksamste Weg ist **2**: Jede Kirmesgesellschaft bekommt einmal einen Link und pflegt ab dann
Termine und Festplatz selbst. Die eigene Recherche (1) füllt den Kalender, bis möglichst viele
Gesellschaften mitmachen.

## 1. Recherche-Tabelle

Vorlage: [`docs/recherche/vorlage.csv`](../recherche/vorlage.csv) – in Google Sheets oder Excel öffnen,
befüllen, als CSV exportieren (Excel: „CSV UTF-8 (Trennzeichen-getrennt)“).

| Spalte            | Pflicht   | Beispiel                              | Hinweise                                                                                                                             |
| ----------------- | --------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Ort               | ja        | `Mühlberg`                            | Name wie im Ortsverzeichnis; bei gleichnamigen Orten Landkreis angeben oder den Slug aus der Ortsseiten-Adresse (`muehlberg`) nehmen |
| Landkreis         | nein      | `GTH`                                 | Kfz-Kennzeichen; nötig bei mehrdeutigen Ortsnamen                                                                                    |
| Datum             | ja        | `18.10.2026`                          | auch `2026-10-18`                                                                                                                    |
| Beginn            | nein      | `20:00`                               | auch `20 Uhr`, `20.00`                                                                                                               |
| Titel             | ja        | `Kirmestanz mit "Bandname"`           | Anführungszeichen werden automatisch zu „…“                                                                                          |
| Veranstaltungsort | nein      | `Festzelt`                            | gleiche Schreibweise wie der Festplatz der Gesellschaft                                                                              |
| Kategorie         | nein      | `kinder`                              | leer = automatisch aus dem Titel                                                                                                     |
| Bestätigt         | nein      | `ja`                                  | nur, wenn die Gesellschaft den Termin selbst bestätigt hat                                                                           |
| Quelle            | empfohlen | Link zum Post, „Telefonat KG, 12.10.“ | wird nicht veröffentlicht – dient als Nachweis der eigenen Recherche                                                                 |

```bash
npm run termine:import -- meine-recherche.csv --probe   # nur prüfen
npm run termine:import -- meine-recherche.csv           # einspielen
```

Fehlerhafte Zeilen werden mit Zeilennummer gemeldet und übersprungen. Ein erneuter Import derselben
Tabelle aktualisiert vorhandene Termine (gleicher Ort, Datum und Titel), statt sie zu verdoppeln.

Recherche-Tabellen gehören nicht ins Repository: Ordner `recherche/` und Dateien `*.recherche.csv`
sind von Git ausgeschlossen.

## Was ihr übernehmen dürft – und was nicht

- **Fakten ja:** Ort, Datum, Uhrzeit, Art der Veranstaltung, Band – aus Instagram, Facebook,
  Amtsblättern, Aushängen, Band-Kalendern. Immer die Quelle notieren.
- **Fremde Sammlungen nein:** Keine vollständigen oder großen Teile fremder Terminlisten übernehmen
  (Datenbankherstellerrecht, §§ 87a ff. UrhG) – jeden Termin bei der Originalquelle prüfen.
- **Bilder und Texte nein:** Flyer, Fotos und Beschreibungstexte aus Posts sind urheberrechtlich
  geschützt und werden nicht übernommen.

## 2. Persönliche Links für Kirmesgesellschaften

```bash
npm run link -- erstellen muehlberg "Kirmesgesellschaft Mühlberg"
```

Den ausgegebenen Link direkt weitergeben (E-Mail, Messenger). Über den Link können die Gesellschaften:

- Termine anlegen, ändern, löschen und eure recherchierten Termine bestätigen,
- Festplätze auf der Karte setzen, damit „Route“ direkt hinführt.

Ein Link gilt nur für einen Ort. Jede Änderung wird protokolliert; `npm run link -- sperren <id>`
macht einen Link sofort ungültig.

## Ortsverzeichnis aktualisieren

Das Ortsverzeichnis (`db/seed/orte.json`) stammt aus OpenStreetMap. Gelegentlich aktualisieren:

```bash
npm run orte:aktualisieren && npm run db:orte
```
