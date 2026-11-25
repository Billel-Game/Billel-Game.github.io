const state = { cards: [], filtered: [], filename: "", imageCache: new Map(), priceCache: new Map(), checkingPrices: false, selectedFolder: "", activeCard: null, fxRates: null };
const currency = new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR" });
const STORAGE_KEY = "localcards.collection.v1";
const $ = (id) => document.getElementById(id);
const Model = window.CardVaultModel; // card-model.js always loads first

function parseCsvLine(line) {
  const cells = [];
  let cell = "", quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { cell += '"'; i += 1; } else quoted = !quoted;
    } else if (char === "," && !quoted) { cells.push(cell); cell = ""; } else cell += char;
  }
  cells.push(cell);
  return cells;
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const normaliseHeader = (value) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const headerIndex = lines.findIndex((line) => {
    const headers = parseCsvLine(line).map(normaliseHeader);
    return headers.some((header) => ["cardname", "productname", "name"].includes(header))
      && headers.some((header) => ["quantity", "qty", "count"].includes(header));
  });
  if (headerIndex < 0) throw new Error("Could not find the collection header.");
  const headers = parseCsvLine(lines[headerIndex]).map((header) => header.trim());
  return lines.slice(headerIndex + 1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
  }).filter((card) => Object.values(card).some(Boolean));
}

function mergeDuplicateCards(cards) {
  const grouped = new Map();
  cards.forEach((card) => {
    const key = `${card.folder}|${card.game}|${card.setCode}|${card.number}|${card.printing}|${card.condition}|${card.language}`;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { ...card });
      return;
    }
    const totalQuantity = existing.quantity + card.quantity;
    existing.price = totalQuantity ? ((existing.price * existing.quantity) + (card.price * card.quantity)) / totalQuantity : 0;
    existing.bought = totalQuantity ? ((existing.bought * existing.quantity) + (card.bought * card.quantity)) / totalQuantity : 0;
    existing.quantity = totalQuantity;
  });
  return [...grouped.values()];
}

function normalise(card) {
  const header = (value) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const field = (aliases) => {
    const wanted = aliases.map(header);
    const entry = Object.entries(card).find(([key, value]) => value !== "" && wanted.includes(header(key)));
    return entry ? entry[1] : "";
  };
  const gameValue = field(["Collection", "Game", "Category", "Product Line", "Product Type"]).toLowerCase();
  const game = /pokemon|pokémon|pokemon tcg/.test(gameValue) ? "pok"
    : /yu.?gi.?oh|yugioh/.test(gameValue) ? "ygo"
      : /magic|mtg/.test(gameValue) ? "mtg" : gameValue || "cards";
  const name = field(["Card Name", "Product Name", "Name"]);
  return Model.normalizeCard({
    ...card,
    name,
    game,
    folder: field(["List Name", "Parent List Name", "Portfolio Name", "Folder", "Collection"]) || "Unsorted",
    quantity: Number(field(["Quantity", "Qty", "Count"])) || 0,
    price: 0,
    priceSource: "Awaiting prices",
    bought: Number(field(["Purchase Price", "Price Bought"])) || 0,
    purchaseDate: field(["Purchase Date"]),
    storageLocation: field(["Storage Location"]),
    notes: field(["Notes"]),
    set: field(["Set Name", "Set", "Expansion"]) || "Unknown set",
    setCode: field(["Set Code", "Set ID", "Expansion Code"]),
    number: field(["Card Number", "Collector Number", "Number"]) || "—",
    condition: field(["Condition", "Card Condition"]) || "Unknown",
    rarity: field(["Rarity"]) || "Unknown",
    printing: field(["Printing", "Finish"]) || "Unknown",
    language: field(["Language", "Card Language"]) || "Unknown",
    imageUrl: field(["Image URL", "Image", "Image Link"]) || "",
  });
}

function imageUrl(card) {
  const key = `${card.setCode}|${card.number}`;
  if (card.imageUrl) return card.imageUrl;
  if (!card.setCode || card.game !== "mtg") return null;
  if (state.imageCache.has(key)) return state.imageCache.get(key);
  const url = `https://api.scryfall.com/cards/${encodeURIComponent(card.setCode.toLowerCase())}/${encodeURIComponent(card.number)}?format=image&version=normal`;
  state.imageCache.set(key, url);
  return url;
}

function renderStats() {
  const visibleCards = state.selectedFolder ? state.cards.filter((card) => card.folder === state.selectedFolder) : state.cards;
  const totalCopies = visibleCards.reduce((sum, card) => sum + card.quantity, 0);
  const totalValue = visibleCards.reduce((sum, card) => sum + card.quantity * card.price, 0);
  $("card-count").textContent = visibleCards.length.toLocaleString();
  $("copy-count").textContent = totalCopies.toLocaleString();
  $("collection-value").textContent = currency.format(totalValue);
  $("set-count").textContent = new Set(visibleCards.map((card) => card.set)).size.toLocaleString();
}

function priceLabel(card) {
  if (card.priceSource === "Cardmarket base print estimate") return "Cardmarket base-print estimate";
  if (card.priceSource.startsWith("Cardmarket")) return "Cardmarket price";
  if (card.priceSource === "Sold comps median") return "Your sold comps median";
  if (card.priceSource === "PriceCharting") return "PriceCharting (sold, ungraded)";
  if (card.priceSource === "YGOPRODeck estimate") return "Price estimate";
  if (card.priceSource === "TCGplayer estimate") return "TCGplayer estimate";
  if (!isEnglishLanguage(card)) return "Language not supported";
  if (isFirstEdition(card) || isShadowless(card)) return "Exact variant unavailable";
  return "No live market price";
}

