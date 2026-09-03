// Lin-Lingua server: serves the static app and proxies AI calls to OpenRouter.
// Run: `npm install && cp .env.example .env` (fill in OPENROUTER_API_KEY) `npm start`.

require("dotenv").config();
const express = require("express");
const path = require("path");
const crypto = require("crypto");
const { SCENARIOS, LANG_NAMES } = require("./scenarios.js");

const app = express();
app.set("trust proxy", 1); // корректный req.secure за прокси (nginx/платформа)
const PORT = parseInt(process.env.PORT || "3000", 10);
const MODEL = process.env.MODEL || "google/gemini-2.0-flash-exp:free";
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
const APP_TITLE = process.env.APP_TITLE || "Lin-Lingua";

const BASE_URL = (process.env.BASE_URL || "https://api.apiyi.com/v1").replace(/\/+$/, "");
const CHAT_URL = `${BASE_URL}/chat/completions`;

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "10kb" }));

// ===== Auth =====
const AUTH_USER = process.env.AUTH_USER || "pankov";
const AUTH_PASS = process.env.AUTH_PASS || "Salkon";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 дней

// Если AUTH_SECRET не задан — генерируется случайный (сессии перестанут
// приниматься после рестарта сервера). Для постоянных сессий задайте в .env.
const AUTH_SECRET = process.env.AUTH_SECRET || crypto.randomBytes(32).toString("hex");

function sessionToken(user, exp) {
  const sig = crypto.createHmac("sha256", AUTH_SECRET).update(`${user}:${exp}`).digest("hex");
  return `${user}.${exp}.${sig}`;
}

