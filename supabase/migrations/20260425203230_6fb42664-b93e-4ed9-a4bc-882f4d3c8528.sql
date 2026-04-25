-- Purger toutes les coupures de la semaine 20-26 avril 2026 (données erronées)
DELETE FROM outages 
WHERE starts_at >= '2026-04-20 00:00:00+00'::timestamptz 
  AND starts_at < '2026-04-27 04:00:00+00'::timestamptz;

-- LES ABYMES zone 1
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, '1', '2026-04-21 00:00:00+00'::timestamptz, '2026-04-21 11:00:00+00'::timestamptz, 660, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Les Abymes';
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, '1', '2026-04-23 00:00:00+00'::timestamptz, '2026-04-23 11:00:00+00'::timestamptz, 660, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Les Abymes';
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, '1', '2026-04-25 00:00:00+00'::timestamptz, '2026-04-25 11:00:00+00'::timestamptz, 660, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Les Abymes';
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, '1', '2026-04-27 00:00:00+00'::timestamptz, '2026-04-27 11:00:00+00'::timestamptz, 660, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Les Abymes';

-- LES ABYMES zones 2 & 3
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, '2 & 3', '2026-04-21 00:00:00+00'::timestamptz, '2026-04-21 11:00:00+00'::timestamptz, 660, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Les Abymes';
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, '2 & 3', '2026-04-23 00:00:00+00'::timestamptz, '2026-04-23 11:00:00+00'::timestamptz, 660, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Les Abymes';
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, '2 & 3', '2026-04-25 00:00:00+00'::timestamptz, '2026-04-25 11:00:00+00'::timestamptz, 660, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Les Abymes';
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, '2 & 3', '2026-04-27 00:00:00+00'::timestamptz, '2026-04-27 11:00:00+00'::timestamptz, 660, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Les Abymes';

