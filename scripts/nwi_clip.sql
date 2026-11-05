INSERT INTO ref.nwi_wetlands (state, attribute, geom)
SELECT :'state', clipped.attribute,
       ST_Multi(clipped.geom)::geometry(MultiPolygon, 5070)
FROM (
  SELECT fixed.attribute,
         ST_CollectionExtract(ST_Intersection(fixed.geom, county.geom), 3) AS geom
  FROM ref.nwi_fixed AS fixed
  JOIN (
    SELECT ST_Union(geom) AS geom
    FROM ref.counties_tiger
    WHERE statefp = :'fips'
  ) AS county
    ON fixed.geom && county.geom
   AND ST_Intersects(fixed.geom, county.geom)
  WHERE fixed.geom IS NOT NULL
    AND NOT ST_IsEmpty(fixed.geom)
) AS clipped
WHERE clipped.geom IS NOT NULL
  AND NOT ST_IsEmpty(clipped.geom);
