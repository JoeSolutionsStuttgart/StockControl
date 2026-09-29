// KI-Prognose: wählbare Modelle und Faktoren.
// Modelle: Kennung aus Cloudflare Workers AI (developers.cloudflare.com/workers-ai/models).
// eu: true hebt ein Modell eines europäischen Anbieters hervor und stellt es nach oben.
// Neue Modelle hier eintragen UND in cloudflare/worker.js unter ALLOWED_MODELS.
(function () {
const AI_MODELS = [
  { id: "@cf/mistralai/mistral-small-3.1-24b-instruct", label: "Mistral Small 3.1 (24B)", origin: "Mistral AI, Frankreich", eu: true, note: "Empfohlen — genau und mehrsprachig" },
  { id: "@cf/mistral/mistral-7b-instruct-v0.1", label: "Mistral 7B", origin: "Mistral AI, Frankreich", eu: true, note: "Schnell und sparsam, weniger genau" },
  { id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", label: "Llama 3.3 (70B)", origin: "Meta, USA", eu: false, note: "Groß, verbraucht mehr vom Kontingent" },
  { id: "@cf/meta/llama-3.1-8b-instruct", label: "Llama 3.1 (8B)", origin: "Meta, USA", eu: false, note: "Schnell und sparsam" },
  { id: "@cf/google/gemma-3-12b-it", label: "Gemma 3 (12B)", origin: "Google, USA", eu: false, note: "Mittelgroß" },
  { id: "@cf/qwen/qwq-32b", label: "QwQ (32B)", origin: "Alibaba, China", eu: false, note: "Rechnet ausführlich, langsamer" }
];

// Faktoren, die man der Prognose selbst hinzufügen kann. multi: mehrfach möglich.
const FC_KINDS = [
  { kind: "wetter",   de: "Wetter",            en: "Weather",          sv: "Väder",             ph: "z. B. sonnig, 28 °C" },
  { kind: "standort", de: "Standort",          en: "Location",         sv: "Plats",             ph: "z. B. Innenstadt, Filiale Nord" },
  { kind: "events",   de: "Geplante Events",   en: "Planned events",   sv: "Planerade evenemang" },
  { kind: "ferien",   de: "Ferien / Feiertage", en: "Holidays",        sv: "Lov / helgdagar",   ph: "z. B. Sommerferien, Pfingsten" },
  { kind: "aktion",   de: "Aktion / Preis",    en: "Promotion / price", sv: "Kampanj / pris",   ph: "z. B. −20 % auf Getränke" },
  { kind: "frei",     de: "Eigener Faktor",    en: "Custom factor",    sv: "Egen faktor",       ph: "Beschreibung", multi: true }
];

(window.SC = window.SC || {}).ki = { AI_MODELS, FC_KINDS };
})();
