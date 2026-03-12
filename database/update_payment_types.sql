-- Run this in Supabase SQL Editor to apply the latest changes to the payments module

-- 1. DROP the old constraint FIRST! (Otherwise it blocks the update)
ALTER TABLE beneficiaries DROP CONSTRAINT IF EXISTS beneficiaries_type_check;

-- 2. Update any existing invalid rows to the new default ('transfer' is now valid because we dropped the old rule)
UPDATE beneficiaries 
SET type = 'transfer' 
WHERE type NOT IN ('equipo', 'influencer', 'comisiones', 'transfer', 'piso_yure');

-- 3. ADD the new constraint after data is clean
ALTER TABLE beneficiaries ADD CONSTRAINT beneficiaries_type_check 
    CHECK (type IN ('equipo', 'influencer', 'comisiones', 'transfer', 'piso_yure'));

-- 4. Set default type to 'transfer' for existing or new rows safely
ALTER TABLE beneficiaries ALTER COLUMN type SET DEFAULT 'transfer';

-- 5. Change amount_admk and amount_infinite to VARCHAR
ALTER TABLE payments ALTER COLUMN amount_admk TYPE VARCHAR(100);
ALTER TABLE payments ALTER COLUMN amount_infinite TYPE VARCHAR(100);