-- CAPESTERRE B/E 1 (jusqu'à 11h)
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, 'CAPESTERRE B/E 1', '2026-04-21 00:00:00+00'::timestamptz, '2026-04-21 15:00:00+00'::timestamptz, 900, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Capesterre-Belle-Eau';
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, 'CAPESTERRE B/E 1', '2026-04-23 00:00:00+00'::timestamptz, '2026-04-23 15:00:00+00'::timestamptz, 900, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Capesterre-Belle-Eau';
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, 'CAPESTERRE B/E 1', '2026-04-25 00:00:00+00'::timestamptz, '2026-04-25 15:00:00+00'::timestamptz, 900, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Capesterre-Belle-Eau';
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, 'CAPESTERRE B/E 1', '2026-04-27 00:00:00+00'::timestamptz, '2026-04-27 15:00:00+00'::timestamptz, 900, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Capesterre-Belle-Eau';

-- CAPESTERRE B/E 4
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, 'CAPESTERRE B/E 4', '2026-04-21 00:00:00+00'::timestamptz, '2026-04-21 11:00:00+00'::timestamptz, 660, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Capesterre-Belle-Eau';
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, 'CAPESTERRE B/E 4', '2026-04-23 00:00:00+00'::timestamptz, '2026-04-23 11:00:00+00'::timestamptz, 660, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Capesterre-Belle-Eau';
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, 'CAPESTERRE B/E 4', '2026-04-25 00:00:00+00'::timestamptz, '2026-04-25 11:00:00+00'::timestamptz, 660, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Capesterre-Belle-Eau';
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, 'CAPESTERRE B/E 4', '2026-04-27 00:00:00+00'::timestamptz, '2026-04-27 11:00:00+00'::timestamptz, 660, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Capesterre-Belle-Eau';

-- CAPESTERRE B/E 2 & 3
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, 'CAPESTERRE B/E 2 & 3', '2026-04-21 00:00:00+00'::timestamptz, '2026-04-21 11:00:00+00'::timestamptz, 660, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Capesterre-Belle-Eau';
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, 'CAPESTERRE B/E 2 & 3', '2026-04-23 00:00:00+00'::timestamptz, '2026-04-23 11:00:00+00'::timestamptz, 660, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Capesterre-Belle-Eau';
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, 'CAPESTERRE B/E 2 & 3', '2026-04-25 00:00:00+00'::timestamptz, '2026-04-25 11:00:00+00'::timestamptz, 660, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Capesterre-Belle-Eau';
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, 'CAPESTERRE B/E 2 & 3', '2026-04-27 00:00:00+00'::timestamptz, '2026-04-27 11:00:00+00'::timestamptz, 660, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Capesterre-Belle-Eau';

-- TERRE-DE-HAUT (Les Saintes)
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, 'LES SAINTES', '2026-04-21 00:00:00+00'::timestamptz, '2026-04-21 11:00:00+00'::timestamptz, 660, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Terre-de-Haut';
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, 'LES SAINTES', '2026-04-23 00:00:00+00'::timestamptz, '2026-04-23 11:00:00+00'::timestamptz, 660, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Terre-de-Haut';
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, 'LES SAINTES', '2026-04-25 00:00:00+00'::timestamptz, '2026-04-25 11:00:00+00'::timestamptz, 660, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Terre-de-Haut';
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, 'LES SAINTES', '2026-04-27 00:00:00+00'::timestamptz, '2026-04-27 11:00:00+00'::timestamptz, 660, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Terre-de-Haut';

-- TERRE-DE-BAS (Les Saintes)
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, 'LES SAINTES', '2026-04-21 00:00:00+00'::timestamptz, '2026-04-21 11:00:00+00'::timestamptz, 660, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Terre-de-Bas';
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, 'LES SAINTES', '2026-04-23 00:00:00+00'::timestamptz, '2026-04-23 11:00:00+00'::timestamptz, 660, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Terre-de-Bas';
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, 'LES SAINTES', '2026-04-25 00:00:00+00'::timestamptz, '2026-04-25 11:00:00+00'::timestamptz, 660, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Terre-de-Bas';
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, 'LES SAINTES', '2026-04-27 00:00:00+00'::timestamptz, '2026-04-27 11:00:00+00'::timestamptz, 660, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Terre-de-Bas';

-- TROIS-RIVIÈRES (général)
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, NULL, '2026-04-21 00:00:00+00'::timestamptz, '2026-04-21 11:00:00+00'::timestamptz, 660, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Trois-Rivières';
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, NULL, '2026-04-23 00:00:00+00'::timestamptz, '2026-04-23 11:00:00+00'::timestamptz, 660, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Trois-Rivières';
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, NULL, '2026-04-25 00:00:00+00'::timestamptz, '2026-04-25 11:00:00+00'::timestamptz, 660, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Trois-Rivières';
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, NULL, '2026-04-27 00:00:00+00'::timestamptz, '2026-04-27 11:00:00+00'::timestamptz, 660, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Trois-Rivières';

-- GOYAVE (lun, ven seulement)
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, NULL, '2026-04-21 00:00:00+00'::timestamptz, '2026-04-21 11:00:00+00'::timestamptz, 660, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Goyave';
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, NULL, '2026-04-25 00:00:00+00'::timestamptz, '2026-04-25 11:00:00+00'::timestamptz, 660, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Goyave';

-- GOURBEYRE (lun, mer, ven 17h→7h = 14h)
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, NULL, '2026-04-20 21:00:00+00'::timestamptz, '2026-04-21 11:00:00+00'::timestamptz, 840, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Gourbeyre';
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, NULL, '2026-04-22 21:00:00+00'::timestamptz, '2026-04-23 11:00:00+00'::timestamptz, 840, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Gourbeyre';
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, NULL, '2026-04-24 21:00:00+00'::timestamptz, '2026-04-25 11:00:00+00'::timestamptz, 840, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Gourbeyre';

-- SAINT-CLAUDE (TOUS LES JOURS 18h→5h = 11h, donc 22:00 UTC du jour J → 09:00 UTC J+1)
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, NULL, '2026-04-20 22:00:00+00'::timestamptz, '2026-04-21 09:00:00+00'::timestamptz, 660, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Saint-Claude';
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, NULL, '2026-04-21 22:00:00+00'::timestamptz, '2026-04-22 09:00:00+00'::timestamptz, 660, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Saint-Claude';
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, NULL, '2026-04-22 22:00:00+00'::timestamptz, '2026-04-23 09:00:00+00'::timestamptz, 660, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Saint-Claude';
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, NULL, '2026-04-23 22:00:00+00'::timestamptz, '2026-04-24 09:00:00+00'::timestamptz, 660, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Saint-Claude';
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, NULL, '2026-04-24 22:00:00+00'::timestamptz, '2026-04-25 09:00:00+00'::timestamptz, 660, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Saint-Claude';
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, NULL, '2026-04-25 22:00:00+00'::timestamptz, '2026-04-26 09:00:00+00'::timestamptz, 660, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Saint-Claude';
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, NULL, '2026-04-26 22:00:00+00'::timestamptz, '2026-04-27 09:00:00+00'::timestamptz, 660, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Saint-Claude';

-- SAINT-FRANÇOIS (mardi, jeudi, samedi 20h→6h)
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, NULL, '2026-04-22 00:00:00+00'::timestamptz, '2026-04-22 10:00:00+00'::timestamptz, 600, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Saint-François';
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, NULL, '2026-04-24 00:00:00+00'::timestamptz, '2026-04-24 10:00:00+00'::timestamptz, 600, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Saint-François';
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, NULL, '2026-04-26 00:00:00+00'::timestamptz, '2026-04-26 10:00:00+00'::timestamptz, 600, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Saint-François';

-- SAINTE-ANNE (mardi, jeudi, samedi 20h→6h)
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, NULL, '2026-04-22 00:00:00+00'::timestamptz, '2026-04-22 10:00:00+00'::timestamptz, 600, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Sainte-Anne';
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, NULL, '2026-04-24 00:00:00+00'::timestamptz, '2026-04-24 10:00:00+00'::timestamptz, 600, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Sainte-Anne';
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, NULL, '2026-04-26 00:00:00+00'::timestamptz, '2026-04-26 10:00:00+00'::timestamptz, 600, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Sainte-Anne';

-- LE GOSIER (zones 1 & 2)
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, '1 & 2', '2026-04-21 00:00:00+00'::timestamptz, '2026-04-21 11:00:00+00'::timestamptz, 660, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Le Gosier';
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, '1 & 2', '2026-04-23 00:00:00+00'::timestamptz, '2026-04-23 11:00:00+00'::timestamptz, 660, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Le Gosier';
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, '1 & 2', '2026-04-25 00:00:00+00'::timestamptz, '2026-04-25 11:00:00+00'::timestamptz, 660, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Le Gosier';
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, '1 & 2', '2026-04-27 00:00:00+00'::timestamptz, '2026-04-27 11:00:00+00'::timestamptz, 660, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Le Gosier';

-- POINTE-À-PITRE (lun, ven seulement, partage avec Abymes)
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, 'POINTE-A-PITRE / ABYMES', '2026-04-21 00:00:00+00'::timestamptz, '2026-04-21 11:00:00+00'::timestamptz, 660, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Pointe-à-Pitre';
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, 'POINTE-A-PITRE / ABYMES', '2026-04-25 00:00:00+00'::timestamptz, '2026-04-25 11:00:00+00'::timestamptz, 660, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Pointe-à-Pitre';

-- LE MOULE (lun, mer 20h→5h = 9h)
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, NULL, '2026-04-21 00:00:00+00'::timestamptz, '2026-04-21 09:00:00+00'::timestamptz, 540, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Le Moule';
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, NULL, '2026-04-23 00:00:00+00'::timestamptz, '2026-04-23 09:00:00+00'::timestamptz, 540, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Le Moule';
-- LE MOULE vendredi 20h→9h = 13h
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, NULL, '2026-04-25 00:00:00+00'::timestamptz, '2026-04-25 13:00:00+00'::timestamptz, 780, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Le Moule';

-- MORNE-À-L'EAU zone 1 (lun, mer 20h→5h)
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, 'MORNE-A-L''EAU 1', '2026-04-21 00:00:00+00'::timestamptz, '2026-04-21 09:00:00+00'::timestamptz, 540, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Morne-à-l''Eau';
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, 'MORNE-A-L''EAU 1', '2026-04-23 00:00:00+00'::timestamptz, '2026-04-23 09:00:00+00'::timestamptz, 540, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Morne-à-l''Eau';
-- vendredi 20h→9h
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, 'MORNE-A-L''EAU 1', '2026-04-25 00:00:00+00'::timestamptz, '2026-04-25 13:00:00+00'::timestamptz, 780, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Morne-à-l''Eau';

-- MORNE-À-L'EAU zone 2 (mardi, jeudi 20h→5h)
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, 'MORNE-A-L''EAU 2', '2026-04-22 00:00:00+00'::timestamptz, '2026-04-22 09:00:00+00'::timestamptz, 540, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Morne-à-l''Eau';
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, 'MORNE-A-L''EAU 2', '2026-04-24 00:00:00+00'::timestamptz, '2026-04-24 09:00:00+00'::timestamptz, 540, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Morne-à-l''Eau';

-- SAINTE-ROSE 1 (mardi, samedi 17h→9h = 16h)
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, '1', '2026-04-21 21:00:00+00'::timestamptz, '2026-04-22 13:00:00+00'::timestamptz, 960, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Sainte-Rose';
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, '1', '2026-04-25 21:00:00+00'::timestamptz, '2026-04-26 13:00:00+00'::timestamptz, 960, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Sainte-Rose';

-- SAINTE-ROSE 2 (mardi 19h→8h = 13h)
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, '2', '2026-04-21 23:00:00+00'::timestamptz, '2026-04-22 12:00:00+00'::timestamptz, 780, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Sainte-Rose';

-- TROIS-RIVIÈRES zone 5 (mardi, jeudi, samedi 18h→8h = 14h)
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, '5', '2026-04-21 22:00:00+00'::timestamptz, '2026-04-22 12:00:00+00'::timestamptz, 840, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Trois-Rivières';
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, '5', '2026-04-23 22:00:00+00'::timestamptz, '2026-04-24 12:00:00+00'::timestamptz, 840, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Trois-Rivières';
INSERT INTO outages (commune_id, sector, starts_at, ends_at, estimated_duration_minutes, status, source, reliability_score, confidence_score, time_precision, source_url, cause)
SELECT id, '5', '2026-04-25 22:00:00+00'::timestamptz, '2026-04-26 12:00:00+00'::timestamptz, 840, 'scheduled', 'official', 0.95, 0.95, 'exact', 'https://www.smgeag.fr/planning-tours-eau-20-26-avril-2026/', 'Tour d''eau planifié' FROM communes WHERE name = 'Trois-Rivières';