import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  onSnapshot,
  query,
  orderBy,
  arrayUnion,
  increment,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const ADJ = ["sunny", "breezy", "coral", "citrus", "mango", "peachy", "coconut", "tropical", "golden", "salty"];
const NOUN = ["otter", "flamingo", "dolphin", "seagull", "starfish", "turtle", "pelican", "manatee", "clownfish", "urchin"];

function randomGameCode() {
  const a = ADJ[Math.floor(Math.random() * ADJ.length)];
  const n = NOUN[Math.floor(Math.random() * NOUN.length)];
  const num = Math.floor(Math.random() * 90) + 10;
  return `${a}-${n}-${num}`;
}

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateStrToDays(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

function daysToDateStr(days) {
  const d = new Date(days * 86400000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function computePoints(entry) {
  const waterPts = Math.floor((entry.waterOz || 0) / 20) * 2;
  const stepsPts = Math.floor((entry.steps || 0) / 10000) * 1;
  const mins = entry.workoutMinutes || 0;
  let workoutPts = 0;
  if (mins >= 90) workoutPts = 4;
  else if (mins >= 60) workoutPts = 3;
  else if (mins >= 30) workoutPts = 2;
  const mobilityPts = entry.mobility ? 1 : 0;
  const sleepPts = entry.sleep ? 1 : 0;
  return {
    water: waterPts,
    steps: stepsPts,
    workout: workoutPts,
    mobility: mobilityPts,
    sleep: sleepPts,
    total: waterPts + stepsPts + workoutPts + mobilityPts + sleepPts,
  };
}

// Cycle boundaries are defined by an ascending list of anchor dates.
// Each anchor starts a new 14-day-cycle "segment"; segments subdivide
// into further 14-day cycles until the next anchor (or today).
function cycleKeyFor(dateStr, anchors) {
  const days = dateStrToDays(dateStr);
  let segIdx = 0;
  for (let i = 0; i < anchors.length; i++) {
    if (dateStrToDays(anchors[i]) <= days) segIdx = i;
    else break;
  }
  const segStartDays = dateStrToDays(anchors[segIdx]);
  const subIdx = Math.floor((days - segStartDays) / 14);
  const cycleStartDays = segStartDays + subIdx * 14;
  return {
    key: `${segIdx}-${subIdx}`,
    startDate: daysToDateStr(cycleStartDays),
    endDate: daysToDateStr(cycleStartDays + 14),
  };
}

// ---------- DOM refs ----------
const joinScreen = document.getElementById("join-screen");
const whoScreen = document.getElementById("who-screen");
const gameScreen = document.getElementById("game-screen");

const joinNew = document.getElementById("join-new");
const joinShare = document.getElementById("join-share");
const createGameBtn = document.getElementById("create-game-btn");
const joinGameBtn = document.getElementById("join-game-btn");
const joinCodeInput = document.getElementById("join-code-input");
const shareLinkInput = document.getElementById("share-link-input");
const shareCodeText = document.getElementById("share-code-text");
const copyLinkBtn = document.getElementById("copy-link-btn");
const continueBtn = document.getElementById("continue-btn");

const newCycleBtn = document.getElementById("new-cycle-btn");
const switchPlayerBtn = document.getElementById("switch-player-btn");
const rulesBtn = document.getElementById("rules-btn");
const rulesModal = document.getElementById("rules-modal");
const rulesCloseBtn = document.getElementById("rules-close-btn");

let gameId = null;
let myRole = null; // "player1" | "player2"
let gameData = { player1Name: "Player 1", player2Name: "Player 2", cycleAnchors: [todayStr()] };
let entries = []; // all entries for this game

function extractCode(raw) {
  const trimmed = raw.trim();
  const hashMatch = trimmed.match(/[#&]g=([a-z0-9-]+)/i);
  if (hashMatch) return hashMatch[1];
  return trimmed;
}

function showScreen(el) {
  [joinScreen, whoScreen, gameScreen].forEach((s) => s.classList.add("hidden"));
  el.classList.remove("hidden");
}

async function createGame() {
  let code = randomGameCode();
  // vanishingly unlikely to collide, but check once just in case
  let snap = await getDoc(doc(db, "games", code));
  if (snap.exists()) code = randomGameCode();

  await setDoc(doc(db, "games", code), {
    player1Name: "Player 1",
    player2Name: "Player 2",
    cycleAnchors: [todayStr()],
  });

  gameId = code;
  localStorage.setItem("ss_gameId", gameId);

  const link = `${location.origin}${location.pathname}#g=${code}`;
  shareLinkInput.value = link;
  shareCodeText.textContent = code;
  joinNew.classList.add("hidden");
  joinShare.classList.remove("hidden");
}

async function joinGame(rawCode) {
  const code = extractCode(rawCode);
  if (!code) return;
  const ref = doc(db, "games", code);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    alert("Couldn't find that game code. Double-check it with your friend.");
    return;
  }
  gameId = code;
  localStorage.setItem("ss_gameId", gameId);
  goToWhoScreen();
}

function goToWhoScreen() {
  showScreen(whoScreen);
}

async function pickRole(role) {
  myRole = role;
  localStorage.setItem(`ss_role_${gameId}`, role);

  const snap = await getDoc(doc(db, "games", gameId));
  const existing = snap.exists() ? snap.data()[`${role}Name`] : null;
  const defaultLabel = role === "player1" ? "Player 1" : "Player 2";
  if (!existing || existing === defaultLabel) {
    const name = prompt("What's your name?");
    if (name && name.trim()) {
      await setDoc(doc(db, "games", gameId), { [`${role}Name`]: name.trim() }, { merge: true });
    }
  }
  startGame();
}

async function renamePlayer(role) {
  const current = gameData[`${role}Name`] || (role === "player1" ? "Player 1" : "Player 2");
  const name = prompt("Enter your name:", current);
  if (name && name.trim()) {
    await setDoc(doc(db, "games", gameId), { [`${role}Name`]: name.trim() }, { merge: true });
  }
}

function startGame() {
  document.getElementById("footer-game-code").textContent = gameId;
  showScreen(gameScreen);

  // Lock the opponent's card to read-only.
  const otherRole = myRole === "player1" ? "player2" : "player1";
  document.querySelectorAll(`.metric-add[data-player="${otherRole}"] .add-row`).forEach((row) => {
    row.classList.add("hidden");
  });
  document
    .querySelectorAll(`.checkbox-label input.metric-toggle[data-player="${otherRole}"]`)
    .forEach((cb) => (cb.disabled = true));

  // Only I can rename myself.
  document.querySelector(`.btn-rename[data-player="${otherRole}"]`).classList.add("hidden");
  document
    .querySelector(`.btn-rename[data-player="${myRole}"]`)
    .addEventListener("click", () => renamePlayer(myRole));

  onSnapshot(doc(db, "games", gameId), (snap) => {
    if (!snap.exists()) return;
    gameData = snap.data();
    if (!gameData.cycleAnchors || gameData.cycleAnchors.length === 0) {
      gameData.cycleAnchors = [todayStr()];
    }
    renderNames();
    render();
  });

  const entriesQuery = query(collection(db, "games", gameId, "entries"), orderBy("date", "asc"));
  onSnapshot(entriesQuery, (snap) => {
    entries = snap.docs.map((d) => d.data());
    refreshTodayDisplay();
    render();
  });
}

function renderNames() {
  document.getElementById("who-name-1").textContent = gameData.player1Name || "Player 1";
  document.getElementById("who-name-2").textContent = gameData.player2Name || "Player 2";
  document.getElementById("display-name-1").textContent = gameData.player1Name || "Player 1";
  document.getElementById("display-name-2").textContent = gameData.player2Name || "Player 2";
  document.getElementById("meter-name-1").textContent = gameData.player1Name || "Player 1";
  document.getElementById("meter-name-2").textContent = gameData.player2Name || "Player 2";
  document.getElementById("cal-legend-1").textContent = gameData.player1Name || "Player 1";
  document.getElementById("cal-legend-2").textContent = gameData.player2Name || "Player 2";
}

function refreshTodayDisplay() {
  const today = todayStr();
  for (const role of ["player1", "player2"]) {
    const e = entries.find((en) => en.player === role && en.date === today);
    document.getElementById(`today-waterOz-${role}`).textContent = e?.waterOz || 0;
    document.getElementById(`today-steps-${role}`).textContent = e?.steps || 0;
    document.getElementById(`today-workoutMinutes-${role}`).textContent = e?.workoutMinutes || 0;
    document.querySelector(`.metric-toggle[data-player="${role}"][data-metric="mobility"]`).checked =
      !!e?.mobility;
    document.querySelector(`.metric-toggle[data-player="${role}"][data-metric="sleep"]`).checked =
      !!e?.sleep;
  }
}

function totalsForCycle(cycleKey) {
  const totals = {
    player1: { water: 0, steps: 0, workout: 0, mobility: 0, sleep: 0, total: 0 },
    player2: { water: 0, steps: 0, workout: 0, mobility: 0, sleep: 0, total: 0 },
  };
  for (const e of entries) {
    const { key } = cycleKeyFor(e.date, gameData.cycleAnchors);
    if (key !== cycleKey) continue;
    const pts = computePoints(e);
    const t = totals[e.player];
    if (!t) continue;
    t.water += pts.water;
    t.steps += pts.steps;
    t.workout += pts.workout;
    t.mobility += pts.mobility;
    t.sleep += pts.sleep;
    t.total += pts.total;
  }
  return totals;
}

function render() {
  const today = todayStr();
  const current = cycleKeyFor(today, gameData.cycleAnchors);
  const totals = totalsForCycle(current.key);

  const daysLeft = 14 - Math.floor((dateStrToDays(today) - dateStrToDays(current.startDate)));
  document.getElementById("cycle-days-left").textContent =
    daysLeft <= 1 ? "Last day of this cycle!" : `${daysLeft} days left in this cycle`;

  renderPlayerCard("player1", totals.player1);
  renderPlayerCard("player2", totals.player2);

  const s1 = totals.player1.total;
  const s2 = totals.player2.total;
  const sum = s1 + s2;
  const pct1 = sum === 0 ? 50 : (s1 / sum) * 100;
  document.getElementById("meter-fill-1").style.width = `${pct1}%`;
  document.getElementById("meter-fill-2").style.width = `${100 - pct1}%`;
  document.getElementById("meter-score-1").textContent = `${s1} pts`;
  document.getElementById("meter-score-2").textContent = `${s2} pts`;

  const badge = document.getElementById("leader-badge");
  const crown1 = document.getElementById("crown-1");
  const crown2 = document.getElementById("crown-2");
  crown1.classList.remove("visible");
  crown2.classList.remove("visible");
  if (s1 === s2) {
    badge.textContent = "🤝 tied";
  } else if (s1 > s2) {
    badge.textContent = `🏆 ${gameData.player1Name || "Player 1"} leads`;
    crown1.classList.add("visible");
  } else {
    badge.textContent = `🏆 ${gameData.player2Name || "Player 2"} leads`;
    crown2.classList.add("visible");
  }

  renderCalendar(current);
  renderHistory(current.key);
}

function renderCalendar(current) {
  const today = todayStr();
  const startDays = dateStrToDays(current.startDate);
  const grid = document.getElementById("calendar-grid");
  grid.innerHTML = "";

  for (let i = 0; i < 14; i++) {
    const dateStr = daysToDateStr(startDays + i);
    const isFuture = dateStr > today;
    const isToday = dateStr === today;
    const dayNum = Number(dateStr.split("-")[2]);

    const loggedP1 = entries.some((e) => e.player === "player1" && e.date === dateStr);
    const loggedP2 = entries.some((e) => e.player === "player2" && e.date === dateStr);

    const cell = document.createElement("div");
    cell.className = `cal-day${isToday ? " today" : ""}${isFuture ? " future" : ""}`;
    cell.title = dateStr;
    cell.innerHTML = `
      <span class="cal-daynum">${dayNum}</span>
      <div class="cal-dots">
        <span class="cal-dot p1${loggedP1 ? " filled" : ""}"></span>
        <span class="cal-dot p2${loggedP2 ? " filled" : ""}"></span>
      </div>
    `;
    grid.appendChild(cell);
  }
}

function renderPlayerCard(role, t) {
  document.getElementById(`total-${role}`).textContent = t.total;
  const list = document.getElementById(`breakdown-${role}`);
  list.innerHTML = "";
  const rows = [
    ["💧 Water", t.water],
    ["🚶 Steps", t.steps],
    ["🏋️ Workouts", t.workout],
    ["🧘 Mobility", t.mobility],
    ["😴 Sleep", t.sleep],
  ];
  for (const [label, val] of rows) {
    const li = document.createElement("li");
    li.innerHTML = `${label} <span>${val}</span>`;
    list.appendChild(li);
  }
}

function renderHistory(currentKey) {
  const keys = new Set();
  for (const e of entries) {
    const { key } = cycleKeyFor(e.date, gameData.cycleAnchors);
    if (key !== currentKey) keys.add(key);
  }
  const list = document.getElementById("history-list");
  if (keys.size === 0) {
    list.innerHTML = `<li class="history-empty">No completed cycles yet — this is the first one!</li>`;
    return;
  }
  const rows = [...keys].map((key) => {
    const t = totalsForCycle(key);
    const sample = entries.find((e) => cycleKeyFor(e.date, gameData.cycleAnchors).key === key);
    const { startDate, endDate } = cycleKeyFor(sample.date, gameData.cycleAnchors);
    let winner = "🤝 tie";
    if (t.player1.total > t.player2.total) winner = `🏆 ${gameData.player1Name || "Player 1"}`;
    else if (t.player2.total > t.player1.total) winner = `🏆 ${gameData.player2Name || "Player 2"}`;
    return { startDate, endDate, s1: t.player1.total, s2: t.player2.total, winner, key };
  });
  rows.sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
  list.innerHTML = rows
    .slice(0, 8)
    .map(
      (r) =>
        `<li><span>${r.startDate} → ${r.endDate}</span><span>${r.s1} – ${r.s2} &nbsp; ${r.winner}</span></li>`
    )
    .join("");
}

function flashStatus(player, message) {
  const statusEl = document.getElementById(`save-status-${player}`);
  statusEl.textContent = message;
  setTimeout(() => (statusEl.textContent = ""), 2000);
}

async function addMetric(player, metric, amount) {
  if (!amount || amount <= 0) return;
  const today = todayStr();
  const entryId = `${player}_${today}`;
  try {
    await setDoc(
      doc(db, "games", gameId, "entries", entryId),
      { player, date: today, [metric]: increment(amount) },
      { merge: true }
    );
    flashStatus(player, "Added ✓");
  } catch (err) {
    flashStatus(player, "Couldn't save — check your connection.");
    console.error(err);
  }
}

async function toggleMetric(player, metric, value) {
  const today = todayStr();
  const entryId = `${player}_${today}`;
  try {
    await setDoc(
      doc(db, "games", gameId, "entries", entryId),
      { player, date: today, [metric]: value },
      { merge: true }
    );
  } catch (err) {
    flashStatus(player, "Couldn't save — check your connection.");
    console.error(err);
  }
}

// ---------- Event wiring ----------
createGameBtn.addEventListener("click", createGame);
joinGameBtn.addEventListener("click", () => joinGame(joinCodeInput.value));
copyLinkBtn.addEventListener("click", async () => {
  await navigator.clipboard.writeText(shareLinkInput.value);
  copyLinkBtn.textContent = "Copied!";
  setTimeout(() => (copyLinkBtn.textContent = "Copy link"), 1500);
});
continueBtn.addEventListener("click", goToWhoScreen);

document.querySelectorAll(".who-btn").forEach((btn) => {
  btn.addEventListener("click", () => pickRole(btn.dataset.player));
});

document.querySelectorAll(".metric-add").forEach((block) => {
  const player = block.dataset.player;
  const metric = block.dataset.metric;
  const input = block.querySelector(".add-input");
  const btn = block.querySelector(".btn-add");

  const doAdd = () => {
    if (player !== myRole) return;
    const amount = Number(input.value);
    addMetric(player, metric, amount);
    input.value = "";
  };

  btn.addEventListener("click", doAdd);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      doAdd();
    }
  });
});

document.querySelectorAll(".metric-toggle").forEach((cb) => {
  cb.addEventListener("change", () => {
    const player = cb.dataset.player;
    if (player !== myRole) return;
    toggleMetric(player, cb.dataset.metric, cb.checked);
  });
});

newCycleBtn.addEventListener("click", async () => {
  const ok = confirm("Start a new 14-day cycle now? This locks in the current scores to history.");
  if (!ok) return;
  await setDoc(doc(db, "games", gameId), { cycleAnchors: arrayUnion(todayStr()) }, { merge: true });
});

switchPlayerBtn.addEventListener("click", () => {
  localStorage.removeItem(`ss_role_${gameId}`);
  myRole = null;
  goToWhoScreen();
});

rulesBtn.addEventListener("click", () => rulesModal.classList.remove("hidden"));
rulesCloseBtn.addEventListener("click", () => rulesModal.classList.add("hidden"));
rulesModal.addEventListener("click", (e) => {
  if (e.target === rulesModal) rulesModal.classList.add("hidden");
});

// ---------- Boot ----------
(async function boot() {
  const hashCode = extractCode(location.hash || "");
  const storedGameId = localStorage.getItem("ss_gameId");

  if (hashCode) {
    const snap = await getDoc(doc(db, "games", hashCode));
    if (snap.exists()) {
      gameId = hashCode;
      localStorage.setItem("ss_gameId", gameId);
    }
  } else if (storedGameId) {
    const snap = await getDoc(doc(db, "games", storedGameId));
    if (snap.exists()) gameId = storedGameId;
  }

  if (!gameId) {
    showScreen(joinScreen);
    return;
  }

  const storedRole = localStorage.getItem(`ss_role_${gameId}`);
  if (storedRole) {
    myRole = storedRole;
    startGame();
  } else {
    goToWhoScreen();
  }
})();
