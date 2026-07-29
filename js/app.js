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
      emojiOptions: ["👗", "🎀", "🌸", "💖", "🩰", "👑", "🌷", "💕", "🧁", "⭐", "🌟", "🦄"],
    },
    budgets: {}, // { "2026-07": { limit: 2000, carryOver: true } }
    dresses: [], // 见 addDress 字段
  });

  const STATUS = {
    wish: { label: "想买", cls: "st-wish" },
    ordered: { label: "已下定", cls: "st-ordered" },
    arrived: { label: "已到货", cls: "st-arrived" },
    owned: { label: "已拥有", cls: "st-owned" },
  };

  const CATEGORIES = {
    dress: { label: "裙子", cls: "ct-dress" },
    accessory: { label: "配饰", cls: "ct-acc" },
    shoes: { label: "鞋子", cls: "ct-shoes" },
    other: { label: "其他", cls: "ct-other" },
  };
  const SUBTYPES = {
    jsk: "JSK（无袖）",
    op: "OP（有袖）",
    bib: "背带裙",
    cutsew: "内搭/Cutsew",
  };
  function typeLabel(d) {
    if (d.category === "dress") return d.subType ? SUBTYPES[d.subType] : "裙子";
    return (CATEGORIES[d.category] || CATEGORIES.other).label;
  }

  /* ---------- 状态读写 ---------- */
  let state = load();
  let currentMonth = monthKey(new Date());
  let calMonth = monthKey(new Date());
  let wardrobeFilterRange = "all";
  let wardrobeFilterCategory = "all";
  let wardrobeFilterSub = "all";

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
      let spend = 0;
      // 下定支出记入“下定月”（想买不计）
      if (d.status !== "wish" && d.dateOrdered && monthKey(parseDate(d.dateOrdered)) === mk) {
        spend += Number(d.orderPaid) || 0;
      }
      // 尾款支出：状态变为已到货/已拥有时，记入“尾款所在月”
      const paidOff = d.status === "arrived" || d.status === "owned";
      if (paidOff) {
        const bal = Math.max(0, (Number(d.price) || 0) - (Number(d.orderPaid) || 0));
        if (d.balanceDueDate && monthKey(parseDate(d.balanceDueDate)) === mk) {
          spend += bal;
        } else if (!d.balanceDueDate && d.dateOrdered && monthKey(parseDate(d.dateOrdered)) === mk) {
          spend += bal; // 未填尾款日则补记到下定月
        }
      }
      return s + spend;
    }, 0);
  }
  function monthDresses(mk) {
    return state.dresses.filter((d) => d.dateOrdered && monthKey(parseDate(d.dateOrdered)) === mk);
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
  const TITLES = { month: "本月衣橱", wardrobe: "我的裙柜", calendar: "尾款日历", stats: "消费统计" };
  function switchTab(tab) {
    if (tab === "add") { openDressModal(); return; }
    document.querySelectorAll(".page").forEach((p) => p.classList.add("hidden"));
    $("#page-" + tab).classList.remove("hidden");
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === tab));
    $("#pageTitle").textContent = TITLES[tab] || "裙裙记账";
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
      ? `<div class="list">${list.map(dressItemHtml).join("")}</div>`
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
        <h2>本月下定</h2>
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
      .concat(Object.keys(CATEGORIES).map((k) =>
        `<span class="range-chip ${wardrobeFilterCategory === k ? "on" : ""}" data-cat="${k}">${CATEGORIES[k].label}</span>`))
      .join("");
    // 子类型 chips（仅裙子）
    let subChips = "";
    if (wardrobeFilterCategory === "dress") {
      subChips = `<div class="range-chips" style="margin:10px 0">`
        + [`<span class="range-chip sub ${wardrobeFilterSub === "all" ? "on" : ""}" data-sub="all">全部款式</span>`]
          .concat(Object.keys(SUBTYPES).map((k) =>
            `<span class="range-chip sub ${wardrobeFilterSub === k ? "on" : ""}" data-sub="${k}">${SUBTYPES[k].replace(/（.*）/, "")}</span>`))
          .join("") + `</div>`;
    }
    // 价格区间 chips
    const rangeChips = [`<span class="range-chip ${wardrobeFilterRange === "all" ? "on" : ""}" data-r="all">全部</span>`]
      .concat(ranges.map((r) => `<span class="range-chip ${wardrobeFilterRange === r.id ? "on" : ""}" data-r="${r.id}">${escapeHtml(r.label)}</span>`))
      .join("");

    // 组合筛选
    let dresses = state.dresses.slice().sort((a, b) => (b.dateOrdered || "").localeCompare(a.dateOrdered || ""));
    if (wardrobeFilterCategory !== "all") dresses = dresses.filter((d) => (d.category || "dress") === wardrobeFilterCategory);
    if (wardrobeFilterCategory === "dress" && wardrobeFilterSub !== "all") dresses = dresses.filter((d) => d.subType === wardrobeFilterSub);
    if (wardrobeFilterRange !== "all") {
      const r = ranges.find((x) => x.id === wardrobeFilterRange);
      if (r) dresses = dresses.filter((d) => inRange(d.price, r));
    }
    const total = dresses.reduce((s, d) => s + (Number(d.price) || 0), 0);
    const totalBalance = dresses.reduce((s, d) => s + ((Number(d.price) || 0) - (Number(d.deposit) || 0)), 0);

    let listHtml = dresses.length
      ? `<div class="list">${dresses.map(dressItemHtml).join("")}</div>`
      : `<div class="empty"><div class="e">👗</div>没有符合条件的单品～<br>换个筛选或点 ＋ 添加</div>`;

    el.innerHTML = `
      <div class="card">
        <div class="card-title">裙柜总览</div>
        <div class="month-stats">
          <div class="cell"><b>${dresses.length}</b><span>件（筛选后）</span></div>
          <div class="cell"><b>${money(total)}</b><span>总价值</span></div>
          <div class="cell"><b>${money(totalBalance)}</b><span>待付尾款</span></div>
        </div>
      </div>
      <div class="section-title"><h2>按类型</h2></div>
      <div class="range-chips">${catChips}</div>
      ${subChips}
      <div class="section-title" style="margin-top:12px"><h2>按价格区间</h2><span class="link" data-act="edit-ranges">编辑区间</span></div>
      <div class="range-chips">${rangeChips}</div>
      <div style="height:14px"></div>
      ${listHtml}
    `;
    el.querySelectorAll("[data-cat]").forEach((c) => c.onclick = () => { wardrobeFilterCategory = c.dataset.cat; if (c.dataset.cat !== "dress") wardrobeFilterSub = "all"; renderWardrobe(); });
    el.querySelectorAll("[data-sub]").forEach((c) => c.onclick = () => { wardrobeFilterSub = c.dataset.sub; renderWardrobe(); });
    el.querySelectorAll("[data-r]").forEach((c) => c.onclick = () => { wardrobeFilterRange = c.dataset.r; renderWardrobe(); });
    el.querySelector('[data-act="edit-ranges"]').onclick = openRangeModal;
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

    // 该月尾款分布
    const dueMap = {};
    state.dresses.forEach((d) => {
      if (d.balanceDueDate && monthKey(parseDate(d.balanceDueDate)) === calMonth) {
        const day = d.balanceDueDate.slice(8, 10);
        dueMap[day] = (dueMap[day] || 0) + 1;
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
      if (has) cls.push("has-due");
      cells += `<div class="${cls.join(" ")}" data-day="${full}">${day}${has ? `<span class="cnt">${has}</span><span class="dot"></span>` : ""}</div>`;
    }

    // 即将到期尾款（本月及之后、未逾期优先，逾期也列出）
    const dues = state.dresses
      .filter((d) => d.balanceDueDate && d.status !== "owned" && d.status !== "arrived")
      .map((d) => ({ d, diff: daysBetween(today, d.balanceDueDate) }))
      .sort((a, b) => a.diff - b.diff)
      .slice(0, 8);

    const dueHtml = dues.length
      ? dues.map(({ d, diff }) => {
          const cd = diff < 0 ? `<span class="countdown cd-over">逾期 ${-diff}天</span>`
            : diff === 0 ? `<span class="countdown cd-soon">今天到期</span>`
            : diff <= 7 ? `<span class="countdown cd-soon">${diff}天后</span>`
            : `<span class="countdown cd-ok">${diff}天后</span>`;
          return `<div class="due-item">
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
        <div class="cal-legend"><span><i></i>有尾款到期</span><span>● 今天</span></div>
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
  }

  /* ---------- 渲染：统计 ---------- */
  function renderStats() {
    const el = $("#page-stats");
    const all = state.dresses;
    const totalVal = all.reduce((s, d) => s + (Number(d.price) || 0), 0);
    const totalPaid = all.reduce((s, d) => s + (Number(d.orderPaid) || 0), 0);
    const totalBal = all.reduce((s, d) => s + ((Number(d.price) || 0) - (Number(d.deposit) || 0)), 0);
    const owned = all.filter((d) => d.status === "owned").length;

    const ranges = state.settings.priceRanges;
    const rangeCards = ranges.map((r) => {
      const ds = all.filter((d) => inRange(d.price, r));
      const sum = ds.reduce((s, d) => s + (Number(d.price) || 0), 0);
      return `<div class="range-card"><div class="lab">${escapeHtml(r.label)} · ${ds.length}件</div><div class="num">${money(sum)}</div><div class="tot">占比 ${totalVal ? Math.round((sum / totalVal) * 100) : 0}%</div></div>`;
    }).join("");

    const catCards = Object.keys(CATEGORIES).map((k) => {
      const ds = all.filter((d) => (d.category || "dress") === k);
      const sum = ds.reduce((s, d) => s + (Number(d.price) || 0), 0);
      return `<div class="range-card"><div class="lab">${CATEGORIES[k].label} · ${ds.length}件</div><div class="num">${money(sum)}</div><div class="tot">占比 ${all.length ? Math.round(ds.length / all.length * 100) : 0}%</div></div>`;
    }).join("");

    const top = all.slice().sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0))[0];

    el.innerHTML = `
      <div class="stat-hero">
        <div class="card"><div class="v">${all.length}</div><div class="k">单品总数</div></div>
        <div class="card"><div class="v">${money(totalVal)}</div><div class="k">衣橱总价值</div></div>
      </div>
      <div class="card">
        <div class="month-stats">
          <div class="cell"><b>${money(totalPaid)}</b><span>已支付</span></div>
          <div class="cell"><b>${money(totalBal)}</b><span>待付尾款</span></div>
          <div class="cell"><b>${owned}</b><span>已到手</span></div>
        </div>
      </div>
      <div class="section-title"><h2>按类型分布</h2></div>
      <div class="range-grid">${catCards}</div>
      <div class="section-title" style="margin-top:14px"><h2>价格区间分布</h2></div>
      <div class="range-grid">${rangeCards}</div>
      ${top ? `<div class="card" style="margin-top:14px"><div class="card-title">镇店之宝</div>
        <div class="item"><div class="thumb">${top.emoji || "👗"}</div>
        <div class="body"><div class="name">${escapeHtml(top.name)}</div>
        <div class="meta">${typeLabel(top)} · ${STATUS[top.status] ? STATUS[top.status].label : ""} · 最贵单品</div></div>
        <div class="price">${money(top.price)}</div></div></div>` : ""}
    `;
  }

  /* ---------- 裙子卡片 HTML ---------- */
  function dressItemHtml(d) {
    const st = STATUS[d.status] || STATUS.wish;
    const paidOff = d.status === "arrived" || d.status === "owned";
    const bal = (Number(d.price) || 0) - (Number(d.deposit) || 0);
    // 已到货/已拥有：不再区分定金尾款，只显示全款；不再提示尾款
    const due = (!paidOff && d.balanceDueDate) ? `<span class="meta">尾款 ${d.balanceDueDate.slice(5)} · ${money(bal)}</span>` : "";
    const priceMeta = paidOff ? money(d.price) : (money(d.price) + (d.deposit ? " · 定金 " + money(d.deposit) : ""));
    const wear = Number(d.wearCount) || 0;
    const wash = Number(d.washCount) || 0;
    const counters = (wear > 0 || wash > 0)
      ? `<div class="counters"><span title="穿着次数">👕 ${wear}</span><span title="洗涤次数">🫧 ${wash}</span></div>` : "";
    return `<div class="item" data-id="${d.id}">
      <div class="thumb">${d.image ? '<img src="' + escapeHtml(d.image) + '" alt="">' : (d.emoji || "👗")}</div>
      <div class="body">
        <div class="name">${escapeHtml(d.name)}<span class="type-pill ${(CATEGORIES[d.category] || CATEGORIES.other).cls}">${typeLabel(d)}</span><span class="status-pill ${st.cls}">${st.label}</span></div>
        <div class="meta">${priceMeta}</div>
        ${due}
      </div>
      <div class="side">
        ${counters}
        <div class="price">${money(d.price)}</div>
      </div>
    </div>`;
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
      <div class="field"><label>裙子名称 *</label><input id="f-name" placeholder="例如：草莓波点 JSK" value="${escapeHtml(s.name || "")}"></div>
      <div class="row2">
        <div class="field"><label>总价</label><input id="f-price" type="number" inputmode="decimal" placeholder="0" value="${s.price || ""}"></div>
        <div class="field"><label>定金</label><input id="f-deposit" type="number" inputmode="decimal" placeholder="0" value="${s.deposit || ""}"></div>
      </div>
      <div class="row2">
        <div class="field"><label>下定日期</label><input id="f-ordered" type="date" value="${s.dateOrdered || todayStr()}"></div>
        <div class="field"><label>尾款日期</label><input id="f-due" type="date" value="${s.balanceDueDate || ""}"></div>
      </div>
      <div class="row2">
        <div class="field"><label>类型</label>
          <select id="f-cat">
            ${Object.keys(CATEGORIES).map((k) => `<option value="${k}" ${(s.category || "dress") === k ? "selected" : ""}>${CATEGORIES[k].label}</option>`).join("")}
          </select>
        </div>
        <div class="field" id="f-sub-wrap" style="${["accessory", "shoes", "other"].includes(s.category) ? "display:none" : ""}">
          <label>裙装款式</label>
          <select id="f-sub">
            ${Object.keys(SUBTYPES).map((k) => `<option value="${k}" ${s.subType === k ? "selected" : ""}>${SUBTYPES[k]}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="row2">
        <div class="field"><label>本次已付（记预算）</label><input id="f-paid" type="number" inputmode="decimal" placeholder="默认=定金" value="${s.orderPaid != null ? s.orderPaid : (s.deposit || "")}"></div>
        <div class="field"><label>状态</label>
          <select id="f-status">
            ${Object.keys(STATUS).map((k) => `<option value="${k}" ${s.status === k ? "selected" : ""}>${STATUS[k].label}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="row2">
        <div class="field"><label>穿着次数</label><input id="f-wear" type="number" inputmode="numeric" min="0" placeholder="0" value="${s.wearCount || 0}"></div>
        <div class="field"><label>洗涤次数</label><input id="f-wash" type="number" inputmode="numeric" min="0" placeholder="0" value="${s.washCount || 0}"></div>
      </div>
      <div class="field"><label>品牌 / 备注</label><input id="f-note" placeholder="可选" value="${escapeHtml(s.note || "")}"></div>
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
      box.querySelector("#f-sub-wrap").style.display = e.target.value === "dress" ? "" : "none";
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
      if (confirm("确定删除这条裙子吗？")) {
        state.dresses = state.dresses.filter((x) => x.id !== existing.id);
        save(); closeModal(); refreshAll(); toast("已删除");
      }
    };
    box.querySelector("#f-save").onclick = () => {
      const name = box.querySelector("#f-name").value.trim();
      if (!name) { toast("请填写裙子名称"); return; }
      const price = parseFloat(box.querySelector("#f-price").value) || 0;
      const deposit = parseFloat(box.querySelector("#f-deposit").value) || 0;
      let paid = box.querySelector("#f-paid").value;
      paid = paid === "" ? deposit : (parseFloat(paid) || 0);
      const rec = {
        id: existing ? existing.id : uid(),
        emoji: picked,
        name,
        price, deposit,
        orderPaid: paid,
        dateOrdered: box.querySelector("#f-ordered").value || todayStr(),
        balanceDueDate: box.querySelector("#f-due").value || "",
        status: box.querySelector("#f-status").value,
        category: box.querySelector("#f-cat").value,
        subType: box.querySelector("#f-cat").value === "dress" ? box.querySelector("#f-sub").value : "",
        image: imgData,
        note: box.querySelector("#f-note").value.trim(),
        wearCount: parseInt(box.querySelector("#f-wear").value, 10) || 0,
        washCount: parseInt(box.querySelector("#f-wash").value, 10) || 0,
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
      save(); closeModal(); renderWardrobe(); renderStats(); toast("区间已更新");
    };
  }

  /* ---------- 弹窗：设置 ---------- */
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
      <button class="btn btn-danger" id="set-reset">清空全部数据</button>
    `;
    openModal();
    box.querySelector('[data-close]').onclick = closeModal;
    box.querySelector("#set-save").onclick = () => {
      s.currency = box.querySelector("#set-cur").value.trim() || "¥";
      s.carryOverDefault = box.querySelector("#set-carry").checked;
      save(); closeModal(); refreshAll(); toast("设置已保存");
    };
    box.querySelector("#set-reset").onclick = () => {
      if (confirm("确定清空全部裙子与预算数据？此操作不可恢复。")) {
        if (confirm("再确认一次：真的要清空吗？")) {
          state = DEFAULT_STATE(); save(); closeModal(); refreshAll(); toast("已清空");
        }
      }
    };
  }

  /* ---------- 弹窗：某天尾款 ---------- */
  function openDayModal(day, ds) {
    const box = $("#modalBox");
    box.innerHTML = `
      <h3>${day.slice(5)} 尾款日</h3>
      <div class="list">${ds.map((d) => { const paidOff = d.status === "arrived" || d.status === "owned"; return `<div class="item" data-id="${d.id}">
        <div class="thumb">${d.image ? '<img src="' + escapeHtml(d.image) + '" alt="">' : (d.emoji || "👗")}</div>
        <div class="body"><div class="name">${escapeHtml(d.name)}<span class="type-pill ${(CATEGORIES[d.category] || CATEGORIES.other).cls}">${typeLabel(d)}</span></div>
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
    renderMonth(); renderWardrobe(); renderCalendar(); renderStats();
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
    renderMonth(); renderWardrobe(); renderCalendar(); renderStats();
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
