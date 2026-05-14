-- Purge false positives created by the generic SMGEAG scraper when it parsed
-- homepage/navigation text as live official outages. Weekly planning data is
-- imported by scrape_planning.ts and must not come from https://www.smgeag.fr/.

DELETE FROM public.notification_logs
WHERE outage_id IN (
  SELECT id
  FROM public.outages
  WHERE source_url = 'https://www.smgeag.fr/'
    AND external_id LIKE 'smgeag_%'
    AND (
      description ILIKE '%Agence En Ligne%'
      OR description ILIKE '%Carte Infos R%seau%'
      OR description ILIKE '%Planning des tours d%eau%'
      OR description ILIKE '%No results found%'
    )
);

DELETE FROM public.outages
WHERE source_url = 'https://www.smgeag.fr/'
  AND external_id LIKE 'smgeag_%'
  AND (
    description ILIKE '%Agence En Ligne%'
    OR description ILIKE '%Carte Infos R%seau%'
    OR description ILIKE '%Planning des tours d%eau%'
    OR description ILIKE '%No results found%'
  );

DELETE FROM public.outage_history
WHERE source_url = 'https://www.smgeag.fr/'
  AND external_id LIKE 'smgeag_%'
  AND (
    description ILIKE '%Agence En Ligne%'
    OR description ILIKE '%Carte Infos R%seau%'
    OR description ILIKE '%Planning des tours d%eau%'
    OR description ILIKE '%No results found%'
  );
