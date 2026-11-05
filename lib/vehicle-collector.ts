import { saveVehiclePositions } from "@/lib/db";
import { fetchMpvnetVehicles, getDemoVehicles } from "@/lib/mpvnet";
import type { Vehicle, VehicleSource } from "@/types/vehicle";

export type VehicleCollectionResult = {
  source: VehicleSource;
  vehicles: Vehicle[];
  saved: number;
  persisted: boolean;
  error?: string;
};

async function collectUncached(): Promise<VehicleCollectionResult> {
  try {
    const vehicles = await fetchMpvnetVehicles();
    const persisted = await savePositionsSafely(vehicles, "mpvnet");

    return {
      source: "mpvnet",
      vehicles,
      saved: persisted ? vehicles.length : 0,
      persisted
    };
  } catch {
    const message = "MPVnet není dostupný. Zobrazuji ukázková data.";

    if (process.env.NODE_ENV === "development") {
      console.debug("[collector] Falling back to demo data:");
    }

    const vehicles = getDemoVehicles();
    const persisted = false;

    return {
      source: "demo",
      vehicles,
      saved: persisted ? vehicles.length : 0,
      persisted,
      error: message
    };
  }
}

async function savePositionsSafely(vehicles: Vehicle[], source: VehicleSource): Promise<boolean> {
  try {
    if (!process.env.DATABASE_URL) return false;
    await saveVehiclePositions(vehicles, source);
    return true;
  } catch {
    if (process.env.NODE_ENV === "development") {
      console.debug("[collector] Skipping PostGIS persistence:");
    }

    return false;
  }
}

// A warm process shares both in-flight work and a short snapshot; no cross-instance guarantee.
let snapshot: { result: VehicleCollectionResult; expires: number } | undefined;
let pending: Promise<VehicleCollectionResult> | undefined;
export function collectVehiclePositions(): Promise<VehicleCollectionResult> {
  if (snapshot && Date.now() < snapshot.expires) return Promise.resolve(snapshot.result);
  if (pending) return pending;
  pending = collectUncached().then(result => {
    snapshot = { result, expires: Date.now() + 8000 };
    return result;
  }).finally(() => { pending = undefined; });
  return pending;
}
