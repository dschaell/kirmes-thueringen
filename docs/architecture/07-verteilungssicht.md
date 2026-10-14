# 7. Verteilungssicht

```mermaid
flowchart LR
  subgraph Host["Container-Host (z. B. VPS / Kubernetes)"]
    RP["Reverse-Proxy<br/>TLS, HSTS"]
    subgraph netz["internes Netz"]
      W["web<br/>nginx-unprivileged:1.29<br/>UID 101, read-only"]
      A["api<br/>node:24-alpine<br/>User node, read-only"]
      P[("db<br/>postgis/postgis:17-3.5<br/>Volume db-daten")]
    end
  end
  Internet((Internet)) --> RP
  RP -->|/ | W
  RP -->|/api/| A
  A --> P
```

| Knoten | Image                               | Härtung                                                            |
| ------ | ----------------------------------- | ------------------------------------------------------------------ |
| web    | `apps/web/Dockerfile`               | unprivilegierter User, Read-only-FS, `no-new-privileges`, CSP      |
| api    | `apps/api/Dockerfile` (multi-stage) | ohne Dev-Abhängigkeiten, User `node`, Read-only-FS, Healthcheck    |
| db     | `postgis/postgis:17-3.5-alpine`     | Port nur `127.0.0.1` bzw. internes Netz, Passwort aus Secret-Store |

**Lokal:** `docker compose up -d --build --wait` startet alle drei Tiers; dieselbe Topologie
nutzt der DAST-Job in CI. Auf Apple Silicon läuft das PostGIS-Image per amd64-Emulation.

**Datenhaltung:** Tägliches `pg_dump` mit Aufbewahrung von 30 Tagen (Betriebsaufgabe).
