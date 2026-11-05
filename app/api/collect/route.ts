import { collectVehiclePositions } from "@/lib/vehicle-collector";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret?.trim()) {
    return NextResponse.json({ error: "Sběr není nakonfigurován." }, { status: 503 });
  }

  if ( authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await collectVehiclePositions();

  return NextResponse.json({
    ok: true,
    source: result.source,
    saved: result.saved,
    persisted: result.persisted,
    vehicleCount: result.vehicles.length,
    error: result.error ?? null,
    collectedAt: new Date().toISOString()
  });
}
