CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS vehicle_positions (
  id BIGSERIAL PRIMARY KEY,
  vehicle_id TEXT NOT NULL,
  line TEXT,
  vehicle_type TEXT NOT NULL,
  delay_seconds INTEGER,
  destination TEXT,
  source TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  position GEOGRAPHY(Point, 4326) NOT NULL,
  raw JSONB
);

CREATE INDEX IF NOT EXISTS idx_vehicle_positions_vehicle_observed
  ON vehicle_positions (vehicle_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_vehicle_positions_observed
  ON vehicle_positions (observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_vehicle_positions_position
  ON vehicle_positions USING GIST (position);

CREATE UNIQUE INDEX IF NOT EXISTS ux_vehicle_positions_dedupe
  ON vehicle_positions (
    vehicle_id,
    observed_at,
    ROUND((ST_Y(position::geometry))::numeric, 6),
    ROUND((ST_X(position::geometry))::numeric, 6)
  );

CREATE TABLE IF NOT EXISTS vehicle_routes (
  route_key TEXT PRIMARY KEY,
  num1 TEXT NOT NULL,
  num2 TEXT NOT NULL,
  cat INTEGER NOT NULL,
  carrier TEXT,
  route JSONB NOT NULL,
  stops JSONB NOT NULL,
  geometry_available BOOLEAN NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_routes_fetched
  ON vehicle_routes (fetched_at DESC);
