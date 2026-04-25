-- Purge des seed/démo restants (timestamp signature .607909)
DELETE FROM public.outages WHERE EXTRACT(MICROSECOND FROM starts_at) = 607909;
DELETE FROM public.outage_history WHERE EXTRACT(MICROSECOND FROM starts_at) = 607909;

-- Purge du bruit du scraper HTML "informations-reseau"
DELETE FROM public.outages WHERE source_url = 'https://www.smgeag.fr/informations-reseau/';
DELETE FROM public.outage_history WHERE source_url = 'https://www.smgeag.fr/informations-reseau/';

-- Purge également des entrées avec micros .717 issues du même scraper bruité
DELETE FROM public.outages WHERE EXTRACT(MICROSECOND FROM starts_at) = 717000;
DELETE FROM public.outage_history WHERE EXTRACT(MICROSECOND FROM starts_at) = 717000;