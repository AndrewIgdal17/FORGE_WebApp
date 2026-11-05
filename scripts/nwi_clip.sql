CREATE UNLOGGED TABLE ref.nwi_clipped AS
SELECT :'state'::char(2) AS state,
       fixed.attribute,
       ST_Multi(
         ST_CollectionExtract(
           ST_Intersection(fixed.geom, (SELECT geom FROM ref.nwi_county)),
           3
         )
       )::geometry(MultiPolygon, 5070) AS geom
FROM ref.nwi_fixed AS fixed
WHERE fixed.geom IS NOT NULL
  AND NOT ST_IsEmpty(fixed.geom)
  AND fixed.geom && (SELECT geom FROM ref.nwi_county)
  AND ST_Intersects(fixed.geom, (SELECT geom FROM ref.nwi_county));
