// Demodaten — nur ohne verbundenes Supabase-Projekt sichtbar.
(function () {
const SEED = [
  { id:"SC-1001", name:"Mineralwasser still, Kasten 12 × 0,75 l", ean:"4001234567890", ist:6, min:10, bestellmenge:20,
    ort:"Keller · Regal B2", mhd:"30.04.2027", preis:"8,49 €", quantitaet:"Kasten (12 Flaschen)", lieferant:"Getränke Nord GmbH",
    status:"low", verantwortlich:"Marie Kohl", vertretung:"Timo Brand, Anke Reuß", kategorien:["Getränke","Küche"],
    entnahme:"14.09.2026 08:12", auffuell:"29.08.2026 10:40", geaendert:"Timo Brand", hist:[22,20,17,14,12,9,6] },
  { id:"SC-1002", name:"Kaffeebohnen Hausmischung 1 kg", ean:"4007654321098", ist:3, min:6, bestellmenge:12,
    ort:"Küche · Oberschrank", mhd:"12.02.2027", preis:"18,90 €", quantitaet:"Beutel 1 kg", lieferant:"Röster Ost KG",
    status:"ordered", verantwortlich:"Anke Reuß", vertretung:"Marie Kohl", kategorien:["Getränke","Küche"],
    entnahme:"15.09.2026 07:55", auffuell:"01.09.2026 09:10", geaendert:"Anke Reuß", hist:[12,11,9,8,6,5,3] },
  { id:"SC-1003", name:"Druckerpapier A4, 500 Blatt", ean:"4009876501234", ist:24, min:10, bestellmenge:30,
    ort:"Lager Nord · Palette 7", mhd:"—", preis:"4,20 €", quantitaet:"Paket (500 Blatt)", lieferant:"Bürohaus Weiß",
    status:"ok", verantwortlich:"Jonas Pelz", vertretung:"Lena Sikora", kategorien:["Büro"],
    entnahme:"12.09.2026 16:02", auffuell:"05.09.2026 11:20", geaendert:"Jonas Pelz", hist:[30,29,28,27,26,25,24] },
  { id:"SC-1004", name:"Toner schwarz, HL-L8360", ean:"4005550011223", ist:1, min:3, bestellmenge:4,
    ort:"Serverraum · Schrank 3", mhd:"—", preis:"94,00 €", quantitaet:"Einzelkartusche", lieferant:"Bürohaus Weiß",
    status:"low", verantwortlich:"Jonas Pelz", vertretung:"Timo Brand", kategorien:["Büro","IT"],
    entnahme:"11.09.2026 13:31", auffuell:"20.08.2026 08:05", geaendert:"Jonas Pelz", hist:[4,4,3,3,2,2,1] },
  { id:"SC-1005", name:"Netzwerkkabel Cat 6, 3 m", ean:"4001122334455", ist:38, min:15, bestellmenge:25,
    ort:"Serverraum · Schrank 3", mhd:"—", preis:"3,80 €", quantitaet:"Einzelkabel", lieferant:"Kabelwerk Süd",
    status:"ok", verantwortlich:"Timo Brand", vertretung:"Jonas Pelz", kategorien:["IT"],
    entnahme:"09.09.2026 10:44", auffuell:"02.09.2026 15:00", geaendert:"Timo Brand", hist:[48,46,44,42,41,40,38], aktiv:false },
  { id:"SC-1006", name:"Handseife Nachfüllbeutel 1 l", ean:"4003344556677", ist:4, min:5, bestellmenge:10,
    ort:"Keller · Regal A1", mhd:"18.11.2027", preis:"5,60 €", quantitaet:"Beutel 1 l", lieferant:"Hygiene Plus",
    status:"low", verantwortlich:"Lena Sikora", vertretung:"Anke Reuß, Marie Kohl", kategorien:["Hygiene"],
    entnahme:"15.09.2026 06:30", auffuell:"28.08.2026 07:45", geaendert:"Lena Sikora", hist:[10,9,8,7,6,5,4] },
  { id:"SC-1007", name:"Müllbeutel 120 l, Rolle", ean:"4004455667788", ist:12, min:8, bestellmenge:20,
    ort:"Keller · Regal A1", mhd:"—", preis:"7,10 €", quantitaet:"Rolle (25 Stück)", lieferant:"Hygiene Plus",
    status:"ok", verantwortlich:"Lena Sikora", vertretung:"Jonas Pelz", kategorien:["Hygiene"],
    entnahme:"08.09.2026 17:20", auffuell:"03.09.2026 08:30", geaendert:"Lena Sikora", hist:[20,18,17,16,14,13,12] },
  { id:"SC-1008", name:"HDMI-Kabel 2.1, 2 m", ean:"4005566778899", ist:9, min:6, bestellmenge:12,
    ort:"Werkstatt · Schublade 12", mhd:"—", preis:"11,40 €", quantitaet:"Einzelkabel", lieferant:"Kabelwerk Süd",
    status:"ok", verantwortlich:"Timo Brand", vertretung:"Marie Kohl", kategorien:["IT"],
    entnahme:"10.09.2026 09:05", auffuell:"01.09.2026 14:10", geaendert:"Timo Brand", hist:[14,13,12,11,10,10,9] },
  { id:"SC-1009", name:"Erste-Hilfe-Set DIN 13157", ean:"4006677889900", ist:2, min:2, bestellmenge:2,
    ort:"Werkstatt · Wandhalter", mhd:"31.07.2028", preis:"27,50 €", quantitaet:"Koffer", lieferant:"Sicher & Fit GmbH",
    status:"ok", verantwortlich:"Marie Kohl", vertretung:"Lena Sikora", kategorien:["Sicherheit"],
    entnahme:"—", auffuell:"14.07.2026 12:00", geaendert:"Marie Kohl", hist:[2,2,2,2,2,2,2], aktiv:false },
  { id:"SC-1010", name:"Schrauben 4 × 40, Box 200 Stück", ean:"4007788990011", ist:5, min:4, bestellmenge:8,
    ort:"Werkstatt · Schublade 12", mhd:"—", preis:"6,95 €", quantitaet:"Box (200 Stück)", lieferant:"Eisen Meier",
    status:"ok", verantwortlich:"Jonas Pelz", vertretung:"Timo Brand", kategorien:["Werkstatt"],
    entnahme:"05.09.2026 11:11", auffuell:"22.08.2026 16:25", geaendert:"Jonas Pelz", hist:[9,8,8,7,6,6,5] }
];

const DEPTS_DEMO = [{ id: "d1", name: "Werkstatt" }, { id: "d2", name: "Büro" }];

const MEMBERS = [
  { id:"u1", name:"Marie Kohl", email:"m.kohl@internet-gmbh.de", role:"owner", status:"active" },
  { id:"u2", name:"Timo Brand", email:"t.brand@internet-gmbh.de", role:"manager", status:"active" },
  { id:"u3", name:"Anke Reuß", email:"a.reuss@internet-gmbh.de", role:"worker", status:"active" },
  { id:"u4", name:"Jonas Pelz", email:"j.pelz@internet-gmbh.de", role:"worker", status:"active" },
  { id:"u5", name:"Lena Sikora", email:"l.sikora@internet-gmbh.de", role:"reader", status:"pending" },
  { id:"u6", name:"Ravi Chandra", email:"r.chandra@internet-gmbh.de", role:"worker", status:"expired" }
];

const COMPANIES = [
  { id:"c1", name:"Internet GmbH", admin:"m.kohl@internet-gmbh.de", plan:"Gratis", users:6, items:10, created:"02.03.2026", status:"active" },
  { id:"c2", name:"Hafenlogistik Bremen", admin:"leitung@hafenlogistik.de", plan:"Gratis", users:14, items:412, created:"19.04.2026", status:"active" },
  { id:"c3", name:"Klinik Nordlicht", admin:"einkauf@klinik-nordlicht.de", plan:"Gratis", users:31, items:1870, created:"07.05.2026", status:"active" },
  { id:"c4", name:"Bäckerei Wendt", admin:"kontakt@baeckerei-wendt.de", plan:"Gratis", users:4, items:96, created:"21.06.2026", status:"blocked" },
  { id:"c5", name:"Maler Lindqvist AB", admin:"info@lindqvist.se", plan:"Gratis", users:8, items:203, created:"30.07.2026", status:"active" },
  { id:"c6", name:"Schreinerei Voß", admin:"buero@schreinerei-voss.de", plan:"Gratis", users:3, items:58, created:"11.08.2026", status:"active" }
];

(window.SC = window.SC || {}).demo = { SEED, DEPTS_DEMO, MEMBERS, COMPANIES };
})();
