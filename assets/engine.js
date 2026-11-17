/* 密碼破譯大師 · 共用引擎
   所有模式（訓練場、每日密碼、無盡模式）共用此檔案。
   事件監聽只在 boot 綁定一次；重玩只重置狀態，不再疊加監聽器。 */
(function () {
  "use strict";

  var MM = (window.MM = window.MM || {});

  /* ========== 工具 ========== */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashSeed(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function ymd(d) {
    d = d || new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }
  function addDays(d, n) {
    var x = new Date(d.getTime());
    x.setDate(x.getDate() + n);
    return x;
  }

  MM.util = { $: $, el: el, pad2: pad2, ymd: ymd, addDays: addDays };

  /* ========== 存檔 ========== */

  var KEY = "mm.save.v1";

  function defaults() {
    return {
      v: 1,
      wallet: 3,
      stats: { solved: 0, played: 0, guesses: 0, fails: 0, shares: 0, byMode: { classic: 0, daily: 0, endless: 0 } },
      daily: { bestStreak: 0, calendar: {} },
      endless: { bestScore: 0, bestCodes: 0, plays: 0 },
      classic: {},
      ach: {}
    };
  }

  function loadSave() {
    var base = defaults();
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return base;
      var got = JSON.parse(raw);
      if (typeof got.wallet === "number") base.wallet = got.wallet;
      if (got.stats) {
        base.stats.solved = got.stats.solved || 0;
        base.stats.played = got.stats.played || 0;
        base.stats.guesses = got.stats.guesses || 0;
        base.stats.fails = got.stats.fails || 0;
        base.stats.shares = got.stats.shares || 0;
        if (got.stats.byMode) {
          base.stats.byMode.classic = got.stats.byMode.classic || 0;
          base.stats.byMode.daily = got.stats.byMode.daily || 0;
          base.stats.byMode.endless = got.stats.byMode.endless || 0;
        }
      }
      if (got.daily) {
        base.daily.bestStreak = got.daily.bestStreak || 0;
        base.daily.calendar = got.daily.calendar || {};
      }
      if (got.endless) {
        base.endless.bestScore = got.endless.bestScore || 0;
        base.endless.bestCodes = got.endless.bestCodes || 0;
        base.endless.plays = got.endless.plays || 0;
      }
      base.classic = got.classic || {};
      base.ach = got.ach || {};
      return base;
    } catch (e) {
      return base;
    }
  }

  var save = (MM.save = loadSave());

  MM.persist = function () {
    try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* 私密模式等情況忽略 */ }
  };
  MM.resetSave = function () {
    save = MM.save = defaults();
    MM.persist();
  };

  var toastNode = null;
  MM.toast = function (text) {
    if (toastNode) toastNode.remove();
    toastNode = el("div", "toast", text);
    toastNode.setAttribute("role", "status");
    document.body.appendChild(toastNode);
    setTimeout(function () {
      if (toastNode) { toastNode.remove(); toastNode = null; }
    }, 2400);
  };

  /* ========== 題目產生與判定 ========== */

  function rangeArr(min, max) {
    var a = [];
    for (var i = min; i <= max; i++) a.push(i);
    return a;
  }

  function pickFrom(arr, rng) {
    var i = Math.floor(rng() * arr.length);
    return arr.splice(i, 1)[0];
  }

  /* dup：同一數字出現次數（0 表示全部不重複），保證一定有 dup 次重複 */
  function genCode(cfg, rng) {
    rng = rng || Math.random;
    var pool = rangeArr(cfg.min, cfg.max);
    var code = [];
    var i;
    if (cfg.dup) {
      var d = pickFrom(pool, rng);
      for (i = 0; i < cfg.dup; i++) code.push(d);
      for (i = 0; i < cfg.digits - cfg.dup; i++) code.push(pickFrom(pool, rng));
    } else {
      for (i = 0; i < cfg.digits; i++) code.push(pickFrom(pool, rng));
    }
    for (i = code.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = code[i]; code[i] = code[j]; code[j] = t;
    }
    return code;
  }

  /* 回傳每格 "hit"（位置正確）／"near"（數字正確位置錯）／"miss"（不在密碼中） */
  function judge(code, guess) {
    var res = [];
    var i, j;
    for (i = 0; i < guess.length; i++) res.push("miss");
    var sc = code.slice();
    var gc = guess.slice();
    for (i = 0; i < gc.length; i++) {
      if (gc[i] === sc[i]) { res[i] = "hit"; sc[i] = null; gc[i] = null; }
    }
    for (i = 0; i < gc.length; i++) {
      if (gc[i] === null) continue;
      for (j = 0; j < sc.length; j++) {
        if (sc[j] !== null && sc[j] === gc[i]) { res[i] = "near"; sc[j] = null; break; }
      }
    }
    return res;
  }

  MM.genCode = genCode;
  MM.judge = judge;

  /* ========== 模式設定 ========== */

  MM.CLASSIC = {
    l1: { digits: 4, min: 0, max: 9, dup: 0, attempts: 6, hints: 0, name: "訓練場 一", spec: "4 位數字，0 至 9，6 次機會" },
    l2: { digits: 6, min: 1, max: 15, dup: 0, attempts: 10, hints: 0, name: "訓練場 二", spec: "6 位數字，1 至 15，10 次機會" },
    l3: { digits: 8, min: 1, max: 15, dup: 0, attempts: 12, hints: 0, name: "訓練場 三", spec: "8 位數字，1 至 15，12 次機會" },
    l4: { digits: 10, min: 1, max: 20, dup: 2, attempts: 15, hints: 3, name: "訓練場 四", spec: "10 位數字，1 至 20，其中一個數字重複出現 2 次，15 次機會" },
    l5: { digits: 12, min: 1, max: 40, dup: 3, attempts: 18, hints: 2, name: "訓練場 五", spec: "12 位數字，1 至 40，其中一個數字重複出現 3 次，18 次機會" }
  };

  /* 每日密碼：星期幾決定長度（週一最短，週末最長） */
  var DAILY_BY_WEEKDAY = [
    { digits: 6, attempts: 9 }, // 日
    { digits: 4, attempts: 7 }, // 一
    { digits: 4, attempts: 7 }, // 二
    { digits: 5, attempts: 8 }, // 三
    { digits: 5, attempts: 8 }, // 四
    { digits: 5, attempts: 8 }, // 五
    { digits: 6, attempts: 9 }  // 六
  ];

  function dailyCfg(date) {
    date = date || new Date();
    var base = DAILY_BY_WEEKDAY[date.getDay()];
    return {
      digits: base.digits, min: 0, max: 9, dup: 0, attempts: base.attempts, hints: 1,
      seed: "mm-daily-" + ymd(date), name: "每日密碼",
      spec: base.digits + " 位數字，0 至 9，全球同一題，" + base.attempts + " 次機會"
    };
  }
  MM.dailyCfg = dailyCfg;

  /* 無盡模式：階梯難度，每層 3 題，之後循環最尾一層 */
  var LADDER = [
    { digits: 4, min: 0, max: 9, dup: 0, attempts: 6 },
    { digits: 5, min: 0, max: 9, dup: 0, attempts: 7 },
    { digits: 5, min: 1, max: 15, dup: 0, attempts: 8 },
    { digits: 6, min: 1, max: 15, dup: 0, attempts: 9 },
    { digits: 6, min: 1, max: 20, dup: 2, attempts: 10 },
    { digits: 7, min: 1, max: 20, dup: 0, attempts: 10 },
    { digits: 8, min: 1, max: 25, dup: 2, attempts: 11 },
    { digits: 9, min: 1, max: 30, dup: 2, attempts: 12 },
    { digits: 10, min: 1, max: 35, dup: 2, attempts: 12 },
    { digits: 12, min: 1, max: 40, dup: 3, attempts: 14 }
  ];

  function endlessCfg(cleared) {
    var stage = Math.min(Math.floor((cleared || 0) / 3), LADDER.length - 1);
    var base = LADDER[stage];
    return {
      digits: base.digits, min: base.min, max: base.max, dup: base.dup, attempts: base.attempts,
      hints: 0, stage: stage, name: "無盡模式", spec: "難度隨表現提升，3 條命"
    };
  }
  MM.endlessCfg = endlessCfg;

  var RANKS = [[0, "見習"], [1, "學徒"], [3, "譯碼員"], [6, "破譯師"], [10, "高級破譯師"], [15, "密碼大師"], [20, "宗師"], [30, "傳說"]];
  MM.rankFor = function (codes) {
    var title = RANKS[0][1];
    for (var i = 0; i < RANKS.length; i++) if (codes >= RANKS[i][0]) title = RANKS[i][1];
    return title;
  };

  /* ========== 每日連續天數 ========== */

  function solvedOn(key) {
    var rec = save.daily.calendar[key];
    return !!(rec && rec.win);
  }

  MM.dailyStreak = function (now) {
    var d = now ? new Date(now.getTime()) : new Date();
    if (!solvedOn(ymd(d))) d = addDays(d, -1);
    var n = 0;
    while (solvedOn(ymd(d))) { n++; d = addDays(d, -1); }
    return n;
  };

  MM.dailyToday = function () { return save.daily.calendar[ymd()] || null; };

  /* ========== 成就 ========== */

  var ACH = (MM.ACH = [
    { id: "first", name: "首次破譯", why: "完成第一次破譯", grant: 1, test: function () { return save.stats.solved >= 1; }, prog: function () { return [Math.min(save.stats.solved, 1), 1]; } },
    { id: "first_try", name: "一發入魂", why: "第一次猜測就命中", grant: 2, test: function (ev) { return ev.win && ev.attempts === 1; } },
    { id: "no_hint", name: "徒手破譯", why: "5 位以上，完全不靠提示破解", grant: 1, test: function (ev) { return ev.win && ev.digits >= 5 && ev.hintsUsed === 0; } },
    { id: "clean", name: "精準破譯", why: "全程沒有驗證過不存在的數字", grant: 3, test: function (ev) { return ev.win && ev.digits >= 4 && !ev.hadMiss; } },
    { id: "solve_10", name: "破譯十次", why: "累計破解 10 個密碼", grant: 2, test: function () { return save.stats.solved >= 10; }, prog: function () { return [Math.min(save.stats.solved, 10), 10]; } },
    { id: "solve_50", name: "破譯五十次", why: "累計破解 50 個密碼", grant: 3, test: function () { return save.stats.solved >= 50; }, prog: function () { return [Math.min(save.stats.solved, 50), 50]; } },
    { id: "solve_200", name: "破譯二百次", why: "累計破解 200 個密碼", grant: 5, test: function () { return save.stats.solved >= 200; }, prog: function () { return [Math.min(save.stats.solved, 200), 200]; } },
    { id: "daily_3", name: "連續三日", why: "每日密碼連續破解 3 日", grant: 2, test: function () { return save.daily.bestStreak >= 3; }, prog: function () { return [Math.min(save.daily.bestStreak, 3), 3]; } },
    { id: "daily_7", name: "一週不斷", why: "每日密碼連續破解 7 日", grant: 3, test: function () { return save.daily.bestStreak >= 7; }, prog: function () { return [Math.min(save.daily.bestStreak, 7), 7]; } },
    { id: "daily_30", name: "月度宗師", why: "每日密碼連續破解 30 日", grant: 6, test: function () { return save.daily.bestStreak >= 30; }, prog: function () { return [Math.min(save.daily.bestStreak, 30), 30]; } },
    { id: "endless_10", name: "無盡十連", why: "單次無盡模式破解 10 題", grant: 2, test: function () { return save.endless.bestCodes >= 10; }, prog: function () { return [Math.min(save.endless.bestCodes, 10), 10]; } },
    { id: "endless_25", name: "無盡廿五連", why: "單次無盡模式破解 25 題", grant: 4, test: function () { return save.endless.bestCodes >= 25; }, prog: function () { return [Math.min(save.endless.bestCodes, 25), 25]; } },
    { id: "endless_50", name: "無盡五十連", why: "單次無盡模式破解 50 題", grant: 6, test: function () { return save.endless.bestCodes >= 50; }, prog: function () { return [Math.min(save.endless.bestCodes, 50), 50]; } },
    { id: "score_5000", name: "五千分", why: "無盡模式單次 5000 分", grant: 3, test: function () { return save.endless.bestScore >= 5000; }, prog: function () { return [Math.min(save.endless.bestScore, 5000), 5000]; } },
    { id: "night", name: "深夜譯碼", why: "凌晨 0 至 5 點完成一次破解", grant: 1, test: function (ev) { return ev.win && ev.hour >= 0 && ev.hour < 5; } },
    { id: "try_again", name: "再接再厲", why: "累計失敗 10 次仍然繼續", grant: 1, test: function () { return save.stats.fails >= 10; }, prog: function () { return [Math.min(save.stats.fails, 10), 10]; } },
    { id: "share_1", name: "傳令兵", why: "第一次複製每日戰報", grant: 1, test: function () { return save.stats.shares >= 1; }, prog: function () { return [Math.min(save.stats.shares, 1), 1]; } }
  ]);

  MM.achById = function (id) {
    for (var i = 0; i < ACH.length; i++) if (ACH[i].id === id) return ACH[i];
    return null;
  };

  var bannerQueue = [];
  var bannerBusy = false;

  function showBanner(ach) {
    bannerQueue.push(ach);
    if (!bannerBusy) nextBanner();
  }

  function nextBanner() {
    if (!bannerQueue.length) { bannerBusy = false; return; }
    bannerBusy = true;
    var ach = bannerQueue.shift();
    var b = el("div", "banner");
    var panel = el("div", "panel panel__pad");
    panel.appendChild(el("div", "notice", "成就解鎖"));
    panel.appendChild(el("div", "badge__name", ach.name));
    panel.appendChild(el("div", "badge__why", ach.why + "，獲得提示卡 " + ach.grant + " 張"));
    b.appendChild(panel);
    document.body.appendChild(b);
    setTimeout(function () {
      b.remove();
      nextBanner();
    }, 2600);
  }

  MM.checkAch = function (ev) {
    var unlockedNow = [];
    for (var i = 0; i < ACH.length; i++) {
      var a = ACH[i];
      if (save.ach[a.id]) continue;
      var ok = false;
      try { ok = !!a.test(ev || {}); } catch (e) { ok = false; }
      if (ok) {
        save.ach[a.id] = Date.now();
        save.wallet += a.grant;
        unlockedNow.push(a);
      }
    }
    if (unlockedNow.length) {
      MM.persist();
      unlockedNow.forEach(showBanner);
    }
    return unlockedNow;
  };

  /* ========== 圖示與圖例 ========== */

  var ICONS = {
    back: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M10 3 5 8l5 5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    del: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M6.5 3h6A1.5 1.5 0 0 1 14 4.5v7A1.5 1.5 0 0 1 12.5 13h-6L2 8l4.5-5Z" stroke-linejoin="round"/><path d="M8.5 6.5 11.5 9.5M11.5 6.5 8.5 9.5" stroke-linecap="round"/></svg>',
    send: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M2.5 8 13.5 3 9.5 13 7.8 9.4 2.5 8Z" stroke-linejoin="round"/></svg>',
    bulb: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M8 2.2a4 4 0 0 1 2.4 7.2c-.5.4-.7.9-.7 1.4H6.3c0-.5-.2-1-.7-1.4A4 4 0 0 1 8 2.2Z" stroke-linejoin="round"/><path d="M6.5 13h3" stroke-linecap="round"/></svg>',
    check: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3.5 8.5 6.5 11.5 12.5 5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    copy: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5v-2A1.5 1.5 0 0 0 9 2H4A1.5 1.5 0 0 0 2.5 3.5v5A1.5 1.5 0 0 0 4 10h1.5"/></svg>',
    rules: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="M8 7.2V11" stroke-linecap="round"/><circle cx="8" cy="5" r="0.8" fill="currentColor" stroke="none"/></svg>'
  };
  MM.ICONS = ICONS;

  MM.legendBlock = function () {
    var wrap = el("div", "legend");
    [["hit", "位置正確"], ["near", "數字正確，位置錯了"], ["miss", "密碼中沒有此數字"]].forEach(function (row) {
      var item = el("div", "legend__item");
      var mark = el("span", "legend__mark legend__mark--" + row[0], "4");
      mark.setAttribute("aria-hidden", "true");
      item.appendChild(mark);
      item.appendChild(el("div", null, row[1]));
      wrap.appendChild(item);
    });
    return wrap;
  };

  /* ========== 遊戲頁 ========== */

  var PAGE = window.MM_PAGE || null;
  var state = null;
  /* 供除錯用：在 console 輸入 MM.state() 可看目前局勢 */
  MM.state = function () { return state; };
  var dom = {};
  var bound = false;
  var dailyTick = null;

  function initGamePage() {
    dom.history = $("#history");
    dom.hintbar = $("#hintbar");
    dom.current = $("#current");
    dom.keys = $("#keys");
    dom.readbar = $("#readbar");
    dom.side = $("#side");
    dom.result = $("#resultDialog");
    dom.title = $("#modeTitle");
    dom.spec = $("#modeSpec");

    if (PAGE.title && dom.title) dom.title.textContent = PAGE.title;

    buildSide();
    buildRulesDialog();
    if (!bound) { bindGlobal(); bound = true; }

    if (PAGE.kind === "classic") startClassic();
    else if (PAGE.kind === "daily") startDaily();
    else if (PAGE.kind === "endless") startEndless(true);
  }

  function buildSide() {
    if (!dom.side) return;
    dom.side.innerHTML = "";
    var rules = el("div", "panel panel__pad");
    rules.appendChild(el("h2", "badge__name", "玩法"));
    var list = el("ul", "rules-list");
    (PAGE.rules || []).forEach(function (r) { list.appendChild(el("li", null, r)); });
    rules.appendChild(list);
    var legend = MM.legendBlock();
    legend.style.marginTop = "var(--space-3)";
    rules.appendChild(legend);
    dom.side.appendChild(rules);

    var note = el("div", "panel panel__pad");
    note.appendChild(el("h2", "badge__name", "備註"));
    note.appendChild(el("p", "notice", "所有進度只存在此裝置的瀏覽器內，不會上傳。"));
    dom.side.appendChild(note);
  }

  function buildRulesDialog() {
    var dlg = el("dialog", "result");
    dlg.id = "rulesDialog";
    dlg.appendChild(el("h2", "dialog__title", PAGE.title || "玩法"));
    var list = el("ul", "rules-list");
    (PAGE.rules || []).forEach(function (r) { list.appendChild(el("li", null, r)); });
    dlg.appendChild(list);
    var legend = MM.legendBlock();
    legend.style.marginTop = "var(--space-4)";
    dlg.appendChild(legend);
    var actions = el("div", "dialog__actions");
    actions.style.marginTop = "var(--space-4)";
    var close = el("button", "btn btn--primary", "明白");
    close.type = "button";
    close.addEventListener("click", function () { dlg.close(); });
    actions.appendChild(close);
    dlg.appendChild(actions);
    document.body.appendChild(dlg);

    var rulesBtn = $("#rulesBtn");
    if (rulesBtn) {
      rulesBtn.innerHTML = ICONS.rules + "<span>玩法</span>";
      rulesBtn.addEventListener("click", function () { dlg.showModal(); });
    }
  }

  function bindGlobal() {
    document.addEventListener("keydown", function (e) {
      if (!state || state.ended) return;
      if (e.key === "Backspace") { e.preventDefault(); removeDigit(); return; }
      if (e.key === "Enter") { e.preventDefault(); submitGuess(); return; }
      if (e.key >= "0" && e.key <= "9") {
        var v = parseInt(e.key, 10);
        if (v < state.cfg.min || v > state.cfg.max) return;
        addDigit(v);
      }
    });
  }

  /* ---- 遊戲狀態 ---- */

  function startGame(cfg, opts) {
    opts = opts || {};
    var rng = cfg.seed ? mulberry32(hashSeed(cfg.seed)) : Math.random;
    state = {
      cfg: cfg,
      code: genCode(cfg, rng),
      attempt: 1,
      digits: [],
      revealed: {},
      rows: [],
      freeHints: cfg.hints || 0,
      hintsUsed: 0,
      hadMiss: false,
      ended: false,
      busy: false,
      startedAt: Date.now(),
      lives: opts.lives || 0,
      cleared: opts.cleared || 0,
      score: opts.score || 0,
      gameOver: false
    };
    setModeSpec(cfg);
    showHistoryEmpty();
    renderHintbar();
    renderCurrent();
    renderKeys();
    renderReadbar();
  }

  function setModeSpec(cfg) {
    if (!dom.spec) return;
    dom.spec.textContent = cfg.digits + " 位，" + cfg.attempts + " 次機會" + (cfg.dup ? "，含重複" : "");
  }

  function showHistoryEmpty() {
    if (!dom.history || !state) return;
    dom.history.innerHTML = "";
    dom.history.classList.add("history--empty");
    var box = el("div", "history__empty");
    box.appendChild(el("h2", "history__empty-title", "尚未提交"));
    box.appendChild(el("p", "history__empty-text",
      "依序輸入 " + state.cfg.digits + " 位數字。提交後，每一格會顯示判定。"));
    box.appendChild(MM.legendBlock());
    dom.history.appendChild(box);
  }

  function guessesLeft() {
    return state.cfg.attempts - state.attempt + 1;
  }

  function hintAvailable() {
    return state.freeHints > 0 || save.wallet > 0;
  }

  function spendHint() {
    if (state.freeHints > 0) { state.freeHints--; return; }
    if (save.wallet > 0) { save.wallet--; MM.persist(); return; }
  }

  /* ---- 渲染 ---- */

  function renderReadbar() {
    dom.readbar.innerHTML = "";
    var defs = [];

    if (PAGE.kind === "endless") {
      defs.push({ lead: true, label: "分數", value: String(state.score) });
      defs.push({ label: "已破譯", value: state.cleared + " 題" });
      defs.push({ label: "剩餘機會", value: (state.ended ? "0" : String(guessesLeft())) + " 次", alert: guessesLeft() <= 1 });
    } else {
      defs.push({ lead: true, label: "剩餘機會", value: (state.ended ? "0" : String(guessesLeft())) + " 次", alert: guessesLeft() <= 1 });
      if (PAGE.kind === "daily") defs.push({ label: "連續", value: MM.dailyStreak() + " 日" });
      defs.push({ label: "已提交", value: Math.min(state.attempt - 1, state.cfg.attempts) + " 次" });
    }

    defs.forEach(function (d) {
      var r = el("div", "reading" + (d.lead ? " reading--lead" : "") + (d.alert ? " reading--alert" : ""));
      r.appendChild(el("span", "reading__label", d.label));
      r.appendChild(el("span", "reading__value", d.value));
      dom.readbar.appendChild(r);
    });

    var hintLeft = state.freeHints + save.wallet;
    var hintBtn = el("button", "btn btn--hint");
    hintBtn.type = "button";
    hintBtn.setAttribute("aria-label", "使用提示卡，剩下 " + hintLeft + " 張");
    hintBtn.innerHTML = ICONS.bulb + '<span class="btn__text">提示</span><span class="hint-count">' + hintLeft + "</span>";
    hintBtn.disabled = state.ended || !hintAvailable();
    hintBtn.addEventListener("click", useHint);
    dom.readbar.appendChild(hintBtn);

    if (PAGE.kind === "endless") {
      var lives = el("div", "chips");
      lives.setAttribute("aria-label", "生命 " + state.lives + " 條");
      for (var i = 0; i < 3; i++) {
        var life = el("span", "swatch");
        life.style.background = i < state.lives ? "var(--color-ok)" : "transparent";
        life.setAttribute("aria-hidden", "true");
        lives.appendChild(life);
      }
      dom.readbar.appendChild(lives);
    }
  }

  function renderHintbar() {
    dom.hintbar.innerHTML = "";
    var keys = Object.keys(state.revealed);
    if (!keys.length) return;
    dom.hintbar.appendChild(el("span", "hintbar__label", "已公開"));
    keys.sort(function (a, b) { return a - b; });
    keys.forEach(function (k) {
      dom.hintbar.appendChild(el("span", "chip chip--cool", "第 " + (parseInt(k, 10) + 1) + " 位是 " + state.revealed[k]));
    });
  }

  function renderCurrent() {
    if (!dom.current) return;
    if (state.ended) {
      dom.current.innerHTML = "";
      dom.current.hidden = true;
      return;
    }
    dom.current.hidden = false;
    dom.current.innerHTML = "";
    var slots = el("div", "slots");
    slots.style.setProperty("--n", state.cfg.digits);
    for (var i = 0; i < state.cfg.digits; i++) {
      var s = el("div", "slot");
      if (state.digits[i] !== undefined) {
        s.textContent = String(state.digits[i]);
        s.classList.add("slot--filled");
      } else if (i === state.digits.length && !state.ended) {
        s.classList.add("slot--cue");
      }
      if (state.revealed[i] !== undefined) s.classList.add("slot--known");
      slots.appendChild(s);
    }
    dom.current.appendChild(slots);
  }

  function renderKeys() {
    dom.keys.innerHTML = "";
    if (state.ended) return;
    var count = state.cfg.max - state.cfg.min + 1;
    var cols = count > 30 ? 8 : count > 20 ? 6 : 5;
    dom.keys.style.setProperty("--cols", cols);
    var grid = el("div", "keys__grid" + (count > 30 ? " keys__grid--dense" : ""));
    for (var v = state.cfg.min; v <= state.cfg.max; v++) {
      (function (val) {
        var k = el("button", "key", String(val));
        k.type = "button";
        k.setAttribute("aria-label", "輸入 " + val);
        if (!state.cfg.dup && state.digits.indexOf(val) !== -1) k.disabled = true;
        k.addEventListener("click", function () { addDigit(val); });
        grid.appendChild(k);
      })(v);
    }
    dom.keys.appendChild(grid);

    var util = el("div", "keys__util");
    var del = el("button", "btn");
    del.type = "button";
    del.innerHTML = ICONS.del + "<span>刪除一位</span>";
    del.disabled = state.digits.length === 0;
    del.addEventListener("click", removeDigit);
    var sub = el("button", "btn btn--primary");
    sub.type = "button";
    sub.innerHTML = ICONS.check + "<span>確認輸入</span>";
    sub.disabled = state.digits.length !== state.cfg.digits;
    sub.addEventListener("click", submitGuess);
    util.appendChild(del);
    util.appendChild(sub);
    dom.keys.appendChild(util);
  }

  function addDigit(v) {
    if (!state || state.ended || state.busy) return;
    if (state.digits.length >= state.cfg.digits) return;
    if (!state.cfg.dup && state.digits.indexOf(v) !== -1) return;
    state.digits.push(v);
    renderCurrent();
    renderKeys();
  }

  function removeDigit() {
    if (!state || state.ended || state.busy) return;
    if (!state.digits.length) return;
    state.digits.pop();
    renderCurrent();
    renderKeys();
  }

  function resultLabel(r) {
    return r === "hit" ? "位置正確" : r === "near" ? "位置錯了" : "不在密碼中";
  }

  function appendRow(no, guess, res, animate) {
    var empty = dom.history.querySelector(".history__empty");
    if (empty) {
      dom.history.innerHTML = "";
      dom.history.classList.remove("history--empty");
    }
    var row = el("div", "hrow" + (animate === false ? "" : " hrow--new"));
    row.setAttribute("role", "group");
    row.setAttribute("aria-label", "第 " + no + " 次提交");
    row.appendChild(el("span", "hrow__no", pad2(no)));
    var slots = el("div", "slots");
    slots.style.setProperty("--n", guess.length);
    guess.forEach(function (d, i) {
      var s = el("div", "slot slot--filled slot--" + res[i]);
      s.textContent = String(d);
      s.setAttribute("role", "img");
      s.setAttribute("aria-label", d + "，" + resultLabel(res[i]));
      slots.appendChild(s);
    });
    row.appendChild(slots);
    dom.history.appendChild(row);
    dom.history.scrollTop = dom.history.scrollHeight;
  }

  /* ---- 提示 ---- */

  function useHint() {
    if (!state || state.ended || state.busy) return;
    if (!hintAvailable()) return;
    var open = [];
    for (var i = 0; i < state.code.length; i++) {
      if (state.revealed[i] === undefined) open.push(i);
    }
    if (!open.length) return;
    var idx = open[Math.floor(Math.random() * open.length)];
    spendHint();
    state.hintsUsed++;
    state.revealed[idx] = state.code[idx];
    renderHintbar();
    renderCurrent();
    renderReadbar();
  }

  /* ---- 提交 ---- */

  function submitGuess() {
    if (!state || state.ended || state.busy) return;
    if (state.digits.length !== state.cfg.digits) return;
    state.busy = true;

    var guess = state.digits.slice();
    var res = judge(state.code, guess);
    var attemptNo = state.attempt;

    save.stats.guesses++;
    if (res.indexOf("miss") !== -1) state.hadMiss = true;
    state.rows.push({ g: guess, r: res });

    appendRow(attemptNo, guess, res);

    var won = res.every(function (r) { return r === "hit"; });
    state.attempt++;
    state.digits = [];
    state.busy = false;

    if (won) { state.ended = true; setTimeout(function () { onWin(attemptNo); }, 450); return; }

    if (state.attempt > state.cfg.attempts) {
      state.ended = true;
      setTimeout(function () { onLose(attemptNo); }, 450);
      return;
    }

    renderCurrent();
    renderKeys();
    renderReadbar();
  }

  function solveEvent(extra) {
    var ev = {
      mode: PAGE.kind, win: true, attempts: state.attempt - 1, digits: state.cfg.digits,
      hintsUsed: state.hintsUsed, hadMiss: state.hadMiss, hour: new Date().getHours(),
      score: state.score, cleared: state.cleared, lives: state.lives
    };
    for (var k in extra) ev[k] = extra[k];
    return ev;
  }

  function failEvent() {
    return {
      mode: PAGE.kind, win: false, attempts: state.cfg.attempts, digits: state.cfg.digits,
      hintsUsed: state.hintsUsed, hadMiss: state.hadMiss, hour: new Date().getHours(),
      score: state.score, cleared: state.cleared, lives: state.lives
    };
  }

  function showEndbar(message, actions) {
    dom.keys.innerHTML = "";
    if (message) dom.keys.appendChild(el("p", "notice", message));
    var bar = el("div", "endbar");
    actions.forEach(function (a) {
      var b = el("button", "btn" + (a.primary ? " btn--primary" : ""), a.label);
      b.type = "button";
      b.addEventListener("click", a.run);
      bar.appendChild(b);
    });
    dom.keys.appendChild(bar);
  }

  function openDialog(opts) {
    var dlg = dom.result;
    dlg.innerHTML = "";
    dlg.appendChild(el("h2", "dialog__title", opts.title));
    if (opts.body) dlg.appendChild(el("p", "dialog__body", opts.body));
    if (opts.code && opts.code.length) {
      if (opts.codeLabel) dlg.appendChild(el("p", "dialog__codelabel", opts.codeLabel));
      var cd = el("div", "dialog__code");
      opts.code.forEach(function (d) { cd.appendChild(el("div", "codecell", String(d))); });
      dlg.appendChild(cd);
    }
    if (opts.extraNode) dlg.appendChild(opts.extraNode);
    var actions = el("div", "dialog__actions");
    opts.actions.forEach(function (a) {
      var b = el("button", "btn" + (a.primary ? " btn--primary" : ""), a.label);
      b.type = "button";
      b.addEventListener("click", function () { dlg.close(); a.run(); });
      actions.appendChild(b);
    });
    dlg.appendChild(actions);
    if (!dlg.open) dlg.showModal();
  }

  function goHome() { location.href = "密碼破譯大師-主頁.html"; }

  /* ---- 訓練場 ---- */

  function startClassic() {
    startGame(MM.CLASSIC[PAGE.id]);
  }

  function onWinClassic(attemptNo) {
    save.stats.solved++;
    save.stats.played++;
    save.stats.byMode.classic++;
    var best = save.classic[PAGE.id];
    if (!best || attemptNo < best) { save.classic[PAGE.id] = attemptNo; best = attemptNo; }
    MM.persist();
    MM.checkAch(solveEvent());

    showEndbar("本局完成，用了 " + attemptNo + " 次機會。", [
      { label: "再來一局", primary: true, run: startClassic },
      { label: "返回主頁", run: goHome }
    ]);
    openDialog({
      title: "破譯成功",
      body: "用了 " + attemptNo + " 次機會。此題最佳紀錄 " + best + " 次。",
      code: state.code,
      actions: [
        { label: "再來一局", primary: true, run: startClassic },
        { label: "返回主頁", run: goHome }
      ]
    });
  }

  function onLoseClassic() {
    save.stats.played++;
    save.stats.fails++;
    MM.persist();
    MM.checkAch(failEvent());

    showEndbar("本局結束。", [
      { label: "再來一局", primary: true, run: startClassic },
      { label: "返回主頁", run: goHome }
    ]);
    openDialog({
      title: "機會用完",
      body: "答案如下，再試一次。",
      code: state.code,
      codeLabel: "答案",
      actions: [
        { label: "再來一局", primary: true, run: startClassic },
        { label: "返回主頁", run: goHome }
      ]
    });
  }

  /* ---- 每日密碼 ---- */

  function startDaily() {
    var rec = MM.dailyToday();
    if (rec) { showDailyFinished(rec); return; }
    startGame(dailyCfg(new Date()));
  }

  function rebuildRows(rec) {
    if (!rec.rows) return;
    rec.rows.forEach(function (row, i) {
      appendRow(i + 1, row.g, row.r, false);
    });
  }

  function countdownNode() {
    var wrap = el("div", "countdown");
    wrap.appendChild(el("span", "notice", "距離明日題目 "));
    var cd = el("span", "figure");
    wrap.appendChild(cd);
    startCountdown(cd);
    return wrap;
  }

  function startCountdown(node) {
    if (dailyTick) clearInterval(dailyTick);
    function tick() {
      var now = new Date();
      var next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
      var ms = next - now;
      var h = Math.floor(ms / 3600000);
      var m = Math.floor((ms % 3600000) / 60000);
      node.textContent = h + " 小時 " + m + " 分";
    }
    tick();
    dailyTick = setInterval(tick, 30000);
  }

  function showDailyFinished(rec) {
    state = {
      cfg: dailyCfg(new Date()), code: rec.code || [], attempt: (rec.a || 0) + 1, digits: [],
      revealed: {}, rows: rec.rows || [], freeHints: 0, hintsUsed: rec.hu || 0, hadMiss: !!rec.hm,
      ended: true, busy: false, startedAt: Date.now(), lives: 0, cleared: 0, score: 0
    };
    setModeSpec(state.cfg);
    dom.history.innerHTML = "";
    rebuildRows(rec);
    renderHintbar();
    renderCurrent();
    renderReadbar();
    showDailyEndbar(rec);
    openDialog({
      title: rec.win ? "今日已破譯" : "今日未破解",
      body: rec.win
        ? "用了 " + rec.a + " 次機會，連續 " + MM.dailyStreak() + " 日。"
        : "連續天數中斷。明天再試。",
      code: rec.code,
      codeLabel: rec.win ? "" : "答案",
      extraNode: countdownNode(),
      actions: [
        { label: "複製戰報", primary: true, run: function () { copyShare(rec); } },
        { label: "返回主頁", run: goHome }
      ]
    });
  }

  function showDailyEndbar(rec) {
    showEndbar(rec.win ? "今日已完成。" : "今日未完成。", [
      { label: "複製戰報", primary: true, run: function () { copyShare(rec); } },
      { label: "返回主頁", run: goHome }
    ]);
  }

  function currentDailyRec(win, attemptNo) {
    return {
      n: state.cfg.digits,
      a: attemptNo,
      win: win,
      rows: state.rows,
      code: state.code.slice(),
      hm: state.hadMiss,
      hu: state.hintsUsed
    };
  }

  function onWinDaily(attemptNo) {
    var rec = currentDailyRec(true, attemptNo);
    save.daily.calendar[ymd()] = rec;
    save.stats.solved++;
    save.stats.played++;
    save.stats.byMode.daily++;
    save.wallet += 1;
    var streak = MM.dailyStreak();
    if (streak > save.daily.bestStreak) save.daily.bestStreak = streak;
    MM.persist();
    MM.checkAch(solveEvent({ streak: streak }));

    var extra = el("div");
    extra.appendChild(el("p", "notice", "連續 " + streak + " 日，獲得提示卡 1 張。"));
    extra.appendChild(countdownNode());

    showDailyEndbar(rec);
    openDialog({
      title: "今日破譯成功",
      body: "用了 " + attemptNo + " 次機會。",
      code: state.code,
      extraNode: extra,
      actions: [
        { label: "複製戰報", primary: true, run: function () { copyShare(rec); } },
        { label: "返回主頁", run: goHome }
      ]
    });
    renderReadbar();
  }

  function onLoseDaily(attemptNo) {
    var rec = currentDailyRec(false, attemptNo);
    save.daily.calendar[ymd()] = rec;
    save.stats.played++;
    save.stats.fails++;
    MM.persist();
    MM.checkAch(failEvent());

    var extra = el("div");
    extra.appendChild(el("p", "notice", "連續天數中斷。"));
    extra.appendChild(countdownNode());

    showDailyEndbar(rec);
    openDialog({
      title: "今日未破解",
      body: "答案如下，明天再試。",
      code: state.code,
      codeLabel: "答案",
      extraNode: extra,
      actions: [
        { label: "複製戰報", primary: true, run: function () { copyShare(rec); } },
        { label: "返回主頁", run: goHome }
      ]
    });
    renderReadbar();
  }

  function buildShareText(rec) {
    var lines = rec.rows.map(function (row) {
      return row.r.map(function (r) { return r === "hit" ? "🟩" : r === "near" ? "🟦" : "⬛"; }).join("");
    });
    var head = "密碼破譯大師 每日密碼 " + ymd();
    var mid = rec.n + " 位，" + rec.a + " 次" + (rec.win ? "" : "，未破解");
    var streak = rec.win ? "連續 " + MM.dailyStreak() + " 日" : "連續中斷";
    var url = location.origin + location.pathname.replace(/[^/]*$/, "") + "密碼破譯大師-每日挑戰.html";
    return [head, mid, lines.join("\n"), streak, url].filter(Boolean).join("\n");
  }

  function copyShare(rec) {
    var text = buildShareText(rec);
    var done = function () {
      save.stats.shares++;
      MM.persist();
      MM.checkAch(solveEvent({ win: !!rec.win }));
      MM.toast("戰報已複製，可貼到對話或社群。");
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text, done); });
    } else {
      fallbackCopy(text, done);
    }
  }

  function fallbackCopy(text, done) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); done(); } catch (e) { /* 忽略 */ }
    ta.remove();
  }

  /* ---- 無盡模式 ---- */

  function startEndless(fresh) {
    if (fresh || !state || state.gameOver) {
      startGame(endlessCfg(0), { lives: 3, cleared: 0, score: 0 });
      save.endless.plays++;
      MM.persist();
    }
  }

  function endlessNext() {
    startGame(endlessCfg(state.cleared), { lives: state.lives, cleared: state.cleared, score: state.score });
  }

  function pointsFor(attemptsUsed) {
    var cfg = state.cfg;
    var base = 60 + cfg.digits * 20 + Math.max(0, cfg.attempts - attemptsUsed) * 15;
    var secs = (Date.now() - state.startedAt) / 1000;
    var speed = secs < 90 ? 60 : secs < 180 ? 30 : 0;
    return base + speed;
  }

  function onWinEndless(attemptNo) {
    var pts = pointsFor(attemptNo);
    state.score += pts;
    state.cleared++;
    save.stats.solved++;
    save.stats.played++;
    save.stats.byMode.endless++;
    if (state.cleared > save.endless.bestCodes) save.endless.bestCodes = state.cleared;
    if (state.score > save.endless.bestScore) save.endless.bestScore = state.score;
    MM.persist();
    MM.checkAch(solveEvent({ cleared: state.cleared, score: state.score }));

    showEndbar("第 " + state.cleared + " 題完成，加 " + pts + " 分，總分 " + state.score + "。", [
      { label: "下一題", primary: true, run: endlessNext },
      { label: "結束", run: goHome }
    ]);
    openDialog({
      title: "第 " + state.cleared + " 題完成",
      body: "用了 " + attemptNo + " 次機會，加 " + pts + " 分。",
      actions: [
        { label: "下一題", primary: true, run: endlessNext },
        { label: "結束", run: goHome }
      ]
    });
    renderReadbar();
  }

  function onLoseEndless() {
    state.lives--;
    save.stats.fails++;
    MM.persist();
    renderReadbar();

    if (state.lives > 0) {
      showEndbar("這題機會用完，剩下 " + state.lives + " 條命。", [
        { label: "下一題", primary: true, run: endlessNext },
        { label: "結束", run: goHome }
      ]);
      openDialog({
        title: "機會用完",
        body: "這題未破解，剩 " + state.lives + " 條命。下一題再試。",
        code: state.code,
        codeLabel: "答案",
        actions: [
          { label: "下一題", primary: true, run: endlessNext },
          { label: "結束", run: goHome }
        ]
      });
      return;
    }

    state.gameOver = true;
    MM.checkAch(failEvent());
    var rank = MM.rankFor(state.cleared);
    showEndbar("挑戰結束。", [
      { label: "再試一次", primary: true, run: function () { startEndless(true); } },
      { label: "返回主頁", run: goHome }
    ]);
    openDialog({
      title: "三條命用完",
      body: "共破譯 " + state.cleared + " 題，得分 " + state.score + "，段位 " + rank + "。",
      code: state.code,
      codeLabel: "答案",
      actions: [
        { label: "再試一次", primary: true, run: function () { startEndless(true); } },
        { label: "返回主頁", run: goHome }
      ]
    });
  }

  /* ---- 結果分派 ---- */

  function onWin(attemptNo) {
    renderReadbar();
    renderCurrent();
    if (PAGE.kind === "classic") onWinClassic(attemptNo);
    else if (PAGE.kind === "daily") onWinDaily(attemptNo);
    else onWinEndless(attemptNo);
  }

  function onLose(attemptNo) {
    renderReadbar();
    renderCurrent();
    if (PAGE.kind === "classic") onLoseClassic(attemptNo);
    else if (PAGE.kind === "daily") onLoseDaily(attemptNo);
    else onLoseEndless(attemptNo);
  }

  /* ========== 啟動 ========== */

  document.addEventListener("DOMContentLoaded", function () {
    if (!PAGE) return;
    if (PAGE.kind === "classic" || PAGE.kind === "daily" || PAGE.kind === "endless") {
      initGamePage();
    }
  });
})();