function cardmarketUrl(card) {
  const sections = { mtg: "Magic", pok: "Pokemon", ygo: "YuGiOh" };
  const section = sections[card.game] || "Magic";
  // Cardmarket's search only matches product names; adding set codes, numbers or rarity
  // returns zero results. Search by name and pick the printing (expansion) from the list.
  // Edition/language/condition filters only work on the product page, not on search.
  const params = new URLSearchParams({ searchString: card.name });
  return `https://www.cardmarket.com/en/${section}/Products/Search?${params.toString()}`;
}

function ebaySoldSearchUrl(card) {
  const search = [card.name, card.setCode, card.number, card.printing, card.language]
    .filter((value) => value && value !== "Unknown")
    .join(" ");
  const params = new URLSearchParams({
    _nkw: search,
    LH_Sold: "1",
    LH_Complete: "1"
  });
  return `https://www.ebay.com/sch/i.html?${params.toString()}`;
}

function safeHttpUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function formatCompPrice(price, currencyCode) {
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: currencyCode
    }).format(price);
  } catch {
    return `${currencyCode} ${Number(price).toFixed(2)}`;
  }
}

function median(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

// EUR-based FX rates (1 EUR = rate units of currency). Fallbacks keep estimates usable offline.
const FALLBACK_EUR_RATES = { EUR: 1, USD: 1.09, GBP: 0.85, JPY: 165, CAD: 1.5, AUD: 1.65, CHF: 0.94 };
let fxRatesPromise = null;

function loadFxRates() {
  if (!fxRatesPromise) {
    fxRatesPromise = fetch("https://api.frankfurter.app/latest?from=EUR")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => { if (data?.rates) state.fxRates = { ...FALLBACK_EUR_RATES, ...data.rates, EUR: 1 }; })
      .catch(() => {});
  }
  return fxRatesPromise;
}

function toEur(amount, currencyCode) {
  const rate = (state.fxRates || FALLBACK_EUR_RATES)[currencyCode];
  return rate ? Number(amount) / rate : null;
}

// Your own sold comps beat any API estimate. The API estimate is stashed so it comes
// back if every comp is removed.
function applySoldComps(card) {
  const eurValues = (card.soldComps || []).map((comp) => toEur(comp.price, comp.currency || "EUR")).filter((value) => value > 0);
  if (eurValues.length) {
    if (card.priceSource !== "Sold comps median") card.estimate = { price: card.price, source: card.priceSource };
    card.price = Math.round(median(eurValues) * 100) / 100;
    card.priceSource = "Sold comps median";
  } else if (card.priceSource === "Sold comps median") {
    card.price = card.estimate?.price || 0;
    card.priceSource = card.estimate?.source || "Awaiting prices";
    card.estimate = null;
  }
}

function renderSoldComps(card) {
  const comps = Array.isArray(card.soldComps) ? card.soldComps : [];
  if (!comps.length) return '<p class="text-xs text-slate-500">No sold comps recorded yet.</p>';
  const byCurrency = new Map();
  comps.forEach((comp) => {
    const currencyCode = /^[A-Z]{3}$/.test(comp.currency) ? comp.currency : "EUR";
    if (!byCurrency.has(currencyCode)) byCurrency.set(currencyCode, []);
    byCurrency.get(currencyCode).push(Number(comp.price));
  });
  const summary = [...byCurrency.entries()].map(([currencyCode, prices]) =>
    `<span>${prices.length} ${escapeHtml(currencyCode)} sale${prices.length === 1 ? "" : "s"} · median ${escapeHtml(formatCompPrice(median(prices), currencyCode))}</span>`
  ).join('<span class="mx-2 text-slate-700">·</span>');
  const recent = comps.slice().sort((a, b) => String(b.soldAt).localeCompare(String(a.soldAt))).slice(0, 5);
  return `
    <p class="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-mono text-lime-300">${summary}</p>
    <ul class="space-y-2">${recent.map((comp) => {
      const currencyCode = /^[A-Z]{3}$/.test(comp.currency) ? comp.currency : "EUR";
      const url = safeHttpUrl(comp.url);
      return `<li class="flex items-start justify-between gap-2 rounded-lg bg-slate-950/70 px-3 py-2 text-xs">
        <span><strong class="text-slate-100">${escapeHtml(formatCompPrice(Number(comp.price), currencyCode))}</strong><span class="ml-2 text-slate-400">${escapeHtml(comp.marketplace || "Other")} · ${escapeHtml(comp.soldAt || "Date unknown")}${comp.condition ? ` · ${escapeHtml(comp.condition)}` : ""}</span>${url ? `<a class="ml-2 text-violet-300 underline" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Source</a>` : ""}</span>
        <button type="button" class="text-slate-500 hover:text-pink-300" data-remove-sold-comp="${escapeHtml(comp.id)}" aria-label="Remove sold comp">×</button>
      </li>`;
    }).join("")}</ul>`;
}

function renderSets() {
  const sets = [...new Set(state.cards.map((card) => card.set))].sort();
  $("set-filter").innerHTML = '<option value="">All sets</option>' + sets.map((set) => `<option>${escapeHtml(set)}</option>`).join("");
}

function renderFolders() {
  const counts = new Map();
  state.cards.forEach((card) => counts.set(card.folder, (counts.get(card.folder) || 0) + card.quantity));
  const folders = [...counts.keys()].sort();
  const tab = (value, label, count) => `
    <button class="rounded-full border px-3.5 py-2 font-mono text-xs transition hover:-translate-y-0.5 ${state.selectedFolder === value ? "border-violet-400 bg-violet-600 text-white shadow-lg shadow-violet-500/20" : "border-slate-800 bg-slate-900/85 text-slate-400 hover:border-violet-500 hover:text-slate-100"}" type="button" data-folder="${escapeHtml(value)}">
      ${escapeHtml(label)}<span class="ml-1.5 opacity-70">${count.toLocaleString()}</span>
    </button>`;
  $("folder-nav").innerHTML = tab("", "All cards", state.cards.reduce((sum, card) => sum + card.quantity, 0))
    + folders.map((folder) => tab(folder, folder, counts.get(folder))).join("");
}

