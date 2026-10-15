# ADR 022: Rate-Limit in der Website statt Caddy-Modul

- **Status:** angenommen
- **Kontext:** siehe [arc42 Kap. 9](../09-architekturentscheidungen.md) und die verlinkten Kapitel

## Entscheidung

Rate-Limit in der Website statt Caddy-Modul.

## Begründung

Kein eigenes Caddy-Image nötig; Limit kennt die Seitenstruktur (statische Dateien zählen nicht); X-Forwarded-For nur aus dem internen Netz; per Umgebung einstellbar

## Verworfene Alternativen

caddy-ratelimit (eigenes Image, eigener Build- und Update-Pfad); Limit nur in der API (Seitenaufrufe blieben ungedrosselt)
