"use client";
import type { VehicleSource, VehicleType } from "@/types/vehicle";
export type VehicleFilter = "all" | VehicleType;
type Props = { source: VehicleSource | "error"; error: string | null; loading: boolean; totalCount: number; tramCount: number; lastRefresh: Date | null; filter: VehicleFilter; onFilterChange: (value: VehicleFilter) => void };
const filters: [VehicleFilter, string][] = [["all", "Vše"], ["tram", "Tramvaje"], ["bus", "Autobusy"], ["trolleybus", "Trolejbusy"], ["unknown", "Ostatní"]];
export default function VehiclePanel(p: Props) {
  return <header className="transit-header pointer-events-auto">
    <div className="brand"><span className="brand-symbol" aria-hidden="true">O</span><div><h1>Ostrava Tram Live</h1><p>Polohy městské dopravy · obnova po 10 s</p></div></div>
    <div className="source-status" role="status"><strong>{p.loading ? "Načítání dat…" : p.source === "mpvnet" ? "MPVnet · poslední snímek" : p.source === "demo" ? "Ukázkový provoz" : "Spojení přerušeno"}</strong><span>{p.lastRefresh ? `Snímek ${p.lastRefresh.toLocaleTimeString("cs-CZ")}` : "Čekám na první snímek"} · {p.totalCount} vozidel</span></div>
    <nav aria-label="Typ dopravy">{filters.map(([value, label]) => <button key={value} type="button" aria-pressed={p.filter === value} onClick={() => p.onFilterChange(value)}>{label}</button>)}</nav>
    {p.error && <p className="source-message" role="status">{p.source === "demo" ? "MPVnet není dostupný. Polohy jsou simulované a neukládají se do historie." : "Data se nepodařilo obnovit. Staré polohy postupně zmizí."}</p>}
  </header>;
}