function updateRemoveButton() {
  $("remove-collection").disabled = state.cards.length === 0;
  $("export-json").disabled = state.cards.length === 0;
  $("export-csv").disabled = state.cards.length === 0;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

function cardImage(card) {
  const url = imageUrl(card);
  return url ? `<img class="absolute inset-0 h-full w-full object-cover" src="${url}" alt="" loading="lazy" onload="this.nextElementSibling.classList.add('hidden')" onerror="this.remove(); this.nextElementSibling.classList.remove('hidden')">` : "";
}

function renderCards() {
  const query = $("search").value.trim().toLowerCase();
  const selectedSet = $("set-filter").value;
  const sort = $("sort").value;
  state.filtered = state.cards.filter((card) => {
    const haystack = `${card.name} ${card.set} ${card.number} ${card.rarity}`.toLowerCase();
    return (!state.selectedFolder || card.folder === state.selectedFolder)
      && (!query || haystack.includes(query)) && (!selectedSet || card.set === selectedSet);
  }).sort((a, b) => {
    if (sort === "value") return b.price * b.quantity - a.price * a.quantity;
    if (sort === "quantity") return b.quantity - a.quantity;
    if (sort === "set") return a.set.localeCompare(b.set) || a.name.localeCompare(b.name);
    return a.name.localeCompare(b.name);
  });
  $("results-count").textContent = `${state.filtered.length.toLocaleString()} unique cards`;
  $("empty-state").hidden = state.filtered.length > 0;
  $("card-grid").innerHTML = state.filtered.map((card, index) => {
    const hasImage = Boolean(imageUrl(card));
    return `
    <article class="card group min-w-0 cursor-pointer overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-800/95 to-slate-950/95 shadow-lg shadow-black/20 transition hover:-translate-y-1 hover:border-slate-600 hover:shadow-2xl hover:shadow-black/40" data-index="${index}" tabindex="0" role="button" aria-label="View ${escapeHtml(card.name)}">
      <div class="relative aspect-[5/7] overflow-hidden bg-gradient-to-br from-violet-950 to-blue-950">
        ${cardImage(card)}
        <div class="${hasImage ? "hidden " : ""}absolute inset-0 grid place-items-center p-5 text-center text-xl leading-none tracking-tight text-violet-100">${escapeHtml(card.name)}</div>
        <span class="absolute right-2 top-2 rounded-full bg-lime-300 px-2 py-1 font-mono text-[11px] font-medium text-slate-950">×${card.quantity}</span>
      </div>
      <div class="p-3.5">
        <h2 class="truncate text-[17px] leading-tight" title="${escapeHtml(card.name)}">${escapeHtml(card.name)}</h2>
        <div class="mt-1 font-mono text-[11px] text-slate-500">${escapeHtml(card.set)} · ${escapeHtml(card.number)} · ${escapeHtml(card.condition)} · ${escapeHtml(card.printing)}</div>
        <div class="mt-5 flex items-end justify-between gap-2"><div><span class="mb-1 block font-mono text-[9px] uppercase tracking-[.08em] text-slate-500">${priceLabel(card)}</span><span class="font-mono text-lg">${currency.format(card.price)}</span></div><span class="font-mono text-[11px] text-emerald-300">${currency.format(card.price * card.quantity)} total</span></div>
      </div>
    </article>`;
  }).join("");
}

function openCard(card, show = true) {
  state.activeCard = card;
  const url = imageUrl(card);
  $("dialog-content").innerHTML = `
    <div class="grid min-h-[360px] grid-cols-1 sm:grid-cols-[40%_1fr]">
      <div class="flex items-start justify-center bg-slate-950 p-6 sm:p-8">${url ? `<img class="w-full max-w-[240px] rounded-[4.5%/3.2%] object-contain shadow-2xl shadow-black/60 sm:sticky sm:top-1/2 sm:max-w-[300px] sm:-translate-y-1/2" src="${url}" alt="${escapeHtml(card.name)}">` : `<div class="aspect-[63/88] w-full max-w-[240px] rounded-xl border border-dashed border-slate-700"></div>`}</div>
      <div class="p-7 sm:p-9">
        <p class="mb-3 font-mono text-[11px] uppercase tracking-[.08em] text-violet-300">${escapeHtml(card.set)} · ${escapeHtml(card.number)}</p>
        <h2 class="mb-2 text-3xl font-semibold tracking-tight">${escapeHtml(card.name)}</h2>
        <p class="mb-7 text-slate-400">${escapeHtml(card.rarity)} · ${escapeHtml(card.printing)} · ${escapeHtml(card.condition)} · ${escapeHtml(card.language)}</p>
        <dl class="mb-7 grid grid-cols-2 gap-3">
          <div class="border-t border-slate-800 pt-2"><dt class="font-mono text-[10px] uppercase text-slate-500">Copies</dt><dd class="mt-1">${card.quantity}</dd></div>
          <div class="border-t border-slate-800 pt-2"><dt class="font-mono text-[10px] uppercase text-slate-500">${priceLabel(card)}</dt><dd class="mt-1">${currency.format(card.price)} each</dd></div>
          <div class="border-t border-slate-800 pt-2"><dt class="font-mono text-[10px] uppercase text-slate-500">Collection value</dt><dd class="mt-1">${currency.format(card.price * card.quantity)}</dd></div>
          <div class="border-t border-slate-800 pt-2"><dt class="font-mono text-[10px] uppercase text-slate-500">Purchase price</dt><dd class="mt-1">${currency.format(card.bought)} each</dd></div>
          ${card.referencePrice ? `<div class="col-span-2 border-t border-slate-800 pt-2"><dt class="font-mono text-[10px] uppercase text-slate-500">Source price (before EUR conversion)</dt><dd class="mt-1">${escapeHtml(formatCompPrice(card.referencePrice.amount, card.referencePrice.currency))} <span class="text-xs text-slate-400">${escapeHtml(card.referencePrice.source)}${card.referencePrice.note ? ` · ${escapeHtml(card.referencePrice.note)}` : ""}</span></dd></div>` : ""}
        </dl>
        <div class="mb-3 flex flex-wrap items-center gap-2">
          <span class="mr-1 font-mono text-[10px] uppercase tracking-[.08em] text-slate-500">Copies</span>
          <button class="h-10 w-10 rounded-xl border border-slate-700 bg-slate-800 text-lg text-slate-200 transition hover:border-violet-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-40" type="button" data-card-action="decrease" ${card.quantity <= 1 ? "disabled" : ""} aria-label="Remove one copy">−</button>
          <span class="min-w-8 text-center font-mono text-lg">${card.quantity}</span>
          <button class="h-10 w-10 rounded-xl border border-lime-300 bg-lime-300 text-lg text-slate-950 transition hover:bg-lime-200" type="button" data-card-action="increase" aria-label="Add one copy">+</button>
          <button class="ml-auto rounded-xl border border-pink-400/30 bg-pink-900/20 px-3 py-2 text-sm font-semibold text-pink-300 transition hover:bg-pink-900/40" type="button" data-card-action="delete">Delete card</button>
        </div>
        <form id="card-details-form" class="mt-6 grid gap-3 sm:grid-cols-2" data-card-action="save">
          <label class="text-xs text-slate-400">Quantity
            <input name="quantity" type="number" min="1" step="1" value="${card.quantity}" class="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" />
          </label>
          <label class="text-xs text-slate-400">Condition
            <input name="condition" value="${escapeHtml(card.condition)}" class="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" />
          </label>
          <label class="text-xs text-slate-400">Finish / printing
            <input name="printing" value="${escapeHtml(card.printing)}" class="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" />
          </label>
          <label class="text-xs text-slate-400">Language
            <input name="language" value="${escapeHtml(card.language)}" class="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" />
          </label>
          <label class="text-xs text-slate-400">Purchase price
            <input name="bought" type="number" min="0" step="0.01" value="${Number(card.bought) || 0}" class="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" />
          </label>
          <label class="text-xs text-slate-400">Purchase date
            <input name="purchaseDate" type="date" value="${escapeHtml(card.purchaseDate || "")}" class="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" />
          </label>
          <label class="text-xs text-slate-400">Storage location
            <input name="storageLocation" value="${escapeHtml(card.storageLocation || "")}" placeholder="Binder 1 · Page 12" class="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" />
          </label>
          <label class="text-xs text-slate-400">Folder
            <input name="folder" value="${escapeHtml(card.folder || "")}" class="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" />
          </label>
          <label class="text-xs text-slate-400 sm:col-span-2">Notes
            <textarea name="notes" rows="3" class="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100">${escapeHtml(card.notes || "")}</textarea>
          </label>
          <button class="sm:col-span-2 rounded-xl bg-lime-300 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-lime-200" type="submit">Save card details</button>
        </form>
        <a class="inline-block rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 px-4 py-3 text-sm font-semibold text-white" href="${cardmarketUrl(card)}" target="_blank" rel="noopener">Open on Cardmarket ↗</a>
        ${safeHttpUrl(card.priceUrl || "") ? `<a class="ml-2 inline-block rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-semibold text-slate-200 hover:border-violet-400" href="${escapeHtml(safeHttpUrl(card.priceUrl))}" target="_blank" rel="noopener noreferrer">PriceCharting ↗</a>` : ""}
        <details class="group mt-7 border-t border-slate-800 pt-5" ${card.soldComps?.length ? "open" : ""}>
          <summary class="cursor-pointer list-none text-sm text-slate-400 hover:text-slate-200"><span class="inline-block transition group-open:rotate-90">›</span> Override with your own sales <span class="text-slate-500">(optional)</span></summary>
          <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p class="text-[11px] text-slate-500">Prices are estimated automatically. Only add sales here if you want to override that; their median (in EUR) becomes the card's value.</p>
            <a class="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-violet-400" href="${ebaySoldSearchUrl(card)}" target="_blank" rel="noopener noreferrer">Search eBay sold ↗</a>
          </div>
          <div class="mt-3">${renderSoldComps(card)}</div>
          <form id="sold-comp-form" class="mt-4 grid gap-2 sm:grid-cols-2">
            <label class="text-xs text-slate-400">Sold price *
              <input name="price" type="number" min="0.01" step="0.01" required class="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" />
            </label>
            <label class="text-xs text-slate-400">Currency
              <select name="currency" class="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"><option>EUR</option><option>USD</option><option>GBP</option></select>
            </label>
            <label class="text-xs text-slate-400">Sold date *
              <input name="soldAt" type="date" max="${new Date().toISOString().slice(0, 10)}" required class="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" />
            </label>
            <label class="text-xs text-slate-400">Marketplace
              <select name="marketplace" class="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"><option>eBay</option><option>TCGplayer</option><option>Cardmarket</option><option>Other</option></select>
            </label>
            <label class="text-xs text-slate-400 sm:col-span-2">Sale link (optional)
              <input name="url" type="url" placeholder="https://…" class="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" />
            </label>
            <label class="text-xs text-slate-400 sm:col-span-2">Sale condition / notes (optional)
              <input name="condition" maxlength="160" placeholder="Near Mint · English · 1st Edition" class="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" />
            </label>
            <button type="submit" class="sm:col-span-2 rounded-lg bg-lime-300 px-3 py-2.5 text-sm font-semibold text-slate-950">Save sold comp</button>
          </form>
        </details>
      </div>
    </div>`;
  if (show) $("card-dialog").showModal();
}

function showError(message) {
  $("error-state").textContent = message;
  $("error-state").hidden = false;
}

function renderAll() {
  renderStats();
  renderSets();
  renderFolders();
  renderCards();
  updateRemoveButton();
}

function refreshCollectionView() {
  if (state.selectedFolder && !state.cards.some((card) => card.folder === state.selectedFolder)) state.selectedFolder = "";
  saveCollection();
  renderAll();
}

// Replaces the whole collection (restored, imported, or the repo default).
function setCollection(cards, filename, label, status) {
  state.priceCache.clear();
  state.imageCache.clear();
  state.cards = cards;
  state.filename = filename;
  state.selectedFolder = "";
  state.cards.forEach(applySoldComps);
  $("error-state").hidden = true;
  saveCollection();
  renderAll();
  $("file-name").textContent = label;
  $("price-status").textContent = status;
  loadCardImages();
}

async function loadCollection() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch (error) {
    // Never delete stored data on a read error; it may still be recoverable.
    showError(`Could not read the saved collection (${error.message}). It was left untouched.`);
    return;
  }
  if (saved) {
    const { cards, filename } = Model.migrateCollection(saved);
    setCollection(cards, filename, `${filename} · saved in this browser`, "Saved collection restored · press Update prices to refresh");
    return;
  }
  // First visit in this browser: start from the collection in the repo.
  try {
    const response = await fetch("./data/cards.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const { cards } = Model.migrateCollection(await response.json());
    setCollection(cards, "My card collection", "My card collection · saved in this browser", "Press Update prices to fetch prices");
  } catch {
    $("results-count").textContent = "Drop a CSV export to load your collection";
  }
}

function saveCollection() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ filename: state.filename, cards: state.cards.map(Model.normalizeCard) }));
  } catch (error) {
    showError(`Could not save the collection in this browser: ${error.message}`);
  }
}

