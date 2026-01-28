import { STAGES } from "./stages.js";

const LS_KEY = "oneStrokeGrid_v1";

const el = (id) => document.getElementById(id);
const gridEl = el("grid");
const toastEl = el("toast");

const stageLabelEl = el("stageLabel");
const progressLabelEl = el("progressLabel");
const countLabelEl = el("countLabel");
const statusLabelEl = el("statusLabel");

const undoBtn = el("undoBtn");
const resetBtn = el("resetBtn");
const prevBtn = el("prevBtn");
const nextBtn = el("nextBtn");
const stagesBtn = el("stagesBtn");

const modalBackdrop = el("modalBackdrop");
const stageListEl = el("stageList");
const closeModalBtn = el("closeModalBtn");

/** ----------------------------
 * State
 * ---------------------------*/
let currentStageIndex = 0;
let w = 0, h = 0;
let start = [0, 0], goal = [0, 0];
let blockedSet = new Set();
let pos = { x: 0, y: 0 };
let path = [];                // [{x,y}, ...]
let visited = new Set();      // "x,y"
let solvableCount = 0;
let isCleared = false;

let clearedIds = new Set(loadProgress());

/** ----------------------------
 * Helpers
 * ---------------------------*/
function keyOf(x, y) { return `${x},${y}`; }

function inBounds(x, y) {
    return x >= 0 && x < w && y >= 0 && y < h;
}

function isBlocked(x, y) {
    return blockedSet.has(keyOf(x, y));
}

function isVisited(x, y) {
    return visited.has(keyOf(x, y));
}

function neighbors(x, y) {
    return [
        { x: x + 1, y },
        { x: x - 1, y },
        { x, y: y + 1 },
        { x, y: y - 1 },
    ].filter(p => inBounds(p.x, p.y));
}

function isAdjacent(ax, ay, bx, by) {
    return Math.abs(ax - bx) + Math.abs(ay - by) === 1;
}

function canMoveTo(nx, ny) {
    if (!inBounds(nx, ny)) return false;
    if (isBlocked(nx, ny)) return false;
    if (isVisited(nx, ny)) return false;
    if (!isAdjacent(pos.x, pos.y, nx, ny)) return false;
    return true;
}

function remainingMovesCount() {
    return neighbors(pos.x, pos.y).filter(p => !isBlocked(p.x, p.y) && !isVisited(p.x, p.y)).length;
}

/** ----------------------------
 * Storage
 * ---------------------------*/
function loadProgress() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return [];
        const data = JSON.parse(raw);
        if (Array.isArray(data.cleared)) return data.cleared;
        return [];
    } catch {
        return [];
    }
}

function saveProgress() {
    const payload = { cleared: Array.from(clearedIds) };
    localStorage.setItem(LS_KEY, JSON.stringify(payload));
}

/** ----------------------------
 * Toast
 * ---------------------------*/
let toastTimer = null;
function showToast(message, kind = "") {
    toastEl.textContent = message;
    toastEl.classList.remove("hidden", "ok", "bad");
    if (kind === "ok") toastEl.classList.add("ok");
    if (kind === "bad") toastEl.classList.add("bad");

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.add("hidden"), 1400);
}

/** ----------------------------
 * Modal (Stages)
 * ---------------------------*/
function openModal() {
    renderStageList();
    modalBackdrop.classList.remove("hidden");
}

function closeModal() {
    modalBackdrop.classList.add("hidden");
}

function renderStageList() {
    stageListEl.innerHTML = "";
    STAGES.forEach((s, idx) => {
        const item = document.createElement("div");
        item.className = "stageItem" + (clearedIds.has(s.id) ? " cleared" : "");
        item.tabIndex = 0;

        const name = document.createElement("div");
        name.className = "name";
        name.textContent = `#${s.id} ${s.name}`;

        const meta = document.createElement("div");
        meta.className = "meta2";
        const left = document.createElement("span");
        left.textContent = `${s.w}×${s.h}`;
        const right = document.createElement("span");
        right.innerHTML = clearedIds.has(s.id) ? `<span class="check">✓</span>` : ``;

        meta.appendChild(left);
        meta.appendChild(right);

        item.appendChild(name);
        item.appendChild(meta);

        item.addEventListener("click", () => {
            loadStage(idx);
            closeModal();
        });
        item.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                loadStage(idx);
                closeModal();
            }
        });

        stageListEl.appendChild(item);
    });
}

/** ----------------------------
 * Stage loading / rendering
 * ---------------------------*/
function loadStage(index) {
    currentStageIndex = Math.max(0, Math.min(STAGES.length - 1, index));
    const s = STAGES[currentStageIndex];

    w = s.w; h = s.h;
    start = s.start;
    goal = s.goal;

    blockedSet = new Set((s.blocked || []).map(([x, y]) => keyOf(x, y)));

    // Basic validation: start/goal must not be blocked
    blockedSet.delete(keyOf(start[0], start[1]));
    blockedSet.delete(keyOf(goal[0], goal[1]));

    solvableCount = w * h - blockedSet.size;

    pos = { x: start[0], y: start[1] };
    path = [{ ...pos }];
    visited = new Set([keyOf(pos.x, pos.y)]);

    isCleared = false;

    renderAll();
    showToast(`Loaded #${s.id}`, "");
}

