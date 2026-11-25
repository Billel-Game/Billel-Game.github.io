// Card scanner: camera frame → OCR (Tesseract, lazy-loaded) of the name strip and the
// code/number strip → card database lookup (Scryfall, YGOPRODeck, TCGdex) → you tap the
// right printing → it's added to the collection and priced. Stays open for the next card.
// Uses globals from app.js (state, $, Model, escapeHtml, currency, refreshCollectionView,
// priceSingleCard, pokemonNumber).

const SCAN_PREFS_KEY = "localcards.scanner.v1";
const SCAN_PRINTINGS = {
  mtg: ["Normal", "Foil", "Etched"],
  pok: ["Normal", "Holo", "Reverse Holo", "1st Edition"],
  ygo: ["1st Edition", "Unlimited", "Limited"]
};
const SCAN_CONDITIONS = ["NearMint", "Excellent", "Good", "LightlyPlayed", "Played", "Poor"];
const DEFAULT_FOLDERS = { mtg: "Magic", pok: "Pokemon", ygo: "Yu-Gi-Oh" };

// Where text sits on a card, as fractions of the card's width/height.
const NAME_STRIP = { left: 0.04, top: 0.025, width: 0.74, height: 0.085 };
const CODE_STRIPS = {
  mtg: { left: 0.02, top: 0.9, width: 0.6, height: 0.09 }, // "123/280 R" + "MKM • EN"
  pok: { left: 0, top: 0.85, width: 1, height: 0.14 }, // "025/165"
  ygo: { left: 0.45, top: 0.66, width: 0.53, height: 0.11 } // "SDK-001" under the art
};

const scanner = {
  stream: null,
  worker: null,
  workerPromise: null,
  busy: false,
  auto: true,
  paused: false,
  timer: null,
  lastKey: "",
  results: [],
  session: [],
  prefs: loadScanPrefs()
};

function loadScanPrefs() {
  const defaults = { game: "mtg", printing: { mtg: "Normal", pok: "Normal", ygo: "1st Edition" }, condition: "NearMint", language: "en", folders: {} };
  try {
    const saved = JSON.parse(localStorage.getItem(SCAN_PREFS_KEY) || "{}");
    return { ...defaults, ...saved, printing: { ...defaults.printing, ...saved.printing }, folders: { ...saved.folders } };
  } catch {
    return defaults;
  }
}

function saveScanPrefs() {
  try {
    localStorage.setItem(SCAN_PREFS_KEY, JSON.stringify(scanner.prefs));
  } catch {
    // Preferences are a convenience; ignore storage failures.
  }
}

