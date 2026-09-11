// Post-build step: publish the study material in /guide as a static, unlisted
// section of the deployed site.
//
// Runs AFTER `vite build` (see the `build` script in package.json), so it copies
// into the already-emitted dist/ folder. Crucially it does NOT go through Vite's
// public/ folder: the PWA precache globs **/*.html (vite.config.js), and one of
// these study docs is ~1.5 MB — we don't want them in the service-worker precache.
// Copying post-build keeps them served statically but out of the SW manifest.
//
// Vercel checks the filesystem before applying the SPA rewrite (see vercel.json),
// so dist/guide/* is served directly and isn't swallowed by the app.
//
// The page is UNLISTED: nothing in the app links to /guide, and the generated
// index carries a noindex robots meta. It is not authenticated — anyone with the
// URL can read it.
//
// Usage: node scripts/build-guide.mjs   (invoked automatically by `npm run build`)

import { readdirSync, copyFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "guide");
const outDir = join(root, "dist", "guide");

if (!existsSync(srcDir)) {
  console.log("build-guide: no guide/ folder — nothing to publish.");
  process.exit(0);
}

const entries = readdirSync(srcDir, { withFileTypes: true })
  .filter((e) => e.isFile())
  .map((e) => e.name);

const htmlFiles = entries.filter((n) => n.toLowerCase().endsWith(".html")).sort();
const docxFiles = entries.filter((n) => n.toLowerCase().endsWith(".docx")).sort();

if (htmlFiles.length === 0 && docxFiles.length === 0) {
  console.log("build-guide: no .html or .docx files in guide/ — nothing to publish.");
  process.exit(0);
}

mkdirSync(outDir, { recursive: true });

// Copy every published file verbatim into dist/guide/.
for (const name of [...htmlFiles, ...docxFiles]) {
  copyFileSync(join(srcDir, name), join(outDir, name));
}

// Pull the <title> out of an HTML file for a friendlier label; fall back to a
// prettified filename.
function labelForHtml(name) {
  try {
    const html = readFileSync(join(srcDir, name), "utf-8");
    const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (m && m[1].trim()) return m[1].trim().replace(/\s+/g, " ");
  } catch {
    /* fall through to filename */
  }
  return prettyName(name);
}

function prettyName(name) {
  return name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
}

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const htmlItems = htmlFiles
  .map((name) => {
    const href = encodeURIComponent(name);
    return `      <li><a href="./${href}">${esc(labelForHtml(name))}</a></li>`;
  })
  .join("\n");

const docxItems = docxFiles
  .map((name) => {
    const href = encodeURIComponent(name);
    return `      <li><a href="./${href}" download>${esc(prettyName(name))}<span class="ext">.docx</span></a></li>`;
  })
  .join("\n");

const sections = [];
if (htmlFiles.length) {
  sections.push(`    <h2>Guides</h2>\n    <ul>\n${htmlItems}\n    </ul>`);
}
if (docxFiles.length) {
  sections.push(`    <h2>Downloads</h2>\n    <ul class="downloads">\n${docxItems}\n    </ul>`);
}

const indexHtml = `<!doctype html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex,nofollow" />
  <title>Guide</title>
  <style>
    :root { --gold: #c9a84c; --bg: #14110c; --card: #1d1913; --text: #e9e2d0; --muted: #9a9384; }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--text);
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      line-height: 1.5; padding: 40px 20px; }
    main { max-width: 720px; margin: 0 auto; }
    h1 { color: var(--gold); font-size: 1.6rem; margin: 0 0 4px; }
    .sub { color: var(--muted); margin: 0 0 28px; font-size: .9rem; }
    h2 { color: var(--gold); font-size: 1rem; text-transform: uppercase;
      letter-spacing: .08em; margin: 28px 0 10px; }
    ul { list-style: none; padding: 0; margin: 0; }
    li { margin: 0 0 8px; }
    a { display: block; background: var(--card); color: var(--text);
      text-decoration: none; padding: 14px 16px; border-radius: 10px;
      border: 1px solid rgba(201,168,76,.18); transition: border-color .15s, background .15s; }
    a:hover { border-color: var(--gold); background: #241f17; }
    .downloads a { color: var(--muted); }
    .ext { color: var(--gold); font-size: .8rem; margin-left: 6px; opacity: .7; }
  </style>
</head>
<body>
  <main>
    <h1>Guide</h1>
    <p class="sub">${htmlFiles.length} guide${htmlFiles.length === 1 ? "" : "s"}${
      docxFiles.length ? ` · ${docxFiles.length} download${docxFiles.length === 1 ? "" : "s"}` : ""
    }</p>
${sections.join("\n")}
  </main>
</body>
</html>
`;

writeFileSync(join(outDir, "index.html"), indexHtml, "utf-8");

console.log(
  `build-guide: published ${htmlFiles.length} html + ${docxFiles.length} docx → dist/guide/ (index.html generated).`
);