function verifyToken(token) {
  if (typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [user, expStr, sig] = parts;
  const exp = parseInt(expStr, 10);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const expected = sessionToken(user, exp).split(".")[2];
  return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  for (const pair of raw.split(";")) {
    const i = pair.indexOf("=");
    if (i < 0) continue;
    out[pair.slice(0, i).trim()] = decodeURIComponent(pair.slice(i + 1).trim());
  }
  return out;
}

function isAuthed(req) {
  return verifyToken(parseCookies(req).ll_session);
}

const LOGIN_HTML = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lin-Lingua — вход</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh; display: flex; align-items: center; justify-content: center;
      background: #0e1116; color: #e6e9ef;
      font-family: Inter, system-ui, -apple-system, sans-serif;
    }
    .card {
      width: 100%; max-width: 320px; padding: 32px 28px;
      background: #161b22; border: 1px solid #262d38; border-radius: 12px;
    }
    .brand { font-family: "JetBrains Mono", monospace; font-size: 18px; margin-bottom: 24px; }
    .brand b { color: #7aa2f7; }
    label { display: block; font-size: 12px; color: #9aa4b2; margin: 14px 0 6px; }
    input {
      width: 100%; padding: 10px 12px; border-radius: 8px;
      background: #0e1116; border: 1px solid #303947; color: #e6e9ef;
      font-size: 14px; outline: none;
    }
    input:focus { border-color: #7aa2f7; }
    button {
      width: 100%; margin-top: 22px; padding: 11px; border: 0; border-radius: 8px;
      background: #7aa2f7; color: #0e1116; font-weight: 600; font-size: 14px;
      cursor: pointer;
    }
    button:hover { background: #8db0f8; }
    .err { margin-top: 14px; font-size: 13px; color: #f7768e; min-height: 18px; }
  </style>
</head>
<body>
  <form class="card" method="POST" action="/login">
    <div class="brand">lin<b>-</b>lingua</div>
    <label for="login">Логин</label>
    <input id="login" name="login" type="text" autocomplete="username" required autofocus>
    <label for="password">Пароль</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required>
    <button type="submit">Войти</button>
    <div class="err">{{ERR}}</div>
  </form>
</body>
</html>`;

function loginPage(err) {
  return LOGIN_HTML.replace("{{ERR}}", err || "");
}

// Публичные маршруты — только логин; всё остальное требует сессию.
app.use((req, res, next) => {
  if (req.path === "/login") return next();
  if (isAuthed(req)) return next();
  if (req.path.startsWith("/api/")) return res.status(401).json({ error: "Unauthorized" });
  res.redirect("/login");
});

app.get("/login", (req, res) => {
  if (isAuthed(req)) return res.redirect("/");
  res.type("html").send(loginPage());
});

app.post("/login", (req, res) => {
  const { login, password } = req.body || {};
  const okUser = login === AUTH_USER;
  const okPass = typeof password === "string"
    && crypto.timingSafeEqual(Buffer.from(password.padEnd(64)), Buffer.from(AUTH_PASS.padEnd(64)));
  if (!okUser || !okPass) {
    return res.status(401).type("html").send(loginPage("Неверный логин или пароль"));
  }
  const exp = Date.now() + SESSION_TTL_MS;
  res.cookie("ll_session", sessionToken(login, exp), {
    httpOnly: true,
    sameSite: "lax",
    secure: req.secure,
    maxAge: SESSION_TTL_MS,
    path: "/",
  });
  res.redirect("/");
});

app.get("/logout", (req, res) => {
  res.clearCookie("ll_session", { path: "/" });
  res.redirect("/login");
});

// Block direct access to server-only files (dotfiles are blocked by default).
app.use((req, res, next) => {
  const blocked = new Set(["/server.js", "/package.json", "/package-lock.json"]);
  if (blocked.has(req.path) || req.path.startsWith("/node_modules/")) {
    return res.status(404).send("Not found");
  }
  next();
});

app.use(express.static(__dirname, { dotfiles: "deny" }));

// ===== Helpers =====

function getScenario(id) {
  return SCENARIOS.find(s => s.id === id);
}

function buildChatMessages({ scenario, lang, mode, messages }) {
  const langName = LANG_NAMES[lang] || "English";
  const systemContent = mode === "interactive"
    ? buildInteractiveSystem(scenario, langName)
    : buildProductionSystem(scenario, langName);

  return [
    { role: "system", content: systemContent },
    ...messages,
  ];
}

function buildInteractiveSystem(scenario, langName) {
  return [
    `You are roleplaying as ${scenario.aiRole}.`,
    `Scenario: "${scenario.title}". ${scenario.description}`,
    `The user is a Russian-speaking software engineer practicing ${langName} for working in an international team.`,
    `Reply in ${langName}, naturally and concisely (1-3 sentences). Drive the conversation forward — ask questions, give realistic responses for the scenario.`,
    ``,
    `For EVERY user turn you must return a single JSON object (no prose around it):`,
    `{`,
    `  "corrections": [ { "wrong": "<user's exact wrong span>", "correct": "<corrected version>", "translation": "<Russian translation of the corrected version>" }, ... ],`,
    `  "reply": "<your in-character reply in ${langName}>"`,
    `}`,
    ``,
    `Rules:`,
    `- Include only REAL mistakes (grammar, vocabulary, naturalness, tense). Skip stylistic preferences.`,
    `- If the user's message is correct, return "corrections": [].`,
    `- "wrong" must be the exact span as the user wrote it (or a short fragment of it). "correct" must be a natural rewrite.`,
    `- "translation" is in Russian.`,
    `- Reply is in ${langName} only — never mix Russian into the reply.`,
    `- Do not wrap the JSON in markdown code fences.`,
  ].join("\n");
}

function buildProductionSystem(scenario, langName) {
  return [
    `You are roleplaying as ${scenario.aiRole}.`,
    `Scenario: "${scenario.title}". ${scenario.description}`,
    `The user is a Russian-speaking software engineer practicing ${langName} for working in an international team.`,
    `Reply in ${langName}, naturally and concisely (1-3 sentences). Drive the conversation forward — ask questions, give realistic responses for the scenario.`,
    `Do NOT correct the user's mistakes during the conversation. Just respond as the role would. The review happens after the session.`,
    `Reply in plain text (no JSON, no markdown).`,
  ].join("\n");
}

function buildReviewMessages({ scenario, lang, messages }) {
  const langName = LANG_NAMES[lang] || "English";
  const transcript = messages
    .filter(m => m.role === "user" || m.role === "assistant")
    .map(m => `${m.role === "user" ? "USER" : "AI"}: ${m.content}`)
    .join("\n");

  const system = [
    `You are a ${langName} language coach. The user just had a ${scenario.title} roleplay in ${langName}.`,
    `Analyze ONLY the user's messages (lines starting with "USER:") and return a single JSON object (no prose, no markdown):`,
    `{`,
    `  "mistakes": [ { "wrong": "<user span>", "correct": "<corrected version>", "translation": "<Russian translation of the corrected version>", "explanation": "<short Russian explanation>" }, ... ],`,
    `  "summary": "<1-2 sentences in Russian summarizing how they did and what to focus on>"`,
    `}`,
    `Rules: include only real mistakes (max 8); skip stylistic preferences. If the user wrote almost nothing, return mistakes: [] and a short Russian summary.`,
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: `Conversation transcript:\n${transcript}` },
  ];
}

async function callOpenRouter(messages, { json = false } = {}) {
  if (!OPENROUTER_KEY) {
    throw new Error("OPENROUTER_API_KEY is not set in .env");
  }
  const body = {
    model: MODEL,
    messages,
  };
  if (json) body.response_format = { type: "json_object" };

  const resp = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENROUTER_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": APP_URL,
      "X-Title": APP_TITLE,
    },
    body: JSON.stringify(body),
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`OpenRouter ${resp.status}: ${text.slice(0, 500)}`);
  }
  let data;
  try { data = JSON.parse(text); }
  catch { throw new Error(`OpenRouter returned non-JSON: ${text.slice(0, 200)}`); }
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error(`OpenRouter response missing content: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return content;
}

// Some models prefix JSON with ```json or wrap it; strip that defensively.
function safeParseJson(text) {
  let s = text.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }
  // Find first { and last } to be more robust
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first >= 0 && last > first) s = s.slice(first, last + 1);
  return JSON.parse(s);
}