function downloadFile(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportJson() {
  if (!state.cards.length) return;
  const collection = { filename: state.filename || "CardVault collection", cards: state.cards.map(Model.normalizeCard) };
  downloadFile("cardvault-collection.json", JSON.stringify(collection, null, 2), "application/json");
}

function csvCell(value) {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function exportCsv() {
  if (!state.cards.length) return;
  const headers = [
    "Card Name", "Collection", "Set Name", "Set Code", "Card Number",
    "Quantity", "Condition", "Rarity", "Printing", "Language",
    "Market Price", "Purchase Price", "Purchase Date", "Storage Location",
    "Folder", "Notes", "Image URL"
  ];
  const rows = state.cards.map((card) => [
    card.name, card.game, card.set, card.setCode, card.number,
    card.quantity, card.condition, card.rarity, card.printing, card.language,
    card.price, card.bought, card.purchaseDate, card.storageLocation,
    card.folder, card.notes, card.imageUrl
  ]);
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  downloadFile("cardvault-collection.csv", "﻿" + csv, "text/csv;charset=utf-8");
}

function importFile(file) {
  if (!file) return;
  file.text().then((text) => {
    if (/\.json$/i.test(file.name)) {
      const { cards } = Model.migrateCollection(JSON.parse(text));
      setCollection(cards, file.name, `${file.name} · imported`, `Imported ${cards.length.toLocaleString()} cards · press Update prices to refresh`);
    } else {
      const cards = mergeDuplicateCards(parseCsv(text).map(normalise));
      setCollection(cards, file.name, `${file.name} · duplicates merged automatically`, `Loaded ${cards.length.toLocaleString()} unique cards · press Update prices to refresh`);
    }
  }).catch((error) => showError(`Could not import ${file.name}: ${error.message}`));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchCardmarketPrices(cards) {
  const response = await fetch("https://api.scryfall.com/cards/collection", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ identifiers: cards.map((card) => ({ set: card.setCode.toLowerCase(), collector_number: card.number })) }),
  });
  if (!response.ok) throw new Error(`Cardmarket lookup failed (${response.status}).`);
  const result = await response.json();
  result.data.forEach((card) => state.priceCache.set(`${card.set}|${card.collector_number}`, card.prices));
}

