-- Sign-in and guard-PIN throttling that survives a restart and is shared by every replica (it used to be
-- an in-memory counter per process). Deliberately not tenant data: the key is a phone number, a client address
-- or both, so there is no org_id and no row-level security. Time is the database's clock.
CREATE TABLE auth_throttle (
  key           text PRIMARY KEY,
  fails         int NOT NULL DEFAULT 0,
  window_start  timestamptz NOT NULL DEFAULT now(),
  locked_until  timestamptz,
  level         int NOT NULL DEFAULT 0
);
CREATE INDEX auth_throttle_window_idx ON auth_throttle (window_start);
GRANT SELECT, INSERT, UPDATE, DELETE ON auth_throttle TO sojaa_app;

-- Counts one attempt against a key BEFORE the credential is checked (so a burst of parallel guesses cannot
-- slip past a check-then-count race). Returns 0 when the attempt may proceed, otherwise the seconds to wait.
-- Over p_limit attempts in the window locks the key for p_base_s, doubling at each repeat up to p_max_s.
-- Attempts made while locked are refused without counting, so hammering a locked key does not extend the lock.
CREATE FUNCTION auth_throttle_hit(p_key text, p_limit int, p_window_s int, p_base_s int, p_max_s int)
RETURNS int LANGUAGE plpgsql AS $$
DECLARE
  r auth_throttle%ROWTYPE;
  v_fails int;
  v_level int;
  v_wait int;
BEGIN
  INSERT INTO auth_throttle (key) VALUES (p_key) ON CONFLICT DO NOTHING;
  SELECT * INTO r FROM auth_throttle WHERE key = p_key FOR UPDATE;

  IF r.locked_until IS NOT NULL AND r.locked_until > now() THEN
    RETURN ceil(extract(epoch FROM r.locked_until - now()))::int;
  END IF;

  v_fails := r.fails;
  v_level := r.level;
  IF r.locked_until IS NOT NULL OR r.window_start < now() - make_interval(secs => p_window_s) THEN
    v_fails := 0;
    IF r.locked_until IS NULL OR r.locked_until < now() - interval '1 day' THEN v_level := 0; END IF;
    UPDATE auth_throttle SET window_start = now(), locked_until = NULL WHERE key = p_key;
  END IF;

  v_fails := v_fails + 1;
  IF v_fails > p_limit THEN
    v_wait := least(p_max_s::numeric, p_base_s::numeric * power(2, least(v_level, 20)))::int;
    UPDATE auth_throttle SET fails = 0, level = v_level + 1, window_start = now(), locked_until = now() + make_interval(secs => v_wait) WHERE key = p_key;
    RETURN v_wait;
  END IF;
  UPDATE auth_throttle SET fails = v_fails, level = v_level WHERE key = p_key;
  RETURN 0;
END $$;
