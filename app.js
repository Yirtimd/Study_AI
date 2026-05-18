(() => {
  const STORAGE_KEY = "studi-en-state-v3";

  const SRS_INTERVALS_MIN = [10, 60 * 24, 60 * 24 * 3, 60 * 24 * 7, 60 * 24 * 21, 60 * 24 * 60];
  const SRS_LABELS = ["10 минут", "1 день", "3 дня", "1 неделю", "3 недели", "2 месяца"];

  const TYPE_LABELS = { word: "Слова", phrase: "Фразы", cloze: "Cloze (пропуск)" };

  // ===== Language config =====
  const LANGS = {
    en: {
      name: "Английский",
      shortLabel: "EN",
      ttsLang: "en-US",
      words: typeof WORDS !== "undefined" ? WORDS : [],
      phrases: typeof PHRASES !== "undefined" ? PHRASES : [],
    },
    ja: {
      name: "Японский",
      shortLabel: "JA",
      ttsLang: "ja-JP",
      words: typeof JA_WORDS !== "undefined" ? JA_WORDS : [],
      phrases: typeof JA_PHRASES !== "undefined" ? JA_PHRASES : [],
    },
    it: {
      name: "Итальянский",
      shortLabel: "IT",
      ttsLang: "it-IT",
      words: typeof IT_WORDS !== "undefined" ? IT_WORDS : [],
      phrases: typeof IT_PHRASES !== "undefined" ? IT_PHRASES : [],
    },
  };

  // Convert raw card (lang-specific shape) into a unified runtime card.
  function normalizeCard(c, lang) {
    const out = {
      lang,
      type: c.type || "word",
      ru: c.ru,
      cat: c.cat,
      blank: c.blank,
    };
    if (lang === "ja") {
      out.primary = c.ja;
      // show kana hint only if it differs from primary (e.g. primary has kanji)
      out.kana = c.kana && c.kana !== c.ja ? c.kana : null;
      out.romaji = c.romaji || null;
      out.forms = [c.ja, c.kana, c.romaji].filter(Boolean);
      out.blankForms = [c.blank, c.blankKana, c.blankRomaji].filter(Boolean);
    } else {
      // EN, IT, and any other Latin-script language: lang code matches the field name.
      const primary = c[lang];
      out.primary = primary;
      out.kana = null;
      out.romaji = null;
      out.forms = [primary, ...(c.alt || [])].filter(Boolean);
      out.blankForms = c.blank ? [c.blank] : [];
    }
    return out;
  }

  function buildCardsForLang(lang) {
    const cfg = LANGS[lang];
    return [
      ...cfg.words.map(w => normalizeCard(w, lang)),
      ...cfg.phrases.map(p => normalizeCard(p, lang)),
    ];
  }

  // ===== State =====
  const state = loadState();

  function defaultState() {
    return {
      stats: {},                        // keyed by `${lang}::${type}::${primary}::${cat}`
      sessionCorrect: 0,
      sessionWrong: 0,
      lang: "en",
      activeCats: { en: null, ja: null }, // null => default to all
      activeTypes: { en: null, ja: null },
      direction: "ru-fl",                 // "ru-fl" or "fl-ru"
      shuffle: true,
      srs: true,
      autoSpeak: false,
      kanaSet: "hiragana",                // "hiragana" or "katakana"
      kanaOpen: false,
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        // Try migrating from v2
        const old = localStorage.getItem("studi-en-state-v2");
        if (old) return migrateV2(JSON.parse(old));
        return defaultState();
      }
      const parsed = JSON.parse(raw);
      const merged = { ...defaultState(), ...parsed };
      // Make sure activeCats/activeTypes are objects
      if (Array.isArray(merged.activeCats)) merged.activeCats = { en: merged.activeCats, ja: null };
      if (Array.isArray(merged.activeTypes)) merged.activeTypes = { en: merged.activeTypes, ja: null };
      if (!merged.activeCats || typeof merged.activeCats !== "object") merged.activeCats = { en: null, ja: null };
      if (!merged.activeTypes || typeof merged.activeTypes !== "object") merged.activeTypes = { en: null, ja: null };
      return merged;
    } catch { return defaultState(); }
  }

  function migrateV2(v2) {
    const fresh = defaultState();
    fresh.stats = {};
    // re-key stats with `en::` prefix
    if (v2.stats) {
      for (const [k, v] of Object.entries(v2.stats)) {
        fresh.stats[`en::${k}`] = v;
      }
    }
    fresh.sessionCorrect = v2.sessionCorrect || 0;
    fresh.sessionWrong = v2.sessionWrong || 0;
    fresh.activeCats = { en: Array.isArray(v2.activeCats) ? v2.activeCats : null, ja: null };
    fresh.activeTypes = { en: Array.isArray(v2.activeTypes) ? v2.activeTypes : null, ja: null };
    fresh.direction = v2.direction === "en-ru" ? "fl-ru" : "ru-fl";
    fresh.shuffle = v2.shuffle ?? true;
    fresh.srs = v2.srs ?? true;
    fresh.autoSpeak = v2.autoSpeak ?? false;
    return fresh;
  }

  function saveState() {
    state.shuffle = els.optShuffle.checked;
    state.srs = els.optSrs.checked;
    state.autoSpeak = els.optAutoSpeak.checked;
    state.direction = [...els.direction].find(r => r.checked).value;
    state.lang = [...els.langRadios].find(r => r.checked).value;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  // ===== DOM =====
  const els = {
    cat: document.getElementById("card-cat"),
    prompt: document.getElementById("card-prompt"),
    hint: document.getElementById("card-hint"),
    input: document.getElementById("answer-input"),
    form: document.getElementById("card-form"),
    check: document.getElementById("btn-check"),
    reveal: document.getElementById("btn-reveal"),
    skip: document.getElementById("btn-skip"),
    speak: document.getElementById("btn-speak"),
    feedback: document.getElementById("card-feedback"),
    statCorrect: document.getElementById("stat-correct"),
    statWrong: document.getElementById("stat-wrong"),
    statDue: document.getElementById("stat-due"),
    statProgress: document.getElementById("stat-progress"),
    optShuffle: document.getElementById("opt-shuffle"),
    optSrs: document.getElementById("opt-srs"),
    optAutoSpeak: document.getElementById("opt-autospeak"),
    catFilter: document.getElementById("cat-filter"),
    catAll: document.getElementById("cat-all"),
    catNone: document.getElementById("cat-none"),
    typeFilter: document.getElementById("type-filter"),
    direction: document.querySelectorAll('input[name="direction"]'),
    langRadios: document.querySelectorAll('input[name="lang"]'),
    dirFlLabels: document.querySelectorAll('.dir-fl-label'),
    reset: document.getElementById("btn-reset"),
    session: document.getElementById("btn-session"),
    sessionInfo: document.getElementById("session-info"),
    help: document.getElementById("btn-help"),
    helpOverlay: document.getElementById("help-overlay"),
    helpClose: document.getElementById("help-close"),
    helpTitle: document.getElementById("help-title"),
    helpBody: document.getElementById("help-body"),
    kana: document.getElementById("btn-kana"),
    kanaPanel: document.getElementById("kana-panel"),
    kanaGrid: document.getElementById("kana-grid"),
    kanaTabs: document.querySelectorAll(".kana-tab"),
    kanaBs: document.getElementById("kana-bs"),
    kanaClear: document.getElementById("kana-clear"),
  };

  // ===== Mutable runtime =====
  let allCardsForLang = [];   // current language's full card pool
  let allCategories = [];     // unique categories in current lang
  const allTypes = ["word", "phrase", "cloze"];
  let deck = [];
  let currentIdx = 0;
  let answered = false;
  let session = null; // { queue, total, correctCount, mistakes }

  function activeCats() {
    const v = state.activeCats[state.lang];
    return v == null ? [...allCategories] : v;
  }
  function activeTypes() {
    const v = state.activeTypes[state.lang];
    return v == null ? [...allTypes] : v;
  }
  function setActiveCats(arr) { state.activeCats[state.lang] = arr; }
  function setActiveTypes(arr) { state.activeTypes[state.lang] = arr; }

  // ===== Card key, normalization, accepted answers =====
  function cardKey(c) { return `${c.lang}::${c.type}::${c.primary}::${c.cat}`; }

  function normalizeFL(s, lang) {
    s = s.toLowerCase().trim()
      .replace(/[?!.,;:'"`()、。「」]/g, "");
    if (lang === "ja") {
      // Japanese: drop all whitespace (no spaces in JA, romaji can be typed either way).
      // Convert macrons to double vowels for romaji input (ohayō -> ohayou-ish).
      s = s.replace(/\s+/g, "")
           .replace(/ā/g, "aa").replace(/ī/g, "ii")
           .replace(/ū/g, "uu").replace(/ē/g, "ee")
           .replace(/ō/g, "ou");
    } else if (lang === "it") {
      // Italian: strip accents so "università" / "universita" both match.
      s = s.replace(/[àáâãä]/g, "a")
           .replace(/[èéêë]/g, "e")
           .replace(/[ìíîï]/g, "i")
           .replace(/[òóôõö]/g, "o")
           .replace(/[ùúûü]/g, "u")
           .replace(/\s+/g, " ");
    } else {
      s = s.replace(/\s+/g, " ");
    }
    return s;
  }

  function normalizeRu(s) {
    return s.toLowerCase().trim()
      .replace(/ё/g, "е")
      .replace(/[?!.,;:'"`]/g, "")
      .replace(/\s+/g, " ");
  }

  function acceptedAnswers(card, direction) {
    if (card.type === "cloze") {
      return card.blankForms.map(s => normalizeFL(s, card.lang));
    }
    if (direction === "ru-fl") {
      return card.forms.map(s => normalizeFL(s, card.lang));
    }
    // fl-ru: accept Russian, splitting by "/" and stripping parenthetical hints
    return card.ru.split("/").map(s =>
      normalizeRu(s.replace(/\(.*?\)/g, "").trim())
    ).filter(Boolean);
  }

  // What to show as the "correct answer" after check or reveal.
  function answerHint(card, direction) {
    if (card.type === "cloze") return card.blank;
    if (direction === "ru-fl") {
      // Show all forms compactly: 学校 (がっこう) — gakkou
      if (card.lang === "ja") {
        const parts = [card.primary];
        if (card.kana) parts.push(card.kana);
        if (card.romaji) parts.push(card.romaji);
        return parts.join(" · ");
      }
      return card.primary;
    }
    return card.ru;
  }

  // ===== SRS =====
  function scheduleCard(card, correct) {
    const k = cardKey(card);
    const s = state.stats[k] ||= { correct: 0, wrong: 0, streak: 0, box: 0, due: 0 };
    if (correct) {
      s.correct++;
      s.streak = (s.streak || 0) + 1;
      s.box = Math.min((s.box || 0) + 1, SRS_INTERVALS_MIN.length - 1);
    } else {
      s.wrong++;
      s.streak = 0;
      s.box = 0;
    }
    s.due = Date.now() + SRS_INTERVALS_MIN[s.box] * 60 * 1000;
    return s;
  }

  function isDue(card, now) {
    const s = state.stats[cardKey(card)];
    if (!s) return true;
    return s.due <= now;
  }

  function dueCount() {
    const now = Date.now();
    const cats = activeCats();
    const types = activeTypes();
    return allCardsForLang.filter(c =>
      cats.includes(c.cat) && types.includes(c.type) && isDue(c, now)
    ).length;
  }

  // ===== Deck =====
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function rebuildDeck() {
    if (session) {
      updateSessionInfo();
      return;
    }

    const cats = activeCats();
    const types = activeTypes();
    const filtered = allCardsForLang.filter(c =>
      cats.includes(c.cat) && types.includes(c.type)
    );

    if (state.srs) {
      const now = Date.now();
      const due = filtered.filter(c => isDue(c, now));
      due.sort((a, b) => {
        const sa = state.stats[cardKey(a)];
        const sb = state.stats[cardKey(b)];
        if (sa && sb) return sa.due - sb.due;
        if (sa) return -1;
        if (sb) return 1;
        return 0;
      });
      const reviewing = due.filter(c => state.stats[cardKey(c)]);
      const newCards = shuffle(due.filter(c => !state.stats[cardKey(c)]));
      deck = [...reviewing, ...newCards];
    } else {
      deck = state.shuffle ? shuffle([...filtered]) : [...filtered];
    }

    currentIdx = 0;
    updateSessionInfo();
    showCard();
  }

  // ===== Rendering =====
  function renderClozePromptHtml(card) {
    const blank = `<span class="blank">&nbsp;</span>`;
    return escapeHtml(card.primary).replace(/___+/, blank);
  }

  function getCurrentCard() {
    if (session) return session.queue[0] || null;
    return deck[currentIdx] || null;
  }

  function showCard() {
    answered = false;
    els.input.className = "";
    els.input.value = "";
    els.feedback.textContent = "";
    els.feedback.className = "card-feedback";
    setCheckLabel("Проверить");

    if (session && session.queue.length === 0) {
      els.cat.textContent = "";
      els.prompt.textContent = `Сессия пройдена! ${session.correctCount} из ${session.total}`;
      els.hint.textContent = `Ошибок за сессию: ${session.mistakes}`;
      els.input.disabled = true;
      els.speak.disabled = true;
      updateStats();
      return;
    }

    if (!session && deck.length === 0) {
      els.cat.textContent = "";
      els.prompt.textContent = state.srs
        ? "Все карточки повторены — приходи позже."
        : "Нет карточек — выберите категорию или тип.";
      els.hint.textContent = "";
      els.input.disabled = true;
      els.speak.disabled = true;
      updateStats();
      return;
    }

    els.input.disabled = false;
    els.speak.disabled = false;
    const card = getCurrentCard();
    const dir = state.direction;

    els.cat.textContent = `${TYPE_LABELS[card.type] || card.type} · ${card.cat}`;

    if (card.type === "cloze") {
      els.prompt.innerHTML = renderClozePromptHtml(card);
      // For JA cloze with kana variant, show kana sentence + ru. For EN cloze, just ru.
      if (card.lang === "ja" && card.kana) {
        els.hint.textContent = `${card.kana} — ${card.ru}`;
      } else {
        els.hint.textContent = card.ru;
      }
      els.input.placeholder = card.lang === "ja"
        ? "Введите пропущенное (можно ромадзи или каной)"
        : "Введите пропущенное слово";
    } else if (dir === "ru-fl") {
      els.prompt.textContent = card.ru;
      els.hint.textContent = "";
      els.input.placeholder =
        card.lang === "ja" ? "Введите по-японски (иероглифика, кана или ромадзи)" :
        card.lang === "it" ? "Введите по-итальянски (артикль необязателен)" :
        "Введите перевод на английском";
    } else { // fl-ru
      els.prompt.textContent = card.primary;
      // For JA, show kana + romaji as recognition aid
      if (card.lang === "ja") {
        const aid = [card.kana, card.romaji].filter(Boolean).join(" · ");
        els.hint.textContent = aid;
      } else {
        els.hint.textContent = "";
      }
      els.input.placeholder = "Введите перевод на русском";
    }

    els.input.focus();
    updateStats();

    if (state.autoSpeak && (card.type === "cloze" || dir === "fl-ru")) {
      speak(speakText(card), card.lang);
    }
  }

  function nextCard() {
    if (session) { showCard(); return; }
    if (state.srs) { rebuildDeck(); return; }
    currentIdx = (currentIdx + 1) % deck.length;
    if (currentIdx === 0 && state.shuffle) shuffle(deck);
    showCard();
  }

  function skipCard() {
    if (session && !answered && session.queue.length > 0) {
      const c = session.queue.shift();
      session.queue.push(c);
      renderSessionUI();
      showCard();
      return;
    }
    nextCard();
  }

  function checkAnswer() {
    const card = getCurrentCard();
    if (!card) return;
    const guess = card.type === "cloze"
      ? normalizeFL(els.input.value, card.lang)
      : state.direction === "fl-ru"
        ? normalizeRu(els.input.value)
        : normalizeFL(els.input.value, card.lang);
    if (!guess) { els.input.focus(); return; }

    const accepted = acceptedAnswers(card, state.direction);
    const correct = accepted.includes(guess);

    const stat = scheduleCard(card, correct);
    if (correct) state.sessionCorrect++; else state.sessionWrong++;

    if (session) {
      if (correct) {
        session.queue.shift();
        session.correctCount++;
      } else {
        const c = session.queue.shift();
        session.queue.push(c);
        session.mistakes++;
      }
    }

    const dueLabel = SRS_LABELS[stat.box];
    const tail = session
      ? (correct
          ? `<span class="srs-info">Осталось ${session.queue.length} из ${session.total}</span>`
          : `<span class="srs-info">Карточка вернётся ещё раз в этой сессии</span>`)
      : (state.srs
          ? `<span class="srs-info">${correct ? "Следующий показ через" : "Покажу снова через"} ${dueLabel}</span>`
          : "");

    if (correct) {
      els.input.className = "ok";
      els.feedback.className = "card-feedback ok";
      els.feedback.innerHTML = `Верно — <strong>${escapeHtml(answerHint(card, state.direction))}</strong>${tail}`;
    } else {
      els.input.className = "err";
      els.feedback.className = "card-feedback err";
      els.feedback.innerHTML = `Не совсем. Правильно: <strong>${escapeHtml(answerHint(card, state.direction))}</strong>${tail}`;
    }

    answered = true;
    setCheckLabel("Дальше →");
    saveState();
    updateStats();
    renderSessionUI();

    if (state.autoSpeak) speak(speakText(card), card.lang);
  }

  function revealAnswer() {
    // If answer is already shown, treat the second click as "next card"
    // instead of re-running reveal (which would advance the session queue
    // or re-count the card as wrong).
    if (answered) {
      nextCard();
      return;
    }
    const card = getCurrentCard();
    if (!card) return;
    els.input.value = card.type === "cloze" ? card.blank : (state.direction === "ru-fl" ? card.primary : card.ru);
    els.input.className = "";
    els.feedback.className = "card-feedback";
    els.feedback.innerHTML = `<strong>${escapeHtml(answerHint(card, state.direction))}</strong>`;
    const stat = scheduleCard(card, false);
    state.sessionWrong++;

    if (session) {
      const c = session.queue.shift();
      session.queue.push(c);
      session.mistakes++;
      els.feedback.innerHTML += `<span class="srs-info">Карточка вернётся ещё раз в этой сессии</span>`;
    } else if (state.srs) {
      els.feedback.innerHTML += `<span class="srs-info">Покажу снова через ${SRS_LABELS[stat.box]}</span>`;
    }
    answered = true;
    setCheckLabel("Дальше →");
    saveState();
    updateStats();
    renderSessionUI();
    if (state.autoSpeak) speak(speakText(card), card.lang);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function setCheckLabel(text) {
    const lbl = document.getElementById("btn-check-label");
    if (lbl) lbl.textContent = text;
    else els.check.textContent = text;
  }

  function updateStats() {
    els.statCorrect.textContent = state.sessionCorrect;
    els.statWrong.textContent = state.sessionWrong;
    els.statDue.textContent = dueCount();
    let cur, tot;
    if (session) {
      cur = session.correctCount; tot = session.total;
      els.statProgress.textContent = `${cur} / ${tot}`;
    } else {
      cur = deck.length === 0 ? 0 : currentIdx + 1;
      tot = deck.length;
      els.statProgress.textContent = deck.length === 0 ? "0 / 0" : `${cur} / ${tot}`;
    }
    const fill = document.getElementById("progress-fill");
    if (fill) fill.style.width = tot > 0 ? `${Math.min(100, (cur / tot) * 100)}%` : "0%";
  }

  // ===== Session =====
  function startSession() {
    const cats = activeCats();
    const types = activeTypes();
    const filtered = allCardsForLang.filter(c =>
      cats.includes(c.cat) && types.includes(c.type)
    );
    if (filtered.length === 0) {
      alert("Выберите хотя бы одну категорию и тип карточек.");
      return;
    }
    session = {
      queue: shuffle([...filtered]),
      total: filtered.length,
      correctCount: 0,
      mistakes: 0,
    };
    renderSessionUI();
    showCard();
  }

  function stopSession() {
    if (session && session.queue.length > 0 && session.correctCount > 0) {
      if (!confirm(`Прервать сессию? Прогресс: ${session.correctCount} из ${session.total}.`)) return;
    }
    session = null;
    renderSessionUI();
    rebuildDeck();
  }

  function renderSessionUI() {
    if (session) {
      els.session.textContent = "Стоп сессия";
      els.session.classList.add("in-session");
    } else {
      els.session.textContent = "Начать сессию";
      els.session.classList.remove("in-session");
    }
    updateSessionInfo();
  }

  function updateSessionInfo() {
    if (!session) {
      const cats = activeCats();
      const types = activeTypes();
      const total = allCardsForLang.filter(c =>
        cats.includes(c.cat) && types.includes(c.type)
      ).length;
      els.sessionInfo.className = "session-info";
      els.sessionInfo.textContent = total > 0
        ? `В выбранных категориях: ${total} карточек`
        : "Выберите категории и тип";
      return;
    }
    if (session.queue.length === 0) {
      els.sessionInfo.className = "session-info done";
      els.sessionInfo.textContent = `Готово! ${session.correctCount} из ${session.total}, ошибок: ${session.mistakes}`;
      return;
    }
    els.sessionInfo.className = "session-info active";
    els.sessionInfo.textContent = `Осталось: ${session.queue.length} из ${session.total} · ошибок: ${session.mistakes}`;
  }

  // ===== Kana keyboard =====
  const HIRAGANA_LAYOUT = [
    { section: "Основные (五十音)" },
    ["あ","い","う","え","お"],
    ["か","き","く","け","こ"],
    ["さ","し","す","せ","そ"],
    ["た","ち","つ","て","と"],
    ["な","に","ぬ","ね","の"],
    ["は","ひ","ふ","へ","ほ"],
    ["ま","み","む","め","も"],
    ["や","","ゆ","","よ"],
    ["ら","り","る","れ","ろ"],
    ["わ","","","","を","ん"],
    { section: "Дакутэн / Хандакутэн (озвончение)" },
    ["が","ぎ","ぐ","げ","ご"],
    ["ざ","じ","ず","ぜ","ぞ"],
    ["だ","ぢ","づ","で","ど"],
    ["ば","び","ぶ","べ","ぼ"],
    ["ぱ","ぴ","ぷ","ぺ","ぽ"],
    { section: "Ё-он (мягкие сочетания)" },
    ["きゃ","きゅ","きょ","しゃ","しゅ","しょ","ちゃ","ちゅ","ちょ"],
    ["にゃ","にゅ","にょ","ひゃ","ひゅ","ひょ","みゃ","みゅ","みょ"],
    ["りゃ","りゅ","りょ","ぎゃ","ぎゅ","ぎょ","じゃ","じゅ","じょ"],
    ["びゃ","びゅ","びょ","ぴゃ","ぴゅ","ぴょ"],
    { section: "Малые знаки и пунктуация" },
    ["っ","ゃ","ゅ","ょ","ぁ","ぃ","ぅ","ぇ","ぉ"],
    ["ー","。","、","「","」"],
  ];

  function hiraToKata(s) {
    return s.split("").map(c => {
      const code = c.charCodeAt(0);
      // Hiragana block U+3041..U+3096 → Katakana block U+30A1..U+30F6
      return (code >= 0x3041 && code <= 0x3096)
        ? String.fromCharCode(code + 0x60)
        : c;
    }).join("");
  }

  function getLayout(set) {
    if (set === "katakana") {
      return HIRAGANA_LAYOUT.map(row =>
        Array.isArray(row) ? row.map(hiraToKata) : row
      );
    }
    return HIRAGANA_LAYOUT;
  }

  function insertAtCursor(text) {
    const input = els.input;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const value = input.value;
    input.value = value.substring(0, start) + text + value.substring(end);
    const newPos = start + text.length;
    input.setSelectionRange(newPos, newPos);
    input.focus();
  }

  function backspaceAtCursor() {
    const input = els.input;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const value = input.value;
    if (start === end && start > 0) {
      input.value = value.substring(0, start - 1) + value.substring(end);
      input.setSelectionRange(start - 1, start - 1);
    } else if (start !== end) {
      input.value = value.substring(0, start) + value.substring(end);
      input.setSelectionRange(start, start);
    }
    input.focus();
  }

  function buildKanaGrid(set) {
    const layout = getLayout(set);
    els.kanaGrid.innerHTML = "";
    layout.forEach(row => {
      if (!Array.isArray(row)) {
        const label = document.createElement("div");
        label.className = "kana-row-label";
        label.textContent = row.section;
        els.kanaGrid.appendChild(label);
        return;
      }
      row.forEach(ch => {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "kana-key" + (ch === "" ? " empty" : "");
        cell.textContent = ch;
        cell.tabIndex = -1;
        if (ch !== "") {
          // mousedown preventDefault keeps focus on the input field
          cell.addEventListener("mousedown", e => e.preventDefault());
          cell.addEventListener("click", () => insertAtCursor(ch));
        }
        els.kanaGrid.appendChild(cell);
      });
      // Pad row to fill grid line if shorter than 10
      const padding = 10 - row.length;
      if (padding > 0 && padding < 10) {
        for (let i = 0; i < padding; i++) {
          const filler = document.createElement("span");
          filler.className = "kana-key empty";
          els.kanaGrid.appendChild(filler);
        }
      }
    });
  }

  function setKanaSet(set) {
    state.kanaSet = set;
    els.kanaTabs.forEach(b => b.classList.toggle("active", b.dataset.set === set));
    buildKanaGrid(set);
    saveState();
  }

  function setKanaOpen(open) {
    state.kanaOpen = open;
    els.kanaPanel.hidden = !open;
    els.kana.classList.toggle("active", open);
    saveState();
  }

  function applyKanaVisibility() {
    const showButton = state.lang === "ja";
    els.kana.hidden = !showButton;
    if (!showButton) {
      els.kanaPanel.hidden = true;
      els.kana.classList.remove("active");
    } else {
      // restore last open/closed state
      els.kanaPanel.hidden = !state.kanaOpen;
      els.kana.classList.toggle("active", !!state.kanaOpen);
    }
  }

  // ===== Help =====
  const HELP_CONTENT = {
    ja: {
      title: "Японский режим — справка",
      html: `
        <div class="help-section">
          <h3>Что принимается при вводе</h3>
          <p>Карточка считается верной, если ты ввёл <em>любую</em> из трёх форм:</p>
          <ul>
            <li>иероглифика — <code>学校</code></li>
            <li>кана — <code>がっこう</code></li>
            <li>ромадзи — <code>gakkou</code></li>
          </ul>
          <p>Регистр, пробелы и знаки препинания игнорируются. Можно набирать <code>konnichi wa</code> или <code>konnichiwa</code> — оба варианта подойдут.</p>
          <p>Долгие гласные с макронами тоже принимаются: <code>ohayō</code> приравнивается к <code>ohayou</code>.</p>
        </div>

        <div class="help-section">
          <h3>Подсказки в режиме JA → RU</h3>
          <p>Когда показывается <code>学校</code>, под ним мелким текстом видно <code>がっこう · gakkou</code>. Удобно, если ещё не выучил иероглиф.</p>
          <p>В режиме RU → JA подсказок нет — это активная отработка.</p>
        </div>

        <div class="help-section">
          <h3>Cloze (пропуск слова)</h3>
          <p>Если в предложении есть кандзи, под основной формой показывается чтение каной — видно, в каком месте пропуск, даже без знания иероглифов.</p>
          <p>Ввод пропущенного слова принимается в любой форме (иероглифика / кана / ромадзи).</p>
        </div>

        <div class="help-section">
          <h3>Озвучка</h3>
          <p>Кнопка <kbd>🔊</kbd> или хоткей <kbd>Alt</kbd>+<kbd>S</kbd> — браузер читает японский текст голосом <code>ja-JP</code> (включая иероглифы).</p>
        </div>

        <div class="help-section">
          <h3>Экранная кана-клавиатура</h3>
          <p>Кнопка <kbd>あ</kbd> рядом с озвучкой открывает панель с каной — вместо того чтобы переключать системную раскладку.</p>
          <p>Переключатель <em>Хирагана / Катакана</em> наверху панели меняет азбуку. Тычешь по знаку — он вставляется в активный input в позиции курсора.</p>
          <p>Доступны все 46 базовых знаков, дакутэн/хандакутэн (озвончённые), ё-он (мягкие сочетания типа きゃ), малые знаки (っ, ゃ, ぃ) и пунктуация.</p>
          <p>Кнопки <code>⌫</code> и <code>очистить</code> — стирают последний знак или весь ввод.</p>
        </div>

        <div class="help-section">
          <h3>Прогресс и категории</h3>
          <p>SRS-статистика, выбор категорий и активная сессия хранятся <em>отдельно</em> для каждого языка. Переключение EN ↔ JA не сбивает прогресс по другому языку.</p>
          <p>При переключении языка во время сессии — она прерывается (очередь была из старого языка).</p>
        </div>
      `,
    },
    it: {
      title: "Итальянский режим — справка",
      html: `
        <div class="help-section">
          <h3>Что принимается при вводе</h3>
          <p>Существительные хранятся с определённым артиклем — это помогает запоминать род: <code>la casa</code>, <code>il libro</code>, <code>l'amico</code>.</p>
          <p>При проверке принимается и форма с артиклем, и без: <code>la casa</code> ↔ <code>casa</code>.</p>
          <p>Диакритику можно опускать: <code>università</code> и <code>universita</code> равноценны. Также <code>perché</code> ↔ <code>perche</code>, <code>è</code> ↔ <code>e</code>.</p>
          <p>Регистр и пунктуация игнорируются.</p>
        </div>

        <div class="help-section">
          <h3>Tu или Lei?</h3>
          <p>В словаре есть оба регистра: неформальный (<code>scusa</code>, <code>come stai?</code>) и вежливый (<code>scusi</code>, <code>come sta?</code>). Для рабочей переписки чаще нужен <em>Lei</em>-стиль.</p>
          <p>В письмах: <code>cordiali saluti</code>, <code>distinti saluti</code>, <code>in attesa di un suo riscontro</code>, <code>resto a disposizione</code>.</p>
        </div>

        <div class="help-section">
          <h3>Озвучка</h3>
          <p>Кнопка <kbd>🔊</kbd> или хоткей <kbd>Alt</kbd>+<kbd>S</kbd> — голос <code>it-IT</code>.</p>
        </div>

        <div class="help-section">
          <h3>Полезные блоки</h3>
          <p>Отдельные категории для стендапа, ведения встреч, дедлайнов, кодревью, инцидентов и идиом — собирай сессию из того, что нужно прямо сейчас.</p>
          <p>Cloze разделён на «фразы» (заполни идиому: <code>in bocca al ___</code>) и «грамматику» (предлоги: <code>vado ___ ufficio</code>).</p>
        </div>
      `,
    },
    en: {
      title: "Английский режим — справка",
      html: `
        <div class="help-section">
          <h3>Ввод</h3>
          <p>Принимаются написания, регистр и пробелы игнорируются. Точки, запятые, апострофы можно опускать: <code>let's get started</code> и <code>lets get started</code> равноценны.</p>
        </div>

        <div class="help-section">
          <h3>Озвучка</h3>
          <p>Кнопка <kbd>🔊</kbd> или <kbd>Alt</kbd>+<kbd>S</kbd> — голос <code>en-US</code>.</p>
        </div>

        <div class="help-section">
          <h3>SRS и сессии</h3>
          <p>Карточки возвращаются на повтор по интервалам Лейтнера: 10 минут → день → 3 дня → неделя → 3 недели → 2 месяца.</p>
          <p>Внутри сессии правило другое: неправильные карточки возвращаются в конец очереди и появляются ещё раз в этой же сессии, а не через 10 минут.</p>
        </div>
      `,
    },
  };

  function showHelp() {
    const cfg = HELP_CONTENT[state.lang] || HELP_CONTENT.en;
    els.helpTitle.textContent = cfg.title;
    els.helpBody.innerHTML = cfg.html;
    els.helpOverlay.hidden = false;
    els.helpOverlay.setAttribute("aria-hidden", "false");
    // Move focus to close button so ESC works without prior focus
    setTimeout(() => els.helpClose.focus(), 0);
  }

  function hideHelp() {
    els.helpOverlay.hidden = true;
    els.helpOverlay.setAttribute("aria-hidden", "true");
    els.input.focus();
  }

  // ===== TTS =====
  function speakText(card) {
    if (card.type === "cloze") return card.primary.replace(/___+/, card.blank);
    return card.primary;
  }

  let speakingTimer = null;
  function speak(text, lang) {
    if (!("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = (LANGS[lang] && LANGS[lang].ttsLang) || "en-US";
    u.rate = 0.95;
    els.speak.classList.add("speaking");
    clearTimeout(speakingTimer);
    u.onend = u.onerror = () => els.speak.classList.remove("speaking");
    speakingTimer = setTimeout(() => els.speak.classList.remove("speaking"), 6000);
    speechSynthesis.speak(u);
  }

  // ===== Filters =====
  function buildFilter(container, items, activeList, labelFn, onChange) {
    container.innerHTML = "";
    items.forEach(item => {
      const chip = document.createElement("span");
      chip.className = "cat-chip" + (activeList.includes(item) ? " active" : "");
      chip.textContent = labelFn(item);
      chip.addEventListener("click", () => {
        const idx = activeList.indexOf(item);
        if (idx >= 0) activeList.splice(idx, 1);
        else activeList.push(item);
        chip.classList.toggle("active");
        onChange();
      });
      container.appendChild(chip);
    });
  }

  function buildAllFilters() {
    // Materialize null defaults so filter handlers mutate persistent arrays
    if (state.activeTypes[state.lang] == null) state.activeTypes[state.lang] = [...allTypes];
    if (state.activeCats[state.lang] == null) state.activeCats[state.lang] = [...allCategories];

    buildFilter(els.typeFilter, allTypes, state.activeTypes[state.lang],
      t => TYPE_LABELS[t], () => { saveState(); rebuildDeck(); });
    buildFilter(els.catFilter, allCategories, state.activeCats[state.lang],
      c => c, () => { saveState(); rebuildDeck(); });
  }

  // ===== Language switching =====
  function applyLanguage() {
    allCardsForLang = buildCardsForLang(state.lang);
    allCategories = [...new Set(allCardsForLang.map(c => c.cat))];

    // Auto-enable categories that exist in the data but aren't in the user's
    // saved active list — happens when new categories are added between sessions.
    // Without this, new categories would appear in the chip list but be inactive,
    // so their cards would never enter the deck.
    const saved = state.activeCats[state.lang];
    if (Array.isArray(saved)) {
      let added = false;
      const known = new Set(saved);
      allCategories.forEach(c => {
        if (!known.has(c)) { saved.push(c); added = true; }
      });
      if (added) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    // Update FL labels in direction radios
    els.dirFlLabels.forEach(el => { el.textContent = LANGS[state.lang].shortLabel; });
    // Toggle body class so the prompt swaps to a JP-friendly font
    document.body.classList.toggle("is-lang-ja", state.lang === "ja");
    // Stop any ongoing session — its queue is from the old language
    session = null;
    renderSessionUI();
    buildAllFilters();
    applyKanaVisibility();
    rebuildDeck();
  }

  // ===== Wiring =====
  els.optShuffle.checked = state.shuffle ?? true;
  els.optSrs.checked = state.srs ?? true;
  els.optAutoSpeak.checked = state.autoSpeak ?? false;
  els.direction.forEach(r => { r.checked = (r.value === (state.direction || "ru-fl")); });
  els.langRadios.forEach(r => { r.checked = (r.value === (state.lang || "en")); });

  els.form.addEventListener("submit", e => {
    e.preventDefault();
    if (answered) nextCard(); else checkAnswer();
  });

  els.reveal.addEventListener("click", revealAnswer);
  els.skip.addEventListener("click", skipCard);
  els.session.addEventListener("click", () => {
    if (session) stopSession(); else startSession();
  });
  els.speak.addEventListener("click", () => {
    const card = getCurrentCard();
    if (card) speak(speakText(card), card.lang);
  });

  document.addEventListener("keydown", e => {
    if (e.altKey && (e.key === "s" || e.key === "S" || e.key === "ы")) {
      e.preventDefault();
      const card = getCurrentCard();
      if (card) speak(speakText(card), card.lang);
    }
  });

  // Cmd+Shift (Mac) / Ctrl+Shift (Win/Linux) chord — show answer.
  // Fires when both modifiers are pressed together (no third key).
  let cmdShiftFired = false;
  document.addEventListener("keydown", e => {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey
        && (e.key === "Shift" || e.key === "Meta" || e.key === "Control")) {
      if (!cmdShiftFired) {
        cmdShiftFired = true;
        revealAnswer();
      }
    }
  });
  document.addEventListener("keyup", e => {
    if (e.key === "Shift" || e.key === "Meta" || e.key === "Control") {
      cmdShiftFired = false;
    }
  });

  els.catAll.addEventListener("click", () => {
    setActiveCats([...allCategories]);
    buildAllFilters();
    saveState();
    rebuildDeck();
  });
  els.catNone.addEventListener("click", () => {
    setActiveCats([]);
    buildAllFilters();
    saveState();
    rebuildDeck();
  });

  els.optShuffle.addEventListener("change", () => { saveState(); rebuildDeck(); });
  els.optSrs.addEventListener("change", () => { saveState(); rebuildDeck(); });
  els.optAutoSpeak.addEventListener("change", saveState);

  els.direction.forEach(r => r.addEventListener("change", () => {
    saveState();
    showCard();
  }));

  els.langRadios.forEach(r => r.addEventListener("change", () => {
    const newLang = [...els.langRadios].find(x => x.checked).value;
    const switchingTo = newLang !== state.lang ? newLang : null;
    state.lang = newLang;
    saveState();
    applyLanguage();
    // Auto-open help when switching INTO a non-default language for the first time in this switch.
    if (switchingTo === "ja" || switchingTo === "it") showHelp();
  }));

  // Kana keyboard wiring
  els.kana.addEventListener("click", () => setKanaOpen(els.kanaPanel.hidden));
  els.kanaTabs.forEach(btn => {
    btn.addEventListener("mousedown", e => e.preventDefault());
    btn.addEventListener("click", () => setKanaSet(btn.dataset.set));
  });
  els.kanaBs.addEventListener("mousedown", e => e.preventDefault());
  els.kanaBs.addEventListener("click", backspaceAtCursor);
  els.kanaClear.addEventListener("mousedown", e => e.preventDefault());
  els.kanaClear.addEventListener("click", () => { els.input.value = ""; els.input.focus(); });
  setKanaSet(state.kanaSet || "hiragana");

  els.help.addEventListener("click", showHelp);
  els.helpClose.addEventListener("click", hideHelp);
  els.helpOverlay.addEventListener("click", e => {
    if (e.target === els.helpOverlay) hideHelp();
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !els.helpOverlay.hidden) {
      e.preventDefault();
      hideHelp();
    }
  });

  els.reset.addEventListener("click", () => {
    if (!confirm("Сбросить весь прогресс и статистику?")) return;
    localStorage.removeItem(STORAGE_KEY);
    Object.assign(state, defaultState());
    els.optShuffle.checked = true;
    els.optSrs.checked = true;
    els.optAutoSpeak.checked = false;
    els.direction.forEach(r => { r.checked = (r.value === "ru-fl"); });
    els.langRadios.forEach(r => { r.checked = (r.value === "en"); });
    applyLanguage();
  });

  applyLanguage();
})();
