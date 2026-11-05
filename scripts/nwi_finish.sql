SELECT set_config('nwi.state', :'state', true);

DO $$
BEGIN
  IF current_setting('nwi.state') = 'TX' AND (
    SELECT count(*) FROM ref.nwi_wetlands WHERE btrim(state) = 'TX'
  ) = 0 THEN
    RAISE EXCEPTION 'Texas clip inserted no polygons';
  END IF;
END $$;

INSERT INTO ref.nwi_provenance (state, release_label, downloaded_on)
VALUES (:'state', :'release', :'downloaded_on')
ON CONFLICT (state) DO UPDATE
SET release_label = EXCLUDED.release_label,
    downloaded_on = EXCLUDED.downloaded_on,
    loaded_at = now();
