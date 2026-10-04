-- Bulk synthetic data for load testing ONE existing church (create it first with cmsbackend/tools/seed-demo.mjs).
-- Run as the database OWNER (it must see past row-level security):
--   docker compose -p cms -f ../docker-compose.prod.yml exec -T postgres psql -U cms -d cms \
--     -v slug=grace-demo -v members=50000 -v gifts=500000 -v ON_ERROR_STOP=1 < seed-bulk.sql
-- Names are synthetic and the data is clearly fake (bulk-<n>@bulk.test, phone 07xx).
\set ON_ERROR_STOP on
BEGIN;
SELECT id AS church_id FROM churches WHERE slug = :'slug' \gset
SELECT coalesce(max(id), 0) AS base FROM members \gset

INSERT INTO members (church_id, first_name, last_name, email, phone_number, status, membership_date, created_at, updated_at)
SELECT :church_id,
       (ARRAY['Wanjiku','Otieno','Achieng','Kamau','Mwangi','Njeri','Odhiambo','Atieno','Kiprop','Chebet','Muthoni','Ochieng','Wambui','Kiptoo','Akinyi','Maina','Nyambura','Mutua','Naliaka','Barasa','Moraa','Kibet','Wafula','Auma','Gitau','Chepkoech','Juma','Zawadi','Baraka','Neema','Jelagat','Omondi','Wekesa','Mwikali','Kioko','Nduta','Okoth','Cherono','Mumbi','Anyango'])[1 + (i % 40)],
       (ARRAY['Kamau','Otieno','Mwangi','Odhiambo','Kiprotich','Njoroge','Mutua','Wafula','Chebet','Ochieng','Kariuki','Omondi','Kimani','Langat','Wanjala','Mbugua','Owino','Rotich','Maina','Onyango','Gitonga','Barasa','Korir','Waweru','Ndungu','Simiyu','Cheruiyot','Nyaga','Okello','Kibet','Muriuki','Atieno','Karanja','Opiyo','Sang','Macharia','Wekesa','Njuguna','Biwott','Ouma','Mugo','Kosgei','Nyongesa','Gathoni','Wangari','Mburugu','Ngugi','Kirui','Mulwa','Oduor','Kilonzo','Githinji','Munyao','Nekesa','Orwa','Tanui','Mukami','Awuor','Kiplagat','Wairimu'])[1 + ((i / 40) % 60)],
       'bulk-' || i || '@bulk.test',
       '07' || lpad((10000000 + i)::text, 8, '0'),
       'Active',
       current_date - ((i * 7919) % 2200),
       now() - ((i % 700) || ' days')::interval, now()
FROM generate_series(1, :members) AS i;

SELECT min(id) AS first_member, max(id) AS last_member FROM members WHERE church_id = :church_id AND email LIKE 'bulk-%@bulk.test' \gset
SELECT id AS fund_id FROM funds WHERE church_id = :church_id ORDER BY id LIMIT 1 \gset
SELECT id AS type_id, name AS type_name FROM giving_types WHERE church_id = :church_id ORDER BY id LIMIT 1 \gset

INSERT INTO contribution (church_id, member_id, amount, contribution_date, contribution_type, payment_method, fund_id, giving_type_id, status, source, created_at, updated_at)
SELECT :church_id,
       :first_member + ((g::bigint * 2654435761) % (:last_member - :first_member + 1)),
       round((50 + ((g::bigint * 40503) % 500000) / 100.0)::numeric, 2),
       current_date - ((g * 31) % 1095),
       :'type_name',
       (ARRAY['Cash','M-Pesa','Bank','Cheque'])[1 + (g % 4)],
       :fund_id, :type_id, 'POSTED', 'MANUAL', now(), now()
FROM generate_series(1, :gifts) AS g;
COMMIT;
ANALYZE members; ANALYZE contribution;
SELECT 'members' AS what, count(*) FROM members WHERE church_id = :church_id
UNION ALL SELECT 'contributions', count(*) FROM contribution WHERE church_id = :church_id;
