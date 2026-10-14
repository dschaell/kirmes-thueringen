# 11. Risiken und technische Schulden

Ergebnis des initialen Architektur- und Code-Reviews. Jede Zeile ist als GitHub-Issue erfasst
(`scripts/setup-github.sh`); beim Schließen eines Issues wird die Zeile hier aktualisiert.

| Nr. | Risiko / Schuld                                                                                                                                                   | Schicht       | Auswirkung                                              | Priorität            |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------- | -------------------- |
| R1  | **Keine Redaktionsoberfläche** – Kirmesgesellschaften pflegen Termine und Festplätze per Link; die Redaktion arbeitet per CSV-Import, Meldungen kommen per E-Mail | Server        | Mehr Handarbeit für die Redaktion                       | P1                   |
| R2  | ~~Frontend liest Seed-Datei statt API~~ – **erledigt**: Website rendert serverseitig aus der API                                                                  | Client        | –                                                       | erledigt             |
| R3  | **Freitextsuche `ILIKE '%…%'` ohne Trigramm-Index**                                                                                                               | Data          | Sequenzieller Scan; skaliert schlecht bei vielen Jahren | P1                   |
| R4  | ~~Orte ohne Geokoordinaten~~ – **erledigt**: Ortsverzeichnis aus OpenStreetMap mit Koordinaten                                                                    | –             | –                                                       | erledigt             |
| R5  | ~~Import der Altdaten~~ – **entfallen**: Altdaten gelöscht, nur noch eigene Recherche                                                                             | –             | –                                                       | entfallen            |
| R6  | **Datenbankrechte**: App nutzt Owner-User mit DDL-Rechten                                                                                                         | Data          | Bei Kompromittierung der API vollständiger DB-Zugriff   | P1                   |
| R7  | **Performance-Szenario E1 unbelegt**                                                                                                                              | Server / Data | Keine Messgrundlage                                     | P2                   |
| R8  | **Leerer Kalender zum Start** – ohne Altdaten muss die Recherche vor dem Livegang genug Termine liefern                                                           | –             | Wenig Inhalt beim Start                                 | P0 (organisatorisch) |
| R9  | **Kein Rate-Limit am öffentlichen Einstieg** – das API-Limit gilt nur für externe Aufrufer, Seitenaufrufe über die Website sind ungedrosselt                      | Client        | Lastspitzen/Scraping treffen API und DB ungebremst      | P2                   |
