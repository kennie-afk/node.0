-- Keyset paging on member_no / loan_no broke past 99,999: they are text, so 'M100000' sorts before 'M99999'.
-- A stored generated column holds the digits of the number as a bigint, so every existing row is backfilled by the
-- table rewrite itself (no row level security is touched) and every insert path gets it for free. Lists page on it.
-- The number a person quotes on M-Pesa is unchanged.
ALTER TABLE members ADD COLUMN member_seq bigint GENERATED ALWAYS AS (NULLIF(regexp_replace(member_no, '[^0-9]', '', 'g'), '')::bigint) STORED;
ALTER TABLE loans ADD COLUMN loan_seq bigint GENERATED ALWAYS AS (NULLIF(regexp_replace(loan_no, '[^0-9]', '', 'g'), '')::bigint) STORED;
CREATE UNIQUE INDEX members_org_seq_idx ON members (org_id, member_seq);
CREATE UNIQUE INDEX loans_org_seq_idx ON loans (org_id, loan_seq);

-- Contains-searches ('%ann%') cannot use a btree; trigram GIN indexes can.
CREATE INDEX members_name_trgm_idx ON members USING gin (lower(full_name) gin_trgm_ops);
CREATE INDEX members_no_trgm_idx ON members USING gin (lower(member_no) gin_trgm_ops);
CREATE INDEX members_phone_trgm_idx ON members USING gin (phone gin_trgm_ops);
CREATE INDEX loans_no_trgm_idx ON loans USING gin (lower(loan_no) gin_trgm_ops);
CREATE INDEX mpesa_payments_ref_trgm_idx ON mpesa_payments USING gin (lower(external_ref) gin_trgm_ops);
CREATE INDEX mpesa_payments_billref_trgm_idx ON mpesa_payments USING gin (lower(bill_ref) gin_trgm_ops);
