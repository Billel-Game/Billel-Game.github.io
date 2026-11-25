(function () {
  "use strict";

  // Earlier versions stored these as the card's market price, but none of them is
  // an exact-printing EUR value: YGOPRODeck's set_price is a USD set-level figure that
  // ignores edition/condition, its cardmarket_price is the cheapest printing of the card
  // name, and TCGdex's TCGplayer price is USD. Clear them so they never feed totals.
  const UNTRUSTED_PRICE_SOURCES = new Set([
    "YGOPRODeck set estimate",
    "Cardmarket via YGOPRODeck",
    "TCGplayer 1st Edition estimate",
    "CSV export"
  ]);

  // Fields older versions wrote that nothing reads any more.
  const OBSOLETE_FIELDS = ["purchasePrice", "cardId", "printingId", "providerIds", "schemaVersion"];

  function normalizeReferencePrice(reference) {
    if (!reference || typeof reference !== "object" || !(Number(reference.amount) > 0)) return null;
    return {
      amount: Number(reference.amount),
      currency: /^[A-Z]{3}$/.test(reference.currency) ? reference.currency : "USD",
      source: String(reference.source || "Reference"),
      note: String(reference.note || "")
    };
  }

  function normalizeSoldComps(comps) {
    if (!Array.isArray(comps)) return [];
    return comps.filter((comp) => comp && Number(comp.price) > 0).map((comp, index) => ({
      id: String(comp.id || `sold-${index + 1}`),
      price: Number(comp.price),
      currency: /^[A-Z]{3}$/.test(comp.currency) ? comp.currency : "EUR",
      soldAt: String(comp.soldAt || ""),
      marketplace: String(comp.marketplace || "Other"),
      url: String(comp.url || ""),
      condition: String(comp.condition || "")
    }));
  }

  function normalizeCard(card) {
    const normalized = { ...card };
    if (UNTRUSTED_PRICE_SOURCES.has(normalized.priceSource)) {
      normalized.price = 0;
      normalized.priceSource = "Awaiting prices";
    }
    // Purchase price used to live in both `bought` and `purchasePrice`.
    normalized.bought = Math.max(0, Number(normalized.purchasePrice ?? normalized.bought) || 0);
    OBSOLETE_FIELDS.forEach((field) => delete normalized[field]);

    normalized.game = normalized.game || normalized.collection || "cards";
    normalized.name = normalized.name || normalized.cardName || "Unknown card";
    normalized.set = normalized.set || normalized.setName || "Unknown set";
    normalized.setCode = normalized.setCode || normalized.setId || "";
    normalized.number = normalized.number || normalized.collectorNumber || "";
    normalized.language = normalized.language || "unknown";
    normalized.printing = normalized.printing || normalized.finish || "unknown";
    normalized.condition = normalized.condition || "Unknown";
    normalized.rarity = normalized.rarity || "Unknown";
    normalized.quantity = Math.max(0, Number(normalized.quantity) || 0);
    normalized.price = Math.max(0, Number(normalized.price) || 0);
    normalized.priceSource = normalized.priceSource || "Awaiting prices";
    normalized.referencePrice = normalizeReferencePrice(normalized.referencePrice);
    normalized.storageLocation = normalized.storageLocation || "";
    normalized.purchaseDate = normalized.purchaseDate || "";
    normalized.notes = normalized.notes || "";
    normalized.soldComps = normalizeSoldComps(normalized.soldComps);
    normalized.folder = normalized.folder || "Unsorted";
    normalized.imageUrl = normalized.imageUrl || normalized.image || "";
    return normalized;
  }

  function migrateCollection(collection) {
    const cards = Array.isArray(collection) ? collection : collection?.cards;
    return {
      filename: (!Array.isArray(collection) && collection?.filename) || "CardVault collection",
      cards: Array.isArray(cards) ? cards.map(normalizeCard) : []
    };
  }

  window.CardVaultModel = { normalizeCard, migrateCollection };
})();
