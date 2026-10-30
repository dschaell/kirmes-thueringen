-- Zugriffszahlen ohne Tracking (Issue #311): nur Seitenaufrufe je Tag und Pfad – keine IP, keine
-- Cookies, kein Referrer, keine Kennung. Nur ergänzend: neue Tabelle; nach 400 Tagen gelöscht.
CREATE TABLE seitenaufruf (
  tag date NOT NULL,
  pfad text NOT NULL CHECK (char_length(pfad) BETWEEN 1 AND 200),
  anzahl integer NOT NULL CHECK (anzahl > 0),
  PRIMARY KEY (tag, pfad)
);
