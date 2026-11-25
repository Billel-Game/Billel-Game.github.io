#!/usr/bin/env node
// Builds data/names/{mtg,pok,ygo}.json: every English card name per game.
// The scanner snaps OCR text to the closest real name from these lists, so garbled
// text can't turn into a random card. Re-run when new sets come out:
//   node scripts/build-name-lists.mjs

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "names");
const HEADERS = { "User-Agent": "CardVault/1.0 (personal collection tracker)", Accept: "application/json" };

async function getJson(url) {
  const response = await fetch(url, { headers: HEADERS });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

const unique = (names) => [...new Set(names.map((name) => String(name || "").trim()).filter(Boolean))].sort();

async function build(game, load) {
  const names = unique(await load());
  await writeFile(join(OUT, `${game}.json`), JSON.stringify(names));
  console.log(`${game}: ${names.length} names`);
}

await mkdir(OUT, { recursive: true });
// Double-faced Magic cards are listed as "Front // Back"; the front face is what's read.
// Digital-only Alchemy rebalances ("A-Name") can't be scanned, so they're left out.
await build("mtg", async () => (await getJson("https://api.scryfall.com/catalog/card-names")).data
  .filter((name) => !name.startsWith("A-"))
  .flatMap((name) => (name.includes(" // ") ? [name, ...name.split(" // ")] : [name])));
await build("pok", async () => (await getJson("https://api.tcgdex.net/v2/en/cards")).map((card) => card.name));
await build("ygo", async () => (await getJson("https://db.ygoprodeck.com/api/v7/cardinfo.php")).data.map((card) => card.name));
