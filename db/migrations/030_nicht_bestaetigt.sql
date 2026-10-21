-- datenaenderung-freigegeben: #240
-- „Bestätigt“ setzt künftig nur die Kirmesgesellschaft selbst (Issue #240, Entscheidung des
-- Betreibers). Diese sieben Termine wurden von der Redaktion als bestätigt markiert und werden
-- wieder „nicht bestätigt“. Gezielt über die Termin-IDs; neue Version für Kalender-Abos.
UPDATE termin SET bestaetigt = false, version = version + 1, geaendert_am = now()
 WHERE bestaetigt
   AND id IN (
     'd877b379-7881-45d7-9ccf-0f954d32128e', -- Kirmesgottesdienst, Alkersleben
     'a047d5a9-5e98-43e5-89d8-3db01b6a6f45', -- Kirmestanz, Alkersleben
     '439483a4-d08c-4c90-894e-f4a2362146c2', -- Ständchen, Alkersleben
     '1529f2b9-4e05-41f5-b485-116ca63d7d41', -- Kinderkirmes, Alkersleben
     '974f10b9-6b6a-498c-b802-ec4b57b45ffd', -- Kirmesparty, Alkersleben
     '837e5b5e-4ce6-41bf-9fe2-d4ee50554823', -- Traditionelles Frühschoppen, Alkersleben
     '2b61c497-4420-459a-ba87-c46598aae563'  -- Kirmesparty, Kirchheim
   );
