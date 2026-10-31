# 12. Glossar

| Begriff                     | Bedeutung                                                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Kirmes**                  | Kurzform von „Kirchmesse“: jährliches Dorffest zur Kirchweih; in Thüringen auch Kirmse.                                              |
| **Kirmesgesellschaft**      | Meist junge Leute eines Ortes, die die Kirmes organisieren (Kirmesburschen/-mädchen).                                                |
| **Kirmestanz**              | Abendveranstaltung mit Band oder DJ, Höhepunkt der Kirmes.                                                                           |
| **Kindertanz**              | Nachmittagsveranstaltung für Familien.                                                                                               |
| **Kirmesbeerdigung**        | Symbolischer Abschluss der Kirmes.                                                                                                   |
| **Herbstkirmes**            | Traditionelle Kirmeszeit September–November (`istHerbstKirmes`).                                                                     |
| **Landkreis-Kürzel**        | Kfz-Kennzeichen als fachlicher Schlüssel (z. B. `GTH` = Gotha).                                                                      |
| **Bestätigt**               | Termin vom Veranstalter (Kirmesgesellschaft) bestätigt; sonst aus öffentlicher Ankündigung recherchiert.                             |
| **Port**                    | Schnittstelle, die der Core definiert und ein äußerer Adapter implementiert.                                                         |
| **Adapter**                 | Implementierung eines Ports bzw. Übersetzung zwischen Außenwelt und Core (HTTP, PostgreSQL).                                         |
| **Composition Root**        | Einziger Ort, an dem konkrete Implementierungen verdrahtet werden (`apps/api/src/main.ts`).                                          |
| **Problem Details**         | Standardisiertes Fehlerformat für HTTP-APIs (RFC 9457).                                                                              |
| **SAST / SCA / DAST**       | Statische Code-Analyse / Analyse von Drittbibliotheken / dynamischer Test der laufenden Anwendung.                                   |
| **Bearbeitungslink**        | Früherer Link einer Kirmesgesellschaft zum Pflegen ohne Konto – entfernt (Issue #355), ersetzt durch Konten mit Passkey.             |
| **Recherche-Tabelle**       | CSV-Datei der Redaktion mit Terminen und Quellen, eingespielt per `npm run termine:import`.                                          |
| **Passkey**                 | Anmeldeschlüssel nach WebAuthn (Face ID, Touch ID, Windows Hello, Sicherheitsschlüssel); an die Domain gebunden, phishing-resistent. |
| **Erziehungsbeauftragung**  | „Muttizettel“ nach § 1 Abs. 1 Nr. 4 JuSchG; Vorlage zum Drucken am Termin.                                                           |
| **Kirmeswochenende**        | Mehrere Veranstaltungen einer Kirmesgesellschaft an aufeinanderfolgenden Tagen, gemeinsam angelegt (alle oder keine).                |
| **Kartenausschnitt (bbox)** | Rechteck `minLon,minLat,maxLon,maxLat` für die Abfrage der Orte einer Karte.                                                         |
| **Least Privilege**         | Jede Komponente bekommt nur die Rechte, die sie braucht – die API z. B. keine DDL-Rechte (Rolle `kirmes_app`).                       |
| **ADR / MADR**              | Architecture Decision Record im Format „Markdown Any Decision Records“, je Entscheidung eine Datei.                                  |
| **Rate-Limit**              | Obergrenze für Anfragen je Client-IP und Zeitfenster; darüber Antwort 429 mit `Retry-After`.                                         |
