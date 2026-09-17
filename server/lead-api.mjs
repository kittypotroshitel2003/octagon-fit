#!/usr/bin/env node
/**
 * OCTAGON-FIT — приём заявок с сайта.
 *
 * Принимает POST /api/lead (JSON) и рассылает заявку:
 *   • на почту   — SMTP Яндекса
 *   • в Telegram — сообщение в группу клуба
 *
 * Настройки читаются из переменных окружения (см. .env.example).
 * Запуск:  node lead-api.mjs
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import nodemailer from "nodemailer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Конфигурация ────────────────────────────────────────────────────────

loadEnvFile(path.join(__dirname, ".env"));

const CONFIG = {
  port: Number(process.env.PORT || 8787),
  host: process.env.HOST || "127.0.0.1",

  telegramToken: process.env.TELEGRAM_BOT_TOKEN || "",
  telegramChatId: process.env.TELEGRAM_CHAT_ID || "",

  mailTo: process.env.MAIL_TO || "octagon.fit@yandex.ru",
  smtpHost: process.env.SMTP_HOST || "smtp.yandex.ru",
  smtpPort: Number(process.env.SMTP_PORT || 465),
  smtpUser: process.env.SMTP_USER || "",
  smtpPass: process.env.SMTP_PASS || "",

  allowedOrigins: (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean),
  logFile: process.env.LOG_FILE || path.join(__dirname, "leads.log"),

  maxBodyBytes: 8 * 1024 * 1024,   // 8 МБ — резюме в base64 весит ~1.4× файла
  rateLimitMax: 10,                // не больше 10 заявок
  rateLimitWindowMs: 10 * 60 * 1000 // за 10 минут с одного IP
};

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const value = m[2].replace(/^["']|["']$/g, "");
    if (!(m[1] in process.env)) process.env[m[1]] = value;
  }
}

// ── Ограничение частоты ─────────────────────────────────────────────────

const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const fresh = (hits.get(ip) || []).filter((t) => now - t < CONFIG.rateLimitWindowMs);
  if (fresh.length >= CONFIG.rateLimitMax) {
    hits.set(ip, fresh);
    return true;
  }
  fresh.push(now);
  hits.set(ip, fresh);
  return false;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, times] of hits) {
    const fresh = times.filter((t) => now - t < CONFIG.rateLimitWindowMs);
    if (fresh.length) hits.set(ip, fresh);
    else hits.delete(ip);
  }
}, CONFIG.rateLimitWindowMs).unref();

// ── Доставка ────────────────────────────────────────────────────────────

const FIELD_LABELS = {
  type: "Тип заявки",
  name: "Имя",
  phone: "Телефон",
  trainer: "Тренер",
  when: "Когда удобно",
  source: "Откуда",
  page: "Страница",
  url: "Адрес",
  consent: "Согласие на обработку данных"
};

function formatLead(lead) {
  const lines = ["Новая заявка с сайта OCTAGON-FIT", ""];
  for (const [key, label] of Object.entries(FIELD_LABELS)) {
    if (lead[key]) lines.push(`${label}: ${lead[key]}`);
  }
  if (lead.resume) lines.push(`Резюме: ${lead.resume.name}`);
  lines.push("", new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" }) + " (МСК)");
  return lines.join("\n");
}

async function sendToTelegram(lead, text) {
  if (!CONFIG.telegramToken || !CONFIG.telegramChatId) {
    return { skipped: "не заданы TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID" };
  }
  const api = `https://api.telegram.org/bot${CONFIG.telegramToken}`;

  if (lead.resume) {
    const form = new FormData();
    form.append("chat_id", CONFIG.telegramChatId);
    form.append("caption", text.slice(0, 1024));
    form.append(
      "document",
      new Blob([Buffer.from(lead.resume.data, "base64")], { type: lead.resume.type }),
      lead.resume.name
    );
    const res = await fetch(`${api}/sendDocument`, { method: "POST", body: form });
    if (!res.ok) throw new Error("Telegram sendDocument: " + (await res.text()));
    return { ok: true };
  }

  const res = await fetch(`${api}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CONFIG.telegramChatId, text, disable_web_page_preview: true })
  });
  if (!res.ok) throw new Error("Telegram sendMessage: " + (await res.text()));
  return { ok: true };
}

let mailer = null;

async function sendToMail(lead, text) {
  if (!CONFIG.smtpUser || !CONFIG.smtpPass) {
    return { skipped: "не заданы SMTP_USER / SMTP_PASS" };
  }
  if (!mailer) {
    mailer = nodemailer.createTransport({
      host: CONFIG.smtpHost,
      port: CONFIG.smtpPort,
      secure: CONFIG.smtpPort === 465,
      auth: { user: CONFIG.smtpUser, pass: CONFIG.smtpPass }
    });
  }
  await mailer.sendMail({
    from: `"Сайт OCTAGON-FIT" <${CONFIG.smtpUser}>`,
    to: CONFIG.mailTo,
    replyTo: CONFIG.mailTo,
    subject: `${lead.type || "Заявка"} — ${lead.name || "без имени"}, ${lead.phone || "без телефона"}`,
    text,
    attachments: lead.resume
      ? [{ filename: lead.resume.name, content: Buffer.from(lead.resume.data, "base64") }]
      : []
  });
  return { ok: true };
}

// ── Валидация ───────────────────────────────────────────────────────────

function validate(lead) {
  if (typeof lead !== "object" || lead === null) return "тело запроса не является объектом";
  if (!String(lead.name || "").trim()) return "не указано имя";
  if (String(lead.phone || "").replace(/\D/g, "").length < 10) return "некорректный телефон";
  if (lead.consent !== "да") return "нет согласия на обработку данных";
  if (lead.resume) {
    if (typeof lead.resume.data !== "string") return "некорректное резюме";
    if (Buffer.byteLength(lead.resume.data, "base64") > 5 * 1024 * 1024) return "резюме больше 5 МБ";
  }
  return null;
}

function clean(lead) {
  const out = {};
  for (const key of Object.keys(FIELD_LABELS)) {
    if (lead[key] != null) out[key] = String(lead[key]).slice(0, 500);
  }
  if (lead.resume && lead.resume.data) {
    out.resume = {
      name: String(lead.resume.name || "resume").slice(0, 120).replace(/[\r\n"]/g, ""),
      type: String(lead.resume.type || "application/octet-stream").slice(0, 100),
      data: lead.resume.data
    };
  }
  return out;
}

// ── HTTP ────────────────────────────────────────────────────────────────

function corsHeaders(origin) {
  const allowed =
    !CONFIG.allowedOrigins.length || (origin && CONFIG.allowedOrigins.includes(origin));
  return {
    "Access-Control-Allow-Origin": allowed && origin ? origin : CONFIG.allowedOrigins[0] || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400"
  };
}

function reply(res, status, body, origin) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(json),
    ...corsHeaders(origin)
  });
  res.end(json);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > CONFIG.maxBodyBytes) {
        reject(new Error("too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  const url = new URL(req.url, "http://localhost");

  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders(origin));
    res.end();
    return;
  }
  if (url.pathname === "/health") {
    reply(res, 200, { ok: true, telegram: !!CONFIG.telegramToken, mail: !!CONFIG.smtpUser }, origin);
    return;
  }
  if (req.method !== "POST" || url.pathname !== "/api/lead") {
    reply(res, 404, { ok: false, error: "not found" }, origin);
    return;
  }

  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress;
  if (rateLimited(ip)) {
    reply(res, 429, { ok: false, error: "слишком много заявок, попробуйте позже" }, origin);
    return;
  }

  let lead;
  try {
    lead = JSON.parse(await readBody(req));
  } catch {
    reply(res, 400, { ok: false, error: "некорректный запрос" }, origin);
    return;
  }

  // Ловушка для ботов: поле скрыто, живой человек его не заполнит.
  if (String(lead.website || "").trim()) {
    console.log(`[${new Date().toISOString()}] honeypot, заявка отброшена (${ip})`);
    reply(res, 200, { ok: true }, origin);
    return;
  }

  const problem = validate(lead);
  if (problem) {
    reply(res, 400, { ok: false, error: problem }, origin);
    return;
  }

  const payload = clean(lead);
  const text = formatLead(payload);

  const [telegram, mail] = await Promise.allSettled([
    sendToTelegram(payload, text),
    sendToMail(payload, text)
  ]);

  const delivered = [telegram, mail].some((r) => r.status === "fulfilled" && r.value.ok);
  for (const [channel, result] of [["telegram", telegram], ["mail", mail]]) {
    if (result.status === "rejected") console.error(`[${channel}]`, result.reason?.message || result.reason);
    else if (result.value.skipped) console.warn(`[${channel}] пропущено: ${result.value.skipped}`);
  }

  // Заявка пишется в файл всегда — даже если оба канала недоступны.
  try {
    fs.appendFileSync(
      CONFIG.logFile,
      JSON.stringify({ at: new Date().toISOString(), ip, delivered, ...payload, resume: payload.resume?.name }) + "\n"
    );
  } catch (e) {
    console.error("[log]", e.message);
  }

  if (!delivered) {
    reply(res, 502, { ok: false, error: "не удалось доставить заявку" }, origin);
    return;
  }
  reply(res, 200, { ok: true }, origin);
});

server.listen(CONFIG.port, CONFIG.host, () => {
  console.log(`OCTAGON-FIT lead API — http://${CONFIG.host}:${CONFIG.port}/api/lead`);
  console.log(`  Telegram: ${CONFIG.telegramToken ? "настроен" : "НЕ НАСТРОЕН"}`);
  console.log(`  Почта:    ${CONFIG.smtpUser ? CONFIG.mailTo : "НЕ НАСТРОЕНА"}`);
});
