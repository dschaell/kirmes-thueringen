# Werkzeug-Image für Entwicklung und Prüfung (nur lokal und in der CI-Nachbildung, nie auf dem Server).
# Node.js wie in den Produktions-Images; git für den Upgrade-Test, psql für Datenbankarbeiten.
FROM node:26-alpine
RUN apk add --no-cache git postgresql17-client bash
WORKDIR /app
