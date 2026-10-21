-- datenaenderung-freigegeben: #229
-- Ständchen, die noch aus der Zeit vor der eigenen Art (#135) als Gottesdienst ('tradition')
-- eingeordnet sind, werden 'staendchen' (Issue #229, Entscheidung des Betreibers; z. B. Alkersleben).
-- Gleiche Erkennung wie im Core. Neue Version für Kalender-Abos. Alle anderen Daten bleiben.
UPDATE termin SET kategorie = 'staendchen', version = version + 1, geaendert_am = now()
 WHERE kategorie = 'tradition' AND titel ~* '(ständchen|staendchen|standchen)';
UPDATE vorschlag_termin SET kategorie = 'staendchen'
 WHERE kategorie = 'tradition' AND titel ~* '(ständchen|staendchen|standchen)';
