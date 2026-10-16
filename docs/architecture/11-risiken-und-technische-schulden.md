# 11. Risiken und technische Schulden

Ergebnis des initialen Architektur- und Code-Reviews. Jede Zeile ist als GitHub-Issue erfasst
(`scripts/setup-github.sh`); beim Schließen eines Issues wird die Zeile hier aktualisiert.

| Nr. | Risiko / Schuld                                                                                                                                      | Schicht | Auswirkung                                    | Priorität            |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | --------------------------------------------- | -------------------- |
| R1  | ~~Keine Redaktionsoberfläche~~ – **erledigt**: Admin-Bereich mit zwei Faktoren; Kirmesgesellschaften pflegen per Link                                | –       | –                                             | erledigt             |
| R2  | ~~Frontend liest Seed-Datei statt API~~ – **erledigt**: Website rendert serverseitig aus der API                                                     | Client  | –                                             | erledigt             |
| R3  | ~~Freitextsuche ohne Trigramm-Index~~ – **erledigt**: GIN-Trigramm-Indizes, EXPLAIN-Regressionstest (Migration 008)                                  | –       | –                                             | erledigt             |
| R4  | ~~Orte ohne Geokoordinaten~~ – **erledigt**: Ortsverzeichnis aus OpenStreetMap mit Koordinaten                                                       | –       | –                                             | erledigt             |
| R5  | ~~Import der Altdaten~~ – **entfallen**: Altdaten gelöscht, nur noch eigene Recherche                                                                | –       | –                                             | entfallen            |
| R6  | ~~App nutzt Owner-User mit DDL-Rechten~~ – **erledigt**: Rolle `kirmes_app` ohne DDL, Migrationen als Owner (Kap. 7)                                 | –       | –                                             | erledigt             |
| R7  | ~~Performance-Szenario E1 unbelegt~~ – **erledigt**: gemessen p95 114 ms bei 10.000 Terminen (Kap. 10)                                               | –       | –                                             | erledigt             |
| R8  | **Leerer Kalender zum Start** – ohne Altdaten muss die Recherche vor dem Livegang genug Termine liefern                                              | –       | Wenig Inhalt beim Start                       | P0 (organisatorisch) |
| R9  | ~~Kein Rate-Limit am öffentlichen Einstieg~~ – **erledigt**: Website begrenzt Seitenaufrufe je Client-IP (Kap. 7)                                    | –       | –                                             | erledigt             |
| R10 | **Nur ein Admin-Prozess**: Fehlversuche und benutzte Einmalcodes liegen im Speicher der API; bei mehreren API-Instanzen müssten sie in die Datenbank | Server  | Schwächerer Brute-Force-Schutz bei Skalierung | P3                   |
