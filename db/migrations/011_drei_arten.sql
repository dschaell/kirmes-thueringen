-- datenaenderung-freigegeben: #64
-- Nur noch drei klare Arten (Issue #64, Entscheidung des Betreibers): party (Tanz & Party),
-- familie (Familien & Kinder), tradition (Tradition). Vorhandene Termine werden nach dem TITEL neu
-- zugeordnet – wie die automatische Erkennung im Core –, sonst nach der früheren Art.
ALTER TABLE termin DROP CONSTRAINT termin_kategorie_check;

UPDATE termin SET kategorie = CASE
  WHEN titel ~* '(kinder|familie)' THEN 'familie'
  WHEN titel ~* '(gottesdienst|andacht|messe\M|kirchgang|ständchen|staendchen|umzug|beerdigung|kirmesbaum|baumsetzen|baum stellen|kirmesspiele|ausklang|platzkonzert|oster|fr(ü|ue|u)h\s*-?\s*sc?h?oppen)' THEN 'tradition'
  WHEN kategorie IN ('kinder') THEN 'familie'
  WHEN kategorie IN ('brauchtum', 'ostern', 'fruehschoppen') THEN 'tradition'
  ELSE 'party'
END;

ALTER TABLE termin ADD CONSTRAINT termin_kategorie_check
  CHECK (kategorie IN ('party', 'familie', 'tradition'));
