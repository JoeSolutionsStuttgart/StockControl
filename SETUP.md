# StockControl — Einrichtung

Du brauchst: dein Supabase-Projekt, deinen Brevo-Account, einen Cloudflare-R2-Bucket
und ein GitHub-Repository für die Seite. Reihenfolge einhalten, dann läuft es.

---

## 1. Datenbank aufsetzen (Supabase)

1. Supabase öffnen → **SQL Editor** → **New query**.
2. Inhalt von `supabase/schema.sql` komplett einfügen und ausführen.

Das legt an: `companies`, `profiles`, `settings`, `products`, `movements`, `events`,
`event_items`, `invitations`, `notifications` — dazu die Sicherheitsregeln.

**Was die Regeln leisten:** Jede Zeile trägt eine `company_id`. Row Level Security lässt
nur Zeilen durch, deren `company_id` zum angemeldeten Konto passt. Eine fremde Firma kann
die Produkte einer anderen technisch nicht lesen, auch nicht über die API.

**Was automatisch passiert:**
- Registriert sich jemand, wird Firma + Profil angelegt. Person 1 bekommt die Rolle `owner`.
- Liegt für die Mailadresse eine gültige Einladung vor (3 Stunden), wird die Person
  stattdessen der einladenden Firma zugeordnet.
- Eine Buchung schreibt nur eine Zeile in `movements` — der Trigger rechnet den Bestand
  fort, setzt den Status und legt bei Unterschreitung eine Benachrichtigung an.
  Deaktivierte Produkte werden übersprungen: kein Tracking, keine Mail.

## 2. Mailbestätigung einschalten

Supabase → **Authentication → Providers → Email**:
- „Confirm email" **an**.
- **Authentication → URL Configuration**: `Site URL` auf deine GitHub-Pages-Adresse setzen,
  z. B. `https://deinname.github.io/stockcontrol/`.
- Gültigkeit des Bestätigungslinks auf **15 Minuten** (900 Sekunden) stellen.

Damit Supabase seine eigenen Mails über Brevo schickt: **Project Settings → Auth → SMTP**
aktivieren und Brevos SMTP-Daten eintragen
(Host `smtp-relay.brevo.com`, Port `587`, Login und Key aus Brevo → SMTP & API).

## 3. Mailversand (Brevo Edge Function)

```bash
supabase link --project-ref DEIN_PROJEKT_REF
supabase secrets set \
  BREVO_API_KEY=xkeysib-... \
  MAIL_FROM=lager@deine-domain.de \
  MAIL_FROM_NAME="StockControl" \
  SERVICE_NAME="StockControl" \
  SITE_URL="https://deinname.github.io/stockcontrol/"
supabase functions deploy send-mail
```

Der Brevo-Key liegt damit **serverseitig** — er taucht nie im Browser auf.
Die Absenderadresse muss in Brevo unter *Senders* verifiziert sein.

**Sammelmails** (täglich / wöchentlich / monatlich): im SQL-Editor einmal einrichten —

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule('stockcontrol-mails', '30 7 * * *', $$
  select net.http_post(
    url     := 'https://DEIN_PROJEKT_REF.functions.supabase.co/send-mail',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer DEIN_SERVICE_ROLE_KEY"}'::jsonb,
    body    := '{"action":"flush"}'::jsonb);
$$);
```

Steht in den Einstellungen „Sofort", verschickt derselbe Aufruf Einzelmails;
bei täglich/wöchentlich/monatlich fasst er alles zu einer Bestellliste zusammen.
Für „sofort" kannst du den Cron auf `*/5 * * * *` stellen.

## 4. Bilder und große Dateien (Cloudflare R2)

Produktbilder, PDFs und Excel-Dateien gehören nicht in die Datenbank — sie liegen in R2.
In Postgres steht nur die URL (`products.bild_url`).

**4.1 Bucket anlegen** — Cloudflare → **R2 → Create bucket**, z. B. `stockcontrol`.
Region „Automatic" ist richtig.

**4.2 Privat lassen** — im Bucket unter **Settings → Public access** prüfen:
**R2.dev subdomain** steht auf *Disabled*, keine Custom Domain verbunden. So ist ein neuer
Bucket voreingestellt — nichts zu tun. Öffentlich hieße: wer die Adresse kennt, sieht das
Bild ohne Anmeldung. Das widerspricht der Trennung der Firmen.

**4.3 API-Schlüssel erzeugen** — **R2 → Manage R2 API Tokens → Create API token**,
Berechtigung **Object Read & Write**, auf den Bucket beschränken. Du bekommst
`Access Key ID` und `Secret Access Key`; die Account-ID steht in der R2-Übersicht.

**4.4 CORS erlauben** — im Bucket unter **Settings → CORS policy**, damit der Browser
direkt hochladen darf (deine Pages-Adresse eintragen):

```json
[{
  "AllowedOrigins": ["https://deinname.github.io"],
  "AllowedMethods": ["PUT", "GET"],
  "AllowedHeaders": ["content-type"],
  "MaxAgeSeconds": 3600
}]
```

**4.5 Upload-Function deployen:**

```bash
supabase secrets set \
  R2_ACCOUNT_ID=... \
  R2_ACCESS_KEY_ID=... \
  R2_SECRET_ACCESS_KEY=... \
  R2_BUCKET=stockcontrol
