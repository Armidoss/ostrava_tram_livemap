# Příprava na technický rozhovor: Ostrava Tram Live

> **Rozsah a míra jistoty:** Tento dokument vychází z kompletní statické kontroly zdrojových souborů, konfigurace a Git metadat repozitáře dne 4. 11. 2026. „Ověřeno v kódu“ znamená, že je dané chování implementované. Neznamená to automaticky, že dnes funguje proti externím službám. Závislosti (`node_modules`) v pracovním adresáři chyběly, proto se nepodařilo spustit `next build` ani TypeScript kontrolu; živé MPVnet, databáze, Docker, Vercel a prohlížeč nebyly v rámci analýzy spuštěny. Tajné hodnoty nebyly čteny ani uváděny.

## 1. Smysl aplikace

**Ověřeno v kódu:** Ostrava Tram Live je webový prototyp mapy, který zobrazuje aktuální polohy vozidel MHD v oblasti Ostravy. V prohlížeči ukáže mapu, vozidla rozliší podle typu, dovolí filtrovat je, klikem zobrazí detail, pokusí se načíst trasu a může vykreslit uloženou nebo aktuální GPS stopu. Poloha se znovu načítá po 10 sekundách a marker se mezi dvěma známými body plynule interpoluje.

Praktický problém, který řeší: data o pohybu vozidel jsou pro člověka hůře použitelná jako syrová odpověď dopravního systému. Aplikace je převádí na přehlednou vizualizaci, izoluje klient od nestabilního zdroje dat a volitelně archivuje historii pro pozdější zobrazení. Nejde o systém řízení dopravy ani oficiální informační kanál; zdroj je v README i v kódu označen jako neoficiální/reverse-engineered MPVnet endpoint.

**Důležitá přesná formulace na pohovoru:** „Aplikace je odolný demonstrační/prototypový klient nad neoficiálním zdrojem. Když zdroj selže, přepne se na zřetelně označená simulovaná data. Netvrdím proto, že mapa vždy ukazuje reálný provoz.“

## 2. Technologický stack a proč

| Vrstva | Technologie | Proč / role | Důkaz |
|---|---|---|---|
| Jazyk | TypeScript 5, strict mode | Typy pro kontrakty API a méně chyb při práci s neznámým JSONem. | `tsconfig.json`, `types/vehicle.ts` |
| Web framework | Next.js 15, App Router | Jedna aplikace pro React UI i serverové route handlers/proxy. | `app/`, `package.json` |
| UI | React 19 | Stav, efekty, memoizace a komponentový model mapy. | `components/*.tsx` |
| Mapa | Leaflet 1.9 + react-leaflet 5 | OSM mapa, markery, polylines, popupy a jednoduchá interakce. | `TransitMapLeaflet.tsx` |
| Vzhled | Tailwind CSS 3, PostCSS, Autoprefixer + vlastní CSS | Rychlé responzivní utility třídy, specifické Leaflet styly a vlastní markery. | `tailwind.config.ts`, `app/globals.css` |
| Data | Node `fetch` | Server-side POST na MPVnet, aby klient neznal/upstream přímo nevolal a aby šla normalizace. | `lib/mpvnet.ts` |
| Databáze | PostgreSQL + PostGIS 3.4, `pg` | Historie pozic, prostorový bod `GEOGRAPHY(Point,4326)`, GIST index a cache tras. | `lib/db.ts`, `db/migrations/001_init.sql` |
| Lokální infrastruktura | Docker Compose, image `postgis/postgis:16-3.4` | Reprodukovatelný lokální PostGIS. | `docker-compose.yml` |
| Deployment/scheduler | Vercel + Vercel Cron | Serverless Next hosting; cron volá kolektor. | `vercel.json` |
| Kvalita | ESLint/`eslint-config-next`, TypeScript | Deklarované nástroje, ale nejsou testy ani ESLint konfigurace ověřené spuštěním. | `package.json` |

