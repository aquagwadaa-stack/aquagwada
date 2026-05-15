-- Second-pass purge for bogus outages created by the old generic SMGEAG scraper
-- from https://www.smgeag.fr/ homepage/navigation text. The homepage is not a
-- valid outage source; real weekly planning rows use the post URL instead.

DELETE FROM public.notification_logs nl
USING public.outages o
WHERE nl.outage_id = o.id
  AND o.source_url = 'https://www.smgeag.fr/';

DELETE FROM public.outages
WHERE source_url = 'https://www.smgeag.fr/';

DELETE FROM public.outage_history
WHERE source_url = 'https://www.smgeag.fr/';