function pokemonName(name) {
  const symbols = { Fg: "Fighting", Gr: "Grass", Fr: "Fire", Fw: "Water", Fl: "Lightning", Fp: "Psychic", Fd: "Darkness", Fm: "Metal", Fc: "Colorless" };
  return name.replace(/\{([^}]+)\}/g, (_, symbol) => symbols[symbol] || symbol);
}

function pokemonNumber(value) {
  return value.replace(/^0+/, "") || "0";
}

function normalizedSetName(value) {
  return value.toLowerCase().replace(/é/g, "e").replace(/ies\b/g, "y").replace(/[^a-z0-9]/g, "");
}

function isFirstEdition(card) {
  return /(^|\s)1st(\s|-)?edition|first(\s|-)?edition/i.test(card.printing);
}

function isShadowless(card) {
  return /shadowless/i.test(`${card.set} ${card.printing} ${card.setCode}`);
}

function isHoloVariant(card) {
  return /foil|holo|reverse/i.test(card.printing);
}

function isEnglishLanguage(card) {
  const language = String(card.language || "").trim().toLowerCase();
  return !language || language === "unknown" || ["en", "eng", "english"].includes(language);
}

function pokemonSetMatches(details, card) {
  const expected = normalizedSetName(card.set);
  const actual = normalizedSetName(details.set?.name || "");
  if (actual === expected || actual.includes(expected) || expected.includes(actual)) return true;
  return isShadowless(card) && normalizedSetName(card.set.replace(/\bshadowless\b/i, "")) === actual;
}

function pokemonCandidateScore(candidate, card) {
  const id = candidate.id.toLowerCase();
  const code = card.setCode.toLowerCase();
  const numberMatches = pokemonNumber(candidate.localId) === pokemonNumber(card.number);
  return (id.startsWith(`${code}-`) ? 100 : 0) + (numberMatches ? 20 : 0);
}

function tcgdexAssetUrl(id) {
  const [setId, localId] = id.split(/-(.+)/);
  const category = ["base", "gym", "neo", "ex", "dp", "pl", "hgss", "bw", "xy", "sm", "swsh", "sv", "me"]
    .find((prefix) => setId.startsWith(prefix)) || setId;
  return `https://assets.tcgdex.net/en/${category}/${setId}/${localId}/low.webp`;
}

