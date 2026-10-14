#!/usr/bin/env bash
# Richtet das GitHub-Repository des Kirmeskalenders ein: Repo, Sicherheitsfunktionen, Labels,
# Branch Protection und das priorisierte Issue-Backlog aus dem initialen Architektur-Review.
#
# Idempotent: Mehrfaches Ausführen legt nichts doppelt an.
# Voraussetzung: gh ≥ 2.40, angemeldet mit `gh auth login` (Scopes: repo, admin:repo_hook).
#
#   REPO=dschaell/kirmes-thueringen ./scripts/setup-github.sh
set -euo pipefail

REPO="${REPO:-$(gh api user --jq .login)/kirmes-thueringen}"
BRANCH="main"
echo "▶ Repository: $REPO"

# ─────────────────────────────────────────────── 1. Repository
if ! gh repo view "$REPO" >/dev/null 2>&1; then
  gh repo create "$REPO" --public \
    --description "Kirmeskalender Thüringen – Kirmestermine suchen, filtern und verwalten" \
    --source . --remote origin --push
fi

gh repo edit "$REPO" \
  --enable-issues --enable-wiki=false --enable-projects=false \
  --enable-squash-merge --enable-merge-commit=false --enable-rebase-merge=false \
  --delete-branch-on-merge \
  --add-topic kirmes --add-topic thueringen --add-topic clean-architecture --add-topic postgresql

# ─────────────────────────────────────────────── 2. Sicherheitsfunktionen
gh api -X PUT "repos/$REPO/vulnerability-alerts" --silent                # Dependabot-Alerts
gh api -X PUT "repos/$REPO/automated-security-fixes" --silent            # Dependabot-Security-PRs
gh api -X PATCH "repos/$REPO" --silent --input - <<'JSON'
{ "security_and_analysis": {
    "secret_scanning": { "status": "enabled" },
    "secret_scanning_push_protection": { "status": "enabled" } } }
JSON
gh api -X PUT "repos/$REPO/private-vulnerability-reporting" --silent || true

# Optional, beschleunigt OWASP Dependency-Check erheblich (https://nvd.nist.gov/developers/request-an-api-key):
#   gh secret set NVD_API_KEY --repo "$REPO"

# ─────────────────────────────────────────────── 3. Labels
label() { gh label create "$1" --repo "$REPO" --color "$2" --description "$3" --force >/dev/null; }
# Typ
label "bug"             "d73a4a" "Fehlverhalten"
label "feature"         "0e8a16" "Neue Funktion"
label "security"        "b60205" "Sicherheitsrelevant (OWASP, Secrets, CVEs)"
label "documentation"   "0075ca" "arc42 / README / Kommentare"
# Schicht
label "client"          "c5def5" "Client-Tier: apps/web"
label "server"          "bfd4f2" "Server-Tier: apps/api, packages/core"
label "data-postgresql" "5319e7" "Data-Tier: PostgreSQL/PostGIS, db/"
# Priorität
label "P0: Critical"    "b60205" "Sofort – blockiert Release oder Sicherheit"
label "P1: High"        "d93f0b" "Nächster Sprint"
label "P2: Medium"      "fbca04" "Geplant"
label "P3: Low"         "c2e0c6" "Bei Gelegenheit"

# ─────────────────────────────────────────────── 4. Branch Protection
gh api -X PUT "repos/$REPO/branches/$BRANCH/protection" --silent --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["Quality Gate"] },
  "enforce_admins": false,
  "required_pull_request_reviews": { "required_approving_review_count": 0, "dismiss_stale_reviews": true },
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true,
  "restrictions": null
}
JSON

