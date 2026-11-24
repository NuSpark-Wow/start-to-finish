// Start to Finish to Start — photo finder for each step (Vercel)
// 1) Google Images through Serper (needs SERPER_API_KEY in Vercel). Each web photo first gets a quick AI look:
//    family-safe, really shows the step, not a watermarked stock image or a page of text.
// 2) If Serper isn't set up or finds nothing good: Wikimedia Commons (public domain or free with credit).
// Every photo is credited with its website or author and links back to where it came from.
// The search words come from the lesson itself (written by the tool), never typed straight in by a visitor.

const UA = "StartToFinish/1.0 (educational site; nusparklearnwow.com)";
const BAD = /\b(nude|naked|nsfw|sex|erotic|corpse|dead body|gore|blood|weapon|gun|execution|war crime|torture|skull|drug|accident|crash)\b/i;
const SKIP_SITES = /(fbsbx|facebook|instagram|tiktok|twitter|x\.com|threads\.net|pinterest|pinimg|shutterstock|alamy|gettyimages|istockphoto|dreamstime|depositphotos|123rf|stock\.adobe|agefotostock|bigstock|vectorstock|freepik|ebay|amazon|etsy|walmart|redbubble|teepublic|aliexpress|alibaba|temu)/i;
const strip = s => String(s || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, 90);

async function serper(q) {
  const key = String(process.env.SERPER_API_KEY || "").trim();
  return fetch("https://google.serper.dev/images", { method: "POST", signal: AbortSignal.timeout(8000),
    headers: { "X-API-KEY": key, "content-type": "application/json" },
    body: JSON.stringify({ q, num: 20, gl: "us", hl: "en", safe: "active" }) });
}

// A quick AI look at one web photo before it is shown (the small preview copy is sent to the AI).
async function looksRight(q, it) {
  const key = process.env.ANTHROPIC_API_KEY; if (!key) return true;
  try {
    const pic = await fetch(it.thumbnailUrl || it.imageUrl, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(6000) });
    if (!pic.ok) return false;
    let type = (pic.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
    if (!/^image\/(jpeg|png|gif|webp)$/.test(type)) type = "image/jpeg";
    const raw = Buffer.from(await pic.arrayBuffer());
    if (raw.length > 4500000) return false;
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", signal: AbortSignal.timeout(12000),
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: process.env.FAST_MODEL || "claude-haiku-5-5", max_tokens: 20, thinking: { type: "disabled" }, messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: type, data: raw.toString("base64") } },
        { type: "text", text: `This picture would appear on a family learning website; readers include children. It is meant to show: "${q}". Answer YES only if it is a clear photograph (or a clean technical illustration) that really shows that subject or that step of making it, is family-safe, and is not mostly text, a meme, a collage of many small pictures, an ad, or covered with a watermark. Otherwise answer NO. One word.` }
      ] }] }) });
    if (!r.ok) return false;
    const d = await r.json();
    return /^\W*yes/i.test((d.content || []).map(c => c.text || "").join("").trim());
  } catch (e) { return false; }
}

async function fromWeb(q) {
  if (!String(process.env.SERPER_API_KEY || "").trim()) return null;
  const r = await serper(q);
  if (!r.ok) return null;
  const all = (await r.json()).images || [];
  const list = all.filter(it => it.imageUrl && /^https:\/\//i.test(it.imageUrl)
    && !/\.(svg|gif)(\?|$)/i.test(it.imageUrl) && !SKIP_SITES.test((it.domain || "") + " " + (it.link || "") + " " + it.imageUrl)
    && (it.imageWidth || 0) >= 450 && !BAD.test(it.title || "")).slice(0, 4);
  if (!list.length) return null;
  const ok = await Promise.all(list.map(it => looksRight(q, it)));
  const it = list[ok.indexOf(true)]; if (!it) return null;
  const site = strip(it.source || it.domain || "").replace(/^www\./, "");
  return { src: it.imageUrl, title: strip(it.title), credit: site || "the web", license: "", source: "From the web", link: it.link || "" };
}

async function fromCommons(q) {
  const url = "https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=6&gsrlimit=15"
    + "&gsrsearch=" + encodeURIComponent(q + " filetype:bitmap") + "&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=900";
  const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) return null;
  const pages = Object.values((await r.json()).query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
  for (const p of pages) {
    const info = p.imageinfo?.[0]; const m = info?.extmetadata || {};
    const lic = String(m.LicenseShortName?.value || "");
    if (!info || !/public domain|^pd|cc0|cc by(-sa)? ?\d/i.test(lic)) continue;
    if ((info.width || 0) < 450) continue;
    const title = p.title.replace(/^File:/, "").replace(/\.[a-z]+$/i, "").replace(/_/g, " ");
    if (BAD.test(title) || BAD.test(m.ImageDescription?.value || "")) continue;
    return { src: info.thumburl || info.url, title: strip(title), credit: strip(m.Artist?.value) || "Unknown", license: lic, source: "Wikimedia Commons", link: info.descriptionurl };
  }
  return null;
}

module.exports = async (req, res) => {
  if (!allowedRequest(req)) return blockRequest(res);
  if (!(await require("./_lwgate")(req, res, "start-to-finish"))) return;
  const q = String(req.query.q || "").replace(/[^\w\s'-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!q || BAD.test(q)) return res.json({ image: null });
  for (const fn of [fromWeb, fromCommons]) {
    try { const img = await fn(q); if (img && img.src) { res.setHeader("Cache-Control", "public, s-maxage=604800"); return res.json({ image: img }); } } catch (e) {}
  }
  res.setHeader("Cache-Control", "public, s-maxage=86400");
  return res.json({ image: null });
};

// ---------- website lock ----------
// Only answer this tool's own pages and Paul's websites, so nobody else can run searches on his account.
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
  return false;
}
function blockRequest(res) {
  res.statusCode = 403;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ error: "not_allowed", message: "This tool only works on NuSpark websites." }));
}
