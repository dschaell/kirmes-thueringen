-- datenaenderung-freigegeben: #225
-- Fünf Termine gehören zur Art „Sonstiges“ (Issue #225, Entscheidung des Betreibers). Gezielt über
-- die Termin-IDs; gibt es sie nicht (andere Datenbank), passiert nichts. Neue Version für
-- Kalender-Abos. Alle anderen Daten bleiben unverändert.
UPDATE termin SET kategorie = 'sonstiges', version = version + 1, geaendert_am = now()
 WHERE kategorie <> 'sonstiges'
   AND id IN (
     '78a0f0a0-ba56-4695-9bb5-c4ecb7dd1eae', -- Seniorennachmittag, Holzhausen
     '93123085-281a-46b2-9708-f922708ece6a', -- Traditionelles Fußballspiel, Rittersdorf
     '9cc1baaf-7fe5-4ed0-9f31-1788fc2910e5', -- Kirmes-„Kater“-Lunch, Schmira
     '06ecc3fb-1422-49d9-bb4b-9672292999d6', -- Dämmershoppen, Schmira
     'd8e0fc19-6091-47f5-927c-92af1ae9639c'  -- Kirmesbeerdigung, Schmira
   );