# ─────────────────────────────────────────────── 5. Issues
# Gemeinsame Definition of Done für alle Issues
DOD_BASIS='### Definition of Done (allgemein)
- [ ] Pipeline **Security & Quality** grün (Secrets, Lint, Tests, SAST, SCA, DAST)
- [ ] Testabdeckung nicht gesunken (Coverage-Ratchet), neue Logik mit Tests
- [ ] Schichtenregeln eingehalten (`npm run lint` inkl. dependency-cruiser), keine neuen Abhängigkeiten im Core
- [ ] Code-Review durch mindestens eine weitere Person bzw. dokumentierte Selbstreview-Checkliste
- [ ] Betroffene arc42-Kapitel im **selben PR** aktualisiert'

issue() { # issue "Titel" "label1,label2,…" "Body"
  if gh issue list --repo "$REPO" --state all --search "in:title \"$1\"" --json title --jq '.[].title' | grep -qxF "$1"; then
    echo "  = vorhanden: $1"
  else
    gh issue create --repo "$REPO" --title "$1" --label "$2" --body "$3
$DOD_BASIS" >/dev/null && echo "  + angelegt: $1"
  fi
}

issue "Authentifizierung und Autorisierung für Verwaltungs-Endpunkte einführen" \
  "security,feature,server,P0: Critical" \
  '## Problem
`LegeTerminAn` (packages/core) ist implementiert, aber bewusst **nicht** per HTTP erreichbar: Es gibt keine Authentifizierung. Ohne AuthN/AuthZ würde jeder Termine anlegen können (OWASP A01 Broken Access Control, A07 Identification & Authentication Failures).

## Umsetzung
- Rolle `redaktion` (später `veranstalter` für eigene Termine)
- OIDC (z. B. Keycloak/Authentik) oder Passkeys; Sessions als `HttpOnly; Secure; SameSite=Strict`-Cookie
- `POST /api/v1/termine`, `PATCH /api/v1/termine/:id` nur mit Rolle; CSRF-Schutz
- Autorisierung als **Port im Core** (`Berechtigungspruefung`), Implementierung im Adapter – keine Framework-Typen im Use Case
- Audit-Log: wer hat welchen Termin wann geändert

### Clean-Code-Kriterien
- [ ] Use Cases erhalten einen `Akteur` als Parameter, prüfen Rechte über einen Port
- [ ] HTTP-Adapter mappt Auth-Fehler auf 401/403 Problem Details, ohne Interna
- [ ] Rate-Limit für Login-Versuche

### arc42
- [ ] Kap. 5.2 (neuer Port, neue Endpunkte), Kap. 6 (Laufzeitsicht „Termin anlegen“ mit Login)
- [ ] Kap. 8.5 (A01/A07 von „geplant“ auf „umgesetzt“), Kap. 11 (R1 schließen)'

issue "Frontend auf API umstellen – Seed-Zugriff aus dem Client-Tier entfernen" \
  "bug,client,server,P1: High" \
  '## Problem
`apps/web/src/lib/data.ts` importiert `db/seed/termine*.json` direkt. Damit umgeht der Client-Tier den Server-Tier – eine **Verletzung der N-Tier-Schichtengrenze**: Änderungen in PostgreSQL erscheinen nicht auf der Website, es gibt zwei Datenquellen.

## Umsetzung
- Build-Zeit: Astro lädt Orte/Termine über `GET /api/v1/termine` (paginiert) – Port `TerminQuelle` im Web mit API-Adapter
- Laufzeit: `/termine` fragt die API statt `/termine.json`
- Täglicher Rebuild (CI-Schedule) bzw. Webhook nach Änderungen
- CSP `connect-src` um die API-Origin erweitern

### Clean-Code-Kriterien
- [ ] Keine Imports aus `db/` in `apps/web` (neue dependency-cruiser-Regel `web-nicht-auf-data`)
- [ ] Gemeinsame DTO-Typen statt doppelter Interfaces (`data-client.ts` entfällt)
- [ ] Fehlerfall „API nicht erreichbar“ beim Build bricht den Build ab statt leere Seiten zu erzeugen

### arc42
- [ ] Kap. 5.4 (Datenzugriff), Kap. 3.2 (Kanal Web→API), Kap. 11 (R2 schließen)'

