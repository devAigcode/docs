#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const INDEX_PAGES = new Set(["latest", "updates", "tutorials", "stories", "reports", "announcements"]);
const CATEGORY_PAGES = ["updates", "tutorials", "stories", "reports"];
const errors = [];
const warnings = [];

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function parseFrontmatter(source, file) {
  const match = source.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!match) {
    errors.push(`${file}: missing YAML frontmatter`);
    return {};
  }

  const values = {};
  for (const line of match[1].split("\n")) {
    const field = line.match(/^([A-Za-z][\w:-]*):\s*(.*?)\s*$/);
    if (!field) continue;
    values[field[1]] = field[2].replace(/^(["'])(.*)\1$/, "$2").trim();
  }
  return values;
}

function changedFiles(base, head) {
  if (!base) {
    try {
      base = git(["merge-base", "origin/main", head]);
    } catch {
      base = `${head}^`;
    }
  }

  return git(["diff", "--name-status", "--diff-filter=AMR", base, head, "--", "blog", "images/blog", "docs.json"])
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("\t").at(-1));
}

const base = process.argv[2] || process.env.BASE_SHA;
const head = process.argv[3] || process.env.HEAD_SHA || "HEAD";
const changed = changedFiles(base, head);
const articles = changed.filter((file) => {
  if (!/^blog\/[a-z0-9][a-z0-9-]*\.mdx$/.test(file)) return false;
  return !INDEX_PAGES.has(path.basename(file, ".mdx"));
});

if (changed.includes("docs.json")) {
  try {
    JSON.parse(fs.readFileSync("docs.json", "utf8"));
  } catch (error) {
    errors.push(`docs.json: invalid JSON (${error.message})`);
  }
}

const latest = fs.readFileSync("blog/latest.mdx", "utf8");
const categories = Object.fromEntries(
  CATEGORY_PAGES.map((category) => [category, fs.readFileSync(`blog/${category}.mdx`, "utf8")]),
);

for (const file of articles) {
  if (!fs.existsSync(file)) continue;

  const slug = path.basename(file, ".mdx");
  const source = fs.readFileSync(file, "utf8");
  const metadata = parseFrontmatter(source, file);

  if (!metadata.title) errors.push(`${file}: frontmatter title is required`);
  if (!metadata.description) errors.push(`${file}: frontmatter description is required`);
  if (metadata.description && (metadata.description.length < 50 || metadata.description.length > 180)) {
    warnings.push(`${file}: description length is ${metadata.description.length}; 50-180 characters is recommended`);
  }

  const href = `/blog/${slug}`;
  if (!latest.includes(`href="${href}"`) && !latest.includes(`href='${href}'`)) {
    errors.push(`${file}: missing card in blog/latest.mdx`);
  }
  if (!Object.values(categories).some((content) => content.includes(`href="${href}"`) || content.includes(`href='${href}'`))) {
    errors.push(`${file}: missing card in a category page (${CATEGORY_PAGES.join(", ")})`);
  }

  const imageDirectory = path.join("images", "blog", slug);
  const coverExists = fs.existsSync(imageDirectory)
    && fs.readdirSync(imageDirectory).some((name) => /^cover\.(png|jpe?g|webp|gif)$/i.test(name));
  if (!coverExists) errors.push(`${file}: missing ${imageDirectory}/cover.*`);

  const imageReferences = [...source.matchAll(/\/images\/blog\/[A-Za-z0-9._/-]+/g)].map((match) => match[0]);
  for (const reference of new Set(imageReferences)) {
    const cleanReference = reference.replace(/[)'"}\],;:]+$/, "");
    if (!fs.existsSync(`.${cleanReference}`)) errors.push(`${file}: referenced image does not exist: ${cleanReference}`);
  }
}

for (const warning of warnings) console.log(`::warning::${warning}`);
for (const error of errors) console.error(`::error::${error}`);

console.log(`Checked ${articles.length} changed blog article(s); ${warnings.length} warning(s), ${errors.length} error(s).`);
if (errors.length) process.exit(1);