function pokemonEnergyImage(name) {
  const typeNumbers = { Grass: 1, Fire: 2, Water: 3, Lightning: 4, Psychic: 5, Fighting: 6, Darkness: 7, Metal: 8 };
  const type = Object.keys(typeNumbers).find((energyType) => pokemonName(name).includes(energyType));
  return type ? `https://images.pokemontcg.io/sve/${typeNumbers[type]}.png` : null;
}

async function fetchPokemonPrice(card) {
  if (!isEnglishLanguage(card)) return null;
  const search = await fetch(`https://api.tcgdex.net/v2/en/cards?name=${encodeURIComponent(pokemonName(card.name))}`);
  if (!search.ok) throw new Error(`Pokémon lookup failed for ${card.name} (${search.status}).`);
  const candidates = await search.json();
  const matches = candidates
    .filter((candidate) => pokemonNumber(candidate.localId) === pokemonNumber(card.number))
    .sort((a, b) => pokemonCandidateScore(b, card) - pokemonCandidateScore(a, card));
  for (const candidate of matches) {
    const detailsResponse = await fetch(`https://api.tcgdex.net/v2/en/cards/${encodeURIComponent(candidate.id)}`);
    if (!detailsResponse.ok) continue;
    const details = await detailsResponse.json();
    if (!pokemonSetMatches(details, card)) continue;
    if (isFirstEdition(card)) {
      // TCGplayer prices are USD: convert to EUR for the estimate, keep the original as reference.
      const usd = Number(details.pricing?.tcgplayer?.["1st-edition"]?.marketPrice);
      return usd > 0
        ? { price: toEur(usd, "USD"), source: "TCGplayer estimate", reference: { amount: usd, currency: "USD", source: "TCGplayer market (via TCGdex)", note: "1st Edition, condition not specified" } }
        : null;
    }
    const pricing = details.pricing?.cardmarket;
    if (isShadowless(card)) {
      const estimate = pricing?.avg || pricing?.trend || null;
      return estimate ? { price: estimate, source: "Cardmarket base print estimate" } : null;
    }
    return isHoloVariant(card) ? pricing?.["avg-holo"] || pricing?.avg : pricing?.avg || pricing?.trend || null;
  }
  return null;
}

async function fetchYugiohPrice(card) {
  if (!isEnglishLanguage(card)) return null;
  const response = await fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?name=${encodeURIComponent(card.name)}`);
  if (!response.ok) throw new Error(`Yu-Gi-Oh! lookup failed for ${card.name} (${response.status}).`);
  const result = await response.json();
  const expectedRarity = String(card.rarity || "").trim().toLowerCase();
  const match = result.data?.[0]?.card_sets?.find((set) => String(set.set_code).trim().toLowerCase() === String(card.number).trim().toLowerCase()
    && (!expectedRarity || expectedRarity === "unknown" || String(set.set_rarity).trim().toLowerCase() === expectedRarity));
  if (!match) return null;
  // Don't use card_prices[].cardmarket_price: it's one value for the card name across every
  // printing (e.g. €0.02 for Blue-Eyes). set_price is per set code + rarity (USD), so it's
  // the best free guess for this printing. It ignores edition/condition; sold comps override it.
  const usd = Number(match.set_price);
  return usd > 0
    ? { price: toEur(usd, "USD"), source: "YGOPRODeck estimate", reference: { amount: usd, currency: "USD", source: "YGOPRODeck set price", note: "Per printing & rarity; ignores edition and condition" } }
    : null;
}

async function resolveCardImage(card) {
  if (card.game === "mtg") return;
  try {
    if (card.game === "ygo") {
      const response = await fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?name=${encodeURIComponent(card.name)}`);
      if (!response.ok) return;
      const result = await response.json();
      const match = result.data?.[0]?.card_sets?.some((set) => set.set_code === card.number);
      if (match) card.imageUrl = result.data[0].card_images?.[0]?.image_url;
      return;
    }
    if (card.game === "pok") {
      const search = await fetch(`https://api.tcgdex.net/v2/en/cards?name=${encodeURIComponent(pokemonName(card.name))}`);
      if (!search.ok) return;
      const candidates = await search.json();
      const match = candidates
        .filter((candidate) => pokemonNumber(candidate.localId) === pokemonNumber(card.number) || candidate.id.toLowerCase().startsWith(`${card.setCode.toLowerCase()}-`))
        .sort((a, b) => pokemonCandidateScore(b, card) - pokemonCandidateScore(a, card))[0];
      if (!match) {
        card.imageUrl = pokemonEnergyImage(card.name);
        return;
      }
      const detailsResponse = await fetch(`https://api.tcgdex.net/v2/en/cards/${encodeURIComponent(match.id)}`);
      if (detailsResponse.ok) {
        const image = (await detailsResponse.json()).image;
        card.imageUrl = image ? `${image.replace(/\/$/, "")}/low.webp` : pokemonEnergyImage(card.name) || tcgdexAssetUrl(match.id);
      }
    }
  } catch (error) {
    console.warn(`Image lookup failed for ${card.name}: ${error.message}`);
  }
}

async function loadCardImages() {
  const cards = state.cards.filter((card) => card.game !== "mtg" && !card.imageUrl);
  for (let index = 0; index < cards.length; index += 5) {
    await Promise.all(cards.slice(index, index + 5).map(resolveCardImage));
    renderCards();
    saveCollection();
  }
}

// fetchYugiohPrice/fetchPokemonPrice return either a bare EUR number or
// { price, source, reference }.
function applyPriceResult(card, result, label) {
  const isObject = result && typeof result === "object";
  const price = isObject ? result.price : result;
  if (price) {
    card.price = Math.round(Number(price) * 100) / 100;
    card.priceSource = isObject && result.source ? result.source : `Cardmarket via ${label}`;
  }
  card.referencePrice = isObject ? result.reference || null : null;
}

