/* ============================================================
   裙裙记账 · Lolita 衣橱  —  PWA 纯前端实现
   数据存 localStorage；无后端、可离线、可安装到主屏。
   ============================================================ */
(function () {
  "use strict";

  const STORE_KEY = "lolita_wardrobe_v1";

  /* ---------- 默认数据 ---------- */
  const DEFAULT_STATE = () => ({
    settings: {
      currency: "¥",
      carryOverDefault: true,
      priceRanges: [
        { id: "r1", label: "500 以下", min: 0, max: 499 },
        { id: "r2", label: "500–999", min: 500, max: 999 },
        { id: "r3", label: "1000–1999", min: 1000, max: 1999 },
        { id: "r4", label: "2000–2999", min: 2000, max: 2999 },
        { id: "r5", label: "3000 及以上", min: 3000, max: null },
      ],
      categories: [
        { id: "dress", label: "裙子", color: "#e86a97", hasSub: true, subtypes: [
          { id: "jsk", label: "JSK" },
          { id: "op", label: "OP" },
          { id: "bib", label: "背带裙" },
          { id: "cutsew", label: "内搭" },
        ] },
        { id: "accessory", label: "配饰", color: "#7a5bd1", hasSub: false, subtypes: [] },
        { id: "shoes", label: "鞋子", color: "#3a87c9", hasSub: false, subtypes: [] },
        { id: "other", label: "其他", color: "#4c9a6a", hasSub: false, subtypes: [] },
      ],
      emojiOptions: ["👗", "🎀", "🌸", "💖", "🩰", "👑", "🌷", "💕", "🧁", "⭐", "🌟", "🦄"],
      wardrobeName: "我的裙柜",
    },
    budgets: {}, // { "2026-07": { limit: 2000, carryOver: true } }
    dresses: [], // 见 addDress 字段
  });

  const STATUS = {
    wish: { label: "已种草", cls: "st-wish" },
    ordered: { label: "已下定", cls: "st-ordered" },
    arrived: { label: "已到货", cls: "st-arrived" },
    owned: { label: "已拥有", cls: "st-owned" },
  };

  // 类型从 settings 读取，支持自定义（增删改、配色、子类）
  function getCats() {
    return (state && state.settings && state.settings.categories && state.settings.categories.length)
      ? state.settings.categories : DEFAULT_STATE().settings.categories;
  }
  function catById(id) { return getCats().find((c) => c.id === id); }
  function catLabel(id) { const c = catById(id); return c ? c.label : "其他"; }
  function catColor(id) { const c = catById(id); return c ? c.color : "#9aa0a6"; }
  function catHasSub(id) { const c = catById(id); return !!(c && c.hasSub); }
  function subLabel(catId, subId) {
    const c = catById(catId);
    if (c && c.subtypes) { const s = c.subtypes.find((x) => x.id === subId); if (s) return s.label; }
    return "";
  }
  function typeLabel(d) {
    const c = catById(d.category || "dress");
    if (c && c.hasSub && d.subType) {
      const s = c.subtypes.find((x) => x.id === d.subType);
      return s ? s.label : c.label;
    }
    return c ? c.label : "其他";
  }
  // 类型彩色标签（用配置色，避免依赖固定 CSS class）
  function typePill(d) {
    const color = catColor(d.category || "dress");
    return `<span class="type-pill" style="background:${color}22;color:${color};border:1px solid ${color}55">${typeLabel(d)}</span>`;
  }

  /* ---------- 状态读写 ---------- */
  let state = load();
  let currentMonth = monthKey(new Date());
  let calMonth = monthKey(new Date());
  let wardrobeFilterRange = "all";
  let wardrobeFilterCategory = "all";
  let wardrobeFilterSub = "all";
  let wardrobeFilterBrand = "all";

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return DEFAULT_STATE();
      const s = JSON.parse(raw);
      const def = DEFAULT_STATE();
      return Object.assign(def, s, {
        settings: Object.assign(def.settings, s.settings || {}),
        budgets: s.budgets || {},
        dresses: s.dresses || [],
      });
    } catch (e) {
      return DEFAULT_STATE();
    }
  }
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (e) {
      toast("保存失败：本地空间不足，请减少图片或清空数据");
    }
  }

  /* ---------- 工具 ---------- */
  function $(sel, root = document) { return root.querySelector(sel); }
  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
  }
  function escapeHtmlAttr(s) {
    return escapeHtml(s).replace(/"/g, "&quot;");
  }
  function money(n) {
    const v = Math.round((Number(n) || 0) * 100) / 100;
    const s = (v % 1 === 0) ? v.toLocaleString("zh-CN") : v.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return state.settings.currency + s;
  }
  function monthKey(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); }
  function prevMonthKey(k) {
    const [y, m] = k.split("-").map(Number);
    return m === 1 ? (y - 1) + "-12" : y + "-" + String(m - 1).padStart(2, "0");
  }
  function nextMonthKey(k) {
    const [y, m] = k.split("-").map(Number);
    return m === 12 ? (y + 1) + "-01" : y + "-" + String(m + 1).padStart(2, "0");
  }
  function parseDate(str) { const [y, m, d] = str.split("-").map(Number); return new Date(y, m - 1, d); }
  function todayStr() { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function compressImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const maxW = 720;
          const scale = Math.min(1, maxW / img.width);
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement("canvas");
          canvas.width = w; canvas.height = h;
          canvas.getContext("2d").drawImage(img, 0, 0, w, h);
          try { resolve(canvas.toDataURL("image/jpeg", 0.82)); }
          catch (e) { reject(e); }
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
  function daysBetween(aStr, bStr) {
    const a = parseDate(aStr), b = parseDate(bStr);
    return Math.round((b - a) / 86400000);
  }

  /* ---------- 预算计算（支持上月余额累计） ---------- */
  function budgetOf(mk) {
    return state.budgets[mk] || { limit: 0, carryOver: state.settings.carryOverDefault };
  }
  // 递归计算某月"转入余额"（上月未用完且开启累计）
  function carryInOf(mk, guard = 0) {
    if (guard > 60) return 0;
    const prev = prevMonthKey(mk);
    const pb = budgetOf(prev);
    if (!pb.carryOver) return 0;
    const prevAvail = pb.limit + carryInOf(prev, guard + 1);
    const prevSpent = monthSpent(prev);
    return Math.max(0, prevAvail - prevSpent);
  }
  function monthSpent(mk) {
    return state.dresses.reduce((s, d) => {
      if (d.status === "wish") return s; // 种草不计
      let spend = 0;
      if (d.purchaseMode === "full") {
        // 全款：购入月记全款
        if (d.purchaseDate && monthKey(parseDate(d.purchaseDate)) === mk) spend += Number(d.price) || 0;
      } else {
        // 定尾：定金月记定金，尾款（已到货/已拥有）月记尾款
        if (d.dateOrdered && monthKey(parseDate(d.dateOrdered)) === mk) spend += Number(d.orderPaid) || 0;
        const paidOff = d.status === "arrived" || d.status === "owned";
        if (paidOff) {
          const bal = Math.max(0, (Number(d.price) || 0) - (Number(d.orderPaid) || 0));
          if (d.balanceDueDate && monthKey(parseDate(d.balanceDueDate)) === mk) {
            spend += bal;
          } else if (!d.balanceDueDate && d.dateOrdered && monthKey(parseDate(d.dateOrdered)) === mk) {
            spend += bal; // 未填尾款日则补记到下定月
          }
        }
      }
      return s + spend;
    }, 0);
  }
  function monthDresses(mk) {
    return state.dresses.filter((d) => d.status !== "wish" && (
      (d.purchaseMode === "full" && d.purchaseDate && monthKey(parseDate(d.purchaseDate)) === mk) ||
      (d.purchaseMode !== "full" && d.dateOrdered && monthKey(parseDate(d.dateOrdered)) === mk)
    ));
  }
  function monthSummary(mk) {
    const b = budgetOf(mk);
    const carryIn = carryInOf(mk);
    const avail = b.limit + carryIn;
    const spent = monthSpent(mk);
    const left = avail - spent;
    return { budget: b, carryIn, avail, spent, left, over: left < 0, count: monthDresses(mk).length };
  }

  /* ---------- 渲染：顶部标题 + 页面切换 ---------- */
  const TITLES = { month: "本月衣橱", wardrobe: "我的裙柜", calendar: "尾款日历", wishlist: "心愿单" };
  function pageTitleOf(tab) {
    if (tab === "wardrobe") return state.settings.wardrobeName || TITLES.wardrobe;
    return TITLES[tab] || "裙裙记账";
  }
  function switchTab(tab) {
    if (tab === "add") { openDressModal(); return; }
    document.querySelectorAll(".page").forEach((p) => p.classList.add("hidden"));
    $("#page-" + tab).classList.remove("hidden");
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === tab));
    $("#pageTitle").textContent = pageTitleOf(tab);
  }

  /* ---------- 渲染：月度 ---------- */
  function renderMonth() {
    const el = $("#page-month");
    const sum = monthSummary(currentMonth);
    const prev = prevMonthKey(currentMonth);
    const prevSum = monthSummary(prev);
    const b = sum.budget;
    const ringPct = sum.avail > 0 ? Math.min(100, Math.round((sum.spent / sum.avail) * 100)) : (sum.spent > 0 ? 100 : 0);
    const C = 2 * Math.PI * 42;
    const dash = C * (ringPct / 100);

    let carryBadge = "";
    if (sum.carryIn > 0) carryBadge = `<span class="badge carry">含上月结转 ${money(sum.carryIn)}</span>`;
    let leftBadge = sum.over
      ? `<span class="badge over">超支 ${money(-sum.left)}</span>`
      : `<span class="badge left">剩余 ${money(sum.left)}</span>`;

    const list = monthDresses(currentMonth);
    let listHtml = list.length
      ? `<div class="list">${list.map(safeDressItemHtml).join("")}</div>`
      : `<div class="empty"><div class="e">🪡</div>本月还没有下定记录～<br>点下方 ＋ 记一条吧</div>`;

    el.innerHTML = `
      <div class="month-nav">
        <button data-act="prev-month">‹</button>
        <div class="m">${currentMonth.replace("-", " 年 ")} 月</div>
        <button data-act="next-month">›</button>
      </div>

      <div class="card">
        <div class="card-title">本月预算${carryBadge}${leftBadge}</div>
        <div class="budget-ring">
          <svg class="ring" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="42" fill="none" stroke="#ffe1ec" stroke-width="11"/>
            <circle cx="50" cy="50" r="42" fill="none" stroke="${sum.over ? "#ef7a8d" : "#f48fb1"}" stroke-width="11"
              stroke-linecap="round" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C - dash).toFixed(1)}"
              transform="rotate(-90 50 50)"/>
            <text x="50" y="46" text-anchor="middle" font-size="15" font-weight="800" fill="#6b4a55">${ringPct}%</text>
            <text x="50" y="62" text-anchor="middle" font-size="9" fill="#b08a98">已用</text>
          </svg>
          <div class="ring-info">
            <div class="big">${money(sum.spent)}</div>
            <div class="sub">已用 / 可用 ${money(sum.avail)}</div>
            <div class="month-stats">
              <div class="cell"><b>${sum.count}</b><span>条裙子</span></div>
              <div class="cell"><b>${money(sum.left)}</b><span>结余</span></div>
            </div>
          </div>
        </div>
        <div class="carry-row">
          <div>
            <div class="t">上月余额累计到下月</div>
            <div class="d">上月（${prev}）剩余 ${money(prevSum.left)}</div>
          </div>
          <label class="switch">
            <input type="checkbox" id="carryToggle" ${b.carryOver ? "checked" : ""}>
            <span class="track"></span>
          </label>
        </div>
      </div>

      <div class="section-title">
        <h2>本月记录</h2>
        <span class="link" data-act="edit-budget">设置预算</span>
      </div>
      ${listHtml}
    `;

    el.querySelector('[data-act="prev-month"]').onclick = () => { currentMonth = prevMonthKey(currentMonth); renderMonth(); };
    el.querySelector('[data-act="next-month"]').onclick = () => { currentMonth = nextMonthKey(currentMonth); renderMonth(); };
    el.querySelector('[data-act="edit-budget"]').onclick = () => openBudgetModal(currentMonth);
    $("#carryToggle").onchange = (e) => {
      state.budgets[currentMonth] = Object.assign(budgetOf(currentMonth), { carryOver: e.target.checked });
      save(); renderMonth(); toast(e.target.checked ? "已开启余额累计" : "已关闭余额累计");
    };
    bindDressItems(el);
  }

  /* ---------- 渲染：裙柜 ---------- */
  function renderWardrobe() {
    const el = $("#page-wardrobe");
    const ranges = state.settings.priceRanges;

    // 类型 chips
    const catChips = [`<span class="range-chip ${wardrobeFilterCategory === "all" ? "on" : ""}" data-cat="all">全部</span>`]
      .concat(getCats().map((c) =>
        `<span class="range-chip ${wardrobeFilterCategory === c.id ? "on" : ""}" data-cat="${c.id}">${escapeHtml(c.label)}</span>`))
      .join("");
    // 子类型 chips（仅该类型含子类时）
    let subChips = "";
    if (wardrobeFilterCategory !== "all") {
      const cat = catById(wardrobeFilterCategory);
      if (cat && cat.hasSub && cat.subtypes && cat.subtypes.length) {
        subChips = `<div class="range-chips" style="margin:10px 0">`
          + [`<span class="range-chip sub ${wardrobeFilterSub === "all" ? "on" : ""}" data-sub="all">全部款式</span>`]
            .concat(cat.subtypes.map((s) =>
              `<span class="range-chip sub ${wardrobeFilterSub === s.id ? "on" : ""}" data-sub="${s.id}">${escapeHtml(s.label)}</span>`))
            .join("") + `</div>`;
      }
    }
    // 价格区间 chips
    const rangeChips = [`<span class="range-chip ${wardrobeFilterRange === "all" ? "on" : ""}" data-r="all">全部</span>`]
      .concat(ranges.map((r) => `<span class="range-chip ${wardrobeFilterRange === r.id ? "on" : ""}" data-r="${r.id}">${escapeHtml(r.label)}</span>`))
      .join("");

    // 品牌 chips：取自裙柜内所有已填写品牌的裙子（去重）
    const brandSet = [];
    state.dresses.forEach((d) => {
      if (d.status === "wish") return;
      const b = (d.brand || "").trim();
      if (b && !brandSet.includes(b)) brandSet.push(b);
    });
    brandSet.sort((a, b) => a.localeCompare(b));
    const brandChips = [`<span class="range-chip ${wardrobeFilterBrand === "all" ? "on" : ""}" data-b="all">全部</span>`]
      .concat(brandSet.map((b) => `<span class="range-chip brand ${wardrobeFilterBrand === b ? "on" : ""}" data-b="${escapeHtmlAttr(b)}">${escapeHtml(b)}</span>`))
      .join("");

    // 组合筛选（已种草只出现在心愿单，不进裙柜）
    let dresses = state.dresses.slice().sort((a, b) => (b.dateOrdered || "").localeCompare(a.dateOrdered || ""));
    dresses = dresses.filter((d) => d.status !== "wish");
    if (wardrobeFilterCategory !== "all") dresses = dresses.filter((d) => (d.category || "dress") === wardrobeFilterCategory);
    if (wardrobeFilterCategory === "dress" && wardrobeFilterSub !== "all") dresses = dresses.filter((d) => d.subType === wardrobeFilterSub);
    if (wardrobeFilterRange !== "all") {
      const r = ranges.find((x) => x.id === wardrobeFilterRange);
      if (r) dresses = dresses.filter((d) => inRange(d.price, r));
    }
    if (wardrobeFilterBrand !== "all") {
      dresses = dresses.filter((d) => (d.brand || "").trim() === wardrobeFilterBrand);
    }
    const total = dresses.reduce((s, d) => s + (Number(d.price) || 0), 0);
    const totalBalance = dresses.reduce((s, d) => s + ((Number(d.price) || 0) - (Number(d.deposit) || 0)), 0);

    let listHtml = dresses.length
      ? `<div class="list">${dresses.map(safeDressItemHtml).join("")}</div>`
      : `<div class="empty"><div class="e">👗</div>没有符合条件的单品～<br>换个筛选或点 ＋ 添加</div>`;

    el.innerHTML = `
      <div class="card">
        <div class="card-title">${escapeHtml(state.settings.wardrobeName || "我的裙柜")} <span class="link" data-act="rename-wardrobe">✎ 重命名</span></div>
        <div class="month-stats">
          <div class="cell"><b>${dresses.length}</b><span>件（筛选后）</span></div>
          <div class="cell"><b>${money(total)}</b><span>总价值</span></div>
          <div class="cell"><b>${money(totalBalance)}</b><span>待付尾款</span></div>
        </div>
      </div>
      <div class="section-title"><h2>按类型</h2><span class="link" data-act="edit-cats">编辑类型</span></div>
      <div class="range-chips">${catChips}</div>
      ${subChips}
      <div class="section-title" style="margin-top:12px"><h2>按价格区间</h2><span class="link" data-act="edit-ranges">编辑区间</span></div>
      <div class="range-chips">${rangeChips}</div>
      <div class="section-title" style="margin-top:12px"><h2>按品牌</h2></div>
      <div class="range-chips">${brandChips}</div>
      <div style="height:14px"></div>
      ${listHtml}
    `;
    el.querySelectorAll("[data-cat]").forEach((c) => c.onclick = () => { wardrobeFilterCategory = c.dataset.cat; if (c.dataset.cat !== "dress") wardrobeFilterSub = "all"; renderWardrobe(); });
    el.querySelectorAll("[data-sub]").forEach((c) => c.onclick = () => { wardrobeFilterSub = c.dataset.sub; renderWardrobe(); });
    el.querySelectorAll("[data-r]").forEach((c) => c.onclick = () => { wardrobeFilterRange = c.dataset.r; renderWardrobe(); });
    el.querySelectorAll("[data-b]").forEach((c) => c.onclick = () => { wardrobeFilterBrand = c.dataset.b; renderWardrobe(); });
    el.querySelector('[data-act="edit-ranges"]').onclick = openRangeModal;
    el.querySelector('[data-act="edit-cats"]').onclick = openCategoryModal;
    const rnLink = el.querySelector('[data-act="rename-wardrobe"]');
    if (rnLink) rnLink.onclick = openRenameWardrobeModal;
    bindDressItems(el);
  }

  function inRange(price, r) {
    const p = Number(price) || 0;
    if (r.max == null) return p >= r.min;
    return p >= r.min && p <= r.max;
  }

  /* ---------- 渲染：日历 ---------- */
  function renderCalendar() {
    const el = $("#page-calendar");
    const [y, m] = calMonth.split("-").map(Number);
    const first = new Date(y, m - 1, 1);
    const startDow = first.getDay();
    const daysInMonth = new Date(y, m, 0).getDate();
    const today = todayStr();
    const prev = prevMonthKey(calMonth);
    const next = nextMonthKey(calMonth);

    // 该月尾款分布（按状态分色：已下定=红/待付，已到货·已拥有=绿/已补）
    const dueMap = {};
    state.dresses.forEach((d) => {
      if (d.status !== "wish" && d.balanceDueDate && monthKey(parseDate(d.balanceDueDate)) === calMonth) {
        const day = d.balanceDueDate.slice(8, 10);
        if (!dueMap[day]) dueMap[day] = { red: 0, green: 0 };
        if (d.status === "ordered") dueMap[day].red++;
        else if (d.status === "arrived" || d.status === "owned") dueMap[day].green++;
      }
    });

    const dows = ["日", "一", "二", "三", "四", "五", "六"];
    let cells = dows.map((d) => `<div class="dow">${d}</div>`).join("");
    for (let i = 0; i < startDow; i++) cells += `<div class="cal-cell muted"></div>`;
    for (let day = 1; day <= daysInMonth; day++) {
      const dd = String(day).padStart(2, "0");
      const full = calMonth + "-" + dd;
      const has = dueMap[dd];
      const cls = ["cal-cell"];
      if (full === today) cls.push("today");
      if (has && (has.red || has.green)) cls.push("has-due");
      let badges = "";
      if (has) {
        // 左上角：已补尾款（绿，带数字）；右上角：待付尾款（红，带数字）
        if (has.green) badges += `<span class="cnt cnt-green">${has.green}</span>`;
        if (has.red) badges += `<span class="cnt cnt-red">${has.red}</span>`;
      }
      cells += `<div class="${cls.join(" ")}" data-day="${full}"><span class="day-num">${day}</span>${badges}</div>`;
    }

    // 即将到期尾款（本月及之后、未逾期优先，逾期也列出）
    const dues = state.dresses
      .filter((d) => d.balanceDueDate && d.status === "ordered")
      .map((d) => ({ d, diff: daysBetween(today, d.balanceDueDate) }))
      .sort((a, b) => a.diff - b.diff)
      .slice(0, 8);

    const dueHtml = dues.length
      ? dues.map(({ d, diff }) => {
          const cd = diff < 0 ? `<span class="countdown cd-over">逾期 ${-diff}天</span>`
            : diff === 0 ? `<span class="countdown cd-soon">今天到期</span>`
            : diff <= 7 ? `<span class="countdown cd-soon">${diff}天后</span>`
            : `<span class="countdown cd-ok">${diff}天后</span>`;
          return `<div class="due-item" data-id="${d.id}">
            <div class="when">${d.balanceDueDate.slice(5)}</div>
            <div class="nm">${escapeHtml(d.name)} ${cd}</div>
            <div class="amt">${money((Number(d.price) || 0) - (Number(d.deposit) || 0))}</div>
          </div>`;
        }).join("")
      : `<div class="empty"><div class="e">🗓️</div>暂无待付尾款</div>`;

    el.innerHTML = `
      <div class="cal-head">
        <button data-act="cal-prev">‹</button>
        <div class="m">${calMonth.replace("-", " 年 ")} 月</div>
        <button data-act="cal-next">›</button>
      </div>
      <div class="card" style="padding:14px">
        <div class="cal-grid">${cells}</div>
        <div class="cal-legend"><span><b class="lg lg-red"></b>待付尾款</span><span><b class="lg lg-green"></b>已补齐</span><span>● 今天</span></div>
      </div>
      <div class="section-title"><h2>尾款提醒</h2></div>
      <div class="card">${dueHtml}</div>
    `;
    el.querySelector('[data-act="cal-prev"]').onclick = () => { calMonth = prevMonthKey(calMonth); renderCalendar(); };
    el.querySelector('[data-act="cal-next"]').onclick = () => { calMonth = nextMonthKey(calMonth); renderCalendar(); };
    el.querySelectorAll(".cal-cell[data-day]").forEach((c) => c.onclick = () => {
      const day = c.dataset.day;
      const ds = state.dresses.filter((d) => d.balanceDueDate === day);
      if (ds.length) openDayModal(day, ds);
    });
    el.querySelectorAll(".due-item[data-id]").forEach((it) => it.onclick = () => {
      const rec = state.dresses.find((x) => x.id === it.dataset.id);
      if (rec) openDressModal(rec);
    });
  }

  /* ---------- 渲染：心愿单 ---------- */
  function renderWishlist() {
    const el = $("#page-wishlist");
    const wishes = state.dresses
      .filter((d) => d.status === "wish")
      .sort((a, b) => (b.dateOrdered || "").localeCompare(a.dateOrdered || ""));
    const total = wishes.reduce((s, d) => s + (Number(d.price) || 0), 0);

    const listHtml = wishes.length
      ? `<div class="list">${wishes.map(safeDressItemHtml).join("")}</div>`
      : `<div class="empty"><div class="e">🌱</div>心愿单还空空如也～<br>点下方 ＋ 种草一条吧</div>`;

    el.innerHTML = `
      <div class="card">
        <div class="card-title">心愿单</div>
        <div class="month-stats">
          <div class="cell"><b>${wishes.length}</b><span>条种草</span></div>
          <div class="cell"><b>${money(total)}</b><span>预估总价</span></div>
        </div>
        <div class="muted-tip" style="margin-top:10px">把状态改为「已下定」即从心愿单移出，进入裙柜 / 月度。</div>
      </div>
      ${listHtml}
    `;
    bindDressItems(el);
  }

  /* ---------- 裙子卡片 HTML ---------- */
  function dressItemHtml(d) {
    const st = STATUS[d.status] || STATUS.wish;
    const paidOff = d.status === "arrived" || d.status === "owned";
    const bal = (Number(d.price) || 0) - (Number(d.deposit) || 0);
    let due = "";
    let priceMeta;
    if (d.purchaseMode === "full") {
      // 全款购买：显示购入日期，不提示定金/尾款
      priceMeta = money(d.price) + (d.purchaseDate ? " · 购入 " + d.purchaseDate.slice(5) : "");
    } else {
      // 定尾模式：已到货/已拥有只显示全款，未补齐则提示尾款
      due = (!paidOff && d.balanceDueDate) ? `<span class="meta">尾款 ${d.balanceDueDate.slice(5)} · ${money(bal)}</span>` : "";
      priceMeta = paidOff ? money(d.price) : (money(d.price) + (d.deposit ? " · 定金 " + money(d.deposit) : ""));
    }
    const wear = Number(d.wearCount) || 0;
    const wash = Number(d.washCount) || 0;
    const isNew = !!d.isNew;
    let countersHtml = "";
    if (isNew) {
      countersHtml = `<span class="new-badge" title="全新未穿">✨ 全新</span>`;
    } else if (wear > 0 || wash > 0) {
      countersHtml = `<span title="穿着次数">👕 ${wear}</span><span title="洗涤次数">🫧 ${wash}</span>`;
    }
    const counters = countersHtml ? `<div class="counters">${countersHtml}</div>` : "";
    const brandMeta = (d.brand || "").trim() ? `<span class="meta brand-meta">🏷 ${escapeHtml(d.brand.trim())}</span>` : "";
    return `<div class="item" data-id="${d.id}">
      <div class="thumb">${d.image ? '<img src="' + escapeHtml(d.image) + '" alt="">' : (d.emoji || "👗")}</div>
      <div class="body">
        <div class="name">${escapeHtml(d.name)}${typePill(d)}<span class="status-pill ${st.cls}">${st.label}</span></div>
        <div class="meta">${priceMeta}</div>
        ${due}
        ${brandMeta}
      </div>
      <div class="side">
        ${counters}
        <div class="price">${money(d.price)}</div>
      </div>
    </div>`;
  }
  // 单条容错：某条数据异常时只跳过该条，避免整段列表渲染失败导致页面空白
  function safeDressItemHtml(d) {
    try { return dressItemHtml(d); }
    catch (e) { return `<div class="item"><div class="body"><div class="name">${escapeHtml(d && d.name ? d.name : "未命名")}</div><div class="meta">该条数据异常，建议编辑或删除</div></div></div>`; }
  }
  function bindDressItems(root) {
    root.querySelectorAll(".item[data-id]").forEach((it) => {
      it.onclick = () => {
        const d = state.dresses.find((x) => x.id === it.dataset.id);
        if (d) openDressModal(d);
      };
    });
  }

  /* ---------- 弹窗：添加/编辑裙子 ---------- */
  function openDressModal(existing) {
    const s = existing || {};
    const emojis = state.settings.emojiOptions || DEFAULT_STATE().settings.emojiOptions;
    const curEmoji = s.emoji || emojis[0];
    const curMode = s.purchaseMode || "layaway";
    const box = $("#modalBox");
    box.innerHTML = `
      <h3>${existing ? "编辑裙子" : "添加裙子 🎀"}</h3>
      <div class="field">
        <label>选个图标</label>
        <div class="emoji-pick">
          ${emojis.map((e) => `<button class="${e === curEmoji ? "sel" : ""}" data-emoji="${e}">${e}</button>`).join("")}
        </div>
      </div>
      <div class="field">
        <label>裙子图片（选填）</label>
        <div id="imgPrev" class="${s.image ? "" : "hidden"}" style="margin-bottom:8px">
          <img id="imgShow" src="${s.image || ""}" style="max-width:100%;max-height:160px;border-radius:12px;display:block">
        </div>
        <input type="file" id="f-img" accept="image/*">
        ${s.image ? '<button type="button" class="btn btn-ghost" id="f-img-del" style="margin-top:8px">移除图片</button>' : ""}
      </div>
      <div class="field"><label>品牌</label><input id="f-brand" placeholder="例如：Baby the Stars Shine Bright" value="${escapeHtml(s.brand || "")}"></div>
      <div class="field"><label>裙子名称 *</label><input id="f-name" placeholder="例如：草莓波点 JSK" value="${escapeHtml(s.name || "")}"></div>
      <div class="row2">
        <div class="field"><label>总价</label><input id="f-price" type="number" inputmode="decimal" placeholder="0" value="${s.price || ""}"></div>
        <div class="field"><label>购买模式</label>
          <select id="f-mode">
            <option value="layaway" ${curMode === "layaway" ? "selected" : ""}>定尾模式</option>
            <option value="full" ${curMode === "full" ? "selected" : ""}>全款购买</option>
          </select>
        </div>
      </div>
      <div id="mode-full" style="${curMode === "full" ? "" : "display:none"}">
        <div class="row2">
          <div class="field"><label>购入日期</label><input id="f-purchase" type="date" value="${s.purchaseDate || todayStr()}"></div>
        </div>
      </div>
      <div id="mode-layaway" style="${curMode === "full" ? "display:none" : ""}">
        <div class="row2">
          <div class="field"><label>定金日期</label><input id="f-ordered" type="date" value="${s.dateOrdered || todayStr()}"></div>
          <div class="field"><label>尾款日期</label><input id="f-due" type="date" value="${s.balanceDueDate || ""}"></div>
        </div>
        <div class="row2">
          <div class="field"><label>定金</label><input id="f-deposit" type="number" inputmode="decimal" placeholder="0" value="${s.deposit || ""}"></div>
          <div class="field"><label>本次已付（记预算）</label><input id="f-paid" type="number" inputmode="decimal" placeholder="默认=定金" value="${s.orderPaid != null ? s.orderPaid : (s.deposit || "")}"></div>
        </div>
      </div>
      <div class="row2">
        <div class="field"><label>类型</label>
          <select id="f-cat">
            ${getCats().map((c) => `<option value="${c.id}" ${(s.category || "dress") === c.id ? "selected" : ""}>${escapeHtml(c.label)}</option>`).join("")}
          </select>
        </div>
        <div class="field" id="f-sub-wrap" style="${catHasSub(s.category || "dress") ? "" : "display:none"}">
          <label>款式子类</label>
          <select id="f-sub">
            ${(() => { const c = catById(s.category || "dress"); return (c && c.subtypes ? c.subtypes : []).map((sub) => `<option value="${sub.id}" ${s.subType === sub.id ? "selected" : ""}>${escapeHtml(sub.label)}</option>`).join(""); })()}
          </select>
        </div>
      </div>
      <div class="row2">
        <div class="field"><label>状态</label>
          <select id="f-status">
            ${Object.keys(STATUS).map((k) => `<option value="${k}" ${s.status === k ? "selected" : ""}>${STATUS[k].label}</option>`).join("")}
          </select>
        </div>
        <div class="field" style="display:flex;align-items:flex-end">
          <label class="check-inline"><input type="checkbox" id="f-new" ${s.isNew ? "checked" : ""}> 全新未穿</label>
        </div>
      </div>
      <div id="wear-wrap" style="${s.isNew ? "display:none" : ""}">
        <div class="row2">
          <div class="field"><label>穿着次数</label><input id="f-wear" type="number" inputmode="numeric" min="0" placeholder="0" value="${s.wearCount || 0}"></div>
          <div class="field"><label>洗涤次数</label><input id="f-wash" type="number" inputmode="numeric" min="0" placeholder="0" value="${s.washCount || 0}"></div>
        </div>
      </div>
      <div class="field"><label>备注</label><input id="f-note" placeholder="可选" value="${escapeHtml(s.note || "")}"></div>
      <div class="modal-actions">
        ${existing ? `<button class="btn btn-danger" id="f-del">删除</button>` : ""}
        <button class="btn btn-ghost" data-close>取消</button>
        <button class="btn btn-primary" id="f-save">${existing ? "保存" : "添加"}</button>
      </div>
    `;
    openModal();

    let picked = curEmoji;
    box.querySelectorAll(".emoji-pick button").forEach((b) => b.onclick = () => {
      box.querySelectorAll(".emoji-pick button").forEach((x) => x.classList.remove("sel"));
      b.classList.add("sel"); picked = b.dataset.emoji;
    });
    box.querySelector("#f-cat").onchange = (e) => {
      const cat = catById(e.target.value);
      const wrap = box.querySelector("#f-sub-wrap");
      wrap.style.display = (cat && cat.hasSub) ? "" : "none";
      if (cat && cat.hasSub) {
        wrap.querySelector("#f-sub").innerHTML = (cat.subtypes || [])
          .map((sub) => `<option value="${sub.id}">${escapeHtml(sub.label)}</option>`).join("");
      }
    };
    box.querySelector("#f-mode").onchange = (e) => {
      const full = e.target.value === "full";
      box.querySelector("#mode-full").style.display = full ? "" : "none";
      box.querySelector("#mode-layaway").style.display = full ? "none" : "";
    };
    const newChk = box.querySelector("#f-new");
    if (newChk) newChk.onchange = (e) => {
      box.querySelector("#wear-wrap").style.display = e.target.checked ? "none" : "";
    };
    let imgData = s.image || "";
    const imgInput = box.querySelector("#f-img");
    if (imgInput) imgInput.onchange = (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      compressImage(file).then((url) => {
        imgData = url;
        box.querySelector("#imgShow").src = url;
        box.querySelector("#imgPrev").classList.remove("hidden");
      }).catch(() => toast("图片读取失败"));
    };
    const imgDel = box.querySelector("#f-img-del");
    if (imgDel) imgDel.onclick = () => {
      imgData = ""; box.querySelector("#imgPrev").classList.add("hidden");
      if (imgInput) imgInput.value = "";
    };
    box.querySelector('[data-close]').onclick = closeModal;
    if (existing) box.querySelector("#f-del").onclick = () => {
      askConfirm("确定删除这条裙子吗？删除后不可恢复。").then((ok) => {
        if (!ok) return;
        state.dresses = state.dresses.filter((x) => x.id !== existing.id);
        save(); closeModal(); refreshAll(); toast("已删除");
      });
    };
    box.querySelector("#f-save").onclick = () => {
      const name = box.querySelector("#f-name").value.trim();
      if (!name) { toast("请填写裙子名称"); return; }
      const price = parseFloat(box.querySelector("#f-price").value) || 0;
      const mode = box.querySelector("#f-mode").value;
      const full = mode === "full";
      const deposit = full ? 0 : (parseFloat(box.querySelector("#f-deposit").value) || 0);
      let paid = box.querySelector("#f-paid").value;
      paid = full ? 0 : (paid === "" ? deposit : (parseFloat(paid) || 0));
      const isNew = box.querySelector("#f-new") ? box.querySelector("#f-new").checked : false;
      const rec = {
        id: existing ? existing.id : uid(),
        emoji: picked,
        name,
        price, deposit,
        orderPaid: paid,
        purchaseMode: mode,
        dateOrdered: full ? "" : (box.querySelector("#f-ordered").value || todayStr()),
        balanceDueDate: full ? "" : (box.querySelector("#f-due").value || ""),
        purchaseDate: full ? (box.querySelector("#f-purchase").value || todayStr()) : "",
        status: box.querySelector("#f-status").value,
        category: box.querySelector("#f-cat").value,
        subType: catHasSub(box.querySelector("#f-cat").value) ? box.querySelector("#f-sub").value : "",
        image: imgData,
        note: box.querySelector("#f-note").value.trim(),
        brand: box.querySelector("#f-brand").value.trim(),
        isNew,
        wearCount: isNew ? 0 : (parseInt(box.querySelector("#f-wear").value, 10) || 0),
        washCount: isNew ? 0 : (parseInt(box.querySelector("#f-wash").value, 10) || 0),
      };
      if (existing) {
        const i = state.dresses.findIndex((x) => x.id === existing.id);
        state.dresses[i] = rec;
      } else {
        state.dresses.unshift(rec);
      }
      save(); closeModal(); refreshAll(); toast(existing ? "已保存" : "已添加 🎀");
    };
  }

  /* ---------- 弹窗：预算设置 ---------- */
  function openBudgetModal(mk) {
    const b = budgetOf(mk);
    const box = $("#modalBox");
    box.innerHTML = `
      <h3>${mk.replace("-", " 年 ")} 月预算</h3>
      <div class="field"><label>本月购买预算</label><input id="b-limit" type="number" inputmode="decimal" value="${b.limit || ""}" placeholder="0"></div>
      <div class="carry-row" style="margin:0;padding:0;border:none">
        <div><div class="t">上月余额累计到下月</div><div class="d">未用完的额度滚入下月</div></div>
        <label class="switch"><input type="checkbox" id="b-carry" ${b.carryOver ? "checked" : ""}><span class="track"></span></label>
      </div>
      <div class="modal-actions" style="margin-top:16px">
        <button class="btn btn-ghost" data-close>取消</button>
        <button class="btn btn-primary" id="b-save">保存</button>
      </div>
    `;
    openModal();
    box.querySelector('[data-close]').onclick = closeModal;
    box.querySelector("#b-save").onclick = () => {
      const limit = parseFloat(box.querySelector("#b-limit").value) || 0;
      const carry = box.querySelector("#b-carry").checked;
      state.budgets[mk] = { limit, carryOver: carry };
      save(); closeModal(); renderMonth(); toast("预算已保存");
    };
  }

  /* ---------- 弹窗：价格区间设置 ---------- */
  function openRangeModal() {
    const ranges = state.settings.priceRanges;
    const box = $("#modalBox");
    const renderRows = () => ranges.map((r, i) => `
      <div class="row2" data-ri="${i}" style="align-items:flex-end">
        <div class="field" style="flex:2"><label>区间名</label><input data-k="label" value="${escapeHtml(r.label)}"></div>
        <div class="field"><label>最低</label><input data-k="min" type="number" value="${r.min}"></div>
        <div class="field"><label>最高(-1=以上)</label><input data-k="max" type="number" value="${r.max == null ? -1 : r.max}"></div>
        <button class="btn btn-danger" data-del style="flex:none;width:42px;height:42px">✕</button>
      </div>`).join("");
    box.innerHTML = `
      <h3>价格区间设置</h3>
      <div id="rangeRows">${renderRows()}</div>
      <button class="btn btn-ghost" id="r-add" style="margin:8px 0">＋ 新增区间</button>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-close>取消</button>
        <button class="btn btn-primary" id="r-save">保存</button>
      </div>
    `;
    openModal();
    box.querySelector('[data-close]').onclick = closeModal;
    box.querySelector("#r-add").onclick = () => {
      ranges.push({ id: uid(), label: "新区间", min: 0, max: 999 });
      box.querySelector("#rangeRows").innerHTML = renderRows(); bindRangeRows();
    };
    function bindRangeRows() {
      box.querySelectorAll("#rangeRows [data-ri]").forEach((row) => {
        const i = Number(row.dataset.ri);
        row.querySelectorAll("input[data-k]").forEach((inp) => {
          inp.oninput = () => {
            const k = inp.dataset.k;
            if (k === "label") ranges[i].label = inp.value;
            else if (k === "min") ranges[i].min = parseFloat(inp.value) || 0;
            else if (k === "max") ranges[i].max = inp.value === "-1" ? null : (parseFloat(inp.value) || 0);
          };
        });
        row.querySelector("[data-del]").onclick = () => { ranges.splice(i, 1); box.querySelector("#rangeRows").innerHTML = renderRows(); bindRangeRows(); };
      });
    }
    bindRangeRows();
    box.querySelector("#r-save").onclick = () => {
      ranges.forEach((r) => { if (!r.id) r.id = uid(); });
      state.settings.priceRanges = ranges;
      save(); closeModal(); renderWardrobe(); renderWishlist(); toast("区间已更新");
    };
  }

  /* ---------- 弹窗：编辑类型（自定义大类与子类） ---------- */
  function openCategoryModal() {
    const cats = JSON.parse(JSON.stringify(getCats()));
    const PALETTE = ["#e86a97", "#7a5bd1", "#3a87c9", "#4c9a6a", "#f0943f", "#2bb3a3", "#d96fa0", "#8a7a66", "#5c6bc0", "#26a69a"];
    let colorIdx = 0;
    const box = $("#modalBox");

    function renderCats() {
      return cats.map((c, i) => `
        <div class="cat-row" data-ci="${i}">
          <div class="row2" style="align-items:flex-end">
            <div class="field" style="flex:2"><label>类型名</label><input data-k="label" value="${escapeHtml(c.label)}"></div>
            <div class="field" style="width:70px"><label>含子类</label><input type="checkbox" data-k="hasSub" ${c.hasSub ? "checked" : ""}></div>
            <button class="btn btn-danger" data-del style="flex:none;width:42px;height:42px">✕</button>
          </div>
          ${c.hasSub ? `
            <div class="sub-rows">
              ${(c.subtypes || []).map((s, j) => `
                <div class="sub-row" data-sj="${j}">
                  <input data-sk="label" value="${escapeHtml(s.label)}" placeholder="子类名">
                  <button class="btn btn-danger" data-sdel style="flex:none;width:34px;height:34px">✕</button>
                </div>`).join("")}
              <button class="btn btn-ghost sub-add" style="margin-top:6px">＋ 新增子类</button>
            </div>` : ""}
        </div>`).join("");
    }
    function rebuild() { box.querySelector("#catRows").innerHTML = renderCats(); bind(); }
    function bind() {
      box.querySelectorAll("#catRows .cat-row").forEach((row) => {
        const i = Number(row.dataset.ci);
        row.querySelectorAll("input[data-k]").forEach((inp) => {
          inp.oninput = inp.onchange = () => {
            const k = inp.dataset.k;
            if (k === "label") cats[i].label = inp.value;
            else if (k === "hasSub") {
              cats[i].hasSub = inp.checked;
              if (!inp.checked) cats[i].subtypes = [];
              rebuild();
            }
          };
        });
        const del = row.querySelector("[data-del]");
        if (del) del.onclick = () => {
          if (cats.length <= 1) { toast("至少保留一个类型"); return; }
          cats.splice(i, 1); rebuild();
        };
        if (cats[i].hasSub) {
          row.querySelectorAll(".sub-row").forEach((sr) => {
            const j = Number(sr.dataset.sj);
            sr.querySelector("input[data-sk]").oninput = () => { cats[i].subtypes[j].label = sr.querySelector("input[data-sk]").value; };
            sr.querySelector("[data-sdel]").onclick = () => { cats[i].subtypes.splice(j, 1); rebuild(); };
          });
          row.querySelector(".sub-add").onclick = () => {
            if (!cats[i].subtypes) cats[i].subtypes = [];
            cats[i].subtypes.push({ id: uid(), label: "新子类" });
            rebuild();
          };
        }
      });
    }

    box.innerHTML = `
      <h3>类型设置</h3>
      <p class="muted-tip">自定义大类（裙子/配饰/鞋子…）与裙装子类（JSK/OP…）。类型名用于筛选与统计，颜色自动分配。</p>
      <div id="catRows">${renderCats()}</div>
      <button class="btn btn-ghost" id="cat-add" style="margin:8px 0">＋ 新增类型</button>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-close>取消</button>
        <button class="btn btn-primary" id="cat-save">保存</button>
      </div>`;
    openModal();
    box.querySelector('[data-close]').onclick = closeModal;
    bind();
    box.querySelector("#cat-add").onclick = () => {
      const used = cats.map((c) => c.color);
      const color = PALETTE.find((p) => !used.includes(p)) || PALETTE[colorIdx++ % PALETTE.length];
      cats.push({ id: uid(), label: "新类型", color, hasSub: false, subtypes: [] });
      rebuild();
    };
    box.querySelector("#cat-save").onclick = () => {
      cats.forEach((c) => { if (!c.id) c.id = uid(); if (!c.subtypes) c.subtypes = []; });
      if (!cats.length) { toast("至少保留一个类型"); return; }
      const ids = cats.map((c) => c.id);
      // 修正已存裙子：若其类型被删，归并到第一个类型
      state.dresses.forEach((d) => {
        if (!ids.includes(d.category)) { d.category = cats[0].id; if (!cats[0].hasSub) d.subType = ""; }
      });
      state.settings.categories = cats;
      // 若当前筛选的类型已不存在，重置筛选
      if (wardrobeFilterCategory !== "all" && !ids.includes(wardrobeFilterCategory)) {
        wardrobeFilterCategory = "all"; wardrobeFilterSub = "all";
      }
      save(); closeModal(); renderWardrobe(); renderWishlist(); toast("类型已更新");
    };
  }

  /* ---------- 弹窗：重命名裙柜 ---------- */
  function openRenameWardrobeModal() {
    const s = state.settings;
    const box = $("#modalBox");
    box.innerHTML = `
      <h3>重命名裙柜</h3>
      <div class="field"><label>裙柜名称</label><input id="rn-name" maxlength="20" value="${escapeHtml(s.wardrobeName || "我的裙柜")}" placeholder="例如：Luna 的裙柜"></div>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-close>取消</button>
        <button class="btn btn-primary" id="rn-save">保存</button>
      </div>`;
    openModal();
    box.querySelector('[data-close]').onclick = closeModal;
    const input = box.querySelector("#rn-name");
    input.focus(); input.select();
    const saveName = () => {
      const v = input.value.trim();
      if (!v) { toast("名称不能为空"); return; }
      s.wardrobeName = v;
      save(); closeModal();
      if (document.querySelector('.tab[data-tab="wardrobe"]').classList.contains("active")) {
        $("#pageTitle").textContent = v;
      }
      renderWardrobe(); toast("裙柜已重命名为「" + v + "」");
    };
    box.querySelector("#rn-save").onclick = saveName;
    input.onkeydown = (e) => { if (e.key === "Enter") saveName(); };
  }

  /* ---------- 弹窗：设置 ---------- */
  /* ---------- 演示数据生成（预览用） ---------- */
  function genDemoData(n) {
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
    function randDateOrdered() {
      const months = ["2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07"];
      const mk = pick(months); const [y, m] = mk.split("-").map(Number); const day = randInt(1, 27);
      return y + "-" + String(m).padStart(2, "0") + "-" + String(day).padStart(2, "0");
    }
    function addDays(dstr, n) {
      const [y, m, d] = dstr.split("-").map(Number);
      const dt = new Date(y, m - 1, d); dt.setDate(dt.getDate() + n);
      return dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") + "-" + String(dt.getDate()).padStart(2, "0");
    }
    const dressPre = ["草莓", "蕾丝", "波点", "樱桃", "蝴蝶结", "薄荷", "樱花", "蔷薇", "星河", "茶会", "古典", "甜梦", "哥特", "童话", "海军", "小熊", "奶油", "葡萄", "蜜桃", "莓果", "月光", "焦糖", "玫瑰", "薄荷糖", "矢车菊"];
    const brands = ["Baby", "Angelic Pretty", "Meta", "Alice", "Juliette", "Innocent World", "Mary", "Antique Beast", "Miss Point", "Dear My Love"];
    const subStyle = { jsk: "JSK", op: "OP", bib: "背带裙", cutsew: "内搭" };
    const accN = ["发箍", "手袖", "KC发带", "头饰", "珍珠项链", "耳饰", "胸针", "包包", "手套", "腰封"];
    const shoesN = ["lo鞋", "茶会鞋", "玛丽珍", "小高跟", "圆头鞋"];
    const otherN = ["披肩", "外套", "洋伞", "手包", "斗篷"];
    const accEmoji = ["🎀", "💕", "🌟", "💖"]; const shoesEmoji = ["👠", "🩰"]; const otherEmoji = ["🧁", "⭐", "🌷"];
    function genOne(i) {
      const r = Math.random(); let category, subType = "", name, emoji;
      if (r < 0.70) { category = "dress"; subType = pick(["jsk", "op", "bib", "cutsew"]); name = pick(dressPre) + " " + subStyle[subType]; emoji = "👗"; }
      else if (r < 0.85) { category = "accessory"; name = pick(accN) + " " + pick(dressPre); emoji = pick(accEmoji); }
      else if (r < 0.95) { category = "shoes"; name = pick(shoesN) + " " + pick(dressPre); emoji = pick(shoesEmoji); }
      else { category = "other"; name = pick(otherN) + " " + pick(dressPre); emoji = pick(otherEmoji); }
      const brand = pick(brands);
      let price;
      if (category === "dress") { const rg = pick(state.settings.priceRanges); price = rg.max == null ? randInt(rg.min, rg.min + 3000) : randInt(rg.min, rg.max); }
      else if (category === "accessory") { price = randInt(pick([[30, 499], [500, 999]])); }
      else if (category === "shoes") { price = randInt(200, 1800); }
      else { price = randInt(50, 1200); }
      price = Math.round(price / 10) * 10;
      const status = pick(["wish", "ordered", "arrived", "owned"]);
      const dateOrdered = randDateOrdered();
      let deposit = 0, orderPaid = 0, balanceDueDate = "";
      if (status !== "wish") { deposit = Math.round(price * (0.3 + Math.random() * 0.15) / 10) * 10; if (deposit > price) deposit = price; orderPaid = deposit; balanceDueDate = addDays(dateOrdered, randInt(28, 58)); }
      let wearCount = 0, washCount = 0;
      if (status === "arrived" || status === "owned") { wearCount = randInt(0, 25); washCount = randInt(0, 20); }
      return { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 9) + i, emoji, name, price, deposit, orderPaid, dateOrdered, balanceDueDate, status, note: "", brand, category, subType, image: "", wearCount, washCount };
    }
    const arr = state.dresses.slice();
    for (let i = 0; i < n; i++) arr.push(genOne(i));
    state.dresses = arr; save(); refreshAll();
  }

  function openSettingsModal() {
    const s = state.settings;
    const box = $("#modalBox");
    box.innerHTML = `
      <h3>⚙️ 设置</h3>
      <div class="field"><label>货币符号</label><input id="set-cur" value="${escapeHtml(s.currency || "¥")}" maxlength="3"></div>
      <div class="carry-row" style="margin:0 0 12px;padding:0;border:none">
        <div><div class="t">新月份默认累计上月余额</div></div>
        <label class="switch"><input type="checkbox" id="set-carry" ${s.carryOverDefault ? "checked" : ""}><span class="track"></span></label>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-close>取消</button>
        <button class="btn btn-primary" id="set-save">保存</button>
      </div>
      <div style="height:10px"></div>
      <button class="btn btn-soft" id="set-demo">🎲 生成 100 条演示数据</button>
      <button class="btn btn-danger" id="set-reset">清空全部数据</button>
    `;
    openModal();
    box.querySelector('[data-close]').onclick = closeModal;
    box.querySelector("#set-save").onclick = () => {
      s.currency = box.querySelector("#set-cur").value.trim() || "¥";
      s.carryOverDefault = box.querySelector("#set-carry").checked;
      save(); closeModal(); refreshAll(); toast("设置已保存");
    };
    box.querySelector("#set-demo").onclick = () => {
      askConfirm("将生成 100 条演示数据（不同价位/品类/状态），并追加到当前衣橱。确定继续？").then((ok) => {
        if (!ok) return;
        genDemoData(100); closeModal(); toast("已生成 100 条演示数据");
      });
    };
    box.querySelector("#set-reset").onclick = () => {
      askConfirm("确定清空全部裙子与预算数据？此操作不可恢复。").then((ok) => {
        if (!ok) return;
        state = DEFAULT_STATE(); save(); closeModal(); refreshAll(); toast("已清空");
      });
    };
  }

  /* ---------- 弹窗：某天尾款 ---------- */
  function openDayModal(day, ds) {
    const box = $("#modalBox");
    box.innerHTML = `
      <h3>${day.slice(5)} 尾款日</h3>
      <div class="list">${ds.map((d) => { const paidOff = d.status === "arrived" || d.status === "owned"; return `<div class="item" data-id="${d.id}">
        <div class="thumb">${d.image ? '<img src="' + escapeHtml(d.image) + '" alt="">' : (d.emoji || "👗")}</div>
        <div class="body"><div class="name">${escapeHtml(d.name)}${typePill(d)}</div>
        <div class="meta">${paidOff ? "全款 " + money(d.price) : "尾款 " + money((Number(d.price) || 0) - (Number(d.deposit) || 0))}</div></div>
        <div class="price">${money(d.price)}</div></div>`; }).join("")}</div>
      <div class="modal-actions"><button class="btn btn-ghost" data-close>关闭</button></div>
    `;
    openModal();
    box.querySelector('[data-close]').onclick = closeModal;
    box.querySelectorAll(".item[data-id]").forEach((it) => it.onclick = () => { closeModal(); openDressModal(ds.find((x) => x.id === it.dataset.id)); });
  }

  /* ---------- 弹窗通用 ---------- */
  function openModal() { $("#modalMask").classList.remove("hidden"); }
  function closeModal() { $("#modalMask").classList.add("hidden"); }

  // 应用内自定义确认弹窗（替代原生 confirm，PWA/iframe 环境更可靠）
  function askConfirm(message) {
    return new Promise((resolve) => {
      let cm = document.getElementById("confirmMask");
      if (!cm) {
        cm = document.createElement("div");
        cm.id = "confirmMask";
        cm.className = "modal-mask";
        cm.innerHTML = '<div class="modal" id="confirmBox"></div>';
        document.body.appendChild(cm);
      }
      const box = cm.querySelector("#confirmBox");
      box.innerHTML = `<p class="confirm-msg">${escapeHtml(message)}</p>
        <div class="modal-actions">
          <button class="btn btn-ghost" id="cf-no">取消</button>
          <button class="btn btn-danger" id="cf-yes">确定</button>
        </div>`;
      cm.classList.remove("hidden");
      const done = (r) => { cm.classList.add("hidden"); resolve(r); };
      box.querySelector("#cf-no").onclick = () => done(false);
      box.querySelector("#cf-yes").onclick = () => done(true);
      cm.onclick = (e) => { if (e.target === cm) done(false); };
    });
  }

  let toastTimer;
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.remove("hidden");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add("hidden"), 1600);
  }

  /* ---------- 首次引导 ---------- */
  function maybeSeed() {
    if (state.dresses.length === 0 && Object.keys(state.budgets).length === 0) {
      // 不自动写入，仅在月度页给引导；这里可选载入示例
    }
  }

  /* ---------- 刷新当前可见页面 ---------- */
  function refreshAll() {
    renderMonth(); renderWardrobe(); renderCalendar(); renderWishlist();
  }

  /* ---------- 事件绑定 ---------- */
  function bindGlobal() {
    document.querySelectorAll(".tab").forEach((t) => t.onclick = () => switchTab(t.dataset.tab));
    $("#btnSettings").onclick = openSettingsModal;
    $("#modalMask").onclick = (e) => { if (e.target.id === "modalMask") closeModal(); };
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
  }

  /* ---------- 启动 ---------- */
  function init() {
    bindGlobal();
    maybeSeed();
    renderMonth(); renderWardrobe(); renderCalendar(); renderWishlist();
    switchTab("month");
    registerSW();
  }

  function registerSW() {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("./sw.js").catch(() => {});
      });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
