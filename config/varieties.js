// Single source of truth for flower varieties. Edit this list to match your
// interview findings. Used by validators (what's allowed) and by the app (dropdown).
const VARIETIES = [
  "Roses",
  "Chrysanthemum",
  "Gladiolus",
  "Carnation",
  "Lilies",
  "Anthurium",
  "Gerbera",
  "Baby's Breath",
  "Sunflower",
  "Calla Lily",
  "Alstroemeria",
  "Statice",
  "Aster",
  "Snapdragon",
  "Lisianthus",
];

// "roses " / "ROSES" -> "Roses". Unknown names are returned trimmed, so the
// validator can reject them.
const canonicalVariety = (input) => {
  if (typeof input !== "string") return input;
  const t = input.trim().toLowerCase();
  return VARIETIES.find((v) => v.toLowerCase() === t) || input.trim();
};

module.exports = { VARIETIES, canonicalVariety };