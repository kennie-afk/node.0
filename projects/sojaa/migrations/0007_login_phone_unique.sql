-- Sign-in finds a person by phone number alone, before any organisation is known. Until now the only
-- unique key was (org_id, phone), so the same number could exist in two organisations and the lookup
-- picked one of them arbitrarily, and with no index leading on phone every sign-in and every guard
-- check-in was a sequential scan of the whole table.
--
-- A number may now belong to one active staff account in total. If existing data already breaks that,
-- fail loudly instead of guessing which account to disable.
DO $$
DECLARE clash text;
BEGIN
  SELECT string_agg(phone, ', ') INTO clash FROM (
    SELECT phone FROM users WHERE status = 'active' GROUP BY phone HAVING count(*) > 1 LIMIT 10
  ) duplicates;
  IF clash IS NOT NULL THEN
    RAISE EXCEPTION 'cannot make sign-in phone numbers unique: these are active in more than one organisation: %', clash;
  END IF;
END $$;

CREATE UNIQUE INDEX users_phone_active_unique ON users (phone) WHERE status = 'active';

-- Guard check-in looks a guard up by phone alone as well. A guard can legitimately hold records at
-- more than one firm, so this one is an index, not a constraint.
CREATE INDEX guards_phone_lookup ON guards (phone) WHERE phone IS NOT NULL AND status = 'active' AND pin_hash IS NOT NULL;