Nejsou implementovány WebSockety, SSE, autentizace uživatelů, ORM, Redux ani testovací framework. Obnova je obyčejný HTTP polling.

## 3. Architektura a tok dat

```text
Browser (React + Leaflet)
  GET /api/vehicles každých 10 s
       |
       v
Next.js route handler -> collectVehiclePositions()
       |                     |-- POST MPVnet /mapData
       |                     |-- normalizeVehicles(unknown JSON -> Vehicle[])
       |                     `-- při chybě: getDemoVehicles()
       |-- volitelně saveVehiclePositions() -> PostgreSQL/PostGIS
       `-- JSON {source, vehicles, error}
  -> stav animací + requestAnimationFrame -> Leaflet markery/panel

Klik na marker
  |-- GET /api/vehicle-history/:id?minutes=180 -> PostGIS -> modrá stopa
  `-- POST /api/vehicle-route -> cache PostGIS, jinak MPVnet /getRoute
       -> body trasy/zastávky -> polylines a body zastávek
```

### Detailní tok

1. Server-renderovaná stránka `app/page.tsx` vloží klientský wrapper `components/TransitMap.tsx`.
2. Wrapper dynamicky importuje `TransitMapLeaflet.tsx` až na klientovi. To je nutné, protože Leaflet pracuje s DOM/window a při SSR by mohl selhat.
3. `TransitMapLeaflet` po mountu volá `/api/vehicles`, po úspěchu ještě jednou za 2 s a dále každých 10 s. `cache: "no-store"` brání získání staré HTTP cache.
4. `app/api/vehicles/route.ts` běží explicitně v Node runtime a dynamicky. Volá `collectVehiclePositions`.
5. `fetchMpvnetVehicles` odešle POST s bounding boxem Ostravy. Odpověď se načte jako text, parsuje `JSON.parse` a tolerantní normalizátor ji prohledá do hloubky max. 8. Neznámé tvary dat tedy neberou aplikaci jako pevně daný API kontrakt.
6. Při neúspěchu upstreamu, JSONu nebo při nulovém počtu nalezených objektů se použije pět deterministicky simulovaných, časově se pohybujících vozidel. Odpověď nese `source: "demo"` a chybu.
7. Pokud existuje `DATABASE_URL`, kolektor se pokusí uložit pozice. Selhání databáze nezruší odpověď mapě. UI podle stejného `id` vytvoří odchozí/příchozí interpolaci a `requestAnimationFrame` ji každý snímek přepočítá.
8. Vozidlo nezvěstné v nové odpovědi zůstane až 30 s jako šedé `stale`. Lokální stopa drží body posledních 30 minut; body se přidávají, když je předchozí starší než 1 s nebo vzdálenější než 4 m.

## 4. Nejdůležitější soubory, funkce a komunikace

| Soubor | Zodpovědnost a vazby |
|---|---|
| `types/vehicle.ts` | Sdílené typy `Vehicle`, odpovědí API, `RoutePoint` a požadavku na trasu. Je kontraktem mezi route handlers a UI. |
| `app/page.tsx`, `app/layout.tsx` | Vstupní stránka, český jazyk HTML, metadata a globální CSS. |
| `components/TransitMap.tsx` | Klientský lazy loader Leaflet modulu a samostatný loading/error stav. |
| `components/TransitMapLeaflet.tsx` | Hlavní orchestrátor UI: polling, `applyIncomingVehicles`, animace, filtry, výběr vozidla, historie, trasa a mobilní detail. `calculateBearing` počítá počáteční směr po velké kružnici; `distanceMeters` je Haversinova vzdálenost. |
| `components/VehicleMarker.tsx` | Leaflet `divIcon`, popup a formátování zpoždění. Přijímá `DisplayVehicle` a při kliknutí předá vozidlo rodiči. |
| `components/VehiclePanel.tsx` | Informační/filtrační panel a stav zdroje MPVnet/demo/error. |
| `lib/mpvnet.ts` | HTTP adaptér zdroje: konstantní bounding box, MPVnet requesty, normalizace trasy a `getDemoVehicles`. |
| `lib/vehicle-normalizer.ts` | Obranný adaptér neznámého JSONu. Hledá alternativní názvy klíčů, ověří souřadnice, odvodí typ/linku/zpoždění a deduplikuje podle ID. |
| `lib/vehicle-collector.ts` | Use-case „získej a volitelně ulož polohy“. Centralizuje fallback a izoluje chybu databáze. |
| `lib/db.ts` | Pool `pg`, jednorázové `ensureSchema`, parametrizované SQL, uložení pozic, historie a cache tras. |
| `app/api/vehicles/route.ts` | Veřejný GET pro mapu. |
| `app/api/collect/route.ts` | GET pro cron; chrání ho `CRON_SECRET`, pokud je nastaven. |
| `app/api/vehicle-route/route.ts` | Validuje JSON body, čte/zapisuje cache tras, jinak volá MPVnet. |
| `app/api/vehicle-history/[vehicleId]/route.ts` | Čte historii vozidla v rozsahu 1–1440 minut, maximum 2 000 bodů. |
| `db/migrations/001_init.sql` | Iniciační DDL pro tabulky, indexy a PostGIS. |

## 5. API, HTTP, databáze a absence WebSocketů

### Vlastní HTTP API

| Endpoint | Kdo ho volá | Co dělá / odpověď |
|---|---|---|
| `GET /api/vehicles` | Browser | Vždy HTTP 200 z implementace; `{source:"mpvnet"|"demo", vehicles, error?}`. Zapisuje do DB best-effort. |
| `GET /api/collect` | Vercel Cron / správce | Stejný sběr bez vracení vozidel; souhrn `saved`, `persisted`, `vehicleCount`. Při nastaveném tajemství vyžaduje `Authorization: Bearer …`; jinak 401. |
| `POST /api/vehicle-route` | Browser po kliknutí | Body `num1`, `num2`, `cat`, volitelně `carrier`. Neplatné body: 400. Upstream bez trasy/chyba: 502. Úspěch z cache nebo MPVnetu. |
| `GET /api/vehicle-history/:vehicleId?minutes=180` | Browser po kliknutí | Z PostGIS vrátí body; selhání DB: 503 s prázdným polem. |

### Externí MPVnet

**Ověřeno v kódu, nikoli živým voláním:**

* `POST https://mpvnet.cz/odis/map/mapData`, JSON `{w:18.0,s:49.6,e:18.5,n:49.95,zoom:13,showStops:false,mapFilterId:null}`.
* `POST https://mpvnet.cz/odis/map/getRoute`, JSON s `num1`, `num2`, `cat`, `carrier`, `trajectory:true`.
* Oba mají hlavičky `Origin`, `Referer`, `User-Agent`, `Content-Type`, `Accept`, vypnutou Next cache.

