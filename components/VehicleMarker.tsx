"use client";

import type { Vehicle } from "@/types/vehicle";
import L from "leaflet";
import { createMarkerElement } from "@/lib/marker-element";
import { useMemo } from "react";
import { Marker, Popup } from "react-leaflet";

export type DisplayVehicle = Vehicle & {
  bearing: number | null;
  stale: boolean;
  lastSeenAt: number;
};

type VehicleMarkerProps = {
  vehicle: DisplayVehicle;
  selected?: boolean;
  onSelect?: (vehicle: DisplayVehicle) => void;
};

function formatDelay(delaySeconds: number | null): string {
  if (delaySeconds === null) {
    return "neznámé";
  }

  if (delaySeconds === 0) {
    return "včas";
  }

  const prefix = delaySeconds > 0 ? "+" : "-";
  const absolute = Math.abs(delaySeconds);
  const minutes = Math.floor(absolute / 60);
  const seconds = absolute % 60;

  if (minutes === 0) {
    return `${prefix}${seconds} s`;
  }

  return `${prefix}${minutes} min ${seconds} s`;
}

function typeLabel(type: Vehicle["type"]): string {
  switch (type) {
    case "tram":
      return "tramvaj";
    case "bus":
      return "bus";
    case "trolleybus":
      return "trolejbus";
    default:
      return "neznámý";
  }
}

export default function VehicleMarker({ vehicle, selected = false, onSelect }: VehicleMarkerProps) {
  const icon = useMemo(() => {
    const typeClass = vehicle.stale ? "vehicle-marker--stale" : `vehicle-marker--${vehicle.type}`;
    const rotation = vehicle.bearing ?? 0;
    const element = createMarkerElement(vehicle.line, typeClass, selected, rotation);

    return L.divIcon({
      className: "",
      html: element,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
      popupAnchor: [0, -18]
    });
  }, [selected, vehicle.bearing, vehicle.line, vehicle.stale, vehicle.type]);

  return (
    <Marker
      position={[vehicle.lat, vehicle.lng]}
      icon={icon}
      eventHandlers={{
        click: () => onSelect?.(vehicle)
      }}
    >
      <Popup>
        <div className="min-w-52 space-y-2 text-sm">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400">Linka</div>
            <div className="text-lg font-bold text-white">{vehicle.line ?? "Neznámá"}</div>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-slate-200">
            <dt className="text-slate-400">Typ</dt>
            <dd>{typeLabel(vehicle.type)}</dd>
            <dt className="text-slate-400">Směr</dt>
            <dd>{vehicle.destination ?? "neznámý"}</dd>
            <dt className="text-slate-400">Zpoždění</dt>
            <dd>{formatDelay(vehicle.delaySeconds)}</dd>
            <dt className="text-slate-400">Aktualizace</dt>
            <dd>{new Date(vehicle.lastUpdate).toLocaleTimeString("cs-CZ")}</dd>
            <dt className="text-slate-400">ID</dt>
            <dd className="break-all font-mono text-xs">{vehicle.id}</dd>
          </dl>
          {vehicle.stale ? (
            <div className="rounded-md bg-slate-700/70 px-2 py-1 text-xs text-slate-200">Neaktivní</div>
          ) : null}
        </div>
      </Popup>
    </Marker>
  );
}
