# Euro Clean Cosmetics, weboldal és landing oldalak

Statikus oldal Vercelen, egy szerver oldali függvénnyel. Nincs build lépés, nincs
framework, nincs CDN hívás a landing oldalakon.

| Útvonal | Mi ez |
|---|---|
| `/` és `/adatvedelem` | Adatvédelmi tájékoztató (GDPR), ugyanaz a fájl két címen |
| `/tisztitas` | Landing oldal az **A hirdetéssorozathoz**: homlokzat, tűzfal, térkő, valamint lakás- és háztakarítás |
| `/auto` | Landing oldal a **B hirdetéssorozathoz**: autó belső takarítás és kárpittisztítás |
| `/api/lead` | A két űrlap végpontja. Csak POST. Beír egy sort a Marketing OS CRM-jébe |

A két landing oldal a `Marketing-OS/ads/euroclean-ingyenes-probatisztitas/` mappa
tizenkilenc hirdetéséhez készült. A `felulet-` és a `lakas-` hirdetések a
`/tisztitas`, az `auto-` hirdetések az `/auto` oldalra mutatnak.

## Mi van a fájlokban

```
index.html              adatvédelmi tájékoztató, önmagában álló
tisztitas/index.html    A oldal
auto/index.html         B oldal
assets/lp.css           a két landing oldal közös stíluslapja
assets/lp.js            közös viselkedés: űrlap, karusszel, beküldés
assets/fonts/           Poppins 400/600/800, latin és latin-ext
img/                    a landing oldalak fotói
api/lead.js             a lead végpont
api/lead.test.cjs       a végpont tesztje, mockolt fetch-csel
vercel.json             tiszta URL-ek, /adatvedelem átírás, cache fejlécek
```

A stíluslap és a JS **szándékosan közös**: a két oldal így nem tud elcsúszni
egymástól. Ami oldalanként más, az mind a HTML-ben van, és minden látható szó
ott, ahol meg is jelenik.

## Élesítés előtt, egyszer

1. **Futtassa le a Marketing OS `supabase/2026-09-17-crm.sql` migrációját**, ha még
   nem futott. Ez hozza létre a `contacts` táblát, amibe az űrlap ír.
2. **Állítsa be a két titkot** a Vercel projektben (Settings → Environment
   Variables, Production és Preview is):

   | Név | Érték |
   |---|---|
   | `SUPABASE_URL` | `https://<projekt>.supabase.co` |
   | `SUPABASE_SERVICE_ROLE` | a **service_role** kulcs, soha nem az anon |

   A kulcs a Marketing OS `.env`-jében `SUPABASE_SERVICE_ROLE_KEY` néven van; a
   függvény mindkét nevet elfogadja, tehát másolható úgy, ahogy van.
3. **Nincs Meta Pixel az oldalakon.** Amíg nincs, a Meta nem lát konverziót, csak
   linkkattintást. A `lp.js` már hívja az `fbq('track','Lead')`-et, ha a pixel
   jelen van, tehát a pixel kódot elég beilleszteni a két HTML `<head>`-jébe.

Deploy: push a `main` ágra, a Vercel magától épít. Framework preset **Other**,
build command üres, output directory a repó gyökere. A `vercel.json` mindent
beállít, amire szükség van.

## Hogyan jut el a lead az adatbázisba

A landing oldal statikus, tehát **nem tarthat Supabase kulcsot**. Az űrlap a
`/api/lead`-re küld, ami Vercel Node Function: az tartja a `service_role`
kulcsot környezeti változóban, és ugyanúgy megkerüli az RLS-t, ahogy a Marketing
OS szerveroldala. Az anon kulcs továbbra sem olvas és nem ír semmit.

A sor a `contacts` táblába megy `client_id = 'euroclean'` értékkel, tehát a
Marketing OS `/c/euroclean/crm` képernyőjén jelenik meg.

**A `contacts` táblában nincs külön város és szolgáltatás oszlop**, ezért mindkettő
az `message` mezőbe kerül, ponttal elválasztva, az utm paraméterekkel együtt:

```
Homlokzat, tűzfal · Mosonmagyaróvár · campaign=probatisztitas content=felulet-04
```

A CRM a név alatt pont ezt a sort írja ki. A `source` oszlopba a lap azonosítója
megy (`lp-tisztitas` vagy `lp-auto`), tehát a táblában látszik, melyik
hirdetéssorozat hozta.

A függvény ezen felül: eldobja a rejtett mezőt kitöltő botokat, elutasítja az
idegen originről érkező kérést, levágja a túl hosszú értékeket, és egy órán belül
nem enged ugyanattól a telefonszámtól második sort, csak a `submissions`
számlálót emeli. Ha a beküldés elhasal, az űrlap **nem üríti ki a mezőket**,
kiír egy hibát és felkínálja a telefonszámot.