Nemohu bez živého testu potvrdit aktuální dostupnost, povolenost, přesný formát ani správnost souřadnic tohoto neoficiálního endpointu. Kód používá heuristiky: pro vozidla rozpoznává mnoho možných klíčů a u trasy interpretuje `x` jako latitude a `y` jako longitude. To je třeba před prezentací ověřit proti reálné odpovědi.

### Datový model

`vehicle_positions` obsahuje identitu, linku, typ, zpoždění, cíl, zdroj, čas pozorování, čas přijetí, původní JSON a PostGIS `GEOGRAPHY(Point,4326)`. Deduplikační unikátní index je nad `(vehicle_id, observed_at, lat zaokrouhlená na 6 míst, lng zaokrouhlená na 6 míst)`; insert pak používá `ON CONFLICT DO NOTHING`. Indexy podporují historii podle vozidla/času, globální čas a prostorové dotazy.

`vehicle_routes` cachuje JSON tras a zastávek podle klíče `cat:num1:num2:carrier`. Cache nemá TTL při čtení, i když zapisuje `fetched_at`.

## 6. Zabezpečení, konfigurace, chyby, logování a nasazení

### Co je provedeno dobře

* Přístup k upstreamu je na serveru; prohlížeč nevolá MPVnet přímo.
* SQL používá parametrizované hodnoty (`$1`…), tedy vstup `vehicleId` ani route body nevytvářejí SQL injection.
* Route request pro `num1`, `num2`, `cat` je před použitím validován.
* DB connection pool má max. 5 spojení, 1,5s connection timeout a při chybě 30s cooldown pro schema pokus.
* Historie limituje čas na 1 den a množství na 2 000 řádků.
* Cron lze chránit serverovým `CRON_SECRET`; tajemství se neposílá do UI.
* Chyby MPVnet/DB jsou degradovány: mapa ani route endpoint při nich zbytečně nespadnou.

