INSERT INTO ref.nwi_wetlands (state, attribute, geom)
SELECT state, attribute, geom
FROM ref.nwi_clipped
WHERE geom IS NOT NULL
  AND NOT ST_IsEmpty(geom);
