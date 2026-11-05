# Příprava na pohovor

## Vysvětlení za 60 sekund

Ostrava Tram Live je česká mapová aplikace pro sledování dostupných poloh MHD. Next.js backend odděluje prohlížeč od neoficiálního MPVnet API. TypeScript pomáhá sjednotit různé podoby odpovědí. Leaflet vykresluje vozidla, filtry a trasu. Volitelný PostGIS ukládá historii poloh. Aplikace obnovuje snímky každých deset sekund a pohyb mezi nimi pouze interpoluje. Při výpadku přepne na jasně označenou simulaci, kterou neukládá jako skutečná měření.

## Tok dat a volba technologií

Prohlížeč → Next.js API → MPVnet → normalizace → krátká cache → volitelný PostGIS → mapa. Next.js poskytuje UI a serverové API v jednom projektu. TypeScript kontroluje kontrakty, skutečné JSON však musíme validovat za běhu. Leaflet poskytuje dostupné mapové vrstvy a interakce. PostGIS ukládá geografické body a umožňuje prostorové dotazy; historie používá parametrizované SQL a časový filtr.

## Polling, animace a chyby

Polling běží po deseti sekundách. requestAnimationFrame interpoluje polohu; reduced-motion přeskočí interpolaci. Zmizelé vozidlo se označí jako neaktivní a do třiceti sekund odstraní. Timeout osm sekund ukončuje upstream požadavek. Chybný JSON, HTTP chyba nebo nepoužitelná data spustí demo. Historie může chybět, mapa funguje i bez databáze. Trasa a historie mají AbortController, takže rychlé přepnutí vozidla nepřepíše aktuální detail starou odpovědí.

## Bezpečnost a rozhraní

Marker používá textContent místo vložení názvu linky do HTML. Sběr vyžaduje secret i při nesprávné konfiguraci. `.env` je mimo index, PostgreSQL poslouchá lokálně a API odmítá neplatné parametry. Historie nevrací interní databázové chyby. Kompaktní světlá lišta ponechává hlavní prostor mapě, filtry mají aria-pressed a viditelný focus. Demo i výpadek jsou popsány textem. Mobilní detail lze sbalit.

## Tři důležité architektonické změny

1. Krátká procesní cache sdílí souběžné načítání i ukládání a omezuje zátěž zdroje.
2. Zrušení předchozího výběru brání závodu asynchronních odpovědí trasy i historie.
3. Oddělení simulace od persistence chrání věrohodnost historických pozorování.

## Technický dluh

Procesní cache neřeší více instancí. Denní cron nezajišťuje souvislou historii. Zbývá centrální collector, sdílená cache, rate limiting, retence databáze, stabilnější upstream identita a širší integrační/browser testy. Čas snímku není garantovaný GPS timestamp.

## Pět otázek

- Proč nestačí TypeScript? Externí JSON nemá zaručený runtime typ, proto potřebuje validaci.
- Co řeší AbortController? Ruší práci při změně výběru; guard navíc odmítne již dokončenou starou odpověď.
- Proč PostGIS? Body ukládá v geografickém typu a nabízí prostorové indexy i výpočty.
- Funguje cache globálně? Ne, serverless instance mají vlastní paměť; globální sdílení vyžaduje externí úložiště.
- Je interpolace skutečný pohyb? Ne, jde o vizuální odhad mezi přijatými snímky.

## Demo na 3–5 minut

1. Otevřít mapu a vysvětlit zdroj, čas snímku a označení demo režimu (30 s).
2. Přepnout filtry, vybrat vozidlo a ukázat směr a zpoždění (60 s).
3. Rozlišit plánovanou trasu, odhad projeté části a historii či stopu relace (60 s).
4. Rychle přepnout vozidla, sbalit detail a ukázat mobilní rozložení (45 s).
5. Ukázat testy, bezpečnostní opravy a vysvětlit lokální cache i omezení denního cronu (60 s).