### Konfigurace

`MPVNET_URL`, `MPVNET_ROUTE_URL`, `DATABASE_URL`, `CRON_SECRET` popisuje `.env.example`. V aktuálním `.env` byly bezpečně ověřeny jen názvy tří proměnných (bez hodnot): URL MPVnetu a `DATABASE_URL`; `CRON_SECRET` v něm není. Produkční proměnné ve Vercelu nelze z repozitáře ověřit.

### Chyby a observabilita

V development módu se používá `console.debug` pro fallback MPVnetu, DB, trasu, historii a import mapy. V produkci jsou tyto logy potlačeny. Nejsou metriky, structured logs, request ID, health endpoint, alerting ani tracing. UI rozlišuje zdroj badge a u demo pouze obecnou zprávou „Demo data“; detail chyby uživateli neukazuje.

### Nasazení

`vercel.json` plánuje `/api/collect` na **03:00 UTC jednou denně**, ne každých deset sekund. Běžný návštěvník však `/api/vehicles` volá každých 10 s a tím také zkouší ukládat historii. Pro Vercel musí existovat externě dosažitelný Postgres/PostGIS (lokální Docker volume do Vercelu nepatří) a nastavené environment variables. Route handlers explicitně požadují `runtime = "nodejs"`, což je správné kvůli `pg`.

## 7. Lokální spuštění, testování a bezpečná demonstrace

### Příprava

1. Použij aktuální podporované Node LTS kompatibilní s Next 15 (předem ověř `node --version`).
2. **Necommituj `.env`.** Vytvoř lokální `.env.local` z `.env.example`; nedávej jej do prezentace, screenshotu ani terminálu. Pro demo můžeš `DATABASE_URL` vynechat, ale pak historie z DB nebude fungovat.
3. Pro PostGIS spusť `docker compose up -d`; ověř `docker compose ps` a healthcheck. Výchozí údaje v Compose jsou pouze pro lokální vývoj, ne pro veřejný server.
4. Nainstaluj přesně locknuté balíčky: `npm ci`.
5. Ověř kvalitu: `npm run build`. Skript `npm run lint` je deklarován, ale je vhodné jej před schůzkou ověřit — u Next 15 může starý příkaz `next lint` vyžadovat úpravu konfigurace/skriptu.
6. Spusť `npm run dev`, otevři `http://localhost:3003`.

### Doporučené funkční ověření před schůzkou

* V DevTools Network ověř `/api/vehicles`: `source` musí odpovídat badge. Pokud je `demo`, **neprezentuj data jako živá**.
* Nech mapu aspoň 20–30 s: markery se mají plynule pohybovat a data se mají obnovovat.
* Vyzkoušej každý filtr a klik na vozidlo. U reálného vozidla s `routeRequest` ověř trasu/zastávky; ne každé vozidlo ji musí mít.
* Je-li DB spuštěná, po několika pollinzích zkontroluj přes klienta DB počet řádků, pak klikni na totéž vozidlo a ověř, že detail říká „Historie“, ne jen „Stopa“.
* Ověř negativní scénář: bez DB stále funguje mapa, jen historie je session-only; při selhání MPVnetu se ukáže demo badge.
* Do živé demonstrace měj připravený lokální fallback: odpojení externí sítě má ukázat funkční a poctivě označený demo režim, nikoli pád UI.