// Prices one card straight away (used when the scanner adds a card).
async function priceSingleCard(card) {
  try {
    await loadFxRates();
    if (card.game === "mtg") {
      await fetchCardmarketPrices([card]);
      const prices = state.priceCache.get(`${card.setCode.toLowerCase()}|${card.number}`);
      const eur = /foil/i.test(card.printing) ? prices?.eur_foil || prices?.eur : prices?.eur;
      if (eur) {
        card.price = Number(eur);
        card.priceSource = "Cardmarket";
      }
    } else if (card.game === "ygo") {
      applyPriceResult(card, await fetchYugiohPrice(card), "YGOPRODeck");
      applyPriceChartingPrices(await loadPriceChartingPrices(), [card]);
    } else if (card.game === "pok") {
      applyPriceResult(card, await fetchPokemonPrice(card), "TCGdex");
    }
    applySoldComps(card);
  } catch (error) {
    console.warn(`Price lookup failed for ${card.name}: ${error.message}`);
  }
}

async function updatePublicPrices(cards, fetchPrice, label) {
  let checked = 0;
  for (let index = 0; index < cards.length; index += 5) {
    const batch = cards.slice(index, index + 5);
    await Promise.all(batch.map(async (card) => {
      try {
        const result = await fetchPrice(card);
        state.cards
          .filter((item) => item.game === card.game
            && item.name === card.name
            && item.setCode === card.setCode
            && item.number === card.number
            && item.printing === card.printing)
          .forEach((item) => applyPriceResult(item, result, label));
      } catch (error) {
        console.warn(error.message);
      }
    }));
    checked += batch.length;
    renderStats();
    renderCards();
    $("price-status").textContent = `Checking prices… ${checked}/${cards.length}`;
    saveCollection();
    await sleep(100);
  }
}

// data/prices.json is written by scripts/pricecharting.mjs (sold-based, ungraded, USD).
// It's per printing and edition, so it beats the YGOPRODeck set_price estimate.
async function loadPriceChartingPrices() {
  try {
    const response = await fetch("./data/prices.json", { cache: "no-store" });
    if (!response.ok) return {};
    return (await response.json()).prices || {};
  } catch {
    return {};
  }
}

function applyPriceChartingPrices(prices, cards = state.cards) {
  cards.forEach((card) => {
    if (card.game !== "ygo" || !card.number) return;
    const entry = prices[`ygo|${card.number.trim().toLowerCase()}|${isFirstEdition(card) ? "1st" : "unl"}`];
    const eur = entry?.usd ? toEur(entry.usd, "USD") : null;
    if (!eur) return;
    card.price = Math.round(eur * 100) / 100;
    card.priceSource = "PriceCharting";
    card.priceUrl = entry.url;
    card.referencePrice = { amount: entry.usd, currency: "USD", source: "PriceCharting ungraded", note: [entry.note, `updated ${String(entry.fetchedAt || "").slice(0, 10)}`].filter(Boolean).join(" · ") };
  });
}

async function checkLivePrices() {
  if (state.checkingPrices || !state.cards.length) return;
  state.checkingPrices = true;
  const button = $("refresh-prices");
  button.disabled = true;
  await loadFxRates();
  state.cards.forEach((card) => {
    card.price = 0;
    card.priceSource = "Awaiting prices";
    card.referencePrice = null;
    card.priceUrl = "";
    card.estimate = null;
  });
  const mtgCards = [...new Map(state.cards.filter((card) => card.game === "mtg" && isEnglishLanguage(card)).map((card) => [`${card.setCode}|${card.number}|${card.printing}`, card])).values()];
  let checked = 0;
  for (let index = 0; index < mtgCards.length; index += 75) {
    const batch = mtgCards.slice(index, index + 75);
    try {
      await fetchCardmarketPrices(batch);
      batch.forEach((card) => {
        const prices = state.priceCache.get(`${card.setCode.toLowerCase()}|${card.number}`);
        const livePrice = /foil/i.test(card.printing) ? prices?.eur_foil || prices?.eur : prices?.eur;
        if (livePrice) {
          state.cards.filter((item) => item.setCode === card.setCode && item.number === card.number && item.printing === card.printing)
            .forEach((item) => { item.price = Number(livePrice); item.priceSource = "Cardmarket"; });
        }
      });
    } catch (error) {
      console.warn(error.message);
    }
    checked += batch.length;
    renderStats();
    renderCards();
    $("price-status").textContent = `Checking prices… ${checked}/${mtgCards.length}`;
    saveCollection();
    await sleep(100);
  }
  const pokemonCards = [...new Map(state.cards.filter((card) => card.game === "pok").map((card) => [`${card.name}|${card.setCode}|${card.number}|${card.printing}`, card])).values()];
  await updatePublicPrices(pokemonCards, fetchPokemonPrice, "TCGdex");
  const yugiohCards = [...new Map(state.cards.filter((card) => card.game === "ygo").map((card) => [`${card.name}|${card.setCode}|${card.number}|${card.printing}`, card])).values()];
  await updatePublicPrices(yugiohCards, fetchYugiohPrice, "YGOPRODeck");
  applyPriceChartingPrices(await loadPriceChartingPrices());
  state.cards.forEach(applySoldComps);
  renderStats();
  renderCards();
  saveCollection();
  state.checkingPrices = false;
  button.disabled = false;
  const compCount = state.cards.filter((card) => card.priceSource === "Sold comps median").length;
  const pcCount = state.cards.filter((card) => card.priceSource === "PriceCharting").length;
  const liveCount = state.cards.filter((card) => card.priceSource.startsWith("Cardmarket")).length;
  const estimateCount = state.cards.filter((card) => card.priceSource.includes("estimate")).length;
  const pendingCount = state.cards.length - liveCount - estimateCount - compCount - pcCount;
  $("price-status").textContent = `${liveCount.toLocaleString()} Cardmarket · ${pcCount.toLocaleString()} PriceCharting · ${estimateCount.toLocaleString()} estimates · ${compCount.toLocaleString()} your sales · ${pendingCount.toLocaleString()} unpriced`;
}

