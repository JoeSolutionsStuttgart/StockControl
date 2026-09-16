// StockControl — Dateien in Cloudflare R2: hochladen und ansehen.
// Deploy:  supabase functions deploy upload-url
// Secrets: supabase secrets set R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... \
//                               R2_SECRET_ACCESS_KEY=... R2_BUCKET=...
//
// Der Bucket bleibt PRIVAT. Zwei Aktionen, beide nur für angemeldete Konten:
//   action "upload" → vorsignierte PUT-Adresse (10 Minuten)
//   action "view"   → vorsignierte GET-Adresse (1 Stunde)
// Beide Adressen gelten nur für Schlüssel, die mit der company_id des
// aufrufenden Kontos beginnen. Eine andere Firma bekommt keine Adresse,
// und ohne Adresse ist die Datei in R2 nicht erreichbar.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.18";

const ACCOUNT = Deno.env.get("R2_ACCOUNT_ID")!;
const BUCKET = Deno.env.get("R2_BUCKET")!;

const r2 = new AwsClient({
  accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID")!,
  secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY")!,
  service: "s3",
  region: "auto"
});

// Nur die eigene Seite darf diese Funktion aufrufen. Trage deine
// Adresse als Secret SITE_URL ein; ohne Treffer gibt es keine Antwort.
const ALLOWED_ORIGINS = (Deno.env.get("SITE_URL") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
function corsFor(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  const ok = ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.some((a) => origin.startsWith(a.replace(/\/$/, "")));
  return {
    "Access-Control-Allow-Origin": ok ? (origin || "*") : "null",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin"
  };
}
const cors = { "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
let respHeaders: Record<string, string> = cors;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...respHeaders, "content-type": "application/json" } });

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/avif", "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/csv"];
const MAX_BYTES = 15 * 1024 * 1024;

function safeName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(-80) || "datei";
}

function endpointFor(key: string) {
  return `https://${ACCOUNT}.r2.cloudflarestorage.com/${BUCKET}/${key}`;
}

Deno.serve(async (req) => {
  respHeaders = corsFor(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: respHeaders });
  try {
    // Wer bin ich? Ohne gültiges Nutzer-Token gibt es keine Adresse — für nichts.
    const auth = req.headers.get("Authorization") ?? "";
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } }
    });
    const { data: me } = await sb.auth.getUser();
    if (!me.user) return json({ error: "Nicht angemeldet" }, 401);

    const { data: profile } = await sb.from("profiles")
      .select("company_id, role, status, permissions").eq("id", me.user.id).single();
    if (!profile || profile.status !== "active") return json({ error: "Kein aktives Profil" }, 403);

    const body = await req.json();
    const action = body.action ?? "upload";

    /* ── Ansehen: kurzlebige Leseadresse ───────────────────────── */
    if (action === "view") {
      const key: string = body.key ?? "";
      // Der Riegel: nur Schlüssel im eigenen Firmenordner.
      if (!key || !key.startsWith(`${profile.company_id}/`)) {
        return json({ error: "Kein Zugriff auf diese Datei" }, 403);
      }
      // Zweiter Riegel: der Schlüssel muss an einem Produkt der Firma
      // hängen. Ein geratener Dateiname nützt damit nichts, selbst wenn
      // das Präfix stimmte.
      const { data: hit } = await sb.from("products").select("id").eq("bild_url", key).limit(1);
      if (!hit || hit.length === 0) return json({ error: "Kein Zugriff auf diese Datei" }, 403);

      const signed = await r2.sign(new Request(endpointFor(key), { method: "GET" }),
        { aws: { signQuery: true }, headers: { "x-amz-expires": "3600" } });
      return json({ url: signed.url, expiresIn: 3600 });
    }

    /* ── Hochladen: kurzlebige Schreibadresse ──────────────────── */
    const mayUpload = profile.role === "owner" || profile.role === "manager" ||
      profile.permissions?.upload === true;
    if (!mayUpload) return json({ error: "Kein Recht zum Hochladen" }, 403);

    const { filename, contentType, size, kind = "product" } = body;
    if (!ALLOWED.includes(contentType)) return json({ error: `Dateityp nicht erlaubt: ${contentType}` }, 400);
    if (size && size > MAX_BYTES) return json({ error: "Datei größer als 15 MB" }, 400);

    // Pfad: <company_id>/<art>/<zeit>-<name> — die Firmentrennung steckt im Schlüssel.
    const key = `${profile.company_id}/${kind}/${Date.now()}-${safeName(filename ?? "datei")}`;
    const signed = await r2.sign(new Request(endpointFor(key), { method: "PUT", headers: { "content-type": contentType } }),
      { aws: { signQuery: true }, headers: { "x-amz-expires": "600" } });

    return json({ uploadUrl: signed.url, key });
  } catch (e) {
    return json({ error: String(e) }, 400);
  }
});
