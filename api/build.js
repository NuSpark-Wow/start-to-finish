// Start to Finish to Start — server function (Vercel) — Learn...Wow! / NuSparkLearnWow
// Pick anything (a traffic light, a dishwasher, a microchip, a skyscraper) and watch it get built,
// step by step, from the blueprint to the finished thing. Then run it backward: start with the
// finished thing and trace every part back to where it comes from (the supply chain).
//
// One endpoint, several modes:
//   outline — fast: checks the topic, asks a clarifying question if the thing is ambiguous, and maps the 8 steps
//   detail  — the full lesson, in two halves that run at the same time (part "a" and part "b")
//   art     — the build-up blueprint drawing: one layer per step, so the picture grows as you click Next
//   ask     — follow-up questions to Mr. Paul (he may ask a clarifying question back)
//
// Vercel settings: ANTHROPIC_API_KEY (required). Optional: ANTHROPIC_MODEL, FAST_MODEL, ALLOWED_ORIGINS, DAILY_LIVE_LIMIT.

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
const FAST_MODEL = process.env.FAST_MODEL || "claude-haiku-5-5";
const DAILY_LIMIT = parseInt(process.env.DAILY_LIVE_LIMIT || "40", 10);
const ALLOWED = (process.env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
const STEPS = 8;

// --- simple per-IP daily limit (the Anthropic spend cap is the real backstop)
const hits = new Map();
function overLimit(ip, limit) {
  const key = ip + "|" + new Date().toISOString().slice(0, 10);
  const n = (hits.get(key) || 0) + 1;
  hits.set(key, n);
  if (hits.size > 5000) hits.clear();
  return n > limit;
}

const SYSTEM = `You are the lead engineer and teacher behind "Start to Finish to Start", a Learn...Wow! learning tool on NuSparkLearnWow.com (from NuSpark Publishing). The host is Mr. Paul, a warm, curious teacher who loves showing people the hidden world behind the things they take for granted. Wow...Who Knew?

WHAT THE TOOL DOES: a visitor picks any thing, product or system (a traffic light, a dishwasher, an Amazon Fire Stick, an electrical outlet, a microchip, a shopping cart, a skyscraper, GPS) and learns it in two directions:
- START TO FINISH (forward): it begins with the PLANNING (who designs it, the requirements, the real math: length times width, loads, how many tiles or bolts, power budgets), then the build, step by step, in the true order a factory or crew does it, until it is finished. Every step says what gets ADDED, which specialty supplier or factory makes those parts, what they are made of and where those materials come from. Nothing builds itself: show how many different companies and factories one everyday object depends on.
- FINISH TO START (backward): it begins with the finished thing in use, right in front of you, and traces back one hop at a time to where everything comes from: for an outlet, the outlet, then the wire in the wall, the breaker panel, the meter, the line to the street, the transformer, the substation, the transmission lines, the power plant, the fuel. For a product, the store shelf, the distribution center, the port, the assembly plant, the part suppliers, the material processors, the mines, farms or wells. This is the supply chain and logistics lesson.

FOCUS: how things are engineered, manufactured, supplied and delivered TODAY: home life (utilities, appliances, gadgets, the house itself, the things out in the world like traffic lights and cell towers) and industry and manufacturing (parts and components, materials, machines, vehicles, big systems like warehouses, data centers and power plants). No history lessons and no inventor stories; one short line of context at most.

THE DELIVERY TRIP: the trip from factory to store is usually the same truck, ship and warehouse story, so keep it short in the forward direction, and only go deep when the journey is genuinely special (fresh flowers flown overnight, a jet engine with its own escort, a satellite launched on a rocket). In the backward direction the supply chain IS the lesson, so give each hop real detail.

ACCURACY: well-established facts only. Real processes, real part names, real materials, real typical numbers (with units). When something varies by maker, model or region, say so ("typically", "often", "in most US homes"). Give places as general regions or well-known producing countries (for example "copper: mostly mined in Chile and Peru"), never a specific private company. Never promote, rank or compare brands or companies. If the visitor names a brand-name product (for example a streaming stick by its brand name), you may use the name they used, but teach how that kind of product is made and works, not company secrets or claims. Times and distances are typical estimates; say "about". Never make anything up.

SAFETY: explain how things are made and how they work at a general, educational level. Never give step-by-step instructions for building weapons, explosives, drugs, or anything dangerous, and never explain how to defeat safety or security systems. Electrical, gas and plumbing topics are about how the system works, not do-it-yourself repair; add a short "leave this to a licensed pro" line where it fits.

TOPIC RULES: anything physical or technical that gets planned, built, made, grown, processed, supplied or delivered is on topic. If the request is chit-chat, a person, an opinion, or not a thing that gets built or supplied, it is off topic: kindly suggest The Answer Man on NuSparkLearnWow.com. Weapons, drugs, anything illegal or sexual: off topic, politely. Examples should feel national and everyday (US measurements first, metric where it helps).

WRITING STYLE: like a great museum guide or a friendly plant manager giving a tour. Short sentences, plain words, real detail. Explain any technical word the first time you use it. Make the reader go "oh wow, I never thought about that." No markdown, no asterisks, no bullet characters inside text. Never call the tool or its content "free".

OUTPUT: reply with ONLY a JSON object wrapped in <json> and </json> tags, in the exact shape the user message asks for. Use plain double-quoted JSON strings (no line breaks inside strings).`;

const LEVELS = {
  adult: `LEVEL: GROWN-UP. Detailed and specific, for a curious adult: real part names, real materials, real numbers and units, how the parts and suppliers connect. Still friendly and clear, never academic.`,
  kid: `LEVEL: KID (about ages 8 to 12). Simple words, short sentences, fun comparisons ("as long as a school bus", "thinner than a hair"). Still true and still step by step, just simpler. Explain any real part name in kid words. No scary details.`
};
const DIRS = {
  forward: `DIRECTION: START TO FINISH (forward). Step 1 is the first real build step right after the planning (raw materials or the base), step ${STEPS} finishes it and gets it ready to work or ship. Each step ADDS something, in the true order it is really done.`,
  backward: `DIRECTION: FINISH TO START (backward). Step 1 is the finished thing in use, right in front of you. Each next step goes one hop further back toward where it all comes from (for a utility: back along the lines and pipes to the source; for a product: back through the store, warehouse, port, assembly plant, part suppliers, material processors, to the mines, farms, forests or wells). Step ${STEPS} is the raw origin: where it all starts.`
};

function base(b) {
  const thing = clip(b.thing, 120);
  const level = b.level === "kid" ? "kid" : "adult";
  const dir = b.dir === "backward" ? "backward" : "forward";
  const cat = clip(b.category, 60);
  const note = clip(b.clarified, 200);
  return { thing, level, dir, text:
    `The thing: "${thing}"` + (cat ? `\nCategory they picked it from: ${cat}` : "") + (note ? `\nThey clarified: ${note}` : "") +
    `\n${DIRS[dir]}\n${LEVELS[level]}` };
}

function outlineList(b) {
  const steps = Array.isArray(b.outline && b.outline.steps) ? b.outline.steps.slice(0, STEPS) : [];
  return steps.map((s, i) => `${i + 1}. ${clip(s && s.title, 80)}: ${clip(s && s.adds, 160)}`).join("\n");
}

function prompt(mode, b) {
  const x = base(b);
  if (mode === "outline") {
    const skipClarify = b.noClarify === true || !!clip(b.clarified, 5);
    return x.text + `

TASK: plan this lesson. Reply in this JSON shape:
{
  "onTopic": true,
  "message": "only if onTopic is false: one or two kind sentences",
  "clarify": ${skipClarify ? "null" : `null OR {"q": "one short question", "options": ["2 to 4 short choices"]} ONLY if the thing is truly ambiguous and the lesson would be completely different (for example "battery": a AA battery, a phone battery, or an electric car battery). Most things are NOT ambiguous: pick the most common everyday meaning and set clarify to null.`},
  "name": "the clean name of the thing (Title Case, a few words)",
  "emoji": "one emoji for it",
  "oneLiner": "one sentence that makes people curious to see it ${x.dir === "forward" ? "built" : "traced back"}",
  "steps": [ exactly ${STEPS} items: {"title": "2 to 5 words", "adds": "${x.dir === "forward" ? "what this step adds, under 14 words" : "where we are on this hop, under 14 words"}", "icon": "one emoji"} ]
}
${x.dir === "forward" ? "The planning stage is shown separately before step 1, so do not make planning a step." : "Step 1 is the finished thing in use; step " + STEPS + " is the raw origin."}`;
  }

  if (mode === "detail") {
    const part = b.part === "b" ? "b" : "a";
    const range = part === "a" ? [1, 4] : [5, 8];
    const words = x.level === "kid" ? "60 to 90" : "130 to 180";
    const stepShape = x.dir === "forward"
      ? `{"n": number, "title": "same title as the outline", "text": "${words} words: what happens in this step, how it is really done, what machines and people do it, and why it is done this way", "added": ["the parts or materials added in this step, 1 to 4 short names"], "madeBy": "which kind of specialty supplier or factory makes what is added (for example: a glass plant that presses colored lenses), one sentence", "materials": "what those parts are made of and where those materials typically come from, one sentence", "time": "typical time for this step, short (about ...)", "inside": "what you would see if you looked inside it right now, one sentence", "math": null or {"label": "short name", "work": "the calculation written out with real numbers and units", "result": "the answer, short"}, "wow": "one surprising true fact about this step", "imageQuery": "2 to 4 literal search words for a real photo of this step or part (for example: LED traffic light lens)"}`
      : `{"n": number, "title": "same title as the outline", "text": "${words} words: what this hop is, how it works, what it does to get the thing to the next hop, and who runs it", "whatHappens": "the one-sentence job of this hop", "whereFrom": "where this hop gets its supply from (the next hop back), one sentence", "whoRunsIt": "the kind of company, crew or utility that runs this hop, one sentence", "distance": "about how far this hop is from the previous one, short, or empty if it does not apply", "inside": "what you would see inside this place or part, one sentence", "math": null or {"label": "short name", "work": "a real calculation with numbers and units", "result": "the answer, short"}, "wow": "one surprising true fact about this hop", "imageQuery": "2 to 4 literal search words for a real photo of this hop (for example: electrical substation transformer)"}`;

    let extra = "";
    if (part === "a" && x.dir === "forward") extra = `,
  "blueprint": {
    "text": "${x.level === "kid" ? "60 to 90" : "120 to 170"} words: who plans and designs it before anything is built (engineers, architects, designers), what it has to do, the rules and standards it must meet, and how the plan becomes drawings and a parts list",
    "planners": ["2 to 4 roles that plan it, short"],
    "requirements": ["3 or 4 short requirements it must meet"],
    "math": [ ${x.level === "kid" ? "1 or 2" : "2 or 3"} items: {"label": "short name (for example: How many tiles for the floor?)", "work": "the real calculation written out step by step with numbers and units (for example: 12 ft x 10 ft = 120 sq ft; plus 10% for cuts = 132 tiles)", "result": "the answer, short"} ],
    "partsCount": "about how many parts or pieces it takes, short",
    "suppliers": "about how many different suppliers or factories are involved, short",
    "imageQuery": "2 to 4 search words for a real photo of its design or blueprint stage"
  }`;
    if (part === "a" && x.dir === "backward") extra = `,
  "start": {
    "text": "${x.level === "kid" ? "50 to 80" : "90 to 130"} words: the finished thing in front of you, working, and the big idea: it took a long chain of places, people and materials to get here, and we are about to follow it back",
    "chainLength": "about how far the whole chain stretches, short (for example: about 8,000 miles)"
  }`;
    if (part === "b" && x.dir === "forward") extra = `,
  "finish": {
    "text": "${x.level === "kid" ? "50 to 80" : "100 to 140"} words: it is finished. How it is tested and checked before it leaves, and what it does now",
    "journey": "how it gets from the factory to you, ${x.level === "kid" ? "1 or 2" : "2 or 3"} sentences. Keep it short unless the trip is genuinely special",
    "totals": {"time": "about how long the whole build takes", "suppliers": "about how many suppliers", "countries": "about how many countries can be involved, or empty"},
    "terms": [ 6 items: {"word": "a key part or term from this lesson", "meaning": "one plain sentence"} ],
    "deeper": ["exactly 3 curious follow-up questions a visitor might ask next"]
  }`;
    if (part === "b" && x.dir === "backward") extra = `,
  "finish": {
    "text": "${x.level === "kid" ? "50 to 80" : "100 to 140"} words: we reached the start. Look back at the whole chain and why it matters",
    "origins": [ 4 to 6 items: {"what": "a raw material or source", "where": "where it typically comes from (regions or well-known producing countries)"} ],
    "weakLinks": ["2 or 3 places where this chain can break (a shortage, a port delay, a storm, a single specialist supplier), one sentence each, and what happens when it does"],
    "terms": [ 6 items: {"word": "a key supply chain or engineering term from this lesson", "meaning": "one plain sentence"} ],
    "deeper": ["exactly 3 curious follow-up questions a visitor might ask next"]
  }`;

    return x.text + `

THE ${STEPS} STEPS (already shown to the visitor; keep these titles and this order):
${outlineList(b)}

TASK: write steps ${range[0]} to ${range[1]} in full detail. Every step must clearly follow from the one before it. Add the "math" box only where a real calculation genuinely helps (at least one of these four steps should have one${x.level === "kid" ? ", kept very simple" : ""}). Reply in this JSON shape:
{
  "steps": [ steps ${range[0]} to ${range[1]}, each: ${stepShape} ]${extra}
}`;
  }

  if (mode === "art") {
    return x.text + `

THE ${STEPS} STEPS:
${outlineList(b)}

TASK: you are the blueprint artist. Draw ONE technical blueprint drawing of the ${x.dir === "forward" ? "thing being built" : "whole chain"}, split into ${STEPS} LAYERS, one per step, so the picture grows as the visitor clicks Next. Stacking layers 1 to ${STEPS} must give the complete, finished drawing.
${x.dir === "forward"
  ? `- Draw the thing as a see-through CUTAWAY assembly drawing, so the insides show. Layer 1 is the base or frame. Each later layer draws ONLY the parts that step adds, in their final real position and real shape, on top of the earlier layers. Use true proportions, like an engineering textbook.`
  : `- Draw the chain as a ROUTE MAP that snakes across the board: hop 1 (the finished thing in use) at the top left, hop ${STEPS} (the raw origin) at the bottom right. Each layer draws ONLY its own hop: a simple recognizable outline icon made of a few shapes (a house, a pole with a transformer, a substation fence, a factory with a chimney, a ship, a mine, a truck, a warehouse), plus the connecting line or arrow back to the previous hop. Never draw an empty box as an icon.`}
- BOARD: 800 wide by 500 tall, dark blueprint background (already drawn for you; do not draw a background).
- LABELS: each layer has exactly one label with the step number and a 1 to 3 word name. ${x.dir === "forward"
  ? `Put every label in a neat column on the right: layer N's label text at x=600, y = 30 + N x 50 (so 80, 130, 180 ... 430), font-size 18, text-anchor start, written like "3 Lens". Draw the drawing itself inside x 30 to 560. Each label gets a thin leader line from a small dot (r 3) ON its part to x 588, ending at the label's height. Leader lines never cross each other or any text.`
  : `Put each hop's label directly under its icon, font-size 17, text-anchor middle, written like "3 Meter".`}
- ELEMENTS ALLOWED: g, path, line, circle, ellipse, rect, polyline, polygon, text. Nothing else (no images, no style tags, no scripts, no gradients, no filters).
- Use single quotes for attribute values.
- COLORS: lines in #e6f4ff (white-blue) and #7cc7ff (light blue); fills, if any, #7cc7ff with fill-opacity='0.15'; text fill #e6f4ff. Do not use other colors (the screen highlights the newest layer in orange by itself).
- LINES: stroke-width 2 to 3, stroke-linecap='round', fill='none' unless it is a filled shape. Dashed hidden lines use stroke-dasharray='6 5'. Text: font-family='Arial'.
- At most 22 elements per layer (clean and simple beats busy). Keep everything inside x 20 to 780 and y 20 to 485, and leave the bottom-right corner (x over 550, y over 445) empty: the drawing's title block goes there. Plan positions first so nothing overlaps.

OUTPUT FORMAT (IMPORTANT): plain text only, no JSON. Write the layers in order, each on its own lines, exactly like this:
=== LAYER 1
(all of layer 1's svg elements on one line)
=== LAYER 2
(...)
and so on to LAYER ${STEPS}, then a final line: === END
Write nothing before the first layer. If this thing should not be drawn, write only: === NONE`;
  }

  if (mode === "ask") {
    const q = clip(b.question, 500);
    const at = clip(b.at, 200);
    const hist = (Array.isArray(b.history) ? b.history.slice(-6) : [])
      .map(h => `${h.who === "me" ? "Visitor" : "Mr. Paul"}: ${clip(h.text, 500)}`).join("\n");
    return x.text + `

THE ${STEPS} STEPS IN THIS LESSON:
${outlineList(b)}
${at ? `\nThey are looking at: ${at}` : ""}
${hist ? `\nConversation so far:\n${hist}` : ""}

THE VISITOR ASKS: "${q}"

TASK: answer as Mr. Paul, ${x.level === "kid" ? "in 60 to 120 simple words" : "in 120 to 220 words"}, true and specific, tied to this lesson where it fits. If the question is truly unclear and you cannot answer well without knowing more, give your best short answer anyway and then ask ONE clarifying question. If it is off topic or unsafe, kindly steer back. Reply in this JSON shape:
{"answer": "your answer (plain sentences; you may use line breaks as \\n between short paragraphs)", "clarify": null or {"q": "one short question", "options": ["2 to 4 short choices"]}}`;
  }
  return null;
}

module.exports = async (req, res) => {
  if (!(await require("./_lwgate")(req, res, "start-to-finish"))) return;
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const origin = req.headers.origin || "";
  if (ALLOWED.length && origin && !ALLOWED.some(a => origin === a)) return res.status(403).json({ error: "This tool only works on its home website." });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: "Server is missing ANTHROPIC_API_KEY." });

  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "x").split(",")[0].trim();
  const b = req.body || {};
  const mode = String(b.mode || "");
  if (!clip(b.thing, 120)) return res.status(400).json({ error: "Tell me what to build first." });
  if (mode === "outline" && overLimit(ip, DAILY_LIMIT)) {
    return res.status(429).json({ error: "limit", message: "You've built a lot today! Come back tomorrow and the workshop will be ready." });
  }
  const p = prompt(mode, b);
  if (!p) return res.status(400).json({ error: "Unknown mode" });

  try {
    if (mode === "outline") {
      const j = extractJson(textOf(await anthropic(p, FAST_MODEL, 1800))) || {};
      if (j.onTopic === false) return res.status(200).json({ onTopic: false, message: clip(j.message, 300) || "Start to Finish to Start is for things that get built, made or delivered. For other questions, try The Answer Man on NuSparkLearnWow.com." });
      const c = j.clarify && typeof j.clarify === "object" ? { q: clip(j.clarify.q, 160), options: clipList(j.clarify.options, 4, 60) } : null;
      if (c && c.q && c.options.length >= 2) return res.status(200).json({ onTopic: true, clarify: c });
      const steps = (Array.isArray(j.steps) ? j.steps : []).slice(0, STEPS).map((s, i) => ({
        n: i + 1, title: clip(s && s.title, 60) || "Step " + (i + 1), adds: clip(s && s.adds, 140), icon: clip(s && s.icon, 4) || "⚙️"
      }));
      if (steps.length < STEPS) return res.status(200).json({ ok: false, message: "The workshop couldn't map that one. Tap Try Again." });
      return res.status(200).json({ onTopic: true, name: clip(j.name, 80) || clip(b.thing, 80), emoji: clip(j.emoji, 4) || "🛠️", oneLiner: clip(j.oneLiner, 220), steps });
    }

    if (mode === "detail") {
      const j = extractJson(textOf(await anthropic(p, MODEL, b.level === "kid" ? 4200 : 7000))) || {};
      const steps = (Array.isArray(j.steps) ? j.steps : []).slice(0, 4).map(s => cleanStep(s, b.dir)).filter(s => s.text);
      if (!steps.length) return res.status(200).json({ ok: false, message: "That part of the lesson didn't come through. Tap Try Again." });
      const out = { ok: true, steps };
      if (j.blueprint) out.blueprint = {
        text: clip(j.blueprint.text, 1600), planners: clipList(j.blueprint.planners, 4, 60), requirements: clipList(j.blueprint.requirements, 4, 160),
        math: cleanMathList(j.blueprint.math, 3), partsCount: clip(j.blueprint.partsCount, 80), suppliers: clip(j.blueprint.suppliers, 80), imageQuery: clip(j.blueprint.imageQuery, 60)
      };
      if (j.start) out.start = { text: clip(j.start.text, 1200), chainLength: clip(j.start.chainLength, 80) };
      if (j.finish) out.finish = {
        text: clip(j.finish.text, 1400), journey: clip(j.finish.journey, 600),
        totals: j.finish.totals ? { time: clip(j.finish.totals.time, 80), suppliers: clip(j.finish.totals.suppliers, 80), countries: clip(j.finish.totals.countries, 80) } : null,
        origins: (Array.isArray(j.finish.origins) ? j.finish.origins : []).slice(0, 6).map(o => ({ what: clip(o && o.what, 60), where: clip(o && o.where, 160) })).filter(o => o.what),
        weakLinks: clipList(j.finish.weakLinks, 3, 300),
        terms: (Array.isArray(j.finish.terms) ? j.finish.terms : []).slice(0, 6).map(t => ({ word: clip(t && t.word, 50), meaning: clip(t && t.meaning, 240) })).filter(t => t.word),
        deeper: clipList(j.finish.deeper, 3, 160)
      };
      return res.status(200).json(out);
    }

    if (mode === "art") {
      const text = textOf(await anthropic(p, MODEL, 8000));
      const layers = parseLayers(text);
      if (layers.filter(Boolean).length < 4) return res.status(200).json({ ok: false });
      return res.status(200).json({ ok: true, layers });
    }

    if (mode === "ask") {
      const j = extractJson(textOf(await anthropic(p, MODEL, 1400))) || {};
      const c = j.clarify && typeof j.clarify === "object" ? { q: clip(j.clarify.q, 160), options: clipList(j.clarify.options, 4, 60) } : null;
      return res.status(200).json({ ok: true, answer: clip(j.answer, 2400) || "Hmm, let me think about that one. Try asking it a different way.", clarify: c && c.q && c.options.length >= 2 ? c : null });
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "The workshop hit a snag. Please try again." });
  }
};

function cleanStep(s, dir) {
  s = s || {};
  const out = {
    n: Math.max(1, Math.min(STEPS, parseInt(s.n, 10) || 1)), title: clip(s.title, 60), text: clip(s.text, 1600),
    inside: clip(s.inside, 260), math: cleanMath(s.math), wow: clip(s.wow, 320), imageQuery: clip(s.imageQuery, 60)
  };
  if (dir === "backward") Object.assign(out, { whatHappens: clip(s.whatHappens, 240), whereFrom: clip(s.whereFrom, 260), whoRunsIt: clip(s.whoRunsIt, 240), distance: clip(s.distance, 80) });
  else Object.assign(out, { added: clipList(s.added, 4, 50), madeBy: clip(s.madeBy, 260), materials: clip(s.materials, 280), time: clip(s.time, 80) });
  return out;
}
function cleanMath(m) {
  if (!m || typeof m !== "object") return null;
  const o = { label: clip(m.label, 90), work: clip(m.work, 360), result: clip(m.result, 120) };
  return o.label && o.work ? o : null;
}
function cleanMathList(a, n) { return (Array.isArray(a) ? a : []).map(cleanMath).filter(Boolean).slice(0, n); }

// Blueprint layers: keep only safe drawing elements. The page cleans them again before showing them.
const OK_TAGS = /^(g|path|line|circle|ellipse|rect|polyline|polygon|text|tspan)$/i;
function parseLayers(text) {
  if (/===\s*NONE/i.test(text)) return [];
  const layers = new Array(STEPS).fill("");
  const re = /===\s*LAYER\s*(\d+)\s*\n([\s\S]*?)(?====\s*(?:LAYER|END))/gi;
  let m;
  while ((m = re.exec(text))) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= STEPS) layers[n - 1] = safeSvg(m[2]);
  }
  return layers;
}
function safeSvg(s) {
  s = String(s || "").replace(/<!--[\s\S]*?-->/g, "").replace(/<\s*(script|style|foreignObject|image|use|a)\b[\s\S]*?(<\/\s*\1\s*>|\/>)/gi, "");
  s = s.replace(/<\/?([a-zA-Z][\w:-]*)\b[^>]*>/g, (tag, name) => OK_TAGS.test(name) ? tag : "");
  s = s.replace(/\s(on\w+|href|xlink:href|style)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  return s.trim().slice(0, 12000);
}

function extractJson(text) {
  let raw = null;
  const low = text.toLowerCase();
  const i = low.lastIndexOf("<json>");
  if (i >= 0) { const end = low.indexOf("</json>", i); raw = text.slice(i + 6, end > i ? end : undefined); }
  if (!raw) { const a = text.indexOf("{"), z = text.lastIndexOf("}"); if (a >= 0 && z > a) raw = text.slice(a, z + 1); }
  if (!raw) return null;
  raw = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try { return JSON.parse(raw); } catch (e) {
    // one gentle repair: stray line breaks inside strings
    try { return JSON.parse(raw.replace(/\r?\n/g, " ")); } catch (x) { return null; }
  }
}
const cleanText = s => String(s == null ? "" : s).replace(/<\/?cite\b[^>]*>/gi, "").replace(/\*\*/g, "").replace(/[ \t]{2,}/g, " ").trim();
const clip = (s, n) => cleanText(s).slice(0, n);
const clipList = (a, n, len) => (Array.isArray(a) ? a : []).slice(0, n).map(x => clip(x, len)).filter(Boolean);

async function anthropic(userPrompt, model, maxTokens) {
  const body = { model: model || MODEL, max_tokens: maxTokens || 6000, system: SYSTEM, messages: [{ role: "user", content: userPrompt }] };
  // the fast model must have thinking turned off, or it spends its whole budget thinking and returns nothing
  if (/haiku/i.test(body.model)) body.thinking = { type: "disabled" };
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!r.ok) { const t = await r.text(); throw new Error("Anthropic API error " + r.status + ": " + t.slice(0, 300)); }
  return r.json();
}
const textOf = data => (data.content || []).filter(c => c.type === "text").map(c => c.text).join("");

// for local tests
module.exports._test = { prompt, parseLayers, safeSvg, extractJson, cleanStep };