["search", "set-filter", "sort"].forEach((id) => $(id).addEventListener("input", renderCards));
$("folder-nav").addEventListener("click", (event) => {
  const tab = event.target.closest("[data-folder]");
  if (!tab) return;
  state.selectedFolder = tab.dataset.folder;
  renderStats();
  renderFolders();
  renderCards();
});
$("card-grid").addEventListener("click", (event) => {
  const card = event.target.closest(".card");
  if (card) openCard(state.filtered[Number(card.dataset.index)]);
});
$("card-grid").addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") event.target.click();
});
$("close-dialog").addEventListener("click", () => $("card-dialog").close());
$("dialog-content").addEventListener("click", (event) => {
  const removeSoldComp = event.target.closest("[data-remove-sold-comp]");
  if (removeSoldComp && state.activeCard) {
    state.activeCard.soldComps = (state.activeCard.soldComps || [])
      .filter((comp) => comp.id !== removeSoldComp.dataset.removeSoldComp);
    applySoldComps(state.activeCard);
    refreshCollectionView();
    openCard(state.activeCard, false);
    return;
  }
  const action = event.target.closest("[data-card-action]");
  const card = state.activeCard;
  if (!action || !card) return;
  if (action.dataset.cardAction === "increase") {
    card.quantity += 1;
    refreshCollectionView();
    openCard(card, false);
  } else if (action.dataset.cardAction === "decrease") {
    card.quantity = Math.max(1, card.quantity - 1);
    refreshCollectionView();
    openCard(card, false);
  } else if (action.dataset.cardAction === "delete") {
    if (!window.confirm(`Delete ${card.name} from this collection?`)) return;
    state.cards = state.cards.filter((item) => item !== card);
    state.activeCard = null;
    refreshCollectionView();
    $("card-dialog").close();
  }
});
$("dialog-content").addEventListener("submit", (event) => {
  const soldCompForm = event.target.closest("#sold-comp-form");
  if (soldCompForm && state.activeCard) {
    event.preventDefault();
    const values = new FormData(soldCompForm);
    const price = Number(values.get("price"));
    const rawUrl = String(values.get("url") || "").trim();
    const url = rawUrl ? safeHttpUrl(rawUrl) : "";
    if (!Number.isFinite(price) || price <= 0) {
      $("price-status").textContent = "Enter a sold price greater than zero.";
      return;
    }
    if (rawUrl && !url) {
      $("price-status").textContent = "Sale link must use http or https.";
      return;
    }
    if (!Array.isArray(state.activeCard.soldComps)) state.activeCard.soldComps = [];
    state.activeCard.soldComps.push({
      id: `sold-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      price,
      currency: String(values.get("currency") || "EUR"),
      soldAt: String(values.get("soldAt") || ""),
      marketplace: String(values.get("marketplace") || "Other"),
      url,
      condition: String(values.get("condition") || "").trim()
    });
    applySoldComps(state.activeCard);
    refreshCollectionView();
    openCard(state.activeCard, false);
    $("price-status").textContent = "Sold comp saved · card value now uses your sold comps median.";
    return;
  }
  const form = event.target.closest("#card-details-form");
  if (!form || !state.activeCard) return;
  event.preventDefault();
  const values = new FormData(form);
  state.activeCard.quantity = Math.max(1, Number(values.get("quantity")) || 1);
  state.activeCard.condition = String(values.get("condition") || "Unknown").trim() || "Unknown";
  state.activeCard.printing = String(values.get("printing") || "Unknown").trim() || "Unknown";
  state.activeCard.language = String(values.get("language") || "Unknown").trim() || "Unknown";
  state.activeCard.bought = Math.max(0, Number(values.get("bought")) || 0);
  state.activeCard.purchaseDate = String(values.get("purchaseDate") || "").trim();
  state.activeCard.storageLocation = String(values.get("storageLocation") || "").trim();
  state.activeCard.folder = String(values.get("folder") || "Unsorted").trim() || "Unsorted";
  state.activeCard.notes = String(values.get("notes") || "").trim();
  refreshCollectionView();
  openCard(state.activeCard, false);
  $("price-status").textContent = "Card details saved in this browser";
});
$("refresh-prices").addEventListener("click", checkLivePrices);
$("choose-file").addEventListener("click", () => $("file-input").click());
$("export-json").addEventListener("click", exportJson);
$("export-csv").addEventListener("click", exportCsv);
$("remove-collection").addEventListener("click", () => {
  if (!window.confirm("Remove the saved collection from this browser?")) return;
  localStorage.removeItem(STORAGE_KEY);
  state.cards = [];
  state.filename = "";
  state.selectedFolder = "";
  state.imageCache.clear();
  state.priceCache.clear();
  renderAll();
  $("file-name").textContent = "Your collection is saved in this browser after upload.";
  $("price-status").textContent = "Collection removed";
});
$("file-input").addEventListener("change", (event) => {
  importFile(event.target.files[0]);
  event.target.value = ""; // allow re-importing the same file
});
const DRAG_CLASSES = ["border-violet-400", "bg-violet-950/40"];
$("upload-zone").addEventListener("dragover", (event) => {
  event.preventDefault();
  $("upload-zone").classList.add(...DRAG_CLASSES);
});
$("upload-zone").addEventListener("dragleave", () => $("upload-zone").classList.remove(...DRAG_CLASSES));
$("upload-zone").addEventListener("drop", (event) => {
  event.preventDefault();
  $("upload-zone").classList.remove(...DRAG_CLASSES);
  const file = [...event.dataTransfer.files].find((item) => /\.(csv|json)$/i.test(item.name));
  if (file) importFile(file);
  else showError("Please drop a CSV or JSON export.");
});
loadFxRates();
loadCollection();