**Stav ověření nyní:** `npm run build` skončil před kompilací chybou `next: not found`, protože chybí `node_modules`. Nejde o důkaz chyby zdrojového kódu, ale je to blokující položka před schůzkou.

## 8. Otázky, které může položit vývojář nebo administrátor

1. **Proč používáte vlastní `/api/vehicles`, když může browser volat MPVnet?**  
   Proxy centralizuje neoficiální request, normalizaci a fallback, snižuje vazbu klienta na upstream a umožní serverové ukládání. Viz `lib/mpvnet.ts` → `lib/vehicle-collector.ts` → `app/api/vehicles/route.ts`.

2. **Je to opravdu real-time?**  
   Přesněji near-real-time polling po 10 s, ne push real-time. Mezi dvěma vzorky UI jen lineárně animuje, nezná skutečný pohyb mezi nimi.

3. **Jak se aplikace vyrovná se změnou formátu MPVnet?**  
   `vehicle-normalizer.ts` podporuje alternativní/case-insensitive klíče, rekurzivně hledá kandidáty, validuje rozsah souřadnic a deduplikuje ID. Není to záruka kompatibility; musí se přidat fixture testy z reálných odpovědí a monitoring nulového počtu vozidel.

4. **Jak určujete typ vozidla?**  
   Priorita je textový `type`/`cat`; pak heuristika podle seznamu tramvajových linek, 100–109 pro trolejbusy, 20–99 pro busy a `ND`. Je to doménová heuristika, nikoli autoritativní zdroj, proto existuje `unknown`.

5. **Jak zabráníte duplicitám poloh?**  
   DB unikátní index kombinuje ID vozidla, `observed_at` a souřadnice na šest desetinných míst; insert používá `ON CONFLICT DO NOTHING`. Nevýhoda: pokud upstream přidělí každému requestu jiný čas, toto deduplikaci mezi requesty neudělá.

6. **Proč PostGIS místo obyčejných decimal sloupců?**  
   Umožňuje GIS typ, GIST index a budoucí prostorové dotazy (blízkost zastávky, průnik s koridorem). Historický dotaz nyní používá primárně čas/ID, ale schema je na geodata připravené.

7. **Jak funguje plynulý pohyb?**  
   Při nové pozici se uloží `from`, `to`, start a délka 11,5 s. `requestAnimationFrame` dopočítá lineární lat/lng. Start je aktuálně vykreslená poloha, takže se marker při novém pollingu neskokově přesměruje.

8. **Proč 11,5 s animace při 10s pollingu?**  
   Je to záměrné překrytí pro plynulost, uvedené konstantou `ANIMATION_DURATION_MULTIPLIER=1.15`. Za nevýhodu považuji, že marker typicky nedorazí přesně do starého cíle, než přijde nová zpráva; je to vizualizační kompromis.

9. **Co se stane při výpadku MPVnet?**  
   Kolektor zachytí chybu, vrátí pět demo vozidel a chybu, panel ukáže `demo`. Jestli selže samotné `/api/vehicles`, UI ukáže `error` a uchová poslední markery, dokud je animační TTL neodstraní.

10. **Jak funguje historie při nedostupné DB?**  
    `saveVehiclePositions` se tiše přeskočí, GET historie vrátí 503, ale UI ponechá stopu nasbíranou v paměti browseru během session. Po reloadu bez DB zmizí.

11. **Jak chráníte cron?**  
    Jen pokud existuje `CRON_SECRET`, porovnává handler přesně `Authorization: Bearer <secret>`, jinak vrací 401. Bez proměnné je endpoint volně dostupný — bezpečné pouze pro lokální vývoj, ne produkci.

