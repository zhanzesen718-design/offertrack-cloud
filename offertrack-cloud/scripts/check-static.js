const fs = require("node:fs");
const path = require("node:path");

const requiredFiles = [
  "index.html",
  "styles.css",
  "app.js",
  "config.js",
  "api/ai.js",
  "database/schema.sql",
  "vercel.json",
];

const missing = requiredFiles.filter((file) => !fs.existsSync(path.join(process.cwd(), file)));

if (missing.length) {
  console.error(`Missing required files: ${missing.join(", ")}`);
  process.exit(1);
}

const html = fs.readFileSync(path.join(process.cwd(), "index.html"), "utf8");
const references = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((match) => match[1]);
const localReferences = references.filter((reference) => !reference.startsWith("#") && !reference.startsWith("http"));
const brokenReferences = localReferences.filter((reference) => !fs.existsSync(path.join(process.cwd(), reference)));

if (brokenReferences.length) {
  console.error(`Broken local references: ${brokenReferences.join(", ")}`);
  process.exit(1);
}

console.log("Static project checks passed.");
