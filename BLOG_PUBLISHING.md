# Blog publishing workflow

The production Mintlify site is built from `main`. A normal post should move through a pull request so it receives a preview and automated checks before Mintlify deploys it.

## Prepare a post

1. Add the article as `blog/<slug>.mdx` with `title` and `description` frontmatter.
2. Add its images under `images/blog/<slug>/`, including a `cover.png`, `cover.jpg`, `cover.jpeg`, `cover.webp`, or `cover.gif`.
3. Add the article card to Latest and one category page:

   ```bash
   node scripts/add-blog-card.mjs blog/<slug>.mdx --category reports
   ```

   Valid categories are `updates`, `tutorials`, `stories`, and `reports`.
4. Push the branch and open a pull request against `main`.

The **Blog quality** workflow validates changed articles, referenced images, list cards, the Mintlify build, and broken links. Broken links are initially advisory so the existing backlog does not block publishing; make that step blocking after the current links are cleaned up.

## Publish immediately

After the preview and checks pass, approve and merge the pull request. Mintlify detects the update to `main` and deploys it automatically.

## Publish on a schedule

1. Put the intended time in the pull request body using ISO 8601 with an explicit timezone:

   ```text
   Publish-At: 2026-09-20T10:00:00+08:00
   ```

2. Add the `blog:scheduled` label.
3. Obtain at least one current pull-request approval.
4. Leave the pull request open.

Every five minutes, **Publish scheduled blog posts** finds due pull requests and merges them. The publisher refuses draft pull requests, unapproved pull requests, and pull requests containing files outside `blog/`, `images/blog/`, and `docs.json`. GitHub branch protection still applies to the final merge.

Use the workflow's manual **dry run** before enabling the schedule for the first time.

## Repository settings

- Protect `main` and require pull requests.
- Require the `Blog quality / validate` status check after its first successful run.
- Require at least one approval and conversation resolution.
- Create the `blog:scheduled` label.
- Keep the Mintlify GitHub App connected to this repository and confirm that `main` is the configured deployment branch.

## Search indexing follow-up

The current `docs.json` lists only the five Blog landing pages in navigation. Mintlify therefore omits individual posts from the generated sitemap. The live sitemap confirmed this behavior.

Do not blindly set `seo.indexing` to `all`: that also indexes every other unlisted page. First audit unlisted pages, then either mark obsolete pages `noindex: true` before enabling full indexing, or maintain a searchable hidden navigation group containing only publishable Blog posts.

The live site also currently uses two canonical hosts: category pages explicitly point to `www.autocoder.cc`, while article pages default to `docs.autocoder.cc`. Choose one canonical host and normalize both the category frontmatter and site-wide SEO configuration in a separate SEO change.
