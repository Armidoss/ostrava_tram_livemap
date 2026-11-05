import { getVehicleHistory } from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = {
  params: Promise<{
    vehicleId: string;
  }>;
};

export async function GET(request: Request, { params }: Params) {
  const { vehicleId } = await params;
  const url = new URL(request.url);
  const minutes = Number(url.searchParams.get("minutes") ?? 60);

  if (!vehicleId || vehicleId.length > 200 || /[\x00-\x1f]/.test(vehicleId) || !Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
    return NextResponse.json({ error: "Neplatné parametry." }, { status: 400 });
  }

  try {
    const history = await getVehicleHistory(vehicleId, minutes);

    return NextResponse.json({
      source: "postgis",
      points: history
    });
  } catch {
    if (process.env.NODE_ENV === "development") {
      console.debug("[vehicle-history] Failed to load history:");
    }

    return NextResponse.json(
      {
        source: "unavailable",
        points: [],
        error: "Historie není dostupná."
      },
      { status: 503 }
    );
  }
}
