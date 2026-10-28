#!/usr/bin/env node

/**
 * Self-bootstrapping deploy script for Figma Make sites.
 *
 * First time:   node deploy.js --init
 *   → installs dependencies, adds npm scripts, asks for domain & type
 *
 * Deploy:       node deploy.js   (or npm run deploy)
 *   → SPA:    fixes paths, builds, uploads dist/, configures Caddy
 *   → Static: uploads site files from project root, configures Caddy
 *
 * Delete site:  node deploy.js --delete site.example.com
 *   → removes site files & Caddy config from server
 *
 * The designer only needs Node.js installed. Everything else is automatic.
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { pathToFileURL } from "node:url";

// ── Form relay integration ──────────────────────────────────────────────

export const FORM_SCRIPT_TAG =
  '<script src="https://forms.a-4-to.ru/form.js" defer></script>';

// Insert the form relay script just before </head>, once.
export function injectFormScript(html) {
  if (html.includes("forms.a-4-to.ru/form.js")) return html;
  const idx = html.search(/<\/head>/i);
  if (idx === -1) return html;
  return html.slice(0, idx) + "    " + FORM_SCRIPT_TAG + "\n  " + html.slice(idx);
}

const SITES_CONFIG_PATH = "/srv/forms/sites.json";

// Set/overwrite the Telegram fields on a deploy.config.json object.
export function withTelegramConfig(config, chatId, name) {
  const out = { ...config };
  out.telegramChatId = chatId;
  if (name) out.telegramName = name;
  else delete out.telegramName;
  return out;
}

// Persist the Telegram binding into deploy.config.json so future deploys re-apply it.
function saveTelegramToConfig(chatId, name) {
  if (!fs.existsSync(CONFIG_FILE)) return;
  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  const updated = withTelegramConfig(config, chatId, name);
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2) + "\n");
}

// Merge one domain→{chatId,name} entry into a sites.json string.
export function mergeSiteConfig(existingJson, domain, chatId, name) {
  let obj = {};
  try {
    obj = existingJson && existingJson.trim() ? JSON.parse(existingJson) : {};
  } catch {
    obj = {};
  }
  const entry = { chatId };
  if (name) entry.name = name;
  obj[domain] = entry;
  return JSON.stringify(obj, null, 2) + "\n";
}

// ── Constants ───────────────────────────────────────────────────────────

const CONFIG_FILE = "deploy.config.json";
const DIST_DIR = "dist";
const SITES_DIR = "/srv/sites";
const CADDY_SITES_DIR = "/etc/caddy/sites";

const DEPLOY_DEPS = ["dotenv", "ssh2", "ssh2-sftp-client"];

// ── Helpers ─────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`\x1b[36m▸\x1b[0m ${msg}`);
}
function ok(msg) {
  console.log(`\x1b[32m✓\x1b[0m ${msg}`);
}
function err(msg) {
  console.error(`\x1b[31m✗\x1b[0m ${msg}`);
}

// Single shared readline so multiple sequential prompts work (including when
// stdin is piped). Closed once via closePrompt() when the process is done.
let _rl = null;
function prompt(question) {
  if (!_rl) {
    _rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }
  return new Promise((resolve) => {
    _rl.question(question, (answer) => resolve(answer.trim()));
  });
}
function closePrompt() {
  if (_rl) {
    _rl.close();
    _rl = null;
  }
}

// ── Bootstrap: install deps & patch package.json ────────────────────────

function ensureDeps() {
  // Create a minimal package.json if it doesn't exist (static sites)
  if (!fs.existsSync("package.json")) {
    fs.writeFileSync("package.json", JSON.stringify({ private: true }, null, 2) + "\n");
    ok("Created minimal package.json for deploy dependencies");
  }

  const missing = DEPLOY_DEPS.filter((dep) => {
    try {
      return !fs.existsSync(path.join("node_modules", dep));
    } catch {
      return true;
    }
  });

  if (missing.length > 0) {
    log(`Installing deploy dependencies: ${missing.join(", ")}...`);
    execSync(`npm install --save-dev ${missing.join(" ")}`, {
      stdio: "inherit",
    });
    ok("Dependencies installed");
  }
}

function ensureScripts() {
  const pkgPath = "package.json";
  if (!fs.existsSync(pkgPath)) return;
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  let changed = false;

  if (!pkg.scripts) pkg.scripts = {};

  if (!pkg.scripts.deploy) {
    pkg.scripts.deploy = "node deploy.js";
    changed = true;
  }
  if (!pkg.scripts["deploy:init"]) {
    pkg.scripts["deploy:init"] = "node deploy.js --init";
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
    ok("Added deploy scripts to package.json");
  }
}

function ensureGitignore() {
  const gitignorePath = ".gitignore";
  const requiredEntries = [
    "node_modules",
    "dist",
    ".env",
    "deploy.config.json",
  ];

  let content = "";
  if (fs.existsSync(gitignorePath)) {
    content = fs.readFileSync(gitignorePath, "utf8");
  }

  const missing = requiredEntries.filter(
    (entry) => !content.split("\n").some((line) => line.trim() === entry),
  );

  if (missing.length > 0) {
    const addition = missing.join("\n") + "\n";
    fs.appendFileSync(gitignorePath, (content.endsWith("\n") ? "" : "\n") + addition);
    ok(`Added to .gitignore: ${missing.join(", ")}`);
  }
}

function ensureEnv() {
  if (fs.existsSync(".env")) return;

  const template = `DEPLOY_HOST=YOUR_SERVER_IP
DEPLOY_PORT=22
DEPLOY_USER=deploy
DEPLOY_PASSWORD=YOUR_PASSWORD
`;
  fs.writeFileSync(".env", template);
  log("Created .env — fill in server credentials before deploying");
}

// ── Validation ──────────────────────────────────────────────────────────

function isValidDomain(domain) {
  return /^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/.test(domain);
}

// ── Config ──────────────────────────────────────────────────────────────

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    err(`${CONFIG_FILE} not found. Run: node deploy.js --init`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
}

async function initConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    const existing = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    ok(`Config already exists: domain = ${existing.domain}`);
    return existing;
  }

  const domain = await prompt("Domain (e.g. shop.example.com): ");
  if (!domain || !isValidDomain(domain)) {
    err("Invalid domain. Use format: site.example.com");
    process.exit(1);
  }

  const typeAnswer = await prompt("Site type — spa or static? (default: spa): ");
  const type = typeAnswer === "static" ? "static" : "spa";

  // Optional Telegram group — persisted to config; applied on first deploy.
  const chatId = await prompt("Telegram chat id for notifications (Enter to skip): ");

  const config = { domain, type };
  if (chatId.trim()) config.telegramChatId = chatId.trim();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n");
  ok(`Config saved: ${domain} (${type})`);
  return config;
}

// ── Fix Figma asset paths ───────────────────────────────────────────────

function fixFigmaAssets() {
  const srcDir = path.join(process.cwd(), "src");
  if (!fs.existsSync(srcDir)) return 0;

  const extensions = [".tsx", ".ts", ".jsx", ".js"];
  let totalFixed = 0;

  function processDir(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        processDir(fullPath);
      } else if (extensions.includes(path.extname(entry.name))) {
        const content = fs.readFileSync(fullPath, "utf8");
        if (content.includes("figma:asset/")) {
          const fixed = content.replace(
            /figma:asset\/([a-f0-9A-F]+\.[a-z]+)/g,
            "@/assets/$1",
          );
          fs.writeFileSync(fullPath, fixed);
          log(`Fixed: ${path.relative(process.cwd(), fullPath)}`);
          totalFixed++;
        }
      }
    }
  }

  processDir(srcDir);
  return totalFixed;
}

// ── Server credentials ──────────────────────────────────────────────────

function getServerCreds() {
  const host = process.env.DEPLOY_HOST;
  const password = process.env.DEPLOY_PASSWORD;
  if (!host || !password || host === "YOUR_SERVER_IP" || password === "YOUR_PASSWORD") {
    err("Fill in real credentials in .env file first");
    process.exit(1);
  }
  return {
    host,
    port: Number(process.env.DEPLOY_PORT || 22),
    username: process.env.DEPLOY_USER || "deploy",
    password,
  };
}

// ── SSH exec helper ─────────────────────────────────────────────────────

async function sshExec(creds, command) {
  const { Client } = await import("ssh2");
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let stdout = "";
    let stderr = "";

    conn
      .on("ready", () => {
        conn.exec(command, (execErr, stream) => {
          if (execErr) {
            conn.end();
            return reject(execErr);
          }
          stream
            .on("close", (code) => {
              conn.end();
              if (code !== 0) {
                reject(
                  new Error(
                    `Remote command failed (code ${code}): ${stderr}`,
                  ),
                );
              } else {
                resolve(stdout);
              }
            })
            .on("data", (data) => {
              stdout += data;
            })
            .stderr.on("data", (data) => {
              stderr += data;
            });
        });
      })
      .on("error", reject)
      .connect(creds);
  });
}

// ── Collect static site files ────────────────────────────────────────────

// Always skipped, at ANY depth (dev tooling, VCS, OS cruft, secrets, dev docs)
const STATIC_IGNORE_ALWAYS = new Set([
  ".git",
  ".DS_Store",
  "node_modules",
  ".claude",
  ".beads",
  ".dolt",
  "superpowers", // brainstorm/spec/plan docs under docs/superpowers
]);

// Skipped only at the project root (deploy/env/tooling/source files)
const STATIC_IGNORE_ROOT = new Set([
  ".env",
  "_env",
  "dist",
  "deploy.js",
  "deploy_test.mjs",
  "deploy.config.json",
  "DEPLOY.md",
  "package.json",
  "package-lock.json",
  ".gitignore",
  "CLAUDE.md",
  "AGENTS.md",
  "GEMINI.md",
  "MIGRATION.md",
  "serve.mjs",
  "screenshot.mjs",
  "temporary screenshots",
  "server", // Go form-relay source + compiled binary
  "ops",     // server provisioning artifacts
  "hero-bg-original.mp4", // исходник видео, 5,6 МБ — на сайт не нужен
  "hero-bg.mov",
  "admin.html",
  "admin-server.js",
  "shot_phil.js",
  "start.sh",
]);

function collectStaticFiles(dir, baseDir = dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (STATIC_IGNORE_ALWAYS.has(entry.name)) continue;
    if (dir === baseDir && STATIC_IGNORE_ROOT.has(entry.name)) continue;
    // Skip any leftover hidden dotfiles/dotdirs at the project root
    if (dir === baseDir && entry.name.startsWith(".")) continue;
    // Служебные скриншот-скрипты проекта
    if (dir === baseDir && /^screenshot-.*\.mjs$/.test(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectStaticFiles(fullPath, baseDir));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

// ── Upload via SFTP ─────────────────────────────────────────────────────

async function uploadDist(creds, domain) {
  const SftpClient = (await import("ssh2-sftp-client")).default;
  const sftp = new SftpClient();
  const remotePath = `${SITES_DIR}/${domain}`;

  try {
    await sftp.connect(creds);

    const exists = await sftp.exists(remotePath);
    if (exists) {
      // Clean old files before uploading new build
      await sftp.rmdir(remotePath, true);
    }
    await sftp.mkdir(remotePath, true);

    // Inject the form relay script into the built index.html (idempotent)
    const distIndex = path.join(DIST_DIR, "index.html");
    if (fs.existsSync(distIndex)) {
      fs.writeFileSync(distIndex, injectFormScript(fs.readFileSync(distIndex, "utf8")));
    }

    await sftp.uploadDir(DIST_DIR, remotePath);
  } finally {
    await sftp.end();
  }
}

async function uploadStatic(creds, domain) {
  const SftpClient = (await import("ssh2-sftp-client")).default;
  const sftp = new SftpClient();
  const livePath = `${SITES_DIR}/${domain}`;
  // Upload into a fresh staging dir and swap it in at the end: the live site
  // stays up during the upload, and parallel deploys don't delete each other's files
  const stamp = `${Date.now()}-${process.pid}`;
  const remotePath = `${livePath}.upload-${stamp}`;
  const oldPath = `${livePath}.old-${stamp}`;
  const baseDir = process.cwd();

  try {
    await sftp.connect(creds);

    await sftp.mkdir(remotePath, true);

    const files = collectStaticFiles(baseDir);
    // Create remote directories first
    const dirs = new Set();
    for (const file of files) {
      const rel = path.relative(baseDir, path.dirname(file));
      if (rel) dirs.add(rel);
    }
    for (const dir of [...dirs].sort()) {
      const remoteDir = `${remotePath}/${dir.replace(/\\/g, "/")}`;
      await sftp.mkdir(remoteDir, true);
    }
    // Upload files (inject form relay script into HTML in-flight; sources stay clean)
    for (const file of files) {
      const rel = path.relative(baseDir, file).replace(/\\/g, "/");
      const remote = `${remotePath}/${rel}`;
      if (file.toLowerCase().endsWith(".html")) {
        const html = fs.readFileSync(file, "utf8");
        const patched = injectFormScript(html);
        await sftp.put(Buffer.from(patched, "utf8"), remote);
      } else {
        await sftp.put(file, remote);
      }
    }

    // Swap: two renames, the site is missing for milliseconds instead of minutes
    if (await sftp.exists(livePath)) await sftp.rename(livePath, oldPath);
    await sftp.rename(remotePath, livePath);
    if (await sftp.exists(oldPath)) await sftp.rmdir(oldPath, true);
  } catch (e) {
    // Swap broke halfway: put the previous version back
    if (!(await sftp.exists(livePath).catch(() => true)) && (await sftp.exists(oldPath).catch(() => false))) {
      await sftp.rename(oldPath, livePath).catch(() => {});
    }
    if (await sftp.exists(remotePath).catch(() => false)) {
      await sftp.rmdir(remotePath, true).catch(() => {});
    }
    throw e;
  } finally {
    await sftp.end();
  }
}

// ── Configure Caddy ─────────────────────────────────────────────────────

function buildCaddyConfig(domain, type) {
  const routing =
    type === "static"
      ? "    try_files {path} {path}/ =404"
      : "    try_files {path} /index.html";

  return `${domain} {
    root * ${SITES_DIR}/${domain}
    file_server
${routing}
    encode gzip zstd

    # Cache hashed assets (js, css, images) — immutable, long TTL
    @hashed path *.js *.css *.woff2 *.woff *.ttf
    header @hashed Cache-Control "public, max-age=31536000, immutable"

    @images path *.png *.jpg *.jpeg *.gif *.webp *.avif *.svg *.ico
    header @images Cache-Control "public, max-age=2592000"

    # HTML — always revalidate
    @html path *.html /
    header @html Cache-Control "public, max-age=0, must-revalidate"

    # Security & performance headers
    header {
        X-Content-Type-Options "nosniff"
        X-Frame-Options "SAMEORIGIN"
        Referrer-Policy "strict-origin-when-cross-origin"
        -Server
    }
}`;
}

async function configureCaddy(creds, domain, type) {
  const configPath = `${CADDY_SITES_DIR}/${domain}`;

  const checkResult = await sshExec(
    creds,
    `test -f ${configPath} && echo exists || echo missing`,
  );

  if (checkResult.trim() === "exists") {
    log("Caddy config already exists, skipping");
    return;
  }

  const siteConfig = buildCaddyConfig(domain, type);
  const escaped = siteConfig.replace(/'/g, "'\\''");
  await sshExec(
    creds,
    `echo '${escaped}' | sudo tee ${configPath} > /dev/null && sudo systemctl reload caddy`,
  );
  ok("Caddy configured and reloaded");
}

// ── Register site → Telegram group on the server ─────────────────────────

async function registerTelegram(creds, domain, chatId, name) {
  // The deploy user owns sites.json (chmod 664), so no sudo needed.
  // Read current config (empty if missing), merge this entry, write back.
  let current = "";
  try {
    current = await sshExec(creds, `cat ${SITES_CONFIG_PATH} 2>/dev/null || true`);
  } catch {
    current = "";
  }
  const merged = mergeSiteConfig(current, domain, chatId, name);
  const escaped = merged.replace(/'/g, "'\\''");
  await sshExec(creds, `printf '%s' '${escaped}' > ${SITES_CONFIG_PATH}`);
  ok(`Telegram group registered for ${domain}`);
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  // --telegram: register this site's Telegram group on the server
  if (args.includes("--telegram")) {
    await import("dotenv/config");
    const creds = getServerCreds();
    const config = loadConfig();
    // Allow non-interactive use: node deploy.js --telegram <chatId> [name]
    const tgIdx = args.indexOf("--telegram");
    const argChatId =
      args[tgIdx + 1] && !args[tgIdx + 1].startsWith("--") ? args[tgIdx + 1] : "";
    const argName =
      args[tgIdx + 2] && !args[tgIdx + 2].startsWith("--") ? args[tgIdx + 2] : "";

    let chatId = argChatId;
    if (!chatId) {
      chatId = await prompt("Telegram chat id (e.g. -100123… , Enter to skip): ");
    }
    if (!chatId.trim()) {
      log("No chat id entered — Telegram sending stays disabled for this site");
      return;
    }
    let name = argName;
    if (!name && !argChatId) {
      name = await prompt("Site display name for messages (optional): ");
    }
    await registerTelegram(creds, config.domain, chatId.trim(), name.trim());
    saveTelegramToConfig(chatId.trim(), name.trim()); // persist so deploys re-apply
    return;
  }

  // --list: show all deployed sites
  if (args.includes("--list")) {
    await import("dotenv/config");
    const creds = getServerCreds();
    const sites = await sshExec(creds, `ls -1 ${SITES_DIR} 2>/dev/null`);
    const list = sites.trim().split("\n").filter(Boolean);
    if (list.length === 0) {
      log("No sites deployed yet");
    } else {
      console.log(`\n\x1b[1mDeployed sites (${list.length}):\x1b[0m\n`);
      for (const site of list) {
        console.log(`  https://${site}`);
      }
      console.log();
    }
    return;
  }

  // --delete <domain>: remove site from server
  if (args.includes("--delete")) {
    const domainIdx = args.indexOf("--delete") + 1;
    const domain = args[domainIdx];
    if (!domain || !isValidDomain(domain)) {
      err("Usage: node deploy.js --delete site.example.com");
      process.exit(1);
    }

    await import("dotenv/config");
    const creds = getServerCreds();

    const confirm = await prompt(`Delete ${domain} from server? (yes/no): `);
    if (confirm !== "yes") {
      log("Cancelled");
      return;
    }

    log(`Removing site files: ${SITES_DIR}/${domain}...`);
    await sshExec(creds, `sudo rm -rf ${SITES_DIR}/${domain}`);
    ok("Site files removed");

    log(`Removing Caddy config: ${CADDY_SITES_DIR}/${domain}...`);
    await sshExec(
      creds,
      `sudo rm -f ${CADDY_SITES_DIR}/${domain} && sudo systemctl reload caddy`,
    );
    ok("Caddy config removed and reloaded");

    console.log(`\n\x1b[32m\x1b[1m✓ Deleted!\x1b[0m ${domain}\n`);
    return;
  }

  // --init: full project setup
  if (args.includes("--init")) {
    console.log("\n\x1b[1mSetting up deploy...\x1b[0m\n");

    ensureDeps();
    ensureScripts();
    ensureGitignore();
    ensureEnv();
    await initConfig();

    console.log("\n\x1b[32m\x1b[1mDone!\x1b[0m");
    console.log("  1. Fill in .env with server credentials");
    console.log("  2. Run: npm run deploy  (also wires the Telegram group if set)\n");
    return;
  }

  // Load .env (dynamic import since it may have just been installed)
  await import("dotenv/config");

  const config = loadConfig();
  const creds = getServerCreds();
  const { domain, type = "spa" } = config;

  if (!isValidDomain(domain)) {
    err(`Invalid domain in ${CONFIG_FILE}: "${domain}"`);
    process.exit(1);
  }

  console.log(`\n\x1b[1mDeploying ${domain} (${type})\x1b[0m\n`);

  if (type === "static") {
    // Static site: upload files directly from project root
    const files = collectStaticFiles(process.cwd());
    log(`Uploading ${files.length} files...`);
    await uploadStatic(creds, domain);
    ok("Files uploaded");
  } else {
    // SPA: fix paths, build, upload dist/
    log("Checking Figma asset paths...");
    const fixed = fixFigmaAssets();
    if (fixed > 0) ok(`Fixed ${fixed} file(s)`);
    else ok("No fixes needed");

    log("Building...");
    execSync("npm run build", { stdio: "inherit" });
    ok("Build complete");

    if (!fs.existsSync(DIST_DIR)) {
      err("dist/ not found after build");
      process.exit(1);
    }

    log("Uploading files...");
    await uploadDist(creds, domain);
    ok("Files uploaded");
  }

  // Step 5: Caddy
  log("Checking Caddy config...");
  await configureCaddy(creds, domain, type);

  // Step 6: Telegram group binding (if configured) — idempotent, keeps server in sync
  if (config.telegramChatId) {
    log("Registering Telegram group...");
    await registerTelegram(creds, domain, config.telegramChatId, config.telegramName || "");
  }

  console.log(`\n\x1b[32m\x1b[1m✓ Deployed!\x1b[0m https://${domain}\n`);
}

function isMain() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMain()) {
  main()
    .catch((e) => {
      err(e.message);
      process.exitCode = 1;
    })
    .finally(() => closePrompt());
}
