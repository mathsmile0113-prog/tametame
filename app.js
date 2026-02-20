/* =========
   がまん貯金（ローカル保存）
   ========= */

const STORAGE_KEY = "gaman-goals-v1";
const yen = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" });

/** モデル: Goal
 * {
 *   id: string,
 *   name: string,
 *   target: number,
 *   saved: number,
 *   image: string|null, // base64 data URL
 *   history: [{amt:number, at:number}],
 *   completed: boolean
 * }
 */

const state = {
  goals: loadGoals(),
};

const goalForm = document.getElementById("goalForm");
const goalsList = document.getElementById("goalsList");
const confettiCanvas = document.getElementById("confettiCanvas");
const ctx = confettiCanvas.getContext("2d");

resizeCanvas();
window.addEventListener("resize", resizeCanvas);

// 初期描画
render();

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
  if (file) {
    imageData = await fileToDataUrl(file);
  }

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

// ========== 状態読み書き ==========
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

// ========== UI描画 ==========
function render() {
  goalsList.innerHTML = "";
  if (state.goals.length === 0) {
    goalsList.innerHTML = `<div class="card"><p>まだ目標がありません。上のフォームから追加してみましょう。</p></div>`;
    return;
  }

  state.goals.forEach((g) => {
    const card = document.createElement("div");
    card.className = "card goal";

    // サムネイル
    const thumb = document.createElement("div");
    thumb.className = "thumb";
    if (g.image) {
      const img = document.createElement("img");
      img.src = g.image;
      img.alt = g.name;
      thumb.appendChild(img);
    } else {
      thumb.innerHTML = "📦";
      thumb.style.fontSize = "28px";
    }

    // 右側メタ
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

    // 入力行（がまん金額）
    const row = document.createElement("div");
    row.className = "row";
    const amtInput = document.createElement("input");
    amtInput.type = "number";
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
      g.saved += v;
      g.history.unshift({ amt: v, at: Date.now() });
      if (!g.completed && g.saved >= g.target) {
        g.completed = true;
        persist();
        render();
        celebrate(`「${g.name}」を達成！おめでとう🎉`);
        return;
      }
      persist();
      render();
    });

    row.appendChild(amtInput);
    row.appendChild(addBtn);

    // 履歴
    const histWrap = document.createElement("div");
    histWrap.style.fontSize = "12px";
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
        g.saved = 0;
        g.history = [];
        g.completed = false;
        persist();
        render();
      }
    });

    const delBtn = document.createElement("button");
    delBtn.className = "btn danger";
    delBtn.textContent = "削除";
    delBtn.addEventListener("click", () => {
      if (confirm("この目標を削除します。よろしいですか？")) {
        state.goals = state.goals.filter(x => x.id !== g.id);
        persist();
        render();
      }
    });

    actions.appendChild(resetBtn);
    actions.appendChild(delBtn);

    meta.appendChild(title);
    meta.appendChild(amounts);
    meta.appendChild(progress);
    meta.appendChild(row);
    meta.appendChild(histWrap);
    meta.appendChild(actions);

    card.appendChild(thumb);
    card.appendChild(meta);

    goalsList.appendChild(card);
  });
}

// ========== ユーティリティ ==========
function cryptoRandomId() {
  // 16バイトの乱数をBase36に
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

// ========== 紙吹雪アニメーション ==========
let confettiParticles = [];
let confettiTimer = null;
function resizeCanvas() {
  confettiCanvas.width = window.innerWidth;
  confettiCanvas.height = window.innerHeight;
}

function celebrate(message) {
  // 3秒間紙吹雪
  spawnConfetti();
  if (message) {
    // 軽いトースト
    const toast = document.createElement("div");
    toast.textContent = message;
    toast.style.position = "fixed";
    toast.style.left = "50%";
    toast.style.top = "20px";
    toast.style.transform = "translateX(-50%)";
    toast.style.background = "rgba(17, 24, 39, 0.9)";
    toast.style.border = "1px solid var(--border)";
    toast.style.color = "var(--text)";
    toast.style.padding = "12px 16px";
    toast.style.borderRadius = "12px";
    toast.style.zIndex = "100";
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2200);
  }

  if (confettiTimer) {
    clearTimeout(confettiTimer);
  }
  animateConfetti();
  confettiTimer = setTimeout(() => {
    confettiParticles = [];
    ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
  }, 2800);
}

function spawnConfetti() {
  const colors = ["#22c55e", "#38bdf8", "#f59e0b", "#ef4444", "#a78bfa"];
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
    p.x += p.vx;
    p.y += p.vy;
    p.rot += p.vr;

    // 回転矩形として描画
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    ctx.restore();
  });
  confettiParticles = confettiParticles.filter(p => p.y < confettiCanvas.height + 20);
  if (confettiParticles.length > 0) {
    requestAnimationFrame(animateConfetti);
  }
}