12. **Jsou SQL dotazy bezpečné?**  
    Ano vůči SQL injection: všechny proměnné hodnoty jsou parametry `pg`. Dynamicky sestavované jsou pouze placeholdery pro velikost interně vytvořeného batch insertu, nikoli uživatelský text.

13. **Proč je Leaflet dynamicky importovaný?**  
    Má závislost na browserovém DOM. `TransitMap.tsx` importuje mapový modul až v `useEffect`, čímž se vyhne SSR problému a oddělí loading/error stav.

14. **Používáte WebSocket nebo SSE?**  
    Ne. Kód obsahuje jen `fetch` a `setInterval`; push kanál není implementovaný. Pro vyšší škálu bych zvažoval jediný serverový collector + pub/sub/SSE nebo cache, aby každý klient nezatěžoval upstream.

15. **Je Vercel Cron nastavený pro živou historii?**  
    Ne. Je jednou denně ve 03:00 UTC. Živě se dnes historie naplňuje hlavně návštěvami `/api/vehicles`; pro produkční archivaci je nutný častější autorizovaný scheduler/worker, jehož interval odpovídá cíli a limitům dodavatele dat.

16. **Proč cache tras a jak se invaliduje?**  
    Cache omezuje volání neoficiálního upstreamu při opakovaném kliknutí. Klíč je `cat:num1:num2:carrier`, `ON CONFLICT` cache obnoví při novém fetchi. Při čtení však není TTL, tedy může vracet zastaralou trasu; to je technický dluh.

17. **Jak poznáte, že zobrazená budoucí trasa je přesná?**  
    Nepoznám to s jistotou. UI najde nejbližší bod vrácené geometrie k aktuální GPS poloze a rozdělí polyline na „projetou“ a „další“. Je to aproximace, ne map matching ani skutečná predikce.

18. **Jaké citlivé údaje aplikace zpracovává?**  
    Kód přenáší konfiguraci DB a případné cron tajemství; uložený `raw JSON` může obsahovat více upstream metadat. Aktuálně je problém, že `.env` je verzovaný — musí se odstranit z historie/rotovat tajemství. Osobní údaje nelze z kódu potvrdit bez reálné odpovědi upstreamu.

## 9. Scénář pětiminutové demonstrace

**0:00–0:35 — Kontext.** „Toto je Next.js prototyp pro vizualizaci poloh MHD v Ostravě. Hlavní myšlenka není jen mapa: izoluje nestabilní neoficiální zdroj, normalizuje jeho JSON, degraduje do demo režimu a umí archivovat geodata.“

**0:35–1:20 — Mapa a polling.** Otevři mapu, ukaž badge zdroje a čas aktualizace. Řekni přesně, zda je to MPVnet nebo demo. Počkej na obnovu/pohyb markerů, ukaž filtry a popup se zpožděním/ID.

**1:20–2:15 — Detail vozidla.** Klikni na vozidlo. Ukaž detail, tlačítko Střed a legendu: modrá je historie/stopa, šedá projetá část, barevná přerušovaná další trasa. Ukaž zastávky jen pokud se skutečně načetly.

**2:15–3:00 — Data flow v kódu.** Otevři nejdřív `app/api/vehicles/route.ts`, pak `lib/vehicle-collector.ts`, `lib/mpvnet.ts` a `lib/vehicle-normalizer.ts`. V jedné větě vysvětli proxy → normalizaci → fallback → JSON.

**3:00–3:40 — PostGIS.** Otevři `db/migrations/001_init.sql` a vysvětli `GEOGRAPHY(Point,4326)`, index podle vozidla/času a deduplikaci. Zdůrazni, že DB je volitelná a UI bez ní nespadne.

**3:40–4:25 — Odolnost.** Ukaž badge demo nebo vysvětli, jak by se po výpadku zobrazil. Zmiň, že WebSockety zde nejsou: vědomě je použit polling, ale škálovací návrh by ho centralizoval.

