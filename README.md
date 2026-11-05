# Ostrava Tram Live

Česká mapa poloh MHD v Ostravě pro demonstraci práce s externími daty a geografickým rozhraním. Jde o near-real-time polling, nikoli nepřetržitý živý přenos. Nejde o oficiální aplikaci dopravce.

## Architektura

Next.js 15 App Router, React 19, striktní TypeScript, React Leaflet / Leaflet, Tailwind a vlastní CSS. Prohlížeč volá `/api/vehicles` každých 10 sekund. Server načte MPVnet, normalizuje alternativní JSON struktury, odmítne neplatné souřadnice a odstraní duplicitní ID. Osmisekundová cache jednoho procesu sdílí i rozpracovaný požadavek, včetně zápisu do volitelného PostgreSQL/PostGIS. Upstream má osm sekund na odpověď.

Při chybě se zobrazují výslovně označená simulovaná demo vozidla; neukládají se do databáze. Animace interpoluje mezi snímky, nejde o měření skutečné trajektorie mezi nimi. Chybějící vozidla jsou šedá a po 30 sekundách od posledního přijetí zmizí. Čas normalizované polohy představuje přijetí dat, nikoli ověřený čas GPS měření.

Výběr vozidla načte plánovanou trasu a historii. Nový výběr zruší předchozí požadavky. PostGIS historie obsahuje skutečně přijaté snímky, stopa relace existuje jen v prohlížeči. Rozdělení plánované trasy na projetou a zbývající část je geometrický odhad. Cache tras v databázi vyprší po šesti hodinách.

## Lokální spuštění

Použijte Node.js 24 (testy používají nativní TypeScript stripping a module hooks).

```sh
npm ci
cp .env.example .env
npm run dev
```

Otevřete http://localhost:3003. Pro demo není databáze nutná. Konfigurace:

| Proměnná | Význam |
| --- | --- |
| MPVNET_URL | Serverový endpoint poloh |
| MPVNET_ROUTE_URL | Serverový endpoint tras |
| DATABASE_URL | Volitelné připojení PostgreSQL/PostGIS |
| CRON_SECRET | Náhodný tajný token pro `Authorization: Bearer …` na `/api/collect` |

`.env` nesmí být sledován Gitem. Příklad hesla v Compose je pouze pro lokální vývoj. Port databáze je vázán na 127.0.0.1.

```sh
docker compose up -d
npm test
npm run lint
npm run typecheck
npm run build
npm start
```

Migrace se automaticky inicializuje při vytvoření nového databázového svazku. Server také používá idempotentní inicializaci schématu; produkce potřebuje odpovídající oprávnění nebo předem připravené schéma. Žádné mazání dat není potřeba.

## Nasazení a omezení

Na Vercelu nastavte serverové proměnné včetně CRON_SECRET. Chybějící secret vrací 503, chybné přihlášení 401. `vercel.json` zachovává denní cron v 03:00 UTC: ten neprodukuje kontinuální historii. Aktivní uživatelé vyvolávají další sběr přes mapové API.

Cache je pouze lokální pro teplý proces; více serverless instancí má oddělené cache a může provádět duplicitní sběr. Další krok je centrální plánovaný collector a sdílená cache (např. PostgreSQL/Redis), ze které čte API. Frekvenci je nutné sladit s tarifem hostingu a pravidly zdroje. Pro veřejný provoz zbývá rate limiting, retence historie a oddělení zápisového účtu od čtecího API.

MPVnet je neoficiální endpoint bez garantovaného schématu. Identita bez stabilního upstream ID může být odvozena z polohy a není spolehlivá pro dlouhou historii. Prázdná/nepoužitelná odpověď vyvolá označený fallback. Mapové dlaždice vyžadují síť a respektování pravidel OpenStreetMap.

Historie Git obsahovala `.env`; odebrání z indexu neodstraní staré commity. Pokud obsahovaly skutečné přihlašovací údaje, ručně je rotujte. Historie nebyla přepisována. Živé MPVnet připojení a integrační test PostGIS nejsou součástí deterministických jednotkových testů.

## Stav ověření této úpravy

Deterministické testy pokrývají normalizaci, duplicity, textové vykreslení markeru, autentizaci sběru, validaci API, řízený fallback, deduplikaci souběžného sběru a SQL podmínku expirace cache (bez skutečné databáze). Skutečné čekání na timeout a závod výběru v prohlížeči zatím nemají integrační test. Desktopové a mobilní screenshoty nebyly pořízeny; vizuální kontrola zůstává nedokončená.

Po kompatibilních bezpečnostních aktualizacích npm audit hlásí 9 nálezů (7 moderate, 2 high), včetně vnořeného PostCSS v Next.js. Doporučený automatický fix části nálezů vyžaduje Next.js 16; nebyl použit. Před veřejným produkčním nasazením je nutné nálezy znovu vyhodnotit a připravit ověřený upgrade/patch.