// ===== API =====

app.get("/api/scenarios", (req, res) => {
  res.json({ scenarios: SCENARIOS });
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    model: MODEL,
    hasKey: Boolean(OPENROUTER_KEY),
  });
});

app.post("/api/chat", async (req, res) => {
  try {
    const { scenario: scenarioId, lang, mode, messages } = req.body || {};
    const scenario = getScenario(scenarioId);
    if (!scenario) return res.status(400).json({ error: "Unknown scenario" });
    if (!lang || !LANG_NAMES[lang]) return res.status(400).json({ error: "Unknown language" });
    if (mode !== "interactive" && mode !== "production") return res.status(400).json({ error: "Unknown mode" });
    if (!Array.isArray(messages)) return res.status(400).json({ error: "messages must be an array" });

    const fullMessages = buildChatMessages({ scenario, lang, mode, messages });
    const wantJson = mode === "interactive";
    const raw = await callOpenRouter(fullMessages, { json: wantJson });

    if (wantJson) {
      try {
        const parsed = safeParseJson(raw);
        return res.json({
          corrections: Array.isArray(parsed.corrections) ? parsed.corrections : [],
          reply: typeof parsed.reply === "string" ? parsed.reply : "",
        });
      } catch (e) {
        // Fallback: treat the raw text as the reply, no corrections.
        return res.json({ corrections: [], reply: raw });
      }
    }

    return res.json({ reply: raw });
  } catch (err) {
    console.error("[/api/chat]", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/review", async (req, res) => {
  try {
    const { scenario: scenarioId, lang, messages } = req.body || {};
    const scenario = getScenario(scenarioId);
    if (!scenario) return res.status(400).json({ error: "Unknown scenario" });
    if (!lang || !LANG_NAMES[lang]) return res.status(400).json({ error: "Unknown language" });
    if (!Array.isArray(messages)) return res.status(400).json({ error: "messages must be an array" });

    const fullMessages = buildReviewMessages({ scenario, lang, messages });
    const raw = await callOpenRouter(fullMessages, { json: true });

    try {
      const parsed = safeParseJson(raw);
      return res.json({
        mistakes: Array.isArray(parsed.mistakes) ? parsed.mistakes : [],
        summary: typeof parsed.summary === "string" ? parsed.summary : "",
      });
    } catch {
      return res.json({ mistakes: [], summary: raw });
    }
  } catch (err) {
    console.error("[/api/review]", err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Lin-Lingua running at ${APP_URL}`);
  console.log(`Provider: ${BASE_URL}`);
  console.log(`Model: ${MODEL}`);
  if (!OPENROUTER_KEY) {
    console.warn("⚠️  OPENROUTER_API_KEY is not set. AI features will fail.");
    console.warn("    Copy .env.example to .env and set the key.");
  }
});
