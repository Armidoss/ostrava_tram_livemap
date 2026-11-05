import type { Vehicle, VehicleRouteRequest, VehicleType } from "@/types/vehicle";

const LAT_KEYS = ["lat", "latitude", "gpsLat", "y"];
const LNG_KEYS = ["lng", "lon", "longitude", "gpsLng", "x"];
const LINE_KEYS = ["line", "route", "routeName", "lineName", "routeNumber", "l"];
const ID_KEYS = ["id", "vehicleId", "tripId", "registrationNumber", "vehicleNumber"];
const DELAY_KEYS = ["delay", "delaySeconds", "delaySec", "delayMinutes", "dm"];
const TYPE_KEYS = ["type", "vehicleType", "mode", "transportType", "cat"];
const DESTINATION_KEYS = ["destination", "target", "headsign", "direction", "finalStop", "lastStop"];
const TRAM_LINES = new Set(["1", "2", "3", "4", "5", "7", "8", "10", "11", "12", "14", "15", "17", "18", "19"]);

type PlainObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getFirstValue(obj: PlainObject, keys: string[]): unknown {
  const lowerMap = new Map(Object.keys(obj).map((key) => [key.toLowerCase(), key]));

  for (const key of keys) {
    const exact = obj[key];
    if (exact !== undefined && exact !== null) {
      return exact;
    }

    const actualKey = lowerMap.get(key.toLowerCase());
    if (actualKey) {
      const value = obj[actualKey];
      if (value !== undefined && value !== null) {
        return value;
      }
    }
  }

  return null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    if (!value.trim()) return null;
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function parseCn(value: unknown): string[] {
  if (typeof value !== "string") {
    return [];
  }

  return value.split("|").map((part) => part.trim());
}

function getMpvnetLine(candidate: PlainObject): string | null {
  const direct = toStringOrNull(getFirstValue(candidate, LINE_KEYS));
  if (direct) {
    return direct;
  }

  const parts = parseCn(candidate.cn);
  if (parts.length === 0) {
    return null;
  }

  if (parts[1] && (!parts[0] || parts[0].length > 3 || parts[1].length <= 3)) {
    return parts[1];
  }

  return parts[0] || null;
}

function getMpvnetDestination(candidate: PlainObject): string | null {
  const direct = toStringOrNull(getFirstValue(candidate, DESTINATION_KEYS));
  if (direct) {
    return direct;
  }

  const parts = parseCn(candidate.cn);
  return parts[9] || parts[8] || null;
}

function getRouteRequest(candidate: PlainObject): VehicleRouteRequest | undefined {
  const parts = parseCn(candidate.cn);
  const cat = toNumber(candidate.cat);

  if (parts.length < 3 || cat === null) {
    return undefined;
  }

  const num1 = cat === 1 && parts[1] ? parts[1] : parts[0];
  const num2 = parts[2];

  if (!num1 || !num2) {
    return undefined;
  }

  return {
    num1,
    num2,
    cat,
    carrier: toStringOrNull(candidate.c) ?? null
  };
}

function getMpvnetId(candidate: PlainObject, line: string | null, lat: number, lng: number, index: number): string {
  const direct = toStringOrNull(getFirstValue(candidate, ID_KEYS));
  if (direct) {
    return direct;
  }

  const parts = parseCn(candidate.cn);
  const vehicleNumber = parts.find((part) => /ev\.\s*č\./i.test(part)) ?? parts[11];
  if (vehicleNumber) {
    return `${line ?? "vehicle"}-${vehicleNumber}`;
  }

  return `${line ?? "vehicle"}-${lat.toFixed(5)}-${lng.toFixed(5)}-${index}`;
}

function inferType(candidate: PlainObject, value: unknown, line: string | null): VehicleType {
  const raw = toStringOrNull(value)?.toLowerCase() ?? "";

  if (["tram", "tramway", "streetcar", "trams"].includes(raw) || raw.includes("tram")) {
    return "tram";
  }

  if (
    ["trolleybus", "trolley", "troleybus", "trolejbus"].includes(raw) ||
    raw.includes("trolley") ||
    raw.includes("trolej")
  ) {
    return "trolleybus";
  }

  if (["bus", "autobus", "buses"].includes(raw) || raw.includes("bus")) {
    return "bus";
  }

  const normalizedLine = line?.toUpperCase() ?? "";
  const numericLine = Number(normalizedLine);

  if (Number.isFinite(numericLine)) {
    if (TRAM_LINES.has(normalizedLine)) {
      return "tram";
    }

    if (numericLine >= 100 && numericLine < 110) {
      return "trolleybus";
    }

    if (numericLine >= 20 && numericLine < 100) {
      return "bus";
    }
  }

  if (normalizedLine.startsWith("ND")) {
    return "bus";
  }

  if (toStringOrNull(candidate.cr)?.toLowerCase().includes("dpo") && raw === "3") {
    return "bus";
  }

  return "unknown";
}

function normalizeDelay(value: unknown, keyHint?: string): number | null {
  const numeric = toNumber(value);
  if (numeric === null) {
    return null;
  }

  const asString = typeof value === "string" ? value.toLowerCase() : "";
  if (asString.includes("min") || keyHint === "dm" || keyHint === "delayMinutes") {
    return Math.round(numeric * 60);
  }

  return Math.round(numeric);
}

function getDelay(candidate: PlainObject): number | null {
  const lowerMap = new Map(Object.keys(candidate).map((key) => [key.toLowerCase(), key]));

  for (const key of DELAY_KEYS) {
    const actualKey = candidate[key] !== undefined ? key : lowerMap.get(key.toLowerCase());
    if (!actualKey) {
      continue;
    }

    const value = candidate[actualKey];
    if (value !== undefined && value !== null) {
      return normalizeDelay(value, actualKey);
    }
  }

  return null;
}

function hasValidOstravaCoordinates(lat: number, lng: number): boolean {
  return lat >= 49 && lat <= 51 && lng >= 17 && lng <= 19.5;
}

function getCoordinates(obj: PlainObject): { lat: number; lng: number } | null {
  const namedLat = toNumber(getFirstValue(obj, LAT_KEYS.filter((key) => key !== "x" && key !== "y")));
  const namedLng = toNumber(getFirstValue(obj, LNG_KEYS.filter((key) => key !== "x" && key !== "y")));

  if (namedLat !== null && namedLng !== null && hasValidOstravaCoordinates(namedLat, namedLng)) {
    return { lat: namedLat, lng: namedLng };
  }

  const x = toNumber(getFirstValue(obj, ["x"]));
  const y = toNumber(getFirstValue(obj, ["y"]));

  if (x !== null && y !== null) {
    if (hasValidOstravaCoordinates(y, x)) {
      return { lat: y, lng: x };
    }

    if (hasValidOstravaCoordinates(x, y)) {
      return { lat: x, lng: y };
    }
  }

  return null;
}

function isVehicleLikeObject(obj: PlainObject): boolean {
  if (getCoordinates(obj) === null) {
    return false;
  }

  return (
    getFirstValue(obj, LINE_KEYS) !== null ||
    getFirstValue(obj, ID_KEYS) !== null ||
    getFirstValue(obj, TYPE_KEYS) !== null ||
    obj.cn !== undefined ||
    obj.n !== undefined
  );
}

function collectVehicleCandidates(raw: unknown, candidates: PlainObject[], depth = 0): void {
  if (depth > 8) {
    return;
  }

  if (Array.isArray(raw)) {
    const objectItems = raw.filter(isPlainObject);
    const likelyVehicleItems = objectItems.filter(isVehicleLikeObject);

    if (likelyVehicleItems.length > 0) {
      candidates.push(...likelyVehicleItems);
      return;
    }

    for (const item of raw) {
      collectVehicleCandidates(item, candidates, depth + 1);
    }

    return;
  }

  if (!isPlainObject(raw)) {
    return;
  }

  if (isVehicleLikeObject(raw)) {
    candidates.push(raw);
  }

  for (const value of Object.values(raw)) {
    if (Array.isArray(value) || isPlainObject(value)) {
      collectVehicleCandidates(value, candidates, depth + 1);
    }
  }
}

export function normalizeVehicles(raw: unknown): Vehicle[] {
  const candidates: PlainObject[] = [];
  collectVehicleCandidates(raw, candidates);

  const seen = new Set<string>();
  const now = new Date().toISOString();

  return candidates.reduce<Vehicle[]>((vehicles, candidate, index) => {
    const coordinates = getCoordinates(candidate);

    if (!coordinates) {
      return vehicles;
    }

    const { lat, lng } = coordinates;
    const line = getMpvnetLine(candidate);
    const id = getMpvnetId(candidate, line, lat, lng, index);

    if (seen.has(id)) {
      return vehicles;
    }

    seen.add(id);

    vehicles.push({
      id,
      line,
      type: inferType(candidate, getFirstValue(candidate, TYPE_KEYS), line),
      lat,
      lng,
      delaySeconds: getDelay(candidate),
      destination: getMpvnetDestination(candidate),
      lastUpdate: now,
      routeRequest: getRouteRequest(candidate),
      raw: candidate
    });

    return vehicles;
  }, []);
}