**4:25–5:00 — Sebereflexe.** Řekni otevřeně tři priority: odstranit verzovaný `.env`, testy a správně nastavený produkční collector/rate limiting. To působí důvěryhodněji než tvrdit, že MVP je hotové enterprise řešení.

## 10. Potenciální chyby, slabiny a technický dluh (podle závažnosti)

| Priorita | Problém ověřený v kódu | Dopad | Náprava | Jak ověřit |
|---|---|---|---|---|
| Kritická | `.env` je trackovaný v Gitu (`git ls-files .env`); `.gitignore` ignoruje jen `.env*.local`, ne `.env`. | Možný únik DB přístupu nebo jiných tajemství do historie/remote. | Okamžitě rotovat všechny hodnoty, odstranit `.env` z indexu a historie podle procesu organizace, přidat `.env` do `.gitignore`; ponechat jen `.env.example`. | `git ls-files .env` nesmí nic vrátit; secret scanning historie/remote nesmí nalézt původní tajemství. |
| Vysoká | `L.divIcon` skládá HTML s neescapovaným `vehicle.line` z nedůvěryhodné upstream odpovědi. | Potenciální DOM XSS, pokud upstream vrátí škodlivý text. | Nevkládat data do HTML stringu; použít bezpečný DOM/text node nebo alespoň striktní escape a validaci délky/znaků. | Fixture s `<img onerror=...>` se zobrazí jen jako text a nespustí se. |
| Vysoká | `/api/collect` je bez `CRON_SECRET` veřejný; lokální `.env` podle bezpečně zkontrolovaných názvů secret nemá. | Libovolný volající může vyvolat externí requesty a DB zápisy. | Secret vyžadovat ve všech ne-development prostředích, přidat rate limit a odlišit interní collector. | Bez hlavičky v production configu vždy 401; s platnou hlavičkou 200. |
| Vysoká | Každý browser dělá polling 10 s, a každý hit volá upstream a pokouší se o DB insert. Není rate limit, sdílená cache ani single-flight. | Škálování, náklady, rate limit/ban od MPVnet, nekontrolované plnění DB. | Centrální worker/scheduler, krátká serverová cache, deduplikace souběžných fetchů, rate limit a retence/agregace dat. | Load test s N klienty: upstream request rate zůstane téměř konstantní a DB roste podle očekávání. |
| Vysoká | Fetch na MPVnet nemá explicitní timeout/AbortSignal. | Visící spojení může držet request/function a zhoršit dostupnost. | `AbortSignal.timeout`, rozumné retry s exponential backoff/circuit breaker a měření latence. | Simulovaný pomalý upstream vrátí fallback do definovaného času. |
| Střední | Trasa/historie jsou veřejné endpointy bez rate limitu; route cache nemá TTL. | Zneužití, zbytečný upstream, zastaralé trasy. | Validovat maximální délky/rozsahy, rate limit, TTL (`fetched_at`) a cache-control. | Flood test vrací 429; stará cache se po TTL obnoví. |
| Střední | Při rychlém klikání na A pak B neexistuje `AbortController` ani kontrola ID před `setSelectedRoute`; pozdní odpověď A může přepsat detail B. | Nesprávná trasa v UI. | Rušit předchozí request a/nebo před uložením ověřit aktuální selected ID/request sequence. | Test s uměle zpožděnou odpovědí A a rychlou B ukáže jen B. |
| Střední | Normalizátor je heuristický; fallback ID obsahuje souřadnice a index, typ je částečně podle hard-coded linek. | Nestabilní identity, špatná klasifikace či falešně rozpoznané objekty při změně API. | Smluvní fixture testy z anonymizovaných reálných odpovědí, schema validation, metriky `unknown`/dropped/duplicate. | Test suite pokryje známé varianty a snapshot očekávaných vozidel. |
| Střední | Schema DDL je duplicitně v migraci i `ensureSchema()` za běhu. Serverless globál je jen na jednu instanci. | Mísení deploymentu a runtime, závody/meziinstanční overhead, komplikovaná správa migrací. | Použít verzované migrace aplikované v CI/CD; runtime jen ověřuje spojení. | Nová instance neprovádí DDL, migrace jsou idempotentní a verze DB je sledovaná. |
| Střední | Lokální Compose publikuje PostgreSQL na `5432` s veřejně známými vývojovými údaji. | Nebezpečné, pokud se použije mimo izolovaný lokální počítač. | Jen lokální bind `127.0.0.1`, `.env` s unikátním heslem, produkčně managed DB/TLS/least privilege. | Port není dostupný z jiné stanice; production role nemá zbytečná práva. |
| Střední | Vercel cron je jednou denně, ale README mluví o průběžné historii. | Očekávaná historie nebude existovat, není-li někdo na mapě. | Definovat retenci a interval, nasadit autorizovaný worker/cron v realistické frekvenci a kontrolovat provider limity. | Časová řada v DB obsahuje body i bez návštěvníků. |
| Nízká | Nejsou testy, CI workflow, healthcheck API, metriky ani production logy. | Regrese se objeví až při ručním testu. | Unit testy normalizace/geometrie, integrační testy API s mockem, E2E mapy, CI a observabilita. | CI spouští lint/typecheck/test/build; dashboard ukazuje chyby/latenci. |
| Nízká | UI v panelu ukazuje u demo jen „Demo data“, ne příčinu; route chyby rovněž zjednodušuje. | Slabší diagnostika pro obsluhu. | Uživatelsky stručná zpráva + bezpečný technický kód, detail v logu/monitoringu. | Simulace 4xx/5xx/DB chyby zobrazí rozlišitelný stav bez úniku tajemství. |

