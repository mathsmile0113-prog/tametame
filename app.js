/* =========================
   がまん貯金（スマホ最適版）
   ========================= */

const STORAGE_KEY = "gaman-goals-v2"; // v2: UI変更に伴いキーを分ける
const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" });
const QUICK_AMOUNTS = [100, 300, 500, 1000, 2000]; // ワンタップ加算

// 実測vh（アドレスバーの出入りで高さが変わる対策）
function setVH() {
  document.documentElement.style.setProperty("--vh", `${window.innerHeight * 0.01}px`);
}
setVH();
window.addEventListener("resize", setVH);

const state = { goals: loadGoals() };

const goalForm = document.getElementById("goalForm");
const goalsList = document.getElementById("goalsList");
const confettiCanvas = document.getElementById("confettiCanvas");
const ctx = confettiCanvas.getContext("2d");
const imageModal = document.getElementById("imageModal");
const modalImage = document.getElementById("modalImage");

resizeCanvas();
window.addEventListener("resize", resizeCanvas);
render();

/* ===== 目標追加 ===== */
goalForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("goalName").value.trim();
  const target = parseInt(document.getElementById("goalTarget").value, 10);
  const file = document.getElementById("goalImage").files[0] || null;

  if (!name || !target || target <= 0) {
    alert("「欲しいもの」と「目標金額（正の数）」を入力してください。");
    return;
  }

  let imageData = null;
  if (file) imageData = await fileToDataUrl(file);

  const goal = {
    id: cryptoRandomId(),
    name,
    target,
    saved: 0,
    image: imageData,
    history: [],
    completed: false,
  };

  state.goals.unshift(goal);
  persist();
  goalForm.reset();
  render();
});

/* ===== 描画 ===== */
function render() {
  goalsList.innerHTML = "";
  if (state.goals.length === 0) {
    goalsList.innerHTML = `<div class="card"><p>まだ目標がありません。上のフォームから追加してみましょう。</p></div>`;
    return;
  }

  state.goals.forEach((g) => {
    const card = document.createElement("div");
    card.className = "card goal-card";

    // 大きいサムネ
    const thumb = document.createElement("div");
    thumb.className = "thumb";
    if (g.image) {
      const img = document.createElement("img");
      img.src = g.image;
      img.alt = g.name;
      img.loading = "lazy";
      img.decoding = "async";
      img.style.cursor = "zoom-in";
      img.addEventListener("click", () => openImageModal(g.image, g.name));
      thumb.appendChild(img);
    } else {
      const ph = document.createElement("div");
      ph.className = "placeholder";
      ph.textContent = "📦";
      thumb.appendChild(ph);
    }

    // メタ
    const meta = document.createElement("div");
    meta.className = "meta";

    const title = document.createElement("div");
    title.className = "title";
    title.textContent = g.name + (g.completed ? " ✅" : "");

    const amounts = document.createElement("div");
    const pct = Math.min(100, Math.floor((g.saved / g.target) * 100)) || 0;
    amounts.className = "amounts";
    amounts.textContent = `${yen.format(g.saved)} / ${yen.format(g.target)}（${pct}%）`;

    const progress = document.createElement("div");
    progress.className = "progress";
    const bar = document.createElement("span");
    bar.style.width = `${pct}%`;
    progress.appendChild(bar);

    // 金額入力行
    const row = document.createElement("div");
    row.className = "row";
    const amtInput = document.createElement("input");
    amtInput.type = "number";
    amtInput.inputMode = "numeric";
    amtInput.pattern = "[0-9]*";
    amtInput.placeholder = "がまん金額（円）";
    amtInput.min = "1"; amtInput.step = "1";
    amtInput.className = "amount grow";

    const addBtn = document.createElement("button");
    addBtn.className = "btn primary";
    addBtn.textContent = "追加";
    addBtn.addEventListener("click", () => {
      const v = parseInt(amtInput.value, 10);
      if (!v || v <= 0) {
        alert("正の金額を入力してください。");
        return;
      }
      addAmount(g, v);
      amtInput.value = "";
    });

    row.appendChild(amtInput);
    row.appendChild(addBtn);

    // クイック加算（長押しで連続）
    const quick = document.createElement("div");
    quick.className = "quick-add";
    QUICK_AMOUNTS.forEach((a) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.textContent = `+${a.toLocaleString()}`;
      setupPressAndHold(chip, () => addAmount(g, a));
      quick.appendChild(chip);
    });

    // 履歴
    const histWrap = document.createElement("div");
    histWrap.style.fontSize = "0.9rem";
    histWrap.style.color = "var(--muted)";
    if (g.history.length > 0) {
      const latest = g.history.slice(0, 3).map(h =>
        `${formatDate(h.at)}：+${yen.format(h.amt)}`
      ).join(" / ");
      histWrap.textContent = `最近のがまん：${latest}`;
    } else {
      histWrap.textContent = "まだがまん履歴はありません";
    }

    // アクション
    const actions = document.createElement("div");
    actions.className = "actions";
    const resetBtn = document.createElement("button");
    resetBtn.className = "btn ghost";
    resetBtn.textContent = "進捗リセット";
    resetBtn.addEventListener("click", () => {
      if (confirm("この目標の進捗を0に戻します。よろしいですか？")) {
        g.saved = 0; g.history = []; g.completed = false;
        persist(); render();
      }
    });

    const delBtn = document.createElement("button");
    delBtn.className = "btn danger";
    delBtn.textContent = "削除";
    delBtn.addEventListener("click", () => {
      if (confirm("この目標を削除します。よろしいですか？")) {
        state.goals = state.goals.filter(x => x.id !== g.id);
        persist(); render();
      }
    });

    actions.appendChild(resetBtn);
    actions.appendChild(delBtn);

    // 組み立て
    meta.appendChild(title);
    meta.appendChild(amounts);
    meta.appendChild(progress);
    meta.appendChild(row);
    meta.appendChild(quick);
    meta.appendChild(histWrap);
    meta.appendChild(actions);

    card.appendChild(thumb);
    card.appendChild(meta);

    goalsList.appendChild(card);
  });
}

