export type VehicleType = "tram" | "bus" | "trolleybus" | "unknown";

export type Vehicle = {
  id: string;
  line: string | null;
  type: VehicleType;
  lat: number;
  lng: number;
  delaySeconds: number | null;
  destination: string | null;
  lastUpdate: string;
  routeRequest?: VehicleRouteRequest;
  raw?: unknown;
};

export type VehicleSource = "mpvnet" | "demo";

export type VehiclesResponse = {
  source: VehicleSource;
  vehicles: Vehicle[];
  error?: string;
};

export type VehicleRouteRequest = {
  num1: string;
  num2: string;
  cat: number;
  carrier?: number | string | null;
};

export type RoutePoint = {
  lat: number;
  lng: number;
  name?: string | null;
  stop?: boolean;
};

export type VehicleRouteResponse = {
  source: "mpvnet" | "cache" | "unavailable";
  route: RoutePoint[];
  stops: RoutePoint[];
  geometryAvailable: boolean;
  error?: string;
};

export type VehicleHistoryResponse = {
  source: "postgis" | "unavailable";
  points: RoutePoint[];
  error?: string;
};
