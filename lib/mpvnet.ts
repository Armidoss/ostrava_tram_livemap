import { normalizeVehicles } from "@/lib/vehicle-normalizer";
import type { RoutePoint, Vehicle, VehicleRouteRequest } from "@/types/vehicle";

const OSTRAVA_BBOX_PAYLOAD = {
  w: 18.0,
  s: 49.6,
  e: 18.5,
  n: 49.95,
  zoom: 13,
  showStops: false,
  mapFilterId: null
};

const DEMO_BASE: Array<Omit<Vehicle, "lat" | "lng" | "lastUpdate"> & { path: [number, number][] }> = [
  {
    id: "demo-tram-8",
    line: "8",
    type: "tram",
    delaySeconds: 65,
    destination: "Poruba, Vřesinská",
    path: [
      [49.8344, 18.2822],
      [49.8326, 18.2618],
      [49.8275, 18.2286],
      [49.8262, 18.1835]
    ]
  },
  {
    id: "demo-tram-2",
    line: "2",
    type: "tram",
    delaySeconds: -25,
    destination: "Výškovice",
    path: [
      [49.8467, 18.2707],
      [49.8329, 18.2462],
      [49.8012, 18.2347],
      [49.7787, 18.2391]
    ]
  },
  {
    id: "demo-tram-4",
    line: "4",
    type: "tram",
    delaySeconds: 0,
    destination: "Martinov",
    path: [
      [49.7842, 18.2621],
      [49.8127, 18.2498],
      [49.8361, 18.2262],
      [49.8582, 18.1972]
    ]
  },
  {
    id: "demo-tram-12",
    line: "12",
    type: "tram",
    delaySeconds: 140,
    destination: "Dubina",
    path: [
      [49.8421, 18.2894],
      [49.8239, 18.2827],
      [49.8008, 18.2665],
      [49.7799, 18.2502]
    ]
  },
  {
    id: "demo-bus-48",
    line: "48",
    type: "bus",
    delaySeconds: 35,
    destination: "Hrabůvka",
    path: [
      [49.8201, 18.2973],
      [49.8124, 18.2862],
      [49.7928, 18.2741]
    ]
  }
];

function interpolatePath(path: [number, number][], phase: number): [number, number] {
  const maxIndex = path.length - 1;
  const scaled = phase * maxIndex;
  const index = Math.min(Math.floor(scaled), maxIndex - 1);
  const localPhase = scaled - index;
  const [startLat, startLng] = path[index];
  const [endLat, endLng] = path[index + 1];

  return [
    startLat + (endLat - startLat) * localPhase,
    startLng + (endLng - startLng) * localPhase
  ];
}

export function getDemoVehicles(): Vehicle[] {
  const now = Date.now();
  const timestamp = new Date(now).toISOString();

  return DEMO_BASE.map((vehicle, index) => {
    const cycleMs = 90000 + index * 12000;
    const rawPhase = ((now + index * 17000) % cycleMs) / cycleMs;
    const phase = rawPhase <= 0.5 ? rawPhase * 2 : (1 - rawPhase) * 2;
    const [lat, lng] = interpolatePath(vehicle.path, phase);

    return {
      id: vehicle.id,
      line: vehicle.line,
      type: vehicle.type,
      lat,
      lng,
      delaySeconds: vehicle.delaySeconds,
      destination: vehicle.destination,
      lastUpdate: timestamp,
      raw: { demo: true }
    };
  });
}

export async function fetchMpvnetVehicles(): Promise<Vehicle[]> {
  const endpoint = process.env.MPVNET_URL ?? "https://mpvnet.cz/odis/map/mapData";

  const response = await fetch(endpoint, {
    signal: AbortSignal.timeout(8000),
    method: "POST",
    headers: {
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/json",
      Origin: "https://mpvnet.cz",
      Referer: "https://mpvnet.cz/odis/map",
      "User-Agent": "OstravaTramLive/0.1 MVP"
    },
    body: JSON.stringify(OSTRAVA_BBOX_PAYLOAD),
    cache: "no-store",
    next: { revalidate: 0 }
  });

  if (!response.ok) {
    throw new Error(`MPVnet responded with HTTP ${response.status}`);
  }

  const text = await response.text();
  const raw = JSON.parse(text) as unknown;
  const vehicles = normalizeVehicles(raw);

  if (vehicles.length === 0) {
    throw new Error("MPVnet response parsed successfully, but no vehicle-like objects were found.");
  }

  return vehicles;
}

function normalizeRoutePoint(value: unknown): RoutePoint | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const point = value as Record<string, unknown>;
  const rawLat = point.x ?? point.lat ?? point.latitude;
  const rawLng = point.y ?? point.lng ?? point.lon ?? point.longitude;
  const lat = typeof rawLat === "number" ? rawLat : Number(rawLat);
  const lng = typeof rawLng === "number" ? rawLng : Number(rawLng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 49 || lat > 51 || lng < 17 || lng > 19.5) {
    return null;
  }

  const rawName = point.n ?? point.name;
  const name = typeof rawName === "string" && rawName.trim().length > 0 ? rawName.trim() : null;
  const type = typeof point.t === "string" ? point.t : null;

  return {
    lat,
    lng,
    name,
    stop: type !== "H"
  };
}

export async function fetchMpvnetRoute(routeRequest: VehicleRouteRequest): Promise<{
  route: RoutePoint[];
  stops: RoutePoint[];
  geometryAvailable: boolean;
}> {
  const endpoint = process.env.MPVNET_ROUTE_URL ?? "https://mpvnet.cz/odis/map/getRoute";
  const payload = {
    num1: routeRequest.num1,
    num2: routeRequest.num2,
    cat: routeRequest.cat,
    carrier: routeRequest.carrier ?? 0,
    trajectory: true
  };

  const response = await fetch(endpoint, {
    signal: AbortSignal.timeout(8000),
    method: "POST",
    headers: {
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/json",
      Origin: "https://mpvnet.cz",
      Referer: "https://mpvnet.cz/odis/map",
      "User-Agent": "OstravaTramLive/0.1 MVP"
    },
    body: JSON.stringify(payload),
    cache: "no-store",
    next: { revalidate: 0 }
  });

  if (!response.ok) {
    throw new Error(`MPVnet route endpoint responded with HTTP ${response.status}`);
  }

  const raw = (await response.json()) as { routeStops?: unknown; transmitters?: unknown };
  const routeStops = Array.isArray(raw.routeStops) ? raw.routeStops : [];
  const points = routeStops.slice(0, 5000).map(normalizeRoutePoint).filter((point): point is RoutePoint => point !== null);
  const stops = points.filter((point) => point.stop);
  const geometryAvailable = points.some((point) => !point.stop) || points.length > stops.length + 3;

  if (points.length < 2) {
    throw new Error("MPVnet route endpoint returned no usable route geometry.");
  }

  return {
    route: points,
    stops,
    geometryAvailable
  };
}
