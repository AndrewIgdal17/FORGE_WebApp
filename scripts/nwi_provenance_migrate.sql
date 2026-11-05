BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'ref'
      AND table_name = 'nwi_provenance'
      AND column_name = 'id'
  ) THEN
    RAISE EXCEPTION 'ref.nwi_provenance has no id column; refusing to migrate';
  END IF;
  IF (SELECT count(*) FROM ref.nwi_wetlands) = 0 THEN
    RAISE EXCEPTION 'ref.nwi_wetlands is empty; refusing to migrate';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM ref.nwi_wetlands
    WHERE btrim(state) NOT IN (
      'AL','AR','AZ','CA','CO','CT','DC','DE','FL','GA',
      'IA','ID','IL','IN','KS','KY','LA','MA','MD','ME',
      'MI','MN','MO','MS','MT','NC','ND','NE','NH','NJ',
      'NM','NV','NY','OH','OK','OR','PA','RI','SC','SD','TN'
    )
  ) THEN
    RAISE EXCEPTION 'ref.nwi_wetlands has a state outside the finished load';
  END IF;
END $$;

DROP TABLE IF EXISTS ref.nwi_provenance_state;

CREATE TABLE ref.nwi_provenance_state (
  state char(2) PRIMARY KEY,
  release_label text NOT NULL,
  downloaded_on date NOT NULL,
  loaded_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO ref.nwi_provenance_state (state, release_label, downloaded_on, loaded_at)
SELECT s.state, p.release_label, p.downloaded_on, p.loaded_at
FROM (
  VALUES
    ('AL'),('AR'),('AZ'),('CA'),('CO'),('CT'),('DC'),('DE'),
    ('FL'),('GA'),('IA'),('ID'),('IL'),('IN'),('KS'),('KY'),
    ('LA'),('MA'),('MD'),('ME'),('MI'),('MN'),('MO'),('MS'),
    ('MT'),('NC'),('ND'),('NE'),('NH'),('NJ'),('NM'),('NV'),
    ('NY'),('OH'),('OK'),('OR'),('PA'),('RI'),('SC'),('SD'),
    ('TN')
) AS s(state)
CROSS JOIN ref.nwi_provenance AS p
WHERE p.id = 1;

DROP TABLE ref.nwi_provenance;
ALTER TABLE ref.nwi_provenance_state RENAME TO nwi_provenance;
GRANT SELECT ON ref.nwi_provenance TO forge_api;

COMMIT;
