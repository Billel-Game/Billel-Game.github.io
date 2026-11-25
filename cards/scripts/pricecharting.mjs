#!/usr/bin/env node
// Fetches ungraded (raw) sold-based prices from PriceCharting for Yu-Gi-Oh! cards
// and writes cards/data/prices.json, which CardVault applies on "Check prices".
//
// Usage (from the cards/ folder, Node 18+):
//   node scripts/pricecharting.mjs                       # uses data/cards.json
//   node scripts/pricecharting.mjs cardvault-collection.json   # an exported collection
//   node scripts/pricecharting.mjs --force               # refetch everything
//
// One search request per unique set code, spaced out to stay polite. Entries fetched
// within the last 3 days are reused unless --force is given.

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUTPUT = join(HERE, "..", "data", "prices.json");
const DEFAULT_INPUT = join(HERE, "..", "data", "cards.json");
const DELAY_MS = 1500;
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
const USER_AGENT = "Mozilla/5.0 (CardVault personal collection tracker)";

const args = process.argv.slice(2);
const force = args.includes("--force");
const inputPath = resolve(args.find((arg) => !arg.startsWith("--")) || DEFAULT_INPUT);

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const slug = (value) => String(value || "")
  .toLowerCase()
  .normalize("NFKD")
  .replace(/[̀-ͯ]/g, "")
  .replace(/['’"]/g, "")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");
const isFirstEdition = (card) => /(^|\s)1st(\s|-)?edition|first(\s|-)?edition/i.test(card.printing || "");
const isEnglish = (card) => ["", "unknown", "en", "eng", "english"].includes(String(card.language || "").trim().toLowerCase());
const priceKey = (code, firstEdition) => `ygo|${String(code).trim().toLowerCase()}|${firstEdition ? "1st" : "unl"}`;

function parseUsd(text) {
  const value = Number(String(text || "").replace(/[$,\s]/g, ""));
  return value > 0 ? value : null;
}

// Each row: { url, usd } where usd is PriceCharting's "Ungraded" price.
function parseSearchRows(html) {
  const rows = [];
  for (const [row] of html.matchAll(/<tr id="product-\d+"[\s\S]*?<\/tr>/g)) {
    const url = row.match(/<td class="title">\s*<a href="([^"]+)"/)?.[1];
    const usd = parseUsd(row.match(/class="price numeric used_price">\s*<span class="js-price">([^<]*)/)?.[1]);
    if (url) rows.push({ url, usd });
  }
  return rows;
}

// A search with a single hit redirects straight to the product page.
function parseProductPage(html, url) {
  const usd = parseUsd(html.match(/<td id="used_price"[\s\S]{0,400}?<span class="price js-price"[^>]*>\s*([^<]+)/)?.[1]);
  return [{ url, usd }];
}

// Product slugs look like ".../blue-eyes-white-dragon-1st-edition-sdk-001".
function pickRow(rows, card, firstEdition) {
  const code = slug(card.number);
  const name = slug(card.name);
  const candidates = rows
    .map((row) => {
      // Redirected URLs carry "?q=..." and encode apostrophes as %27.
      const last = new URL(row.url).pathname.split("/").pop() || "";
      const url = row.url.split("?")[0];
      return { ...row, url, rest: slug(decodeURIComponent(last)) };
    })
    .filter((row) => row.rest.endsWith(`-${code}`))
    .map((row) => ({ ...row, rest: row.rest.slice(0, -(code.length + 1)) }));
  const wantedName = firstEdition ? `${name}-1st-edition` : name;
  const exact = candidates.find((row) => row.rest === wantedName);
  if (exact) return exact;
  // Name spelled differently on PriceCharting: match on edition only, skip variants.
  return candidates.find((row) => row.rest.endsWith("-1st-edition") === firstEdition
    && !/misprint|error|sealed|lot|graded/.test(row.rest)) || null;
}

async function search(code) {
  const url = `https://www.pricecharting.com/search-products?type=prices&q=${encodeURIComponent(code)}`;
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const html = await response.text();
  return response.url.includes("/game/") ? parseProductPage(html, response.url) : parseSearchRows(html);
}

async function main() {
  const raw = JSON.parse(await readFile(inputPath, "utf8"));
  const cards = (Array.isArray(raw) ? raw : raw.cards || [])
    .filter((card) => (card.game || card.collection) === "ygo" && card.number && isEnglish(card));
  const existing = existsSync(OUTPUT) ? JSON.parse(await readFile(OUTPUT, "utf8")) : {};
  const prices = existing.prices || {};

  const byCode = new Map();
  for (const card of cards) {
    const code = card.number.trim().toUpperCase();
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code).push(card);
  }

  const now = Date.now();
  const todo = [...byCode.entries()].filter(([code, group]) => force || group.some((card) => {
    const entry = prices[priceKey(code, isFirstEdition(card))];
    return !entry?.usd || now - Date.parse(entry.fetchedAt) > MAX_AGE_MS;
  }));
  console.log(`${cards.length} Yu-Gi-Oh! cards · ${byCode.size} set codes · ${todo.length} to fetch`);

  let found = 0;
  let missed = 0;
  for (const [index, [code, group]] of todo.entries()) {
    try {
      const rows = await search(code);
      for (const card of group) {
        const firstEdition = isFirstEdition(card);
        // Some 1st Editions (e.g. structure decks) are only listed once, as unlimited.
        let row = pickRow(rows, card, firstEdition);
        let fallback = false;
        if (!row?.usd && firstEdition) {
          row = pickRow(rows, card, false);
          fallback = Boolean(row?.usd);
        }
        const key = priceKey(code, firstEdition);
        if (row?.usd) {
          prices[key] = { usd: row.usd, url: row.url, fetchedAt: new Date().toISOString(), ...(fallback ? { note: "No 1st Edition listing; unlimited price" } : {}) };
          found += 1;
        } else {
          missed += 1;
          console.log(`  no price: ${card.name} ${code}${firstEdition ? " (1st)" : ""}`);
        }
      }
    } catch (error) {
      console.warn(`  ${code}: ${error.message}`);
    }
    process.stdout.write(`\r${index + 1}/${todo.length}`);
    // Save as we go so an interrupted run keeps its progress.
    if ((index + 1) % 10 === 0) await save(prices);
    await sleep(DELAY_MS);
  }
  await save(prices);
  console.log(`\nDone: ${found} priced, ${missed} not found → ${OUTPUT}`);
}

async function save(prices) {
  const output = { source: "PriceCharting", currency: "USD", condition: "Ungraded", generatedAt: new Date().toISOString(), prices };
  await writeFile(OUTPUT, JSON.stringify(output, null, 2) + "\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