// The folder this game's cards usually live in.
function scanFolder(game) {
  if (scanner.prefs.folders[game]) return scanner.prefs.folders[game];
  const counts = new Map();
  state.cards.filter((card) => card.game === game).forEach((card) => counts.set(card.folder, (counts.get(card.folder) || 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || DEFAULT_FOLDERS[game] || "Unsorted";
}

function setScanStatus(text) {
  $("scanner-status").textContent = text;
}

function renderScanSettings() {
  const { game } = scanner.prefs;
  $("scan-game").value = game;
  $("scan-printing").innerHTML = SCAN_PRINTINGS[game].map((value) => `<option>${value}</option>`).join("");
  $("scan-printing").value = scanner.prefs.printing[game];
  $("scan-condition").innerHTML = SCAN_CONDITIONS.map((value) => `<option>${value}</option>`).join("");
  $("scan-condition").value = scanner.prefs.condition;
  $("scan-language").value = scanner.prefs.language;
  $("scan-folder").value = scanFolder(game);
  $("scan-auto").textContent = scanner.auto ? "Auto-scan on" : "Auto-scan off";
  $("scan-auto").setAttribute("aria-pressed", String(scanner.auto));
  $("scan-auto").classList.toggle("bg-lime-300", scanner.auto);
  $("scan-auto").classList.toggle("text-slate-950", scanner.auto);
  $("scan-auto").classList.toggle("bg-slate-900", !scanner.auto);
  $("scan-auto").classList.toggle("text-slate-200", !scanner.auto);
}

/* ---------- Camera ---------- */

async function openScanner() {
  $("scanner-dialog").showModal();
  loadNameList(scanner.prefs.game);
  renderScanSettings();
  renderScanResults();
  renderScanSession();
  if (!navigator.mediaDevices?.getUserMedia) {
    setScanStatus("No camera here. Use a photo or type a name.");
    return;
  }
  setScanStatus("Starting camera…");
  try {
    scanner.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false
    });
    const video = $("scanner-video");
    video.srcObject = scanner.stream;
    await video.play().catch(() => {});
    setScanStatus("Hold a card inside the frame");
    getOcrWorker().catch(() => {}); // warm up OCR while the card is being positioned
    scheduleAutoScan(1000);
  } catch (error) {
    setScanStatus(`Camera unavailable (${error.message}). Use a photo or type a name.`);
  }
}

function closeScanner() {
  clearTimeout(scanner.timer);
  scanner.stream?.getTracks().forEach((track) => track.stop());
  scanner.stream = null;
  scanner.paused = false;
  $("scanner-video").srcObject = null;
  if ($("scanner-dialog").open) $("scanner-dialog").close();
}

// Copies the part of the video inside the on-screen guide to a canvas.
// The video uses object-cover, so screen → video coordinates need the cover scale.
function grabGuideFrame() {
  const video = $("scanner-video");
  if (!video.videoWidth) return null;
  const view = video.getBoundingClientRect();
  const guide = $("scanner-guide").getBoundingClientRect();
  const scale = Math.max(view.width / video.videoWidth, view.height / video.videoHeight);
  const offsetX = (view.width - video.videoWidth * scale) / 2;
  const offsetY = (view.height - video.videoHeight * scale) / 2;
  const sx = Math.max(0, (guide.left - view.left - offsetX) / scale);
  const sy = Math.max(0, (guide.top - view.top - offsetY) / scale);
  const sw = Math.min(video.videoWidth - sx, guide.width / scale);
  const sh = Math.min(video.videoHeight - sy, guide.height / scale);
  return cardCanvas(video, sx, sy, sw, sh);
}

function cardCanvas(source, sx, sy, sw, sh) {
  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = Math.round(900 * (sh / sw));
  const context = canvas.getContext("2d");
  context.filter = "grayscale(1) contrast(1.35)";
  context.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/* ---------- OCR ---------- */

async function getOcrWorker() {
  if (scanner.worker) return scanner.worker;
  if (!scanner.workerPromise) {
    scanner.workerPromise = (async () => {
      if (!window.Tesseract) {
        await new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@6/dist/tesseract.min.js";
          script.onload = resolve;
          script.onerror = () => reject(new Error("Could not load the OCR library."));
          document.head.appendChild(script);
        });
      }
      scanner.worker = await window.Tesseract.createWorker("eng", 1);
      return scanner.worker;
    })().catch((error) => {
      scanner.workerPromise = null;
      throw error;
    });
  }
  return scanner.workerPromise;
}

function stripRect(canvas, strip) {
  return {
    left: Math.round(canvas.width * strip.left),
    top: Math.round(canvas.height * strip.top),
    width: Math.round(canvas.width * strip.width),
    height: Math.round(canvas.height * strip.height)
  };
}

// pageSegMode "7" = a single line, "11" = sparse text anywhere in the region.
async function readRegion(canvas, strip, pageSegMode) {
  const worker = await getOcrWorker();
  await worker.setParameters({ tessedit_pageseg_mode: pageSegMode });
  return (await worker.recognize(canvas, { rectangle: stripRect(canvas, strip) })).data.text;
}

async function readCard(canvas, game) {
  return {
    name: await readRegion(canvas, NAME_STRIP, "7"),
    code: await readRegion(canvas, CODE_STRIPS[game], "11")
  };
}

// Fallback when the card sits a little off the guide: read the whole top of the card.
const TOP_REGION = { left: 0, top: 0, width: 1, height: 0.2 };

/* ---------- Snapping OCR text to real card names ---------- */

// data/names/<game>.json is built by scripts/build-name-lists.mjs.
const nameLists = new Map();
const MIN_NAME_SCORE = 0.75; // below this, a read is treated as noise

