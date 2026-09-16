// StockControl — Mailversand über Brevo.
// Deploy:  supabase functions deploy send-mail
// Secrets: supabase secrets set BREVO_API_KEY=... MAIL_FROM=... MAIL_FROM_NAME=... SERVICE_NAME=...
//
// action "send"  → eine Mail sofort (aus der Oberfläche, mit Nutzer-JWT)
// action "flush" → Sammelmails abarbeiten (per Cron, mit Service-Role-Key)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BREVO_KEY = Deno.env.get("BREVO_API_KEY")!;
const FROM = { email: Deno.env.get("MAIL_FROM")!, name: Deno.env.get("MAIL_FROM_NAME") ?? "StockControl" };
const SERVICE = Deno.env.get("SERVICE_NAME") ?? "StockControl";
const SITE = Deno.env.get("SITE_URL") ?? "";

// Nur die eigene Seite darf diese Funktion aufrufen (Secret SITE_URL).
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

function layout(title: string, body: string) {
  return `<div style="font-family:Barlow,Arial,sans-serif;color:#1d1f20;max-width:520px">
    <div style="font:600 20px 'Barlow Condensed',Arial;color:#5980a6">${SERVICE}</div>
    <h2 style="font:600 22px 'Barlow Condensed',Arial;margin:12px 0 8px">${title}</h2>
    ${body}
    <p style="font-size:12px;color:#7a7a7d;margin-top:24px">${SERVICE} · Lagerverwaltung</p>
  </div>`;
}

const templates: Record<string, (d: any) => { subject: string; html: string }> = {
  invitation: (d) => ({
    subject: `Einladung zu ${SERVICE}`,
    html: layout("Du wurdest eingeladen", `
      <p>Du kannst dich ab sofort am Lager von <b>${d.company ?? "deinem Unternehmen"}</b> anmelden.
      Die Einladung gilt <b>3 Stunden</b>.</p>
      <p><a href="${SITE}?invite=${d.token}" style="background:#5980a6;color:#fff;padding:10px 18px;
        border-radius:12px;text-decoration:none;display:inline-block">Zugang einrichten</a></p>
      <p style="font-size:12px;color:#7a7a7d">Rolle: ${d.role ?? "Arbeiter"}</p>`)
  }),
  low_stock: (d) => ({
    subject: `Mindestbestand unterschritten: ${d.name}`,
    html: layout("Bestand nachbestellen", `
      <p><b>${d.name}</b> liegt bei <b>${d.ist}</b>, Mindestbestand ist <b>${d.min}</b>.</p>
      <table style="border-collapse:collapse;font-size:14px">
        <tr><td style="padding:4px 12px 4px 0;color:#5d5d60">Bestellmenge</td><td>${d.bestellmenge ?? "—"}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#5d5d60">Lieferant</td><td>${d.lieferant ?? "—"}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#5d5d60">Lagerort</td><td>${d.ort ?? "—"}</td></tr>
      </table>
      <p><a href="${SITE}" style="color:#416180">Im Lager öffnen</a></p>`)
  }),
  order_list: (d) => ({
    subject: `Bestellliste ${SERVICE}`,
    html: layout("Diese Artikel fehlen", `
      <table style="border-collapse:collapse;font-size:14px;width:100%">
        <tr style="text-align:left;color:#5d5d60"><th>Artikel</th><th>Ist</th><th>Min</th><th>Bestellen</th><th>Lieferant</th></tr>
        ${(d.rows ?? []).map((r: any) => `<tr>
          <td style="border-top:1px solid #e7e7ea;padding:6px 0">${r.name}</td>
          <td style="border-top:1px solid #e7e7ea">${r.ist}</td>
          <td style="border-top:1px solid #e7e7ea">${r.min}</td>
          <td style="border-top:1px solid #e7e7ea">${r.bestellmenge}</td>
          <td style="border-top:1px solid #e7e7ea">${r.lieferant ?? "—"}</td></tr>`).join("")}
      </table>`)
  }),
  test: () => ({ subject: `Testmail ${SERVICE}`, html: layout("Verbindung steht", "<p>Brevo ist korrekt angebunden.</p>") })
};

async function brevo(to: string[], cc: string[], subject: string, html: string) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": BREVO_KEY, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: FROM,
      to: to.map((email) => ({ email })),
      cc: cc.length ? cc.map((email) => ({ email })) : undefined,
      subject, htmlContent: html
    })
  });
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${await res.text()}`);
  return res.json();
}

Deno.serve(async (req) => {
  const cors = corsFor(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { action = "send", template, to, cc = [], data = {} } = await req.json();

    if (action === "send") {
      const build = templates[template] ?? templates.test;
      const { subject, html } = build(data);
      const out = await brevo([].concat(to), [].concat(cc), subject, html);
      return new Response(JSON.stringify(out), { headers: { ...cors, "content-type": "application/json" } });
    }

    // ── Sammelmails: offene Benachrichtigungen je Firma verschicken ──
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: pending } = await admin.from("notifications")
      .select("id, company_id, products(name, ist, min, bestellmenge, lieferant, ort, verantwortlich, vertreter)")
      .eq("status", "pending");

    const byCompany = new Map<string, any[]>();
    for (const n of pending ?? []) {
      if (!byCompany.has(n.company_id)) byCompany.set(n.company_id, []);
      byCompany.get(n.company_id)!.push(n);
    }

    for (const [companyId, rows] of byCompany) {
      const { data: cfg } = await admin.from("settings").select("*").eq("company_id", companyId).maybeSingle();
      const { data: people } = await admin.from("profiles").select("id, email").eq("company_id", companyId);
      const mailOf = (id: string) => people?.find((p) => p.id === id)?.email;

      if ((cfg?.mail_mode ?? "now") === "now") {
        for (const n of rows) {
          const p = n.products;
          const to = [mailOf(p.verantwortlich)].filter(Boolean) as string[];
          const cc = cfg?.cc_deputies ? (p.vertreter ?? []).map(mailOf).filter(Boolean) as string[] : [];
          if (to.length) {
            const { subject, html } = templates.low_stock(p);
            await brevo(to, cc, subject, html);
          }
        }
      } else {
        const products = rows.map((r: any) => r.products);
        const to = [...new Set(products.map((p: any) => mailOf(p.verantwortlich)).filter(Boolean))] as string[];
        const cc = cfg?.cc_deputies
          ? [...new Set(products.flatMap((p: any) => (p.vertreter ?? []).map(mailOf)).filter(Boolean))] as string[]
          : [];
        if (to.length) {
          const { subject, html } = templates.order_list({ rows: products });
          await brevo(to, cc, subject, html);
        }
      }
      await admin.from("notifications").update({ status: "sent", sent_at: new Date().toISOString() })
        .in("id", rows.map((r: any) => r.id));
    }
    return new Response(JSON.stringify({ processed: pending?.length ?? 0 }),
      { headers: { ...cors, "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 400, headers: { ...cors, "content-type": "application/json" } });
  }
});
