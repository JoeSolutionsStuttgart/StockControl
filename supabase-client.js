// StockControl — Datenzugriff auf Supabase.
// Die Oberfläche ruft ausschließlich diese Funktionen auf; ist nichts
// konfiguriert, meldet configured=false und die Seite bleibt im Demo-Modus.

import { SUPABASE_URL, SUPABASE_ANON_KEY, MAIL_FUNCTION, UPLOAD_FUNCTION } from "./config.js";

export const configured = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

let _client = null;
async function client() {
  if (!configured) throw new Error("Supabase ist nicht konfiguriert (config.js)");
  if (!_client) {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
  }
  return _client;
}

function ok(res) {
  if (res.error) throw res.error;
  return res.data;
}

/* ── Konten ─────────────────────────────────────────────── */

export async function signUpCompany({ email, password, companyName }) {
  const sb = await client();
  // company_name landet in den Metadaten; der Trigger legt Firma + Profil an.
  return ok(await sb.auth.signUp({
    email, password,
    options: { data: { company_name: companyName }, emailRedirectTo: location.origin + location.pathname }
  }));
}

export async function signIn({ email, password }) {
  const sb = await client();
  return ok(await sb.auth.signInWithPassword({ email, password }));
}

export async function signOut() {
  const sb = await client();
  return ok(await sb.auth.signOut());
}

export async function requestPasswordReset(email) {
  const sb = await client();
  return ok(await sb.auth.resetPasswordForEmail(email, {
    redirectTo: location.origin + location.pathname + "#reset"
  }));
}

export async function updatePassword(password) {
  const sb = await client();
  return ok(await sb.auth.updateUser({ password }));
}

export async function session() {
  const sb = await client();
  const { data } = await sb.auth.getSession();
  return data.session || null;
}

export async function myProfile() {
  const sb = await client();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return null;
  return ok(await sb.from("profiles")
    .select("id, name, email, role, status, company_id, companies(name), permissions")
    .eq("id", auth.user.id).single());
}

/* ── Stammdaten laden ───────────────────────────────────── */

export async function loadAll() {
  const sb = await client();
  const [products, members, events, movements, settings] = await Promise.all([
    sb.from("products").select("*").order("aktiv", { ascending: false }).order("name"),
    sb.from("profiles").select("id, name, email, role, status"),
    sb.from("events").select("*, event_items(product_id, qty)").order("datum"),
    sb.from("movements").select("*").order("created_at", { ascending: false }).limit(50),
    sb.from("settings").select("*").maybeSingle()
  ]);
  return {
    products: ok(products), members: ok(members), events: ok(events),
    movements: ok(movements), settings: settings.data || null
  };
}

/* ── Produkte ───────────────────────────────────────────── */

export async function createProduct(row) {
  const sb = await client();
  return ok(await sb.from("products").insert(row).select().single());
}

export async function updateProduct(id, patch) {
  const sb = await client();
  return ok(await sb.from("products").update(patch).eq("id", id).select().single());
}

export async function importProducts(rows) {
  const sb = await client();
  return ok(await sb.from("products").upsert(rows, { onConflict: "company_id,ean" }).select());
}

/* ── Entnahme und Nachfüllung ───────────────────────────── */
// Eine Buchung schreibt nur die Bewegung; der Datenbank-Trigger rechnet
// den Bestand fort, setzt den Status und legt bei Unterschreitung die
// Benachrichtigung an. So kann keine Buchung am Protokoll vorbeigehen.

export async function bookMovement({ productId, delta, note }) {
  const sb = await client();
  return ok(await sb.from("movements").insert({ product_id: productId, delta, note }).select().single());
}

export async function movementsFor(productId) {
  const sb = await client();
  return ok(await sb.from("movements").select("*").eq("product_id", productId)
    .order("created_at", { ascending: false }));
}

/* ── Team ───────────────────────────────────────────────── */

export async function inviteMember({ email, role }) {
  const sb = await client();
  const row = ok(await sb.from("invitations").insert({ email, role }).select().single());
  await sendMail({ template: "invitation", to: email, data: { token: row.token, role } });
  return row;
}

