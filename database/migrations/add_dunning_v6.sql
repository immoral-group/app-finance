ALTER TABLE dunning_config
    ADD COLUMN IF NOT EXISTS show_logo boolean NOT NULL DEFAULT true;
