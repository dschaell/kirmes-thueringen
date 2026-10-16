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

Auf dem Server führt niemand CLIs aus. Deshalb erledigt `migrate` beim Deploy:

- **Ortsverzeichnis** (`ORTE_LADEN=ja` im Stack): lädt `db/seed/orte.json`, idempotent.
- **Erster Redaktionszugang** aus `ADMIN_EMAIL`, `ADMIN_PASSWORT_HASH`, `ADMIN_TOTP_GEHEIMNIS` –
  nur solange es noch gar keinen Admin gibt. Danach werden die Werte ignoriert.

Werte erzeugen (Passwort verdeckt eingeben; Hinweise zum zweiten Faktor erscheinen im Terminal,
nur die drei Variablen landen in der Datei):

```bash
npm run -s admin -w @kirmes/api -- startwerte deine@adresse.de >> .env.server
scripts/server-env-verschluesseln.sh ~/Documents/server-deployments
```

Den angezeigten Schlüssel sofort in der Authenticator-App eintragen. Nach der ersten Anmeldung
einen Passkey einrichten (Redaktion → Passkeys).

## Fehlersuche

Ohne Docker-Rechte auf dem Server sind Container-Logs nur über den Server-Betreiber einsehbar
(`journalctl -u gitops-agent`, `docker logs kirmes-api`). Von außen prüfbar:

```bash
curl -sI https://kirmeskalender-thueringen.de/ | head -1
```