function normalizeName(value) {
  return String(value || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

function loadNameList(game) {
  if (!nameLists.has(game)) {
    nameLists.set(game, fetch(`./data/names/${game}.json`)
      .then((response) => (response.ok ? response.json() : []))
      .then((names) => {
        // exact: normalized name → name. grams: two-letter pair → ids of names containing it,
        // used to pick a few dozen plausible names before the (slow) edit distance.
        const entries = names.map((name) => ({ name, key: normalizeName(name) }));
        const exact = new Map(entries.map((entry) => [entry.key, entry.name]));
        const grams = new Map();
        entries.forEach((entry, id) => {
          bigrams(entry.key).forEach((gram) => {
            if (!grams.has(gram)) grams.set(gram, []);
            grams.get(gram).push(id);
          });
        });
        return { entries, exact, grams, counts: new Uint16Array(entries.length) };
      })
      .catch(() => {
        nameLists.delete(game);
        return [];
      }));
  }
  return nameLists.get(game);
}

// Levenshtein distance that gives up once it exceeds maxDistance (returns Infinity).
// Runs ~50k times per scan, so it reuses two typed-array rows instead of allocating.
let distanceRows = [new Uint16Array(256), new Uint16Array(256)];
function boundedDistance(a, b, maxDistance) {
  if (Math.abs(a.length - b.length) > maxDistance) return Infinity;
  if (b.length + 1 > distanceRows[0].length) distanceRows = [new Uint16Array(b.length + 1), new Uint16Array(b.length + 1)];
  let [previous, current] = distanceRows;
  for (let j = 0; j <= b.length; j += 1) previous[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    let rowMin = i;
    const char = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j += 1) {
      const substitute = previous[j - 1] + (char === b.charCodeAt(j - 1) ? 0 : 1);
      const value = Math.min(previous[j] + 1, current[j - 1] + 1, substitute);
      current[j] = value;
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > maxDistance) return Infinity;
    [previous, current] = [current, previous];
  }
  return previous[b.length];
}

// Every run of up to 6 consecutive words, so junk around the name doesn't matter.
// coverage = how much of its line the run spans.
function nameCandidates(text) {
  const spans = new Map();
  String(text || "").split(/\r?\n/).forEach((line) => {
    const words = normalizeName(line).split(" ").filter(Boolean);
    const lineLength = words.join(" ").length;
    for (let start = 0; start < words.length; start += 1) {
      for (let end = start + 1; end <= Math.min(words.length, start + 6); end += 1) {
        const span = words.slice(start, end).join(" ");
        const coverage = span.length / lineLength;
        if (span.replace(/ /g, "").length >= 3 && coverage > (spans.get(span) || 0)) spans.set(span, coverage);
      }
    }
  });
  return [...spans.entries()].map(([span, coverage]) => ({ span, coverage }));
}

// Best { name, score } among real card names; score is 0..1 (1 = exact).
// Ranking also rewards covering the whole line, so one stray word that happens to be
// a real card ("Dragon") can't beat a slightly misread full name.
function bigrams(key) {
  const grams = new Set();
  for (let index = 0; index < key.length - 1; index += 1) grams.add(key.slice(index, index + 2));
  return grams;
}

async function bestNameMatch(game, text) {
  const list = await loadNameList(game);
  let best = { name: "", score: 0, rank: 0 };
  const consider = (name, score, coverage) => {
    const rank = score * (0.7 + 0.3 * coverage);
    if (rank > best.rank) best = { name, score, rank };
  };
  for (const { span, coverage } of nameCandidates(text)) {
    if (list.exact.has(span)) {
      consider(list.exact.get(span), 1, coverage);
      continue;
    }
    const maxDistance = Math.floor(span.length * (1 - MIN_NAME_SCORE));
    // Each edit breaks at most two letter pairs, so a real match shares at least this many.
    const spanGrams = bigrams(span);
    const needed = spanGrams.size - 2 * maxDistance;
    if (needed < 1) continue;
    const touched = [];
    spanGrams.forEach((gram) => {
      (list.grams.get(gram) || []).forEach((id) => {
        if (list.counts[id] === 0) touched.push(id);
        list.counts[id] += 1;
      });
    });
    touched.forEach((id) => {
      if (list.counts[id] >= needed) {
        const entry = list.entries[id];
        const distance = boundedDistance(span, entry.key, maxDistance);
        if (distance !== Infinity) consider(entry.name, 1 - distance / Math.max(span.length, entry.key.length), coverage);
      }
      list.counts[id] = 0;
    });
  }
  return best;
}

// Real names containing every typed word, shortest first ("blue eyes" → "Blue-Eyes …").
async function namesContaining(game, text) {
  const words = normalizeName(text).split(" ").filter(Boolean);
  if (!words.length) return [];
  return (await loadNameList(game)).entries
    .filter((entry) => words.every((word) => entry.key.includes(word)))
    .sort((a, b) => a.key.length - b.key.length)
    .map((entry) => entry.name);
}

// 0..1 similarity of two names (1 = identical after normalizing).
function nameSimilarity(a, b) {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return 0;
  const longest = Math.max(x.length, y.length);
  return 1 - boundedDistance(x, y, longest) / longest;
}

/* ---------- Parsing OCR text ---------- */

function cleanCardName(text) {
  const lines = String(text || "").split(/\r?\n/)
    .map((line) => line
      .replace(/[|_~=+<>{}[\]\\/@#$%^*"“”]/g, " ")
      .replace(/\b(BASIC|STAGE\s*\d|\d+\s*HP|HP\s*\d+|Evolves from.*)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim())
    .map((line) => line.split(" ").filter((word, index, words) =>
      // drop stray 1–2 character OCR junk at the ends of the line
      !((index === 0 || index === words.length - 1) && word.length < 3 && !/^[A-Z]{1,2}$/.test(word))
    ).join(" "))
    .filter((line) => /[a-z]{3}/i.test(line));
  return lines.sort((a, b) => b.length - a.length)[0] || "";
}

function parseYgoCode(text) {
  const upper = String(text || "").toUpperCase().replace(/[—–_]/g, "-");
  const match = upper.match(/\b([A-Z0-9]{2,4})\s?-\s?([A-Z]{0,2})([0-9OIL]{3})\b/);
  if (!match) return "";
  const digits = match[3].replace(/O/g, "0").replace(/[IL]/g, "1");
  return `${match[1]}-${match[2]}${digits}`;
}

// name: a real card name (exact: true) or typed text; read: the raw OCR'd name text.
function parseHints(game, nameText, codeText) {
  const hints = { name: "", exact: false, read: cleanCardName(nameText), code: "", number: "", setCode: "" };
  if (game === "ygo") hints.code = parseYgoCode(codeText);
  if (game === "pok" || game === "mtg") {
    const fraction = String(codeText || "").match(/\b0*(\d{1,4})\s*\/\s*0*(\d{1,4})\b/);
    if (fraction) {
      hints.number = fraction[1];
      hints.total = fraction[2]; // the set's card count, e.g. 4/102 → Base Set
    }
  }
  if (game === "mtg") {
    const set = String(codeText || "").toUpperCase().match(/\b([A-Z0-9]{3,5})\s*[•·*.-]\s*[A-Z]{2}\b/);
    if (set) hints.setCode = set[1];
    if (!hints.number) hints.number = String(codeText || "").match(/^\s*0*(\d{1,4})\b/m)?.[1] || "";
  }
  return hints;
}

// Typed search: a Yu-Gi-Oh! set code anywhere in the text is used as the code. A close
// match to a real name is used exactly; otherwise the text goes to the API's own search
// (so partial names like "blue eyes" still work).
async function hintsFromText(game, text) {
  const code = game === "ygo" ? parseYgoCode(text) : "";
  const typed = code ? text.replace(new RegExp(code.replace("-", "\\s?-\\s?"), "i"), "").trim() : text.trim();
  const match = typed ? await bestNameMatch(game, typed) : { score: 0 };
  if (match.score >= 0.85) return { name: match.name, exact: true, read: typed, code, number: "", setCode: "", typed: true };
  // Partial name: use the shortest real name containing all typed words.
  const [contained] = typed ? await namesContaining(game, typed) : [];
  return { name: contained || typed, exact: Boolean(contained), read: typed, code, number: "", setCode: "", typed: true };
}

/* ---------- Card database lookups ---------- */

async function getJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) return null;
  return response.json();
}

function mtgCandidate(card, hints) {
  const images = card.image_uris || card.card_faces?.[0]?.image_uris || {};
  const sameSet = Boolean(hints.setCode) && card.set.toUpperCase() === hints.setCode;
  const sameNumber = Boolean(hints.number) && card.collector_number === hints.number;
  const score = (sameSet ? 40 : 0) + (sameNumber ? (sameSet ? 40 : 10) : 0);
  return {
    game: "mtg",
    name: card.name,
    set: card.set_name,
    setCode: card.set.toUpperCase(),
    number: card.collector_number,
    rarity: card.rarity,
    imageUrl: images.normal || "",
    thumb: images.small || images.normal || "",
    note: card.prices?.eur ? `€${card.prices.eur}` : card.released_at?.slice(0, 4) || "",
    score
  };
}

async function lookupMtg(hints) {
  const results = [];
  // Scanned names are already real names; only typed text needs Scryfall's fuzzy search.
  const named = !hints.name ? null
    : hints.exact ? { name: hints.name }
      : await getJson(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(hints.name)}`);
  if (named && hints.setCode && hints.number) {
    const exact = await getJson(`https://api.scryfall.com/cards/${encodeURIComponent(hints.setCode.toLowerCase())}/${encodeURIComponent(hints.number)}`);
    // A misread digit points at a different card; only trust it if the name agrees.
    if (exact && (exact.name === named.name || exact.name.startsWith(`${named.name} //`))) results.push(mtgCandidate(exact, hints));
  }
  if (!named) return results;
  const prints = await getJson(`https://api.scryfall.com/cards/search?unique=prints&order=released&q=${encodeURIComponent(`!"${named.name}" game:paper`)}`);
  (prints?.data || []).forEach((card) => {
    if (!results.some((item) => item.setCode === card.set.toUpperCase() && item.number === card.collector_number)) {
      results.push(mtgCandidate(card, hints));
    }
  });
  return results;
}

function ygoCandidate(card, set, hints) {
  const code = set.set_code;
  return {
    game: "ygo",
    name: card.name,
    set: set.set_name,
    setCode: code.split("-")[0],
    number: code,
    rarity: set.set_rarity,
    imageUrl: `https://images.ygoprodeck.com/images/cards/${card.id}.jpg`,
    thumb: `https://images.ygoprodeck.com/images/cards_small/${card.id}.jpg`,
    note: set.set_rarity_code || "",
    score: hints.code && code.toUpperCase() === hints.code ? 80 : hints.code && code.split("-")[0] === hints.code.split("-")[0] ? 20 : 0
  };
}

async function lookupYgo(hints) {
  if (hints.code) {
    const info = await getJson(`https://db.ygoprodeck.com/api/v7/cardsetsinfo.php?setcode=${encodeURIComponent(hints.code)}`);
    // A misread code is another real card, so the code's card must agree with the name.
    // Typed codes are trusted as-is.
    const agrees = info?.name && (hints.typed
      || (hints.exact ? info.name === hints.name : nameSimilarity(info.name, hints.read) >= 0.6));
    if (agrees) return [ygoCandidate({ id: info.id, name: info.name }, info, hints)];
  }
  if (!hints.name) return [];
  const exact = await getJson(`https://db.ygoprodeck.com/api/v7/cardinfo.php?name=${encodeURIComponent(hints.name)}`);
  const result = exact || (hints.exact ? null : await getJson(`https://db.ygoprodeck.com/api/v7/cardinfo.php?fname=${encodeURIComponent(hints.name)}`));
  const cards = (result?.data || []).slice(0, 3);
  return cards.flatMap((card) => (card.card_sets || []).map((set) => ygoCandidate(card, set, hints))).slice(0, 40);
}

async function lookupPokemon(hints) {
  if (!hints.name) return [];
  let list = await getJson(`https://api.tcgdex.net/v2/en/cards?name=${encodeURIComponent(hints.name)}`) || [];
  if (hints.exact) {
    // TCGdex's name filter is "contains"; a scanned name must match exactly.
    list = list.filter((card) => card.name.toLowerCase() === hints.name.toLowerCase());
  } else if (!list.length && hints.name.includes(" ")) {
    list = await getJson(`https://api.tcgdex.net/v2/en/cards?name=${encodeURIComponent(hints.name.split(" ")[0])}`) || [];
  }
  if (hints.number) {
    const sameNumber = list.filter((card) => pokemonNumber(card.localId) === pokemonNumber(hints.number));
    if (sameNumber.length) list = sameNumber;
  }
  const wanted = hints.name.toLowerCase();
  list.sort((a, b) => (b.name.toLowerCase() === wanted) - (a.name.toLowerCase() === wanted));
  const details = await Promise.all(list.slice(0, 12).map((card) => getJson(`https://api.tcgdex.net/v2/en/cards/${encodeURIComponent(card.id)}`)));
  return details.filter(Boolean).map((card) => ({
    game: "pok",
    name: card.name,
    set: card.set?.name || "Unknown set",
    setCode: card.set?.id || "",
    number: card.localId,
    rarity: card.rarity || "Unknown",
    imageUrl: card.image ? `${card.image}/high.webp` : "",
    thumb: card.image ? `${card.image}/low.webp` : "",
    note: card.set?.cardCount?.official ? `${card.localId}/${card.set.cardCount.official}` : "",
    score: (hints.number && pokemonNumber(card.localId) === pokemonNumber(hints.number) ? 50 : 0)
      + (hints.total && String(card.set?.cardCount?.official) === hints.total ? 30 : 0)
  }));
}

async function lookupCards(game, hints) {
  const results = game === "mtg" ? await lookupMtg(hints) : game === "ygo" ? await lookupYgo(hints) : await lookupPokemon(hints);
  // Stable sort: best score first, otherwise keep the API's order.
  return results.map((item, index) => ({ item, index }))
    .sort((a, b) => b.item.score - a.item.score || a.index - b.index)
    .map(({ item }) => item);
}

/* ---------- Scan flow ---------- */

async function scanCanvas(canvas) {
  if (scanner.busy) return false;
  scanner.busy = true;
  const game = scanner.prefs.game;
  try {
    if (!scanner.worker) setScanStatus("Loading the text reader (first scan only)…");
    else setScanStatus("Reading card…");
    const text = await readCard(canvas, game);
    const hints = parseHints(game, text.name, text.code);
    let match = await bestNameMatch(game, text.name);
    if (match.score < MIN_NAME_SCORE) {
      const wider = await bestNameMatch(game, await readRegion(canvas, TOP_REGION, "11"));
      if (wider.rank > match.rank) match = wider;
    }
    if (match.score >= MIN_NAME_SCORE) {
      hints.name = match.name;
      hints.exact = true;
    } else if (!hints.code) {
      // Show what was read so a bad angle or glare is easy to spot.
      setScanStatus(hints.read
        ? `Read “${hints.read}”, which isn't a card name. Fill the frame, avoid glare.`
        : "Can't read the name yet. Fill the frame, avoid glare, hold steady.");
      return false;
    }
    return await searchAndShow(game, hints);
  } catch (error) {
    setScanStatus(`Scan failed: ${error.message}`);
    return false;
  } finally {
    scanner.busy = false;
  }
}

async function searchAndShow(game, hints) {
  const label = hints.name || hints.code || hints.read;
  const key = `${game}|${hints.name}|${hints.code}|${hints.number}|${hints.setCode}`;
  if (key === scanner.lastKey && scanner.results.length) return true;
  setScanStatus(`Looking up “${label}”…`);
  const results = await lookupCards(game, hints);
  if (!results.length) {
    setScanStatus(`Read “${label}” but found no match. Try again or type the name.`);
    return false;
  }
  scanner.lastKey = key;
  scanner.results = results;
  renderScanResults();
  setScanStatus(`Found ${results[0].name}. Tap the right printing to add it.`);
  return true;
}

function scheduleAutoScan(delay = 1200) {
  clearTimeout(scanner.timer);
  if (!scanner.auto || !scanner.stream || scanner.paused) return;
  scanner.timer = setTimeout(async () => {
    const canvas = grabGuideFrame();
    const found = canvas ? await scanCanvas(canvas) : false;
    if (found) scanner.paused = true; // wait for a pick (or "Scan again")
    else scheduleAutoScan();
  }, delay);
}

function resumeScanning(delay) {
  scanner.paused = false;
  scanner.lastKey = "";
  scanner.results = [];
  renderScanResults();
  scheduleAutoScan(delay);
}

/* ---------- Results and adding ---------- */

function renderScanResults() {
  const results = scanner.results;
  if (!results.length) {
    $("scan-results").innerHTML = "";
    return;
  }
  const best = results[0].score > 0;
  $("scan-results").innerHTML = `
    <div class="flex items-center justify-between">
      <p class="font-mono text-[10px] uppercase tracking-[.08em] text-slate-500">${results.length} printing${results.length === 1 ? "" : "s"} · tap to add</p>
      <button id="scan-again" type="button" class="text-xs text-violet-300 hover:text-violet-200">Scan again</button>
    </div>
    <div class="max-h-[300px] space-y-1.5 overflow-y-auto pr-1">
      ${results.map((item, index) => `
        <button type="button" data-scan-result="${index}" class="flex w-full items-center gap-3 rounded-xl border ${index === 0 && best ? "border-lime-300/70 bg-lime-300/5" : "border-slate-800 bg-slate-900"} p-2 text-left transition hover:border-lime-300">
          ${item.thumb ? `<img src="${escapeHtml(item.thumb)}" alt="" loading="lazy" class="h-16 w-[46px] flex-none rounded object-cover">` : `<span class="h-16 w-[46px] flex-none rounded bg-slate-800"></span>`}
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-semibold text-slate-100">${escapeHtml(item.name)}</span>
            <span class="block truncate text-xs text-slate-400">${escapeHtml(item.set)}</span>
            <span class="block truncate font-mono text-[10px] text-slate-500">${escapeHtml(item.number)} · ${escapeHtml(item.rarity)}${item.note ? ` · ${escapeHtml(item.note)}` : ""}</span>
          </span>
          ${index === 0 && best ? '<span class="flex-none rounded-full bg-lime-300 px-2 py-0.5 font-mono text-[10px] text-slate-950">best</span>' : ""}
        </button>`).join("")}
    </div>`;
}

function sameCopy(a, b) {
  const same = (x, y) => String(x || "").trim().toLowerCase() === String(y || "").trim().toLowerCase();
  return ["game", "name", "setCode", "number", "printing", "condition", "language", "folder"].every((field) => same(a[field], b[field]));
}

// Adds one copy; merges with an identical existing copy. Returns the collection entry.
function addCopy(fields) {
  const card = Model.normalizeCard({
    ...fields,
    printing: fields.printing || scanner.prefs.printing[fields.game] || "Normal",
    condition: scanner.prefs.condition,
    language: scanner.prefs.language || "en",
    folder: scanFolder(fields.game),
    quantity: 1,
    price: 0,
    priceSource: "Awaiting prices"
  });
  const existing = state.cards.find((item) => sameCopy(item, card));
  if (existing) existing.quantity += 1;
  else state.cards.push(card);
  const entry = existing || card;
  scanner.session.unshift(entry);
  refreshCollectionView();
  renderScanSession();
  if (!existing) {
    priceSingleCard(entry).then(() => {
      refreshCollectionView();
      renderScanSession();
    });
  }
  return entry;
}

function addScanResult(index) {
  const item = scanner.results[index];
  if (!item) return;
  const { thumb, note, score, ...fields } = item;
  const entry = addCopy(fields);
  setScanStatus(`Added ${entry.name} (${entry.set}). Next card!`);
  resumeScanning(1800);
}

function undoScan(index) {
  const entry = scanner.session[index];
  if (!entry) return;
  if (entry.quantity > 1) entry.quantity -= 1;
  else state.cards = state.cards.filter((card) => card !== entry);
  scanner.session.splice(index, 1);
  refreshCollectionView();
  renderScanSession();
}

function renderScanSession() {
  const session = scanner.session;
  if (!session.length) {
    $("scan-session").innerHTML = "";
    return;
  }
  const total = session.reduce((sum, card) => sum + card.price, 0);
  $("scan-session").innerHTML = `
    <p class="mb-2 font-mono text-[10px] uppercase tracking-[.08em] text-slate-500">Added this session · ${session.length} card${session.length === 1 ? "" : "s"} · ${currency.format(total)}</p>
    <ul class="max-h-[200px] space-y-1 overflow-y-auto pr-1">
      ${session.map((card, index) => `
        <li class="flex items-center justify-between gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs">
          <span class="min-w-0 truncate"><span class="text-slate-100">${escapeHtml(card.name)}</span> <span class="text-slate-500">${escapeHtml(card.number)} · ${escapeHtml(card.printing)}</span></span>
          <span class="flex flex-none items-center gap-3"><span class="font-mono text-slate-300">${card.price ? currency.format(card.price) : "…"}</span><button type="button" data-scan-undo="${index}" class="text-slate-500 hover:text-pink-300">Undo</button></span>
        </li>`).join("")}
    </ul>`;
}

/* ---------- Events ---------- */

$("open-scanner").addEventListener("click", openScanner);
$("close-scanner").addEventListener("click", closeScanner);
$("scanner-dialog").addEventListener("close", closeScanner);

$("scan-game").addEventListener("change", (event) => {
  scanner.prefs.game = event.target.value;
  loadNameList(scanner.prefs.game);
  saveScanPrefs();
  renderScanSettings();
  resumeScanning(600);
});
$("scan-printing").addEventListener("change", (event) => {
  scanner.prefs.printing[scanner.prefs.game] = event.target.value;
  saveScanPrefs();
});
$("scan-condition").addEventListener("change", (event) => {
  scanner.prefs.condition = event.target.value;
  saveScanPrefs();
});
$("scan-language").addEventListener("change", (event) => {
  scanner.prefs.language = event.target.value.trim() || "en";
  saveScanPrefs();
});
$("scan-folder").addEventListener("change", (event) => {
  scanner.prefs.folders[scanner.prefs.game] = event.target.value.trim() || DEFAULT_FOLDERS[scanner.prefs.game];
  saveScanPrefs();
});

$("scan-auto").addEventListener("click", () => {
  scanner.auto = !scanner.auto;
  renderScanSettings();
  if (scanner.auto) resumeScanning(300);
  else clearTimeout(scanner.timer);
});
$("scan-now").addEventListener("click", async () => {
  clearTimeout(scanner.timer);
  scanner.lastKey = "";
  const canvas = grabGuideFrame();
  if (!canvas) {
    setScanStatus("No camera image yet. Use a photo or type a name.");
    return;
  }
  scanner.paused = await scanCanvas(canvas);
  if (!scanner.paused) scheduleAutoScan();
});
$("scan-photo").addEventListener("click", () => $("scanner-photo").click());
$("scanner-photo").addEventListener("change", (event) => {
  const [file] = event.target.files;
  event.target.value = "";
  if (!file) return;
  const image = new Image();
  image.onload = () => {
    URL.revokeObjectURL(image.src);
    clearTimeout(scanner.timer);
    scanner.lastKey = "";
    // Assume the photo is mostly the card.
    scanCanvas(cardCanvas(image, 0, 0, image.naturalWidth, image.naturalHeight)).then((found) => { scanner.paused = found; });
  };
  image.src = URL.createObjectURL(file);
});

$("scan-search-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = $("scan-search").value.trim();
  if (!text) return;
  clearTimeout(scanner.timer);
  scanner.lastKey = "";
  try {
    scanner.paused = await searchAndShow(scanner.prefs.game, await hintsFromText(scanner.prefs.game, text));
  } catch (error) {
    setScanStatus(`Search failed: ${error.message}`);
  }
});

$("scan-results").addEventListener("click", (event) => {
  if (event.target.closest("#scan-again")) {
    setScanStatus("Hold a card inside the frame");
    resumeScanning(300);
    return;
  }
  const button = event.target.closest("[data-scan-result]");
  if (button) addScanResult(Number(button.dataset.scanResult));
});
$("scan-session").addEventListener("click", (event) => {
  const button = event.target.closest("[data-scan-undo]");
  if (button) undoScan(Number(button.dataset.scanUndo));
});

$("manual-card-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = new FormData(form);
  const text = (key) => String(values.get(key) || "").trim();
  if (!text("name")) return;
  const entry = addCopy({
    game: text("game") || "other",
    name: text("name"),
    set: text("set") || "Unknown set",
    setCode: text("setCode"),
    number: text("number") || "—",
    rarity: text("rarity") || "Unknown",
    imageUrl: ""
  });
  form.reset();
  setScanStatus(`Added ${entry.name} by hand.`);
});

window.addEventListener("pagehide", () => scanner.worker?.terminate());
