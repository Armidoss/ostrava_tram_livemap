# Záznam úprav

Zachována architektura Next.js / React / Leaflet / volitelný PostGIS. Bez commitu, push, deploye, přepisu historie nebo destruktivní migrace.

## Bezpečnost a správnost

- `.env` odebrán pouze z indexu; lokální soubor zachován. Dva historické commity obsahují DATABASE_URL. Případné skutečné databázové heslo je nutné ručně rotovat.
- Značky používají DOM textContent, omezenou délku a odstranění řídicích znaků; žádná HTML interpolace linky.
- Collector bez secretu vrací 503, bez správné autorizace 401 a nespustí práci.
- PostgreSQL je vázán na loopback. SQL parametry zachovány; interní DB chyby nejsou vraceny klientovi.
- Opraveno rozpoznání trolejbusu, který byl dříve kvůli pořadí podmínek rozpoznán jako autobus.

## Spolehlivost a UI

- Timeout upstreamu 8 s, procesní snapshot 8 s a sdílení rozpracovaného sběru.
- Demo fallback se neukládá; bez DB se persistence nepovažuje za úspěšnou.
- Databázová cache tras má platnost 6 hodin. Historie filtruje skutečný zdroj a zachovává limit 2000 bodů.
- AbortController a kontrola zrušení chrání trasu i historii při přepínání výběru a unmountu.
- Kompaktní světlá lišta, textové stavy zdroje, přístupné filtry, focus, reduced-motion a menší dopravní značky. Mobilní detail má omezenou výšku a posuvný obsah. Legenda rozlišuje pozorovanou stopu a odhad plánované trasy.

## Ověření

- `npm ci`: úspěch po opakování; původní pokusy narazily na síť a souběžnou instalaci.
- `npm test`: 3 testovací soubory prošly; přímé spuštění ukázalo 10 testů. Test markeru používá kontrolovaný DOM kontrakt, nikoli skutečný browser engine.
- `npm run lint`: úspěch bez varování.
- `npm run typecheck`: úspěch.
- `npm run build`: úspěch, Next.js 15.5.29.
- `git diff --check`: úspěch.
- Kompatibilní `npm audit fix`: 16 nálezů sníženo na 9 (7 moderate, 2 high), kritický nález odstraněn. Příkaz končí 1 kvůli zbývajícím nálezům. Next.js 16 nebyl zaveden.

Browserové vizuální ověření a screenshoty nejsou dokončeny. Chybí browserové regresní testy filtrů, detailů a rychlého výběru. Timeout test simuluje TimeoutError, nečeká skutečných osm sekund. Test cache ověřuje SQL kontrakt, nikoli běžící PostgreSQL. Živé MPVnet připojení nebylo ověřeno.

## Změněné soubory

`.env` (index), `.env.example`, `.gitignore`, `README.md`, `INTERVIEW_NOTES.md`, `CHANGE_REPORT.md`, `eslint.config.mjs`, `package.json`, `package-lock.json`, `docker-compose.yml`, `app/globals.css`, `app/api/collect/route.ts`, `app/api/vehicle-history/[vehicleId]/route.ts`, `app/api/vehicle-route/route.ts`, `components/TransitMapLeaflet.tsx`, `components/VehicleMarker.tsx`, `components/VehiclePanel.tsx`, `lib/db.ts`, `lib/mpvnet.ts`, `lib/marker-element.ts`, `lib/vehicle-collector.ts`, `lib/vehicle-normalizer.ts`, `tests/aliases.mjs`, `tests/api.test.mjs`, `tests/cache.test.mjs`, `tests/regression.test.mjs`.

Existující nesledovaný `INTERVIEW_PREP.md` ponechán beze změny.

## Ruční kroky a omezení

Rotovat případné skutečné databázové údaje ze staré historie; nastavit unikátní CRON_SECRET v produkci. Vyřešit zbývající auditní nálezy před veřejným nasazením. Denní cron není kontinuální collector. Procesní cache není sdílená mezi serverless instancemi; budoucí centrální collector a společná cache jsou popsány v README. Zbývá rate limiting, retence historie a ověření produkčních databázových oprávnění.