issue "Trigramm-Index (pg_trgm) für die Freitextsuche und EXPLAIN-Regressionstest" \
  "feature,data-postgresql,P1: High" \
  '## Problem
Die Suche nutzt `ILIKE '"'"'%…%'"'"'` auf `termin.titel`, `ort.name`, `termin.veranstaltungsort`. B-Tree-Indizes greifen dafür nicht → **sequenzieller Scan**. Die Indizes auf `ort.landkreis` und `termin.datum` existieren, aber die Kombination mit Freitext ist ungetestet.

## Umsetzung
- Migration `002_suche_trgm.sql`: `CREATE EXTENSION pg_trgm`, GIN-Indizes `gin_trgm_ops` auf die drei Spalten
- Optional: generierte Spalte `suchtext` (unaccent + lower) mit einem Index statt drei
- Integrationstest: `EXPLAIN (FORMAT JSON)` der Suche enthält keinen `Seq Scan` auf `termin` bei ≥ 10.000 Testzeilen

### Clean-Code-Kriterien
- [ ] SQL bleibt eine Konstante (keine dynamische Index-Hinterlist)
- [ ] Migration ist idempotent und in einer Transaktion
- [ ] Messwert für Szenario E1 (p95 < 200 ms) dokumentiert

### arc42
- [ ] Kap. 5.3 (Index-Tabelle), Kap. 10 (E1 mit Messwert), Kap. 11 (R3 schließen)'

issue "Geokoordinaten der Kirmesorte via OpenStreetMap und Kartenansicht" \
  "feature,data-postgresql,client,P1: High" \
  '## Problem
`ort.lage` (PostGIS `geography(Point, 4326)`, GiST-indiziert) ist für alle Orte leer. Die Kartenansicht (F4) ist damit nicht umsetzbar.

## Umsetzung
- Batch-Job `geokodiere-orte`: Nominatim mit eigenem User-Agent, ≤ 1 Anfrage/s, Begrenzung auf Thüringen (`viewbox` + `bounded=1`), Ergebnisse in `ort.lage`
- Port `Geocoder` im Core; Nominatim-Adapter in `infrastructure/`
- Endpunkt `GET /api/v1/orte?bbox=…` (ST_MakeEnvelope, Index-gestützt)
- Frontend: Leaflet-Karte mit Attribution „© OpenStreetMap-Mitwirkende“; Fallback ohne Karte, wenn OSM nicht erreichbar

### Clean-Code-Kriterien
- [ ] Kein Geocoding im Request-Pfad (nur Batch)
- [ ] Koordinaten außerhalb Thüringens werden verworfen (Domänenregel mit Test)
- [ ] CSP `img-src` nur um `tile.openstreetmap.org` erweitert

### arc42
- [ ] Kap. 3 (OSM-Kanäle von „optional“ auf „aktiv“), Kap. 2 (ODbL), Kap. 5, Kap. 8.3 (OSM-Ausfall), Kap. 11 (R4 schließen)'

issue "Least-Privilege-Datenbankrollen: App-User ohne DDL, separater Migrations-User" \
  "security,data-postgresql,P1: High" \
  '## Problem
API und Migrationen verwenden denselben Owner-User. Bei einer Kompromittierung der API (z. B. über eine künftige Lücke) wären `DROP TABLE` oder Schemaänderungen möglich (OWASP A01/A05, Defense in Depth).

## Umsetzung
- Rollen: `kirmes_migrator` (Owner, DDL), `kirmes_app` (nur `SELECT/INSERT/UPDATE` auf `termin`, `ort`, `veranstalter`; `SELECT` auf `landkreis`)
- `REVOKE ALL ON SCHEMA public FROM PUBLIC`
- Getrennte Verbindungs-URLs `DATABASE_URL` / `MIGRATION_DATABASE_URL`
- TLS-Pflicht zur DB in Produktion (`DB_SSL=true`)

