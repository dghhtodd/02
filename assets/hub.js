/* 密碼破譯大師 · 首頁與成就頁邏輯（依賴 engine.js 提供的 MM 工具） */
(function () {
  "use strict";

  var MM = window.MM;
  var $ = MM.util.$;
  var el = MM.util.el;
  var ymd = MM.util.ymd;
  var PAGE = window.MM_PAGE || {};

  /* 創刊日：用來算「第幾期」，只是版面資訊，不影響題目 */
  var ISSUE_EPOCH = new Date(2025, 5, 15);

  function reading(label, value) {
    var r = el("div", "reading");
    r.appendChild(el("span", "reading__label", label));
    r.appendChild(el("span", "reading__value", value));
    return r;
  }

  function fieldStrip(rows) {
    var g = el("div", "panelgrid panelgrid--fields");
    rows.forEach(function (row) {
      g.appendChild(reading(row[0], row[1]));
    });
    return g;
  }

  function setMeter(node, value, max, label) {
    node.innerHTML = "";
    var fill = el("span");
    fill.style.width = (max > 0 ? Math.round((value / max) * 100) : 0) + "%";
    node.appendChild(fill);
    node.setAttribute("role", "progressbar");
    node.setAttribute("aria-label", label);
    node.setAttribute("aria-valuemin", "0");
    node.setAttribute("aria-valuemax", String(max));
    node.setAttribute("aria-valuenow", String(value));
  }

  function issueNumber() {
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var days = Math.round((today - ISSUE_EPOCH) / 86400000);
    return Math.max(1, days + 1);
  }

  function dateLine() {
    var d = new Date();
    return d.getFullYear() + " 年 " + (d.getMonth() + 1) + " 月 " + d.getDate() + " 日";
  }

  /* ---------- 首頁 ---------- */

  function renderHub() {
    var rec = MM.dailyToday();
    var cfg = MM.dailyCfg(new Date());
    var streak = MM.dailyStreak();
    var weekday = ["日", "一", "二", "三", "四", "五", "六"][new Date().getDay()];
    var todayKey = ymd();

    $("#issueDate").textContent = dateLine();
    $("#issueNo").textContent = "第 " + issueNumber() + " 期";
    $("#streakAside").textContent = "最佳 " + MM.save.daily.bestStreak + " 日";
    $("#calendarTitle").textContent = new Date().getFullYear() + " 年 " + (new Date().getMonth() + 1) + " 月";

    /* 蓋印 */
    var stamp = $("#dailyStamp");
    stamp.className = "stamp" + (rec ? "" : " stamp--pending");
    stamp.textContent = rec ? (rec.win ? "破譯成功" : "破譯失敗") : "尚未破譯";

    /* 今日說明 */
    var note = $("#heroNote");
    if (!rec) {
      note.textContent = "今天尚未開始。全球使用同一組密碼，午夜換題。";
    } else if (rec.win) {
      note.textContent = "今日已破譯，用了 " + rec.a + " 次機會。連續 " + streak + " 日。";
    } else {
      note.textContent = "今日未破解，連續天數已中斷。明天再來。";
    }

    /* 題型預覽：未玩顯示空格，已玩顯示最後一次提交 */
    var specimen = $("#dailySpecimen");
    specimen.innerHTML = "";
    var digits = rec ? rec.n : cfg.digits;
    var slots = el("div", "slots");
    slots.style.setProperty("--n", digits);
    var last = rec && rec.rows && rec.rows.length ? rec.rows[rec.rows.length - 1] : null;
    for (var i = 0; i < digits; i++) {
      var s = el("div", "slot");
      if (last) {
        s.classList.add("slot--filled", "slot--" + last.r[i]);
        s.textContent = String(last.g[i]);
      }
      slots.appendChild(s);
    }
    specimen.appendChild(slots);

    /* 讀數 */
    var stats = $("#heroStats");
    stats.innerHTML = "";
    stats.appendChild(reading("連續破譯", streak + " 日"));
    stats.appendChild(reading("最佳連續", MM.save.daily.bestStreak + " 日"));
    stats.appendChild(reading("累計破譯", MM.save.stats.solved + " 題"));
    stats.appendChild(reading("提示卡", MM.save.wallet + " 張"));

    /* 主要行動 */
    var actions = $("#heroActions");
    actions.innerHTML = "";
    var primary = el("a", "btn btn--primary");
    primary.textContent = !rec ? "開始今日密碼" : rec.win ? "查看今日戰報" : "查看今日答案";
    primary.href = "密碼破譯大師-每日挑戰.html";
    actions.appendChild(primary);

    /* 無盡模式 */
    var endlessPanel = $("#endlessPanel");
    endlessPanel.innerHTML = "";
    var rank = el("div", "rankline");
    rank.appendChild(el("span", "rankline__label", "目前段位"));
    rank.appendChild(el("span", "rankline__value", MM.rankFor(MM.save.endless.bestCodes)));
    endlessPanel.appendChild(rank);
    endlessPanel.appendChild(fieldStrip([
      ["最高分數", String(MM.save.endless.bestScore)],
      ["單次題數", MM.save.endless.bestCodes + " 題"],
      ["遊玩次數", MM.save.endless.plays + " 次"]
    ]));
    var endlessBtn = el("a", "btn btn--wide", "進入無盡模式");
    endlessBtn.href = "密碼破譯大師-無盡模式.html";
    endlessPanel.appendChild(endlessBtn);

    /* 月曆 */
    var cal = $("#calendar");
    cal.innerHTML = "";
    ["日", "一", "二", "三", "四", "五", "六"].forEach(function (w) {
      var head = el("div", "calhead", w);
      head.setAttribute("aria-hidden", "true");
      cal.appendChild(head);
    });
    var now = new Date();
    var first = new Date(now.getFullYear(), now.getMonth(), 1);
    var daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    for (var b = 0; b < first.getDay(); b++) {
      cal.appendChild(el("div", "calcell calcell--blank"));
    }
    for (var d = 1; d <= daysInMonth; d++) {
      var key = ymd(new Date(now.getFullYear(), now.getMonth(), d));
      var r = MM.save.daily.calendar[key];
      var cell = el("div", "calcell", String(d));
      var label = (now.getMonth() + 1) + " 月 " + d + " 日";
      if (r && r.win) {
        cell.classList.add("calcell--win");
        label += "，破譯成功，用了 " + r.a + " 次";
      } else if (r) {
        cell.classList.add("calcell--loss");
        label += "，未破解";
      } else if (key === todayKey) {
        label += "，今日，尚未挑戰";
      } else if (key > todayKey) {
        cell.classList.add("calcell--future");
        label += "，未來";
      } else {
        label += "，未參與";
      }
      if (key === todayKey) cell.classList.add("calcell--today");
      cell.setAttribute("role", "img");
      cell.setAttribute("aria-label", label);
      cell.title = label;
      cal.appendChild(cell);
    }

    /* 訓練場 */
    var table = $("#training");
    table.innerHTML = "";
    var names = { l1: "等級一", l2: "等級二", l3: "等級三", l4: "等級四", l5: "等級五" };
    Object.keys(MM.CLASSIC).forEach(function (id) {
      var cfg2 = MM.CLASSIC[id];
      var best = MM.save.classic[id];
      var row = el("a", "index__row");
      row.href = "密碼破譯大師-" + names[id] + ".html";
      var left = el("div");
      left.appendChild(el("div", "index__name", cfg2.name));
      left.appendChild(el("div", "index__spec", cfg2.spec));
      row.appendChild(left);
      row.appendChild(el("span", "index__best" + (best ? "" : " index__best--none"), best ? "最佳 " + best + " 次" : "未挑戰"));
      table.appendChild(row);
    });

    /* 提示卡與徽章 */
    var achCount = Object.keys(MM.save.ach).length;
    var achStats = $("#achStats");
    achStats.innerHTML = "";
    var wallet = el("div", "wallet");
    wallet.appendChild(el("span", "wallet__num", String(MM.save.wallet)));
    wallet.appendChild(el("span", "wallet__unit", "張提示卡"));
    achStats.appendChild(wallet);
    var meter = el("div", "meter");
    achStats.appendChild(meter);
    setMeter(meter, achCount, MM.ACH.length, "已解鎖 " + achCount + " / " + MM.ACH.length + " 個徽章");
    achStats.appendChild(el("p", "register__note",
      "已解鎖 " + achCount + " / " + MM.ACH.length + " 個徽章。每日完成與解鎖徽章都會獲得提示卡。"));

    /* 玩法 */
    var rules = $("#hubRules");
    rules.innerHTML = "";
    rules.appendChild(el("p", "notice", "每次提交一組數字，系統只回答每一格的判定。用最少次數推理出正確密碼。"));
    rules.appendChild(MM.legendBlock());
    rules.appendChild(el("p", "notice", "提示卡可以永久公開一個位置，任何模式都適用。"));

    $("#year").textContent = String(new Date().getFullYear());
  }

  /* ---------- 成就頁 ---------- */

  function renderAch() {
    var unlocked = Object.keys(MM.save.ach).length;
    var total = MM.ACH.length;
    var wallet = $("#walletReading");
    wallet.innerHTML = "";

    var main = el("div", "wallet");
    main.appendChild(el("span", "wallet__num", String(MM.save.wallet)));
    main.appendChild(el("span", "wallet__unit", "張提示卡"));
    wallet.appendChild(main);

    var progress = el("div");
    var meter = el("div", "meter");
    progress.appendChild(meter);
    setMeter(meter, unlocked, total, "已解鎖 " + unlocked + " / " + total + " 個徽章");
    progress.appendChild(el("p", "walletbar__note",
      "已解鎖 " + unlocked + " / " + total + " 個徽章。使用提示卡會永久公開一個位置，所有模式通用。"));
    wallet.appendChild(progress);

    var grid = $("#badges");
    grid.innerHTML = "";
    MM.ACH.forEach(function (a) {
      var on = !!MM.save.ach[a.id];
      var card = el("div", "stampcard " + (on ? "stampcard--on" : "stampcard--off"));
      var head = el("div", "stampcard__head");
      head.appendChild(el("div", "stampcard__name", a.name));
      card.appendChild(head);
      card.appendChild(el("div", "stampcard__why", a.why));

      if (a.prog) {
        var p = a.prog();
        var bar = el("div", "stampcard__meter");
        var fill = el("span");
        fill.style.width = Math.round((p[0] / p[1]) * 100) + "%";
        bar.appendChild(fill);
        bar.setAttribute("role", "progressbar");
        bar.setAttribute("aria-label", a.name + " 進度");
        bar.setAttribute("aria-valuemin", "0");
        bar.setAttribute("aria-valuemax", String(p[1]));
        bar.setAttribute("aria-valuenow", String(p[0]));
        card.appendChild(bar);
        var meta = el("div", "stampcard__meta");
        meta.appendChild(el("span", null, "進度 " + p[0] + " / " + p[1]));
        meta.appendChild(el("span", null, "獎勵 " + a.grant + " 張"));
        card.appendChild(meta);
      } else {
        var meta2 = el("div", "stampcard__meta");
        meta2.appendChild(el("span", null, on ? "條件已達成" : "完成後解鎖"));
        meta2.appendChild(el("span", null, "獎勵 " + a.grant + " 張"));
        card.appendChild(meta2);
      }

      if (on) {
        var check = el("span", "stampcard__check");
        check.innerHTML = MM.ICONS.check;
        check.setAttribute("aria-label", "已解鎖");
        card.appendChild(check);
      }
      grid.appendChild(card);
    });

    var reset = $("#resetBtn");
    var dlg = $("#resetDialog");
    reset.addEventListener("click", function () { dlg.showModal(); });
    $("#resetYes").addEventListener("click", function () {
      MM.resetSave();
      dlg.close();
      location.reload();
    });
    $("#resetNo").addEventListener("click", function () { dlg.close(); });

    $("#year").textContent = String(new Date().getFullYear());
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (PAGE.kind === "hub") renderHub();
    else if (PAGE.kind === "ach") renderAch();
  });
})();
