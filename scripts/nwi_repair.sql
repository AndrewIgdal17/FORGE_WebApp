CREATE UNLOGGED TABLE ref.nwi_fixed AS
SELECT attribute,
       ST_CollectionExtract(ST_MakeValid(geom, 'method=structure'), 3) AS geom
FROM ref.nwi_staging;
