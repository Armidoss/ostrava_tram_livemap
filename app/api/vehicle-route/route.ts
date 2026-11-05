import { getCachedVehicleRoute, saveVehicleRoute } from "@/lib/db";
import { fetchMpvnetRoute } from "@/lib/mpvnet";
import type { VehicleRouteRequest, VehicleRouteResponse } from "@/types/vehicle";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isRouteRequest(value: unknown): value is VehicleRouteRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<VehicleRouteRequest>;
  return (
    typeof candidate.num1 === "string" &&
    /^[\p{L}\p{N} _./-]{1,64}$/u.test(candidate.num1) &&
    typeof candidate.num2 === "string" &&
    /^[\p{L}\p{N} _./-]{1,64}$/u.test(candidate.num2) &&
    typeof candidate.cat === "number" &&
    Number.isInteger(candidate.cat) && candidate.cat >= 0 && candidate.cat <= 100 &&
    (candidate.carrier == null || (typeof candidate.carrier === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(candidate.carrier)) || (typeof candidate.carrier === "number" && Number.isSafeInteger(candidate.carrier) && candidate.carrier >= 0))
  );
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as unknown;

  if (!isRouteRequest(body)) {
    return NextResponse.json<VehicleRouteResponse>(
      {
        source: "unavailable",
        route: [],
        stops: [],
        geometryAvailable: false,
        error: "Trasa není dostupná."
      },
      { status: 400 }
    );
  }

  const cached = await getCachedRouteSafely(body);

  if (cached) {
    return NextResponse.json<VehicleRouteResponse>({
      source: "cache",
      route: cached.route,
      stops: cached.stops,
      geometryAvailable: cached.geometryAvailable,
      error: cached.geometryAvailable ? undefined : "Trasa není dostupná."
    });
  }

  try {
    const result = await fetchMpvnetRoute(body);
    await saveRouteSafely(body, result.route, result.stops, result.geometryAvailable);

    return NextResponse.json<VehicleRouteResponse>({
      source: "mpvnet",
      route: result.route,
      stops: result.stops,
      geometryAvailable: result.geometryAvailable,
      error: result.geometryAvailable ? undefined : "Trasa není dostupná."
    });
  } catch {

    if (process.env.NODE_ENV === "development") {
      console.debug("[vehicle-route] Route lookup failed:");
    }

    return NextResponse.json<VehicleRouteResponse>(
      {
        source: "unavailable",
        route: [],
        stops: [],
        geometryAvailable: false,
        error: "Trasa není dostupná."
      },
      { status: 502 }
    );
  }
}

async function getCachedRouteSafely(routeRequest: VehicleRouteRequest) {
  try {
    return await getCachedVehicleRoute(routeRequest);
  } catch {
    if (process.env.NODE_ENV === "development") {
        console.debug("[vehicle-route] Route cache read failed:");
    }

    return null;
  }
}

async function saveRouteSafely(
  routeRequest: VehicleRouteRequest,
  route: VehicleRouteResponse["route"],
  stops: VehicleRouteResponse["stops"],
  geometryAvailable: boolean
) {
  try {
    await saveVehicleRoute(routeRequest, route, stops, geometryAvailable);
  } catch {
    if (process.env.NODE_ENV === "development") {
        console.debug("[vehicle-route] Route cache write failed:");
    }
  }
}
