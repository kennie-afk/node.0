-- The hourly billing cycle used to walk every organisation on every replica. This returns only the ones
-- with something to do, a page at a time (keyset on org_id): an invoice whose window has opened and which
-- has not been issued, or a stored status that no longer matches the one the dates give. The rules mirror
-- billing/state.ts (effectiveStatus, nextInvoiceWindow); the cycle still re-checks in TypeScript.
CREATE OR REPLACE FUNCTION billing_due_orgs(p_now timestamptz, p_lead_days int, p_suspend_days int, p_after uuid, p_limit int)
RETURNS TABLE (org_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH s AS (
    SELECT s.org_id, s.status, s.trial_ends_at,
           GREATEST(s.trial_ends_at, COALESCE(s.current_period_end, s.trial_ends_at)) AS covered
      FROM subscriptions s JOIN organisations o ON o.id = s.org_id
     WHERE s.status <> 'cancelled' AND NOT o.is_demo
       AND (p_after IS NULL OR s.org_id > p_after)
  )
  SELECT s.org_id FROM s
   WHERE (
           p_now >= s.covered - make_interval(days => p_lead_days)
           AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.org_id = s.org_id AND i.period_start = date_trunc('milliseconds', s.covered))
         )
      OR s.status <> (CASE
           WHEN p_now < s.trial_ends_at THEN 'trial'
           WHEN p_now < s.covered THEN 'active'
           WHEN p_now < s.covered + make_interval(days => p_suspend_days) THEN 'past_due'
           ELSE 'suspended' END)
   ORDER BY s.org_id
   LIMIT p_limit;
$$;
REVOKE ALL ON FUNCTION billing_due_orgs(timestamptz, int, int, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION billing_due_orgs(timestamptz, int, int, uuid, int) TO sojaa_app;
