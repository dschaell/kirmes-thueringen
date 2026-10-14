-- Braucht ein Abend für Minderjährige eine Erziehungsbeauftragung („Muttizettel“)?
ALTER TABLE termin ADD COLUMN muttizettel boolean NOT NULL DEFAULT false;
