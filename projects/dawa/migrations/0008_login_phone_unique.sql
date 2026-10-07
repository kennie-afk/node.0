-- Sign-in finds a person by phone number alone, before any organisation is known. Until now the only
-- unique key was (org_id, phone), so the same number could exist in two organisations and the lookup
-- picked one of them arbitrarily (a PIN checked against another tenant's account), and with no index
-- leading on phone every sign-in was a sequential scan of the whole table.
--
-- A number may now belong to one active account in total. If existing data already breaks that, fail
-- loudly instead of guessing which account to disable.
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
