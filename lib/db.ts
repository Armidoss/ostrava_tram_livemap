import type { RoutePoint, Vehicle, VehicleRouteRequest, VehicleSource } from "@/types/vehicle";
import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __ostravaTramPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __ostravaTramSchemaReady: Promise<void> | undefined;
  // eslint-disable-next-line no-var
  var __ostravaTramDbUnavailableUntil: number | undefined;
}

const DATABASE_URL = process.env.DATABASE_URL;
const DB_RETRY_COOLDOWN_MS = 30000;

function getPool(): Pool | null {
  if (!DATABASE_URL) {
    return null;
  }

  if (!globalThis.__ostravaTramPool) {
    globalThis.__ostravaTramPool = new Pool({
      connectionString: DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 1500
    });
  }

  return globalThis.__ostravaTramPool;
}

async function ensureSchema(): Promise<void> {
  const pool = getPool();

  if (!pool) {
    return;
  }

  if (globalThis.__ostravaTramDbUnavailableUntil && Date.now() < globalThis.__ostravaTramDbUnavailableUntil) {
    throw new Error("PostGIS database is temporarily unavailable.");
  }

  if (!globalThis.__ostravaTramSchemaReady) {
    globalThis.__ostravaTramSchemaReady = pool.query(`
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
    `)
      .then(() => {
        globalThis.__ostravaTramDbUnavailableUntil = undefined;
      })
      .catch((error: unknown) => {
        globalThis.__ostravaTramSchemaReady = undefined;
        globalThis.__ostravaTramDbUnavailableUntil = Date.now() + DB_RETRY_COOLDOWN_MS;
        throw error;
      });
  }

  await globalThis.__ostravaTramSchemaReady;
}

function getRouteKey(routeRequest: VehicleRouteRequest): string {
  return [
    routeRequest.cat,
    routeRequest.num1,
    routeRequest.num2,
    routeRequest.carrier ?? 0
  ].map((part) => String(part)).join(":");
}

function isRoutePoint(value: unknown): value is RoutePoint {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<RoutePoint>;
  return typeof candidate.lat === "number" && typeof candidate.lng === "number";
}

function normalizeRoutePoints(value: unknown): RoutePoint[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRoutePoint);
}

export async function getCachedVehicleRoute(routeRequest: VehicleRouteRequest): Promise<{
  route: RoutePoint[];
  stops: RoutePoint[];
  geometryAvailable: boolean;
} | null> {
  const pool = getPool();

  if (!pool) {
    return null;
  }

  await ensureSchema();

  const result = await pool.query<{
    route: unknown;
    stops: unknown;
    geometry_available: boolean;
  }>(
    `
      SELECT route, stops, geometry_available
      FROM vehicle_routes
      WHERE route_key = $1
      LIMIT 1;
    `,
    [getRouteKey(routeRequest)]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  const route = normalizeRoutePoints(row.route);
  const stops = normalizeRoutePoints(row.stops);

  if (route.length < 2) {
    return null;
  }

  return {
    route,
    stops,
    geometryAvailable: row.geometry_available
  };
}

export async function saveVehicleRoute(
  routeRequest: VehicleRouteRequest,
  route: RoutePoint[],
  stops: RoutePoint[],
  geometryAvailable: boolean
): Promise<void> {
  const pool = getPool();

  if (!pool || route.length < 2) {
    return;
  }

  await ensureSchema();

  await pool.query(
    `
      INSERT INTO vehicle_routes (
        route_key,
        num1,
        num2,
        cat,
        carrier,
        route,
        stops,
        geometry_available,
        fetched_at
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, now())
      ON CONFLICT (route_key) DO UPDATE SET
        route = EXCLUDED.route,
        stops = EXCLUDED.stops,
        geometry_available = EXCLUDED.geometry_available,
        fetched_at = EXCLUDED.fetched_at;
    `,
    [
      getRouteKey(routeRequest),
      routeRequest.num1,
      routeRequest.num2,
      routeRequest.cat,
      routeRequest.carrier === undefined || routeRequest.carrier === null ? null : String(routeRequest.carrier),
      JSON.stringify(route),
      JSON.stringify(stops),
      geometryAvailable
    ]
  );
}

export async function saveVehiclePositions(vehicles: Vehicle[], source: VehicleSource): Promise<void> {
  const pool = getPool();

  if (!pool || vehicles.length === 0) {
    return;
  }

  await ensureSchema();

  const values: unknown[] = [];
  const rows = vehicles.map((vehicle, index) => {
    const offset = index * 10;
    values.push(
      vehicle.id,
      vehicle.line,
      vehicle.type,
      vehicle.delaySeconds,
      vehicle.destination,
      source,
      vehicle.lastUpdate,
      vehicle.lng,
      vehicle.lat,
      vehicle.raw === undefined ? null : JSON.stringify(vehicle.raw)
    );

    return `(
      $${offset + 1},
      $${offset + 2},
      $${offset + 3},
      $${offset + 4},
      $${offset + 5},
      $${offset + 6},
      $${offset + 7}::timestamptz,
      ST_SetSRID(ST_MakePoint($${offset + 8}, $${offset + 9}), 4326)::geography,
      $${offset + 10}::jsonb
    )`;
  });

  await pool.query(
    `
      INSERT INTO vehicle_positions (
        vehicle_id,
        line,
        vehicle_type,
        delay_seconds,
        destination,
        source,
        observed_at,
        position,
        raw
      )
      VALUES ${rows.join(",")}
      ON CONFLICT DO NOTHING;
    `,
    values
  );
}

export async function getVehicleHistory(vehicleId: string, minutes: number): Promise<RoutePoint[]> {
  const pool = getPool();

  if (!pool) {
    throw new Error("DATABASE_URL is not configured.");
  }

  await ensureSchema();

  const boundedMinutes = Math.max(1, Math.min(minutes, 24 * 60));
  const result = await pool.query<{
    lat: number;
    lng: number;
    observed_at: Date;
  }>(
    `
      SELECT
        ST_Y(position::geometry) AS lat,
        ST_X(position::geometry) AS lng,
        observed_at
      FROM vehicle_positions
      WHERE vehicle_id = $1
        AND observed_at >= now() - ($2::int * interval '1 minute')
      ORDER BY observed_at ASC
      LIMIT 2000;
    `,
    [vehicleId, boundedMinutes]
  );

  return result.rows.map((row) => ({
    lat: Number(row.lat),
    lng: Number(row.lng),
    name: row.observed_at.toISOString(),
    stop: false
  }));
}

export async function isDatabaseConfigured(): Promise<boolean> {
  const pool = getPool();

  if (!pool) {
    return false;
  }

  try {
    await ensureSchema();
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
