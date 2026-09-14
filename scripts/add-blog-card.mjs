#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const CATEGORY_PAGES = new Set(["updates", "tutorials", "stories", "reports"]);

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function parseFrontmatter(source) {
  const match = source.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!match) fail("The article must start with YAML frontmatter.");

  const values = {};
  for (const line of match[1].split("\n")) {
    const field = line.match(/^([A-Za-z][\w:-]*):\s*(.*?)\s*$/);
    if (!field) continue;
    values[field[1]] = field[2].replace(/^(["'])(.*)\1$/, "$2").trim();
  }
  return values;
}

function escapeAttribute(value) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

function insertCard(file, card, href, dryRun) {
  const current = fs.readFileSync(file, "utf8");
  if (current.includes(`href="${href}"`) || current.includes(`href='${href}'`)) {
    console.log(`${file}: card already exists`);
    return;
  }

  const marker = /<CardGroup\s+cols=\{2\}>\s*/;
  if (!marker.test(current)) fail(`${file} does not contain <CardGroup cols={2}>.`);

  const updated = current.replace(marker, (value) => `${value}\n${card}\n`);
  if (dryRun) {
    console.log(`${file}: would add ${href}`);
  } else {
    fs.writeFileSync(file, updated);
    console.log(`${file}: added ${href}`);
  }
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const categoryIndex = args.indexOf("--category");
const articleArg = args.find((arg) => !arg.startsWith("--") && arg !== args[categoryIndex + 1]);
const category = categoryIndex >= 0 ? args[categoryIndex + 1] : undefined;

if (!articleArg || !category) {
  fail("Usage: node scripts/add-blog-card.mjs blog/<slug>.mdx --category <updates|tutorials|stories|reports> [--dry-run]");
}
if (!CATEGORY_PAGES.has(category)) fail(`Unknown category: ${category}`);

const articlePath = path.normalize(articleArg);
if (!/^blog[/\\][a-z0-9][a-z0-9-]*\.mdx$/.test(articlePath)) {
  fail("Article path must look like blog/my-article.mdx and use a lowercase kebab-case slug.");
}
if (!fs.existsSync(articlePath)) fail(`${articlePath} does not exist.`);

const slug = path.basename(articlePath, ".mdx");
const metadata = parseFrontmatter(fs.readFileSync(articlePath, "utf8"));
if (!metadata.title || !metadata.description) fail("Article frontmatter requires title and description.");

const imageDirectory = path.join("images", "blog", slug);
const cover = fs.existsSync(imageDirectory)
  ? fs.readdirSync(imageDirectory).find((name) => /^cover\.(png|jpe?g|webp|gif)$/i.test(name))
  : undefined;
if (!cover) fail(`${imageDirectory}/cover.(png|jpg|jpeg|webp|gif) is missing.`);

const href = `/blog/${slug}`;
const image = `/${path.posix.join("images", "blog", slug, cover)}`;
const card = `<Card title="${escapeAttribute(metadata.title)}" href="${href}" img="${image}">\n  ${metadata.description}\n</Card>`;

insertCard(path.join("blog", "latest.mdx"), card, href, dryRun);
insertCard(path.join("blog", `${category}.mdx`), card, href, dryRun);