function renderAll() {
    renderHeader();
    renderGrid();
    renderButtons();
}

function renderHeader() {
    const s = STAGES[currentStageIndex];
    stageLabelEl.textContent = `#${s.id} ${s.name}`;
    progressLabelEl.textContent = `${currentStageIndex + 1}/${STAGES.length}`;

    countLabelEl.textContent = `Visited: ${visited.size}/${solvableCount}`;

    if (isCleared) {
        statusLabelEl.textContent = "CLEAR! 🎉";
        statusLabelEl.classList.remove("muted");
    } else {
        const moves = remainingMovesCount();
        statusLabelEl.textContent = moves === 0 ? "No moves. Undo or Reset." : "Tap adjacent cells";
        statusLabelEl.classList.add("muted");
    }
}

function renderButtons() {
    undoBtn.disabled = path.length <= 1;
    resetBtn.disabled = false;

    prevBtn.disabled = currentStageIndex <= 0;
    nextBtn.disabled = currentStageIndex >= STAGES.length - 1;

    // If cleared, highlight Next a bit more (already primary)
    nextBtn.classList.toggle("primary", true);
}

function renderGrid() {
    // Configure grid
    gridEl.style.gridTemplateColumns = `repeat(${w}, 1fr)`;
    gridEl.style.gridTemplateRows = `repeat(${h}, 1fr)`;
    gridEl.innerHTML = "";

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const cell = document.createElement("button");
            cell.type = "button";
            cell.className = "cell";
            cell.setAttribute("aria-label", `cell ${x},${y}`);

            const k = keyOf(x, y);

            if (blockedSet.has(k)) cell.classList.add("blocked");
            if (visited.has(k)) cell.classList.add("visited");
            if (x === pos.x && y === pos.y) cell.classList.add("current");
            if (x === start[0] && y === start[1]) cell.classList.add("start");
            if (x === goal[0] && y === goal[1]) cell.classList.add("goal");

            // highlight movable neighbors
            if (!isCleared && canMoveTo(x, y)) {
                cell.classList.add("hint");
            }

            const dot = document.createElement("div");
            dot.className = "dot";
            cell.appendChild(dot);

            cell.addEventListener("click", () => {
                if (isCleared) return;

                if (canMoveTo(x, y)) {
                    moveTo(x, y);
                } else {
                    // Small feedback only if user tapped a non-blocked cell
                    if (!isBlocked(x, y)) showToast("Can't move there", "bad");
                }
            });

            gridEl.appendChild(cell);
        }
    }
}

/** ----------------------------
 * Gameplay
 * ---------------------------*/
function moveTo(nx, ny) {
    pos = { x: nx, y: ny };
    path.push({ ...pos });
    visited.add(keyOf(nx, ny));

    checkEnd();
    renderAll();
}

function undo() {
    if (path.length <= 1) return;

    // remove current
    const removed = path.pop();
    visited.delete(keyOf(removed.x, removed.y));

    // set pos to last
    const last = path[path.length - 1];
    pos = { x: last.x, y: last.y };

    isCleared = false;
    renderAll();
}

function reset() {
    loadStage(currentStageIndex);
}

function checkEnd() {
    // Clear condition: at goal AND visited all solvable
    if (pos.x === goal[0] && pos.y === goal[1] && visited.size === solvableCount) {
        clearStage();
        return;
    }

    // Dead end (no moves) while not cleared
    if (remainingMovesCount() === 0) {
        showToast("No moves!", "bad");
    }
}

function clearStage() {
    isCleared = true;
    const s = STAGES[currentStageIndex];
    clearedIds.add(s.id);
    saveProgress();
    showToast("CLEAR!", "ok");
}

/** ----------------------------
 * Wiring
 * ---------------------------*/
undoBtn.addEventListener("click", undo);
resetBtn.addEventListener("click", reset);

prevBtn.addEventListener("click", () => loadStage(currentStageIndex - 1));
nextBtn.addEventListener("click", () => loadStage(currentStageIndex + 1));

stagesBtn.addEventListener("click", openModal);
closeModalBtn.addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", (e) => {
    if (e.target === modalBackdrop) closeModal();
});

// Keyboard helpers
window.addEventListener("keydown", (e) => {
    if (modalBackdrop.classList.contains("hidden") === false) {
        if (e.key === "Escape") closeModal();
        return;
    }

    if (e.key === "Escape") reset();
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") undo();
});

/** ----------------------------
 * Boot
 * ---------------------------*/
(function init() {
    // If user previously cleared some stages, show progress in modal etc.
    loadStage(0);
})();