```bash
node api/lead.test.cjs      # a végpont tesztje, nem hív hálózatot
```

### Miért nem a Marketing OS `/api/leads` végpontja

Az lenne a kijelölt út, de a Marketing OS asztali appként fut a 127.0.0.1-en,
amit egy landing oldal nem ér el. Ha a Marketing OS egyszer nyilvános URL-re
kerül, ez a függvény lecserélhető egy hívásra arra a végpontra az ügyfél
`intake_key`-ével, és akkor a service_role kulcs egyáltalán nem kell ide.

## Az űrlap és az adatvédelem

Négy mező: szolgáltatás, név, telefonszám, település. **E-mail cím szándékosan
nincs**, mert a súrlódás többet ér, mint a mező. Ennek egy ára van: a `contacts`
tábla saját dedupe indexe e-mailre megy, tehát azon nem fog; a telefonszámos
dedupe ezért a függvényben van, és csak egy órás ablakra.

Az űrlap alatt egy mondat áll arról, mihez járul hozzá a beküldő, és egy link az
`/adatvedelem` oldalra. **Nincs külön kipipálandó négyzet.** Árajánlat kérésénél
az adatkezelés jogalapja a szerződéskötést megelőző lépés, nem a hozzájárulás,
ezért a négyzet nem kötelező, viszont a kiírás igen. Ha később hírlevélre is
gyűjtene címet, az **külön, alapértelmezetten üres négyzetet** kíván, mert az már
hozzájárulás.

## A szöveg szerkesztése

Minden látható szó a két `index.html`-ben van, abban a sorrendben, ahogy
megjelenik. Nincs generátor és nincs `szoveg.txt`, mert két oldalnál a
plusz réteg többet rejt el, mint amennyit megóv.

Helyi nézet:

```bash
python3 -m http.server 8056 --directory .
```

Aztán http://127.0.0.1:8056/tisztitas/ és http://127.0.0.1:8056/auto/. **Mobil
nézetben nézze, 390 px szélességen**: a forgalom nagyjából 95%-a Meta appon
belüli böngésző. A `/adatvedelem` átírás csak Vercelen él, helyben a `/` a
tájékoztató.

## Az ingyenes próba jelzése

A hirdetéssorozat kétféle ajánlatot visz, és ezt az oldalnak mondania kell,
nem elhallgatnia:

- **Homlokzat, tűzfal, térkő:** az első szakasz ingyen. A hero jelvényben, a
  hero alatti dobozban és a karusszel két kártyáján is ott van, zölddel.
- **Lakás- és háztakarítás:** nincs próba, felmérés után árajánlat. A hero alatti
  doboz ezt kimondja, a három érintett kártya jelvénye kék "Árajánlat".
- **Autó:** az `/auto` oldalon egyáltalán nincs szó ingyenes próbáról.

Ha ez a szabály változik, három helyen kell átírni a `/tisztitas` oldalon: a
`.badge`, a `.note` és az érintett kártyák `.tag` eleme.

## Fotók, és ami hiányzik

| Fájl | Mi van rajta |
|---|---|
| `img/homlokzat.jpg` | ipari tűzfal, felül algásan, alatta a lemosott szakasz |
| `img/terko.jpg` | térkő félig lemosva, egy képkockán a tiszta és a zöldes rész |
| `img/konyha.jpg`, `img/furdo.jpg`, `img/szoba.jpg` | építkezés utáni takarítás, NI-CO Generál ház |
| `img/auto.jpg` | Mercedes-AMG C 63 S, **kívülről** |

**Az autós oldalon nincs belső fotó, mert nem létezik.** Ez két helyen látszik:
a hero képaláírása ezért mondja meg, hogy a fotó a külsőt mutatja, a karusszel
öt kártyája pedig ikonos, nem fotós. Ahogy megvan az első kárpit előtte-utána
fotó, a kártyákat érdemes fotósra cserélni; a `.card > .icon` blokkot kell
`<img>`-re váltani, a CSS-ben mindkettő megvan.

A `/tisztitas` "Társasház, iroda, kiadó lakás" kártyáján egy üres szoba van,
mert társasházi közös térről sincs fotó.

## Ami nincs

- **Nincs Meta Pixel.** Lásd feljebb.
- **Nincs ár az oldalakon.** A korábbi Cloudflare-es landing oldalak árbecsléseket
  vittek, amik nem egyeztek a hirdetés számaival. Amíg nincs megerősített ár,
  jobb nem írni egyet sem, mint rosszat írni.
- **Nincs vélemény és nincs referencia név,** a Top Cool Kft. kivételével, ami a
  hirdetésekben is szerepel.
- **Nincs köszönő oldal,** a siker az űrlapon belül jelenik meg. Ha a Meta
  konverzió méréséhez külön URL kell, az egy `/koszonjuk` oldal és egy
  átirányítás a `lp.js`-ben.
