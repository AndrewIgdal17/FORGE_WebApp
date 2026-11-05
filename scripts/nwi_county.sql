CREATE UNLOGGED TABLE ref.nwi_county AS
SELECT ST_Union(geom) AS geom
FROM ref.counties_tiger
WHERE statefp = :'fips';