## 11. Co umět do hloubky a co stačí obecně

### Musíš umět vysvětlit do hloubky

* **Celý tok dat a fallback:** proč je MPVnet jen serverový adaptér, jak `collectVehiclePositions` funguje a jak UI pozná demo.
* **Normalizátor:** proč se pracuje s `unknown`, různými názvy polí, validací souřadnic, heuristikou typu a deduplikací — i jeho limity.
* **Polling/animace:** `setInterval`, `requestAnimationFrame`, interpolace, bearing, stale TTL a proč to není skutečná GPS telemetrie v reálném čase.
* **PostGIS model:** WGS84/4326, rozdíl geometrie vs. geografie, GIST, časový index, parametrizované dotazy, cache tras a volitelná persistence.
* **Odolnost a bezpečnost:** fallback, DB best-effort, `CRON_SECRET`, ale také přesně známé mezery: verzovaný `.env`, XSS v markeru, absence limitů/timeouts a závislost na neoficiálním API.

### Stačí znát obecně

* Tailwind utility třídy a detailní odstíny v `globals.css`.
* Každé jednotlivé tlačítko mobilního bottom sheetu a všechny Leaflet props.
* Přesné interní detaily Docker image PostGIS nebo Vercel platformy — vysvětli účel, ale nepředstírej provozní zkušenost, kterou jsi neověřil.
* Přesná struktura MPVnet `cn` pole: umíš ukázat, že je parsované heuristicky, ale potvrď ji až po živé kontrole odpovědi.

## Pět věcí, které vyřešit před schůzkou

1. **Ihned zrotovat případná tajemství a odstranit `.env` z Gitu i historie; přidat ignorování `.env`.**
2. Spustit `npm ci` a úspěšně ověřit `npm run build` (a lint/typecheck); aktuálně to nebylo možné kvůli chybějícím závislostem.
3. Spustit mapu a živě ověřit MPVnet response, normalizaci, trasu a jasné označení MPVnet vs. demo.
4. Ověřit Docker/PostGIS: zápis pozic, historii po refreshi a chování bez DB.
5. Připravit krátké, poctivé vysvětlení největších dluhů: veřejný/neomezený polling, timeouty/rate limit, cron jednou denně a chybějící testy/observabilita.
