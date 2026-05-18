// AI-практика: пикер сценария + чат с двумя режимами (interactive / production).
// Читает текущий язык из localStorage (общий стейт с app.js).

(() => {
  const STORAGE_KEY = "studi-en-state-v3";
  const CHAT_PREF_KEY = "studi-lingua-chat-prefs-v1";

  const els = {
    pickerLang: null, // not used directly; we derive lang from main state

    viewRadios: document.querySelectorAll('input[name="view"]'),
    cardFrame: document.getElementById("card"),
    sessionFrame: document.getElementById("session-frame"),
    kanaPanel: document.getElementById("kana-panel"),

    picker: document.getElementById("chat-picker"),
    pickerScenarios: document.getElementById("chat-scenarios"),
    pickerStatus: document.getElementById("chat-status"),
    aiModeRadios: document.querySelectorAll('input[name="ai-mode"]'),

    panel: document.getElementById("chat-panel"),
    title: document.getElementById("chat-title"),
    modetag: document.getElementById("chat-modetag"),
    end: document.getElementById("chat-end"),
    messages: document.getElementById("chat-messages"),
    form: document.getElementById("chat-form"),
    input: document.getElementById("chat-input"),
    send: document.getElementById("chat-send"),
  };

  // Bail out if the chat markup isn't present (chat.js loaded but UI not built).
  if (!els.picker || !els.panel) return;

  const prefs = loadPrefs();
  if (prefs.mode === "production" || prefs.mode === "interactive") {
    [...els.aiModeRadios].forEach(r => { r.checked = (r.value === prefs.mode); });
  }

  let activeScenario = null;       // SCENARIOS entry currently in use
  let activeMode = currentMode();  // "interactive" | "production"
  let conversation = [];           // [{role:'user'|'assistant', content:'...'}]
  let sending = false;             // request in flight
  let healthChecked = false;

  // ===== Helpers =====

  function loadPrefs() {
    try { return JSON.parse(localStorage.getItem(CHAT_PREF_KEY) || "{}"); }
    catch { return {}; }
  }
  function savePrefs() {
    localStorage.setItem(CHAT_PREF_KEY, JSON.stringify(prefs));
  }

  function currentMode() {
    const r = [...els.aiModeRadios].find(x => x.checked);
    return r ? r.value : "interactive";
  }

  function currentLang() {
    try {
      const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return s.lang === "ja" || s.lang === "it" ? s.lang : "en";
    } catch { return "en"; }
  }

  function langPlaceholder() {
    const l = currentLang();
    if (l === "ja") return "日本語で入力してください…";
    if (l === "it") return "Scrivi in italiano…";
    return "Type in English…";
  }

  function modeLabel(mode) {
    return mode === "interactive" ? "интерактивный" : "продакшн";
  }

  // Show/hide panels for the AI view.
  // We also toggle a body class so the kana panel stays hidden even when
  // app.js's applyKanaVisibility() runs (e.g. on language switch).
  function showCardView() {
    document.body.classList.remove("is-view-ai");
    els.picker.hidden = true;
    els.panel.hidden = true;
  }
  function showAIView() {
    document.body.classList.add("is-view-ai");
    if (activeScenario) {
      els.picker.hidden = true;
      els.panel.hidden = false;
      els.input.focus();
    } else {
      els.picker.hidden = false;
      els.panel.hidden = true;
    }
    pingHealthOnce();
  }

  async function pingHealthOnce() {
    if (healthChecked) return;
    healthChecked = true;
    try {
      const r = await fetch("/api/health");
      if (!r.ok) throw new Error("HTTP " + r.status);
      const data = await r.json();
      if (!data.hasKey) {
        els.pickerStatus.textContent = "⚠ ключ не настроен";
        els.pickerStatus.style.color = "var(--err)";
      } else {
        els.pickerStatus.textContent = data.model || "";
        els.pickerStatus.style.color = "var(--fg-2)";
      }
    } catch (e) {
      els.pickerStatus.textContent = "⚠ сервер недоступен";
      els.pickerStatus.style.color = "var(--err)";
    }
  }

  // ===== Picker =====

  function renderScenarios() {
    const list = (typeof SCENARIOS !== "undefined" && Array.isArray(SCENARIOS)) ? SCENARIOS : [];
    els.pickerScenarios.innerHTML = "";
    list.forEach(s => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ll-scenario";
      btn.innerHTML = `
        <span class="ll-scenario__title"></span>
        <span class="ll-scenario__desc"></span>
      `;
      btn.querySelector(".ll-scenario__title").textContent = s.title;
      btn.querySelector(".ll-scenario__desc").textContent = s.description;
      btn.addEventListener("click", () => startScenario(s));
      els.pickerScenarios.appendChild(btn);
    });
  }

  // ===== Scenario session =====

  function startScenario(scenario) {
    activeScenario = scenario;
    activeMode = currentMode();
    conversation = [];
    els.title.textContent = `AI · ${scenario.title}`;
    els.modetag.textContent = modeLabel(activeMode);
    els.input.placeholder = langPlaceholder();
    els.input.value = "";
    els.messages.innerHTML = "";
    els.picker.hidden = true;
    els.panel.hidden = false;

    // Seed with the scenario's starter (AI's opening line).
    const lang = currentLang();
    const opener = scenario.starter[lang] || scenario.starter.en;
    appendMessage("assistant", opener);
    conversation.push({ role: "assistant", content: opener });

    setTimeout(() => els.input.focus(), 0);
  }

  function endScenario() {
    if (!activeScenario) return;
    const isProduction = activeMode === "production";
    const userMessages = conversation.filter(m => m.role === "user");

    if (isProduction && userMessages.length > 0) {
      requestReview();
    } else {
      // Just exit back to picker
      backToPicker();
    }
  }

  function backToPicker() {
    activeScenario = null;
    conversation = [];
    els.panel.hidden = true;
    els.picker.hidden = false;
  }

  // ===== Sending =====

  els.form.addEventListener("submit", async e => {
    e.preventDefault();
    if (sending || !activeScenario) return;
    const text = els.input.value.trim();
    if (!text) return;

    appendMessage("user", text);
    conversation.push({ role: "user", content: text });
    els.input.value = "";

    const typingNode = appendTyping();
    setSending(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenario: activeScenario.id,
          lang: currentLang(),
          mode: activeMode,
          messages: conversation,
        }),
      });
      typingNode.remove();
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();

      // For interactive mode, render corrections under the user message we just sent.
      if (activeMode === "interactive") {
        renderCorrections(data.corrections || []);
      }

      const reply = (data.reply || "").trim();
      if (reply) {
        appendMessage("assistant", reply);
        conversation.push({ role: "assistant", content: reply });
      }
    } catch (err) {
      typingNode.remove();
      appendError(err.message || String(err));
    } finally {
      setSending(false);
      els.input.focus();
    }
  });

  els.end.addEventListener("click", endScenario);

  // ===== Render =====

  function appendMessage(role, content) {
    const wrap = document.createElement("div");
    wrap.className = `ll-msg ll-msg--${role === "user" ? "user" : "ai"}`;
    const lbl = document.createElement("span");
    lbl.className = "ll-msg__role";
    lbl.textContent = role === "user" ? "you" : "ai";
    const bubble = document.createElement("div");
    bubble.className = "ll-msg__bubble";
    bubble.textContent = content;
    wrap.append(lbl, bubble);
    els.messages.appendChild(wrap);
    scrollToBottom();
    return wrap;
  }

  function appendTyping() {
    const wrap = document.createElement("div");
    wrap.className = "ll-msg ll-msg--ai";
    wrap.innerHTML = `
      <span class="ll-msg__role">ai</span>
      <div class="ll-msg__bubble">
        <span class="ll-typing"><span></span><span></span><span></span></span>
      </div>
    `;
    els.messages.appendChild(wrap);
    scrollToBottom();
    return wrap;
  }

  function appendError(text) {
    const wrap = document.createElement("div");
    wrap.className = "ll-msg ll-msg--system";
    const box = document.createElement("div");
    box.className = "ll-error";
    box.textContent = "Ошибка: " + text;
    wrap.appendChild(box);
    els.messages.appendChild(wrap);
    scrollToBottom();
  }

  function renderCorrections(corrections) {
    const wrap = document.createElement("div");
    wrap.className = "ll-msg ll-msg--user";

    if (!corrections || corrections.length === 0) {
      const empty = document.createElement("div");
      empty.className = "ll-corrections ll-corrections--empty";
      empty.textContent = "✓ без замечаний";
      wrap.appendChild(empty);
    } else {
      const box = document.createElement("div");
      box.className = "ll-corrections";
      corrections.forEach(c => box.appendChild(renderCorrection(c)));
      wrap.appendChild(box);
    }
    els.messages.appendChild(wrap);
    scrollToBottom();
  }

  function renderCorrection(c) {
    const block = document.createElement("div");
    block.className = "ll-correction";
    block.append(
      iconCell("✗", "err"),
      textCell(c.wrong || "", "err"),
      iconCell("✓", "ok"),
      textCell(c.correct || "", "ok"),
      iconCell("ru", "ru"),
      textCell(c.translation || "", "ru"),
    );
    return block;
  }

  function iconCell(text, kind) {
    const el = document.createElement("span");
    el.className = `ll-correction__icon ll-correction__icon--${kind}`;
    el.textContent = text;
    return el;
  }
  function textCell(text, kind) {
    const el = document.createElement("span");
    el.className = `ll-correction__text ll-correction__text--${kind}`;
    el.textContent = text;
    return el;
  }

  function setSending(on) {
    sending = on;
    els.send.disabled = on;
    els.input.disabled = on;
  }

  function scrollToBottom() {
    els.messages.scrollTop = els.messages.scrollHeight;
  }

  // ===== Review (production-mode end) =====

  async function requestReview() {
    setSending(true);
    const typing = appendTyping();
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenario: activeScenario.id,
          lang: currentLang(),
          messages: conversation,
        }),
      });
      typing.remove();
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      renderReview(data);
    } catch (err) {
      typing.remove();
      appendError(err.message || String(err));
    } finally {
      setSending(false);
    }
  }

  function renderReview({ summary, mistakes }) {
    const wrap = document.createElement("div");
    wrap.className = "ll-msg ll-msg--system";
    const box = document.createElement("div");
    box.className = "ll-review";
    box.innerHTML = `<div class="ll-review__title">Разбор сессии</div>`;
    if (summary) {
      const s = document.createElement("div");
      s.className = "ll-review__summary";
      s.textContent = summary;
      box.appendChild(s);
    }
    if (Array.isArray(mistakes) && mistakes.length > 0) {
      const list = document.createElement("ul");
      list.className = "ll-review__list";
      mistakes.forEach(m => {
        const item = document.createElement("li");
        item.className = "ll-correction";
        item.append(
          iconCell("✗", "err"),
          textCell(m.wrong || "", "err"),
          iconCell("✓", "ok"),
          textCell(m.correct || "", "ok"),
          iconCell("ru", "ru"),
          textCell(m.translation || "", "ru"),
        );
        if (m.explanation) {
          const expl = document.createElement("div");
          expl.className = "ll-correction__expl";
          expl.style.gridColumn = "1 / -1";
          expl.textContent = m.explanation;
          item.appendChild(expl);
        }
        list.appendChild(item);
      });
      box.appendChild(list);
    } else {
      const ok = document.createElement("div");
      ok.className = "ll-review__summary";
      ok.textContent = "Существенных ошибок не нашлось — отлично.";
      box.appendChild(ok);
    }
    const back = document.createElement("button");
    back.type = "button";
    back.className = "ll-btn ll-btn--sm";
    back.style.alignSelf = "flex-start";
    back.textContent = "К списку сценариев";
    back.addEventListener("click", backToPicker);
    box.appendChild(back);
    wrap.appendChild(box);
    els.messages.appendChild(wrap);
    scrollToBottom();
  }

  // ===== Wiring =====

  // View toggle (Карточки / AI)
  els.viewRadios.forEach(r => r.addEventListener("change", () => {
    const v = [...els.viewRadios].find(x => x.checked).value;
    if (v === "ai") showAIView();
    else showCardView();
  }));

  // Mode switch live: update active mode and its tag.
  els.aiModeRadios.forEach(r => r.addEventListener("change", () => {
    activeMode = currentMode();
    prefs.mode = activeMode;
    savePrefs();
    if (activeScenario) {
      els.modetag.textContent = modeLabel(activeMode);
    }
  }));

  renderScenarios();

  // If user previously left in AI view, do nothing — view always starts on cards
  // unless toggled. (No persistence on the view radio itself for now.)
})();
