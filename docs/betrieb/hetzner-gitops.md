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
- **Erster Redaktionszugang – im Browser:** `https://kirmeskalender-thueringen.de/admin/einrichten`
  → „Einrichtungslink senden“. Der Link geht immer an das Redaktionspostfach (`MAIL_AN`), ist
  30 Minuten gültig und nur einmal nutzbar. Dort Anmelde-E-Mail und Passwort festlegen, die
  Authenticator-App per QR-Code verbinden und mit einem Code bestätigen. Danach ist man
  angemeldet und richtet am besten gleich einen Passkey ein.
- Sobald ein Admin existiert, ist `/admin/einrichten` gesperrt. Weitere Zugänge oder ein neues
  Passwort gehen über die CLI (`npm run admin`) bzw. die Redaktion.

## Fehlersuche

Ohne Docker-Rechte auf dem Server sind Container-Logs nur über den Server-Betreiber einsehbar
(`journalctl -u gitops-agent`, `docker logs kirmes-api`). Von außen prüfbar:

```bash
curl -sI https://kirmeskalender-thueringen.de/ | head -1
```
