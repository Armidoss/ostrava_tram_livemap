# Ostrava Tram Live

Webový prototyp pro sledování aktuálních poloh vozidel MHD v Ostravě. Aplikace zobrazuje vozidla na Leaflet mapě, ukládá historii poloh a animuje přesun markerů mezi aktualizacemi.



## Co prototyp umí

- server-side proxy endpoint `GET /api/vehicles`
- primární pokus o načtení dat z neoficiálního MPVnet ODIS endpointu
- robustní normalizaci odpovědi s různými možnými názvy polí
- demo fallback, když MPVnet neodpovídá nebo se nepodaří najít vozidla
- full-screen mapu Ostravy přes OpenStreetMap tiles
- filtr podle typu vozidla: Vše, Tram, Bus, Trolejbus, Neznámé
- panel se stavem zdroje, počtem vozidel, počtem tramvají a časem aktualizace
- plynulý pohyb markerů pomocí `requestAnimationFrame`
- pevný 10sekundový interval obnovy sladěný s animací markerů
- stale režim: vozidla zmizelá z odpovědi zůstávají ještě 30 sekund šedá
- jednoduchý výpočet headingu markeru funkcí `calculateBearing()`
- klik na vozidlo načte dostupnou trasu z reverse-engineered MPVnet `map/getRoute`
- volitelné ukládání poloh do PostGIS, takže kliknuté vozidlo může zobrazit historickou GPS stopu i po refreshi stránky

## Zdroj dat

Projekt používá neoficiální/reverse-engineered endpoint:

```txt
POST https://mpvnet.cz/odis/map/mapData
```

Endpoint není veřejně dokumentované API. Struktura odpovědi se může změnit, dostupnost není garantovaná a provozovatel může změnit pravidla přístupu. Proto aplikace používá backend proxy, tolerantní parser a demo fallback.

## Spuštění

```bash
npm install
npm run dev
```

Potom otevři:

```txt
http://localhost:3003
```

Vývojový server je v `package.json` nastavený pevně na port `3003`.

## PostGIS

Pro lokální databázi spusť:

```bash
docker compose up -d
```

Databáze používá image `postgis/postgis:16-3.4` a inicializační migraci v `db/migrations/001_init.sql`.
Tabulka `vehicle_positions` ukládá ID vozidla, linku, typ, zpoždění, cíl, zdroj dat, čas pozorování, surový JSON a geometrii `GEOGRAPHY(Point, 4326)`.

Ukládání běží automaticky při každém pollingu `GET /api/vehicles`. Pokud databáze není dostupná, aplikace pokračuje bez pádu a pouze přeskočí persistenci.

Historii jednoho vozidla vrací:

```txt
GET /api/vehicle-history/:vehicleId?minutes=180
```

Na mapě se PostGIS historie použije po kliknutí na vozidlo. Pokud pro vozidlo ještě nejsou uložené body, UI zobrazí jen GPS stopu nasbíranou v aktuální browser session.

## Vercel Cron

Projekt obsahuje cron collector pro produkční běh na Vercelu:

```txt
GET /api/collect
```

Endpoint stáhne aktuální data z MPVnet, uloží normalizované pozice do PostGIS a vrátí krátký souhrn kolekce. Konfigurace ve `vercel.json` ho spouští jednou denně ve 03:00 UTC:

```json
{
  "crons": [
    {
      "path": "/api/collect",
      "schedule": "0 3 * * *"
    }
  ]
}
```

Pro produkci nastav ve Vercelu `CRON_SECRET`. Endpoint potom vyžaduje hlavičku:

```txt
Authorization: Bearer <CRON_SECRET>
```

Bez `CRON_SECRET` jde endpoint zavolat ručně, což je pohodlné pro lokální vývoj.

## Konfigurace

V `.env` nebo `.env.local`:

```env
MPVNET_URL=https://mpvnet.cz/odis/map/mapData
MPVNET_ROUTE_URL=https://mpvnet.cz/odis/map/getRoute
DATABASE_URL=postgres://tramvaj:tramvaj@localhost:5432/ostrava_tram_live
CRON_SECRET=replace-with-a-long-random-secret-in-production
```

`MPVNET_URL` nastavuje server-side endpoint pro proxy. `MPVNET_ROUTE_URL` nastavuje endpoint pro plánované trasy. `DATABASE_URL` zapíná PostGIS persistenci. `CRON_SECRET` chrání produkční collector endpoint. Klient obnovuje data pevně každých 10 sekund.

## Struktura

```txt
app/page.tsx
app/api/collect/route.ts
app/api/vehicles/route.ts
app/api/vehicle-history/[vehicleId]/route.ts
components/TransitMap.tsx
components/TransitMapLeaflet.tsx
components/VehicleMarker.tsx
components/VehiclePanel.tsx
db/migrations/001_init.sql
docker-compose.yml
lib/db.ts
lib/mpvnet.ts
lib/vehicle-collector.ts
lib/vehicle-normalizer.ts
types/vehicle.ts
vercel.json
```

## Další plán

- reliability score pro zdroj dat a jednotlivé linky
- heatmapa zpoždění
- statistiky linek a intervalů
- PostGIS prostorové dotazy nad zastávkami a úseky linek
- dlouhodobá archivace s retencí a agregacemi
