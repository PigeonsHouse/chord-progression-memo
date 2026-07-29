ALTER TABLE songs ADD COLUMN time_signature_numerator INTEGER NOT NULL DEFAULT 4;
ALTER TABLE songs ADD COLUMN time_signature_denominator INTEGER NOT NULL DEFAULT 4;
