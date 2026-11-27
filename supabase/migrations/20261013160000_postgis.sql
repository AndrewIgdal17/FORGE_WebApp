-- PostGIS in public, before the route column (20261013170000) uses
-- public.geometry. Turgon has had it since it was installed by hand
-- (postgis 3.3.7 in public), so this is a no-op there; it lets a fresh
-- local database (`supabase db reset`) apply every migration in order.
create extension if not exists postgis schema public;