/* ===== 追加・保存・達成判定 ===== */
function addAmount(goal, v) {
  goal.saved += v;
  goal.history.unshift({ amt: v, at: Date.now() });
  if (!goal.completed && goal.saved >= goal.target) {
    goal.completed = true;
    persist(); render();
    celebrate(`「${goal.name}」を達成！おめでとう🎉`);
    return;
  }
  persist(); render();
}

/* ===== 長押しで連続加算 ===== */
function setupPressAndHold(el, onFire) {
  let timer = null;
  let firedOnce = false;

  const start = () => {
    onFire(); // まず1回
    firedOnce = true;
    // 少し待ってから連続発火（押しっぱでスピードアップ）
    timer = setTimeout(function repeat() {
      onFire();
      timer = setTimeout(repeat, 120);
    }, 400);
  };
  const end = () => {
    if (timer) clearTimeout(timer);
    timer = null; firedOnce = false;
  };

  el.addEventListener("mousedown", start);
  el.addEventListener("touchstart", (e) => { e.preventDefault(); start(); }, { passive: false });

  ["mouseup","mouseleave","blur"].forEach(ev => el.addEventListener(ev, end));
  ["touchend","touchcancel"].forEach(ev => el.addEventListener(ev, end));
}

/* ===== 画像モーダル ===== */
function openImageModal(src, alt) {
  modalImage.src = src;
  modalImage.alt = alt || "画像";
  imageModal.hidden = false;
  imageModal.addEventListener("click", closeImageModal, { once: true });
}
function closeImageModal() {
  imageModal.hidden = true;
  modalImage.src = "";
}

/* ===== 永続化 ===== */
function loadGoals() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error(e);
    return [];
  }
}
function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.goals));
}

/* ===== ユーティリティ ===== */
function cryptoRandomId() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(n => n.toString(36)).join("").slice(0, 16);
}
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}
function formatDate(ts) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${y}/${m}/${day} ${hh}:${mm}`;
}

/* ===== 紙吹雪（prefers-reduced-motionに配慮） ===== */
let confettiParticles = [];
let confettiTimer = null;
function resizeCanvas() {
  confettiCanvas.width = window.innerWidth;
  confettiCanvas.height = window.innerHeight;
}
function celebrate(message) {
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    toast(message);
    return;
  }
  spawnConfetti();
  toast(message);

  if (confettiTimer) clearTimeout(confettiTimer);
  animateConfetti();
  confettiTimer = setTimeout(() => {
    confettiParticles = [];
    ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
  }, 2800);
}
function toast(message) {
  if (!message) return;
  const t = document.createElement("div");
  t.textContent = message;
  Object.assign(t.style, {
    position: "fixed", left: "50%", top: "20px", transform: "translateX(-50%)",
    background: "rgba(17, 24, 39, 0.9)", border: "1px solid var(--border)",
    color: "var(--text)", padding: "12px 16px", borderRadius: "12px", zIndex: "100"
  });
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}
function spawnConfetti() {
  const colors = ["#22c55e","#38bdf8","#f59e0b","#ef4444","#a78bfa"];
  confettiParticles = [];
  const count = Math.floor((confettiCanvas.width * confettiCanvas.height) / 25000);
  for (let i = 0; i < Math.min(220, Math.max(60, count)); i++) {
    confettiParticles.push({
      x: Math.random() * confettiCanvas.width,
      y: -10 - Math.random() * 100,
      w: 6 + Math.random() * 6,
      h: 8 + Math.random() * 10,
      color: colors[Math.floor(Math.random() * colors.length)],
      vy: 2 + Math.random() * 3,
      vx: -1 + Math.random() * 2,
      rot: Math.random() * Math.PI,
      vr: (-0.2 + Math.random() * 0.4),
    });
  }
}
function animateConfetti() {
  ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
  confettiParticles.forEach(p => {
    p.x += p.vx; p.y += p.vy; p.rot += p.vr;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
    ctx.fillStyle = p.color; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    ctx.restore();
  });
  confettiParticles = confettiParticles.filter(p => p.y < confettiCanvas.height + 20);
  if (confettiParticles.length > 0) requestAnimationFrame(animateConfetti);
}
``