supabase functions deploy upload-url
```

**Wie der Upload abläuft:** Die Oberfläche fragt die Function nach einer Adresse.
Die prüft Anmeldung und Upload-Recht, baut den Pfad `<company_id>/product/<zeit>-<name>`
und signiert eine PUT-Adresse, die **10 Minuten** gültig ist. Der Browser lädt die Datei
damit direkt nach R2. Die R2-Schlüssel verlassen den Server nie, und weil die `company_id`
im Pfad steckt, kann keine Firma in den Ordner einer anderen schreiben.

**Wie das Ansehen abläuft:** Dieselbe Function beantwortet `action: "view"`. Sie vergleicht
die `company_id` im Schlüssel mit der des angemeldeten Kontos — stimmt sie nicht, gibt es
keine Adresse. Stimmt sie, kommt eine signierte GET-Adresse für **eine Stunde** zurück.
In `products.bild_url` steht nur der Schlüssel, nie eine offene URL. Deshalb kann der
Bucket geschlossen bleiben, und ein weitergegebener Link ist nach einer Stunde wertlos.
Erlaubt sind JPEG, PNG, WebP, AVIF, PDF, XLSX und CSV bis 15 MB — anpassen in
`supabase/functions/upload-url/index.ts`.

## 5. Seite verbinden und veröffentlichen (GitHub Pages)

1. `config.js` ausfüllen:

```js
export const SERVICE_NAME = "StockControl";           // Name überall in der Oberfläche
export const SUPABASE_URL = "https://xxxx.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOi...";     // anon public key
```

   Der anon-Key darf öffentlich sein — er kann ohne Anmeldung nichts lesen, dafür sorgt RLS.
   Eine R2-Adresse steht hier bewusst nicht: der Bucket ist privat, Bilder werden über
   kurzlebige signierte Adressen geladen.

2. Repository auf GitHub pushen. Unter **Settings → Pages → Source** auf
   **GitHub Actions** stellen — `.github/workflows/deploy.yml` liegt schon im Projekt und
   veröffentlicht bei jedem Push auf `main`. Der Workflow legt eine `index.html` an, die auf
   die Anwendung weiterleitet, und eine `.nojekyll`, damit alle Dateien ausgeliefert werden.
3. Eigene Domain? **Settings → Pages → Custom domain** setzen und die Adresse danach in
   Supabase (`Site URL`) und in der R2-CORS-Policy nachtragen.
4. Die Seite lädt ihre Daten ab sofort aus Supabase. Ist `SUPABASE_URL` leer,
   läuft die Oberfläche weiter mit Demo-Daten — praktisch zum Vorführen.

---

## Wo was passiert

| Aufgabe | Ort |
| --- | --- |
| Konten, Anmeldung, Passwort-Reset | Supabase Auth |
| Produkte, Bestände, Verlauf, Events | Supabase Postgres |
| Trennung der Firmen | Row Level Security auf `company_id` |
| Bestandsfortschreibung, Warnung | Datenbank-Trigger `apply_movement` |
| Bestätigungs- und Einladungsmails | Supabase Auth über Brevo-SMTP |
| Bestandswarnung, Bestellliste | Edge Function `send-mail` → Brevo API |
| Zeitgesteuerte Sammelmails | `pg_cron` → `send-mail` mit `action: "flush"` |
| Bilder, PDFs, Excel-Dateien | Cloudflare R2, privater Bucket, Pfad `<company_id>/…` |
| Upload-Freigabe | Edge Function `upload-url`, vorsigniert, 10 Minuten |
| Lesefreigabe für Bilder | dieselbe Function, `action: "view"`, vorsigniert, 1 Stunde |
| Oberfläche | GitHub Pages über Actions-Workflow |

## Rollen

`owner` (Person 1) darf alles, inklusive Profildaten ändern, Rechte setzen und
Firmendaten pflegen. `manager`, `worker`, `reader` sind Vorlagen; einzelne Rechte
liegen pro Person in `profiles.permissions` und überschreiben die Rolle.
Das Recht `upload` steuert, wer Dateien nach R2 schicken darf.

## Laufende Kosten

Supabase, Brevo und Cloudflare R2 haben jeweils ein kostenloses Kontingent, das für
ein mittleres Lager reicht. R2 rechnet Speicher ab, aber keinen Datenverkehr nach außen —
Produktbilder bleiben damit günstig.
