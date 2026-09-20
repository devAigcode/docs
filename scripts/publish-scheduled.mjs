#!/usr/bin/env node

const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const dryRun = process.env.DRY_RUN === "true";
const scheduledLabel = "blog:scheduled";
const allowedPath = /^(blog\/|images\/blog\/|docs\.json$)/;

if (!token || !repository) {
  console.error("GITHUB_TOKEN and GITHUB_REPOSITORY are required.");
  process.exit(1);
}

async function api(path, options = {}) {
  const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...options.headers,
    },
  });
  const body = response.status === 204 ? undefined : await response.json();
  if (!response.ok) throw new Error(`${options.method || "GET"} ${path}: ${response.status} ${body?.message || "request failed"}`);
  return body;
}

async function allPages(path) {
  const results = [];
  for (let page = 1; page <= 10; page += 1) {
    const separator = path.includes("?") ? "&" : "?";
    const batch = await api(`${path}${separator}per_page=100&page=${page}`);
    results.push(...batch);
    if (batch.length < 100) break;
  }
  return results;
}

function latestReviewStates(reviews) {
  const latest = new Map();
  for (const review of reviews) {
    if (!review.user?.login || !review.submitted_at) continue;
    // A later comment does not dismiss an existing approval on GitHub.
    if (review.state === "COMMENTED") continue;
    const previous = latest.get(review.user.login);
    if (!previous || new Date(review.submitted_at) > new Date(previous.submitted_at)) {
      latest.set(review.user.login, review);
    }
  }
  return [...latest.values()];
}

const now = new Date();
const pulls = await allPages("/pulls?state=open&base=main");
const scheduled = pulls.filter((pr) => pr.labels.some((label) => label.name === scheduledLabel));
let failures = 0;
let merged = 0;

for (const pr of scheduled) {
  const match = pr.body?.match(/^Publish-At:\s*(.+?)\s*$/mi);
  if (!match) {
    console.error(`PR #${pr.number}: ${scheduledLabel} is set but Publish-At is missing.`);
    failures += 1;
    continue;
  }

  const publishAt = new Date(match[1]);
  if (Number.isNaN(publishAt.valueOf())) {
    console.error(`PR #${pr.number}: invalid Publish-At value: ${match[1]}`);
    failures += 1;
    continue;
  }
  if (publishAt > now) {
    console.log(`PR #${pr.number}: scheduled for ${publishAt.toISOString()}.`);
    continue;
  }
  if (pr.draft) {
    console.error(`PR #${pr.number}: publish time arrived, but the PR is still a draft.`);
    failures += 1;
    continue;
  }

  const files = await allPages(`/pulls/${pr.number}/files`);
  const unsafeFiles = files.map((file) => file.filename).filter((file) => !allowedPath.test(file));
  if (unsafeFiles.length) {
    console.error(`PR #${pr.number}: scheduled publishing refuses non-blog files: ${unsafeFiles.join(", ")}`);
    failures += 1;
    continue;
  }

  const reviews = latestReviewStates(await allPages(`/pulls/${pr.number}/reviews`));
  const approvals = reviews.filter((review) => review.state === "APPROVED");
  if (!approvals.length) {
    console.error(`PR #${pr.number}: publish time arrived, but no current approval exists.`);
    failures += 1;
    continue;
  }

  if (dryRun) {
    console.log(`PR #${pr.number}: due and approved; dry run skipped merge.`);
    continue;
  }

  try {
    const result = await api(`/pulls/${pr.number}/merge`, {
      method: "PUT",
      body: JSON.stringify({
        sha: pr.head.sha,
        merge_method: "squash",
        commit_title: `${pr.title} (#${pr.number})`,
      }),
    });
    if (!result.merged) throw new Error(result.message || "GitHub did not merge the pull request");
    console.log(`PR #${pr.number}: merged for publishing.`);
    merged += 1;
  } catch (error) {
    console.error(`PR #${pr.number}: ${error.message}`);
    failures += 1;
  }
}

if (!scheduled.length) console.log(`No open pull requests have the ${scheduledLabel} label.`);
console.log(`Scheduled publisher finished: ${merged} merged, ${failures} blocked, dryRun=${dryRun}.`);
if (failures) process.exit(1);
