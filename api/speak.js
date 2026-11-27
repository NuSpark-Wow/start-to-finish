// Start to Finish to Start: Mr. Paul's voice (ElevenLabs text-to-speech)
// The usual speakers: Man or Woman. Grown-ups get the adult voices, kids get the kid-friendly voices.
// Env: ELEVENLABS_API_KEY (required for the recorded voice; without it the page uses the device's own voice)
// Optional: ELEVENLABS_VOICE_ID / ELEVENLABS_VOICE_ID_WOMAN (adult), ELEVENLABS_KID_VOICE_ID / ELEVENLABS_KID_VOICE_ID_WOMAN (kid),
//           ELEVENLABS_MODEL, SPEAK_DAILY_LIMIT (voice pieces per visitor per day, default 400)
// Only the lesson's own words are sent here. No visitor audio ever reaches this server.

const VOICES = {
  adult: { man: "x8EpqJ1pKzP4vo35tTCm",   // David - Clear, Friendly Explainer
           woman: "W3Rk2MrllOWWYVX9H2B1" }, // Instructional Marina - Warm & clear
  kid:   { man: "nzFihrBIvB34imQBuxub",   // Josh - Teacher for Kids
           woman: "oClOrzqamOXmtcB8iqTj" }  // Emma - Bright Kids Educator
};
function voiceId(level, who) {
  if (level === "kid") return who === "woman" ? (process.env.ELEVENLABS_KID_VOICE_ID_WOMAN || VOICES.kid.woman) : (process.env.ELEVENLABS_KID_VOICE_ID || VOICES.kid.man);
  return who === "woman" ? (process.env.ELEVENLABS_VOICE_ID_WOMAN || VOICES.adult.woman) : (process.env.ELEVENLABS_VOICE_ID || VOICES.adult.man);
}
const MODEL = () => process.env.ELEVENLABS_MODEL || "eleven_flash_v2_5";
const DAILY = parseInt(process.env.SPEAK_DAILY_LIMIT || "400", 10);
const cache = new Map(); // repeat pieces don't cost twice (resets when the server sleeps)
const hits = new Map();
function overLimit(ip) {
  const key = ip + "|" + new Date().toISOString().slice(0, 10);
  const n = (hits.get(key) || 0) + 1;
  hits.set(key, n);
  if (hits.size > 5000) hits.clear();
  return n > DAILY;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!allowedRequest(req)) return blockRequest(res);
  const key = process.env.ELEVENLABS_API_KEY;

  // Health check you can open in a browser: /api/speak  (never shows the key)
  if (req.method === "GET") {
    const out = { api_key_set: !!key, model: MODEL() };
    if (key) {
      for (const level of ["adult", "kid"]) for (const who of ["man", "woman"]) {
        try {
          const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId(level, who)}?output_format=mp3_22050_32`, {
            method: "POST", headers: { "xi-api-key": key, "content-type": "application/json" },
            body: JSON.stringify({ text: "Hi.", model_id: MODEL() })
          });
          out[level + "_" + who] = r.ok ? "working" : `error ${r.status}: ${(await r.text()).slice(0, 160)}`;
        } catch (e) { out[level + "_" + who] = "error: " + e.message; }
      }
    }
    return res.json(out);
  }
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!key) return res.status(501).json({ error: "voice_off" });

  const body = typeof req.body === "string" ? safeJSON(req.body) : (req.body || {});
  const who = body.voice === "woman" ? "woman" : "man";
  const level = body.level === "kid" ? "kid" : "adult";
  const text = String(body.text || "").replace(/\s+/g, " ").trim().slice(0, 1200);
  if (!text) return res.status(400).json({ error: "empty" });

  const ck = level + "|" + who + "|" + text;
  if (cache.has(ck)) return res.json(cache.get(ck));
  const ip = String(req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "").split(",")[0].trim() || "noip";
  if (overLimit(ip)) return res.status(429).json({ error: "voice_limit" });   // the page switches to the device's voice

  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId(level, who)}?output_format=mp3_44100_64`, {
      method: "POST",
      headers: { "xi-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({ text: speakable(text), model_id: MODEL(), voice_settings: { stability: 0.6, similarity_boost: 0.8, style: 0.15 } })
    });
    if (!r.ok) return res.status(502).json({ error: "voice_failed" });
    const out = { audio: Buffer.from(await r.arrayBuffer()).toString("base64") };
    if (cache.size > 300) cache.clear();
    cache.set(ck, out);
    return res.json(out);
  } catch (e) {
    return res.status(502).json({ error: "voice_failed" });
  }
};

function safeJSON(s) { try { return JSON.parse(s); } catch (e) { return {}; } }

// Read measurements and math out loud the right way: "12 x 10" -> "12 by 10", ft -> feet, × -> times
function speakable(t) {
  return t
    .replace(/(\d)\s?[x×]\s?(\d)/g, "$1 by $2")
    .replace(/×/g, " times ")
    .replace(/(\d)\s?sq\.?\s?ft\b/gi, "$1 square feet")
    .replace(/(\d)\s?ft\b/g, "$1 feet")
    .replace(/(\d)\s?in\.(?=\s)/g, "$1 inches")
    .replace(/(\d)\s?lbs?\b/g, "$1 pounds")
    .replace(/(\d)\s?mph\b/gi, "$1 miles per hour")
    .replace(/²/g, " squared").replace(/³/g, " cubed")
    .replace(/~/g, "about ")
    .replace(/&/g, " and ");
}

// ---------- website lock ----------
// Only answer this tool's own pages and Paul's websites, so nobody else can run the voice on his credits.
// Add more sites in Vercel with an ALLOWED_SITES setting (comma separated); set LOCK_OFF to 1 to switch the lock off.
function allowedRequest(req) {
  if (String(process.env.LOCK_OFF || "") === "1") return true;
  const sites = ["nusparkpublishing.com", "nusparkmarketing.com", "nusparklearnwow.com"]
    .concat(String(process.env.ALLOWED_SITES || "").split(",").map(s => s.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "")).filter(Boolean));
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").toLowerCase().split(":")[0];
  const ok = u => {
    try {
      const h = new URL(u).hostname.toLowerCase();
      return h === host || h === "localhost" || h === "127.0.0.1" || sites.some(d => h === d || h.endsWith("." + d));
    } catch (e) { return false; }
  };
  const origin = req.headers.origin, ref = req.headers.referer || req.headers.referrer;
  if (origin && origin !== "null") return ok(origin);
  if (ref) return ok(ref);
  return req.method === "GET";
}
function blockRequest(res) {
  res.statusCode = 403;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ error: "not_allowed", message: "This tool only works on NuSpark websites." }));
}