### Clean-Code-Kriterien
- [ ] Rechte als versionierte Migration, nicht manuell
- [ ] Integrationstest: `kirmes_app` kann keine Tabelle löschen
- [ ] Keine Passwörter im Repo (TruffleHog-Gate)

### arc42
- [ ] Kap. 7 (Verteilung/Secrets), Kap. 8.5 (A01/A02), Kap. 11 (R6 schließen)'

issue "Importpipeline über Core-Validierung führen und verworfene Altdaten nachbearbeiten" \
  "bug,data-postgresql,server,P2: Medium" \
  '## Problem
Der Erstimport (`scripts/import_alt.py` → `db/seed/termine.json` → `seed.ts`) verliert Daten: **126 Termine ohne Datum** (`????`), **83 ohne gültigen Landkreis** (z. B. „Haina b. Gotha“, „Göringen (ESA)“), **2 ungültige Uhrzeiten**. Gleichnamige Orte werden nur im Python-Skript per Kreis-Suffix getrennt – diese Regel fehlt im Core.

## Umsetzung
- Use Case `ImportiereTermine` im Core (Bericht: übernommen / Hinweis / verworfen mit Grund)
- Ortsnamen-Mapping-Tabelle für Sonderfälle (Kreis per Ortsverzeichnis ermitteln)
- Termine ohne Datum als „Datum offen“ speichern **oder** begründet verwerfen – fachliche Entscheidung dokumentieren
- Python-Skript liefert nur noch Rohdaten, keine Fachlogik

### Clean-Code-Kriterien
- [ ] Eine Validierungsquelle (Core), kein doppeltes Regelwerk in Python
- [ ] Importbericht als Test-Fixture abgesichert

### arc42
- [ ] Kap. 6 (Laufzeitsicht Import), Kap. 9 (ADR „Termine ohne Datum“), Kap. 11 (R5 schließen)'

issue "Performance-Baseline der Suche messen und als Qualitätsszenario E1 belegen" \
  "feature,server,data-postgresql,P2: Medium" \
  '## Problem
Szenario E1 (p95 < 200 ms für Jahres-Suche in einem Landkreis bei 10.000 Terminen) ist nicht gemessen. Ohne Baseline sind Regressionen (z. B. durch fehlende Indizes) unsichtbar.

## Umsetzung
- Testdatengenerator (10.000 Termine, 900 Orte, alle 23 Kreise)
- Lasttest (k6 oder autocannon) gegen `docker compose`-Stack
- Optionaler CI-Job (wöchentlich) mit Schwellenwert

### Clean-Code-Kriterien
- [ ] Generator nutzt Domänen-Factory (`validiereTermin`), keine Roh-INSERTs am Core vorbei
- [ ] Ergebnisse reproduzierbar (fixer Seed)

### arc42
- [ ] Kap. 10 (E1 mit Messwert), Kap. 11 (R7 schließen)'

issue "arc42 vervollständigen: ADRs als eigene Dateien und Betriebshandbuch" \
  "documentation,P2: Medium" \
  '## Problem
Architekturentscheidungen stehen nur als Tabelle in Kap. 9. Betrieb (Backup/Restore, Rotation von Secrets, Incident bei DB-Ausfall) ist nicht beschrieben.

## Umsetzung
- `docs/architecture/adr/NNN-titel.md` im MADR-Format für ADR 001–009
- Runbook: Backup (`pg_dump`), Restore-Test, Secret-Rotation, Vorgehen bei 503-Häufung
- PR-Template prüft „arc42 aktualisiert“

### Clean-Code-Kriterien
- [ ] Markdown via Prettier formatiert, Mermaid-Diagramme rendern auf GitHub
- [ ] Links zwischen Kapiteln funktionieren

### arc42
- [ ] Kap. 7, Kap. 9, Kap. 12 (neue Begriffe)'

echo "✔ Fertig: https://github.com/$REPO/issues"
