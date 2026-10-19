# Betrieb auf Hetzner (GitOps)

Der Kalender läuft auf einem geteilten Hetzner-Server (`demos-01`, 94.130.178.64) neben anderen
Projekten. Deployt wird nicht von Hand, sondern über das Repo
[`intershopper/server-deployments`](https://github.com/intershopper/server-deployments):

```
Merge auf main (dieses Repo ODER server-deployments)
  → gitops-agent auf dem Server (alle 2 Min.)
      git pull server-deployments + dieses Repo
      sops --decrypt stacks/kirmes/.env.sops → .env (nur kurz)
      docker compose up -d --build   (Stack „kirmes“)
```

**Veröffentlichen = Merge auf `main`.** Feature-Branches werden nie deployt.

## Aufbau

| Teil                    | Wo                                                                       |
| ----------------------- | ------------------------------------------------------------------------ |
| Compose-Datei           | `server-deployments/stacks/kirmes/docker-compose.yml`                    |
| Secrets (verschlüsselt) | `server-deployments/stacks/kirmes/.env.sops`                             |
| HTTPS / Domain          | zentraler Caddy im Stack `prioliste` (`stacks/prioliste/Caddyfile`)      |
| Netz                    | nur `kirmes-web` am gemeinsamen Netz `web`; DB/API in `kirmes-intern`    |
| Daten                   | Volume `kirmes-db-daten`, tägliche Dumps in `/root/kirmes-backups`       |
| Code                    | dieses Repo, vom Server per HTTPS geklont nach `/root/kirmes-thueringen` |

Regeln auf dem geteilten Server: nichts von anderen Stacks ändern, stoppen oder löschen; kein
`docker system prune`. Änderungen an `stacks/prioliste/` nur anhängen und per PR.

## Secrets ändern

Klartext liegt nur lokal in `.env.server` (gitignored, chmod 600). Verschlüsselt wird für zwei
age-Keys: den Server-Key (Frank) und den eigenen (`~/.config/sops/age/keys.txt` – im
Passwortmanager sichern!).

```bash
# 1. .env.server bearbeiten, dann neu verschlüsseln (zeigt nur Namen/Längen):
scripts/server-env-verschluesseln.sh ~/Documents/server-deployments
# 2. in server-deployments committen, PR, mergen → Agent deployt
```

Die Datenbank-Passwörter (`POSTGRES_PASSWORD`, `APP_DB_PASSWORD`) nach dem ersten Start **nicht**
mehr ändern, ohne die Rollen in der Datenbank mit umzustellen.

## Erststart (leere Datenbank)

Auf dem Server führt niemand CLIs aus:

- **Ortsverzeichnis:** `migrate` lädt beim Deploy `db/seed/orte.json` (`ORTE_LADEN=ja` im Stack,
  idempotent).
- **Erster Admin – im Browser:** `https://kirmeskalender-thueringen.de/admin/einrichten`
  → „Einrichtungslink senden“. Der Link geht immer an das Redaktionspostfach (`MAIL_AN`), ist
  30 Minuten gültig und nur einmal nutzbar. Dort einen Namen wählen und einen **Passkey** anlegen
  (Face ID / Touch ID / PIN) – kein Passwort.
- Weitere Mitglieder: Anfrage über `/redaktion-mitmachen` kommt per Mail; ein Admin erzeugt unter
  „Mitglieder“ einen Einladungslink (7 Tage, einmalig) und schickt ihn selbst.
- Sobald ein Admin existiert, ist `/admin/einrichten` gesperrt. Sind alle Admins weg, öffnet sie
  sich wieder (Notweg über das Postfach).

## Sicherungen und Wiederherstellung

Der Dienst `backup` (Image aus `apps/backup`) sichert einmal täglich mit `pg_dump --format=custom`
nach `/root/kirmes-backups/kirmes-JJJJ-MM-TT.dump` und behält 14 Tage. Vor jedem Update legt
`sicherung-vor-update` zusätzlich `vor-update-*.dump` an (30 Tage). Den Stand schreibt `backup` in
`status.json`; die API liest das Verzeichnis nur lesend (`SICHERUNGEN_VERZEICHNIS`) und Admins
sehen auf der Startseite der Redaktion die letzte Sicherung – rot, wenn sie älter als 36 Stunden
ist, fehlgeschlagen ist oder die externe Kopie hakt.

**Externe Kopie (offsite) einschalten** – vorbereitet, aus, bis ein Ziel feststeht. In
`.env.server` eintragen, verschlüsseln, PR (siehe „Secrets ändern“):

```bash
AGE_EMPFAENGER=age1…              # öffentlicher Schlüssel; der private gehört in den Passwortmanager
OFFSITE_ZIEL=offsite:kirmes-sicherungen
RCLONE_CONFIG_OFFSITE_TYPE=s3     # z. B. Hetzner Storage Box (sftp) oder S3-kompatibel
RCLONE_CONFIG_OFFSITE_…=…         # Zugangsdaten des Ziels, siehe rclone-Doku
```

Passwörter für rclone-Ziele wie `sftp` müssen mit `rclone obscure` umgewandelt eingetragen werden.
Die Dumps gehen nur **verschlüsselt** (`*.dump.age`) nach außen; dort bleiben 30 Tage.

**Wiederherstellen** (lokal getestet: gleiche Zeilenzahlen in allen Tabellen):

```bash
age -d -i schluessel.txt kirmes-2026-10-19.dump.age > kirmes.dump   # nur bei externer Kopie
createdb kirmes_wiederherstellung
pg_restore --no-owner --no-acl --dbname=kirmes_wiederherstellung kirmes.dump
```

Meldungen „already exists“ zur PostGIS-Erweiterung sind harmlos.

Erst in eine neue Datenbank zurückspielen, prüfen, dann umstellen – nie über die laufende.

## Erreichbarkeit

Der Workflow `Erreichbarkeit` prüft alle 10 Minuten Startseite, `/termine` und `/kalender.ics`.
Scheitert eine Prüfung auch nach einer Minute, legt er ein Issue mit Label `ausfall` an (GitHub
schickt eine Mail) und kommentiert es bei weiteren Ausfällen; ist die Seite wieder da, schließt er
es. Inhaltliche Fehler findet die tägliche `Website-Prüfung`.

## Fehlersuche

Ohne Docker-Rechte auf dem Server sind Container-Logs nur über den Server-Betreiber einsehbar
(`journalctl -u gitops-agent`, `docker logs kirmes-api`). Von außen prüfbar:

```bash
curl -sI https://kirmeskalender-thueringen.de/ | head -1
```