export async function updateMember(id, patch) {
  const sb = await client();
  return ok(await sb.from("profiles").update(patch).eq("id", id).select().single());
}

export async function removeMember(id) {
  const sb = await client();
  return ok(await sb.from("profiles").update({ status: "removed" }).eq("id", id));
}

export async function savePermissions(profileId, permissions) {
  const sb = await client();
  return ok(await sb.from("profiles").update({ permissions }).eq("id", profileId).select().single());
}

/* ── Betreiberzugang (nur Internet GmbH) ────────────────── */
// Sichtbar sind Firmen und Personen, keine Produktdaten — die Regeln
// auf products bleiben auf die eigene Firma beschränkt.

export async function amPlatformAdmin() {
  const sb = await client();
  const res = await sb.from("platform_admins").select("profile_id").limit(1);
  return !res.error && (res.data || []).length > 0;
}

export async function loadCompanies() {
  const sb = await client();
  return ok(await sb.from("company_overview").select("*").order("created_at"));
}

export async function setCompanyStatus(id, status) {
  const sb = await client();
  return ok(await sb.from("companies").update({ status }).eq("id", id).select().single());
}

export async function deleteCompany(id) {
  const sb = await client();
  const { error } = await sb.rpc("admin_delete_company", { cid: id });
  if (error) throw error;
}

/* ── Events ─────────────────────────────────────────────── */

export async function createEvent({ name, datum, ort, items }) {
  const sb = await client();
  const ev = ok(await sb.from("events").insert({ name, datum, ort }).select().single());
  if (items && items.length) {
    ok(await sb.from("event_items").insert(items.map(i => ({ event_id: ev.id, product_id: i.id, qty: i.qty }))));
  }
  return ev;
}

/* ── Einstellungen ──────────────────────────────────────── */

export async function saveSettings(patch) {
  const sb = await client();
  return ok(await sb.from("settings").upsert(patch).select().single());
}

/* ── Große Dateien: Cloudflare R2 (privater Bucket) ─────── */
// Der Bucket ist NICHT öffentlich. Hochladen und Ansehen laufen beide über
// die Edge Function: sie prüft Anmeldung und Firmenzugehörigkeit und stellt
// eine kurzlebige signierte Adresse aus — PUT für 10 Minuten, GET für eine
// Stunde. In products.bild_url steht nur der Schlüssel, keine offene URL.
// Ohne Anmeldung ist eine Datei in R2 nicht erreichbar.

export async function uploadFile(file, kind = "product") {
  const sb = await client();
  const { data: slot, error } = await sb.functions.invoke(UPLOAD_FUNCTION, {
    body: { action: "upload", filename: file.name, contentType: file.type, size: file.size, kind }
  });
  if (error) throw error;
  if (slot.error) throw new Error(slot.error);

  const put = await fetch(slot.uploadUrl, {
    method: "PUT", headers: { "content-type": file.type }, body: file
  });
  if (!put.ok) throw new Error(`Upload fehlgeschlagen (${put.status})`);

  return { key: slot.key };
}

// Kurzlebige Leseadresse für eine Datei. Nur für Dateien der eigenen Firma —
// das prüft die Function am Schlüssel-Präfix.
export async function viewUrl(key) {
  if (!key) return null;
  if (/^https?:\/\//.test(key)) return key;   // Altbestand: bereits volle URL
  const sb = await client();
  const { data, error } = await sb.functions.invoke(UPLOAD_FUNCTION, { body: { action: "view", key } });
  if (error) throw error;
  if (data.error) throw new Error(data.error);
  return data.url;
}

export async function setProductImage(productId, file) {
  const { key } = await uploadFile(file, "product");
  await updateProduct(productId, { bild_url: key });
  return key;
}

/* ── Mailversand über Brevo (Edge Function) ─────────────── */
// Der Brevo-API-Key liegt als Secret in Supabase, nie im Browser.

export async function sendMail({ template, to, cc, data }) {
  const sb = await client();
  const { data: res, error } = await sb.functions.invoke(MAIL_FUNCTION, {
    body: { action: "send", template, to, cc, data }
  });
  if (error) throw error;
  return res;
}
