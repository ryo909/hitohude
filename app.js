import { STAGES } from "./stages.js";

const LS_KEY = "oneStrokeGrid_v1";

const DEV_VALIDATE_STAGES = true; // 開発中true。不要ならfalse
const SOLVER_TIME_LIMIT_MS = 120; // 1面あたり探索上限（重いなら200〜400へ）

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

// Dev validation results
let stageStatusById = new Map();   // id -> "ok" | "bad" | "timeout" | "skip"
let validStageIndexes = null;      // okなindex配列

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
 * Dev Solver (Hamiltonian path on grid, goal must be last)
 * ---------------------------*/
function isStageSolvable(stage, timeLimitMs = SOLVER_TIME_LIMIT_MS) {
    const w = stage.w, h = stage.h;
    const start = stage.start, goal = stage.goal;
    const blocked = new Set((stage.blocked || []).map(([x, y]) => `${x},${y}`));
    blocked.delete(`${start[0]},${start[1]}`);
    blocked.delete(`${goal[0]},${goal[1]}`);

    const nodes = [];
    const idOf = new Map(); // "x,y" -> idx
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const k = `${x},${y}`;
            if (blocked.has(k)) continue;
            const idx = nodes.length;
            nodes.push({ x, y, k, color: (x + y) & 1 });
            idOf.set(k, idx);
        }
    }

    const N = nodes.length;
    if (N <= 0) return false;

    const sKey = `${start[0]},${start[1]}`;
    const gKey = `${goal[0]},${goal[1]}`;
    if (!idOf.has(sKey) || !idOf.has(gKey)) return false;

    const s = idOf.get(sKey);
    const g = idOf.get(gKey);

    // Bipartite parity check:
    // N even -> endpoints must be opposite colors, N odd -> endpoints must be same colors
    const sColor = nodes[s].color;
    const gColor = nodes[g].color;
    if ((N % 2 === 0 && sColor === gColor) || (N % 2 === 1 && sColor !== gColor)) {
        return false;
    }

    // Build adjacency
    const adj = Array.from({ length: N }, () => []);
    for (let i = 0; i < N; i++) {
        const { x, y } = nodes[i];
        const neigh = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
        for (const [nx, ny] of neigh) {
            const k = `${nx},${ny}`;
            if (idOf.has(k)) adj[i].push(idOf.get(k));
        }
    }

    if (N > 1) {
        if (adj[s].length === 0) return false;
        if (adj[g].length === 0) return false;
    }

    const t0 = performance.now();
    const visited = new Uint8Array(N);
    visited[s] = 1;
    let visitedCount = 1;

    const availDeg = (v) => {
        let c = 0;
        for (const u of adj[v]) if (!visited[u]) c++;
        return c;
    };

    const hasIsolatedUnvisited = () => {
        const remaining = N - visitedCount;
        for (let v = 0; v < N; v++) {
            if (visited[v]) continue;
            if (v === g && remaining === 1) continue;
            if (availDeg(v) === 0) return true;
        }
        return false;
    };

    const orderedMoves = (v) => {
        const moves = [];
        for (const u of adj[v]) {
            if (visited[u]) continue;
            if (u === g && visitedCount !== N - 1) continue; // goalは最後だけ踏む
            moves.push(u);
        }
        moves.sort((a, b) => availDeg(a) - availDeg(b));
        return moves;
    };

    function dfs(v) {
        if (performance.now() - t0 > timeLimitMs) return false;
        if (visitedCount === N) return v === g;

        if (hasIsolatedUnvisited()) return false;

        const moves = orderedMoves(v);
        if (moves.length === 0) return false;

        for (const u of moves) {
            visited[u] = 1;
            visitedCount++;
            if (dfs(u)) return true;
            visitedCount--;
            visited[u] = 0;
        }
        return false;
    }

    return dfs(s);
}

function validateAllStages() {
    const bad = [];
    const timedOut = [];
    const okIdx = [];
    stageStatusById = new Map();

    console.groupCollapsed("[DEV] Stage solvability check");
    STAGES.forEach((st, idx) => {
        const size = st.w * st.h;

        // Skip huge ones to avoid freezing
        if (size > 64) {
            stageStatusById.set(st.id, "skip");
            console.warn(`SKIP (too big): #${st.id} ${st.name} (${st.w}x${st.h})`);
            return;
        }

        const t0 = performance.now();
        const ok = isStageSolvable(st, SOLVER_TIME_LIMIT_MS);
        const dt = Math.round(performance.now() - t0);

        if (ok) {
            stageStatusById.set(st.id, "ok");
            okIdx.push(idx);
        } else {
            if (dt >= SOLVER_TIME_LIMIT_MS) {
                stageStatusById.set(st.id, "timeout");
                timedOut.push({ st, dt, idx });
            } else {
                stageStatusById.set(st.id, "bad");
                bad.push({ st, dt, idx });
            }
        }
    });

    validStageIndexes = okIdx;

    if (bad.length === 0 && timedOut.length === 0) {
        console.info("All stages appear solvable ✅");
    } else {
        if (bad.length) {
            console.warn("UNSOLVABLE (likely):");
            bad.forEach(({ st, dt }) => console.warn(`  #${st.id} ${st.name} (${st.w}x${st.h}) in ${dt}ms`));
        }
        if (timedOut.length) {
            console.warn("UNKNOWN (timed out): consider increasing SOLVER_TIME_LIMIT_MS");
            timedOut.forEach(({ st, dt }) => console.warn(`  #${st.id} ${st.name} (${st.w}x${st.h}) >= ${dt}ms`));
        }
    }
    console.groupEnd();

    // current stageがokでなければ最初のokへ飛ばす
    const cur = STAGES[currentStageIndex];
    const curStatus = stageStatusById.get(cur?.id);
    if (curStatus && curStatus !== "ok") {
        const firstOk = validStageIndexes?.[0];
        if (typeof firstOk === "number") {
            loadStage(firstOk);
            showToast("Moved to a solvable stage", "ok");
        }
    }

    renderAll();

    if (bad.length || timedOut.length) {
        showToast("Some stages flagged (see stage list/console)", "bad");
    }
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
        const status = stageStatusById.get(s.id); // "ok" | "bad" | "timeout" | "skip" | undefined
        const isDisabled = (status && status !== "ok");

        const item = document.createElement("div");
        item.className = "stageItem"
            + (clearedIds.has(s.id) ? " cleared" : "")
            + (isDisabled ? " disabled" : "");
        item.tabIndex = 0;

        const name = document.createElement("div");
        name.className = "name";
        name.textContent = `#${s.id} ${s.name}`;

        const meta = document.createElement("div");
        meta.className = "meta2";

        const left = document.createElement("span");
        left.textContent = `${s.w}×${s.h}`;

        const right = document.createElement("span");
        const check = clearedIds.has(s.id) ? `<span class="check">✓</span>` : "";

        let tag = "";
        if (status === "bad") tag = `<span class="tag bad">⚠️ 無効</span>`;
        if (status === "timeout") tag = `<span class="tag timeout">⏱ 検証中</span>`;
        if (status === "skip") tag = `<span class="tag skip">⏭ スキップ</span>`;

        right.innerHTML = `${check} ${tag}`.trim();

        meta.appendChild(left);
        meta.appendChild(right);

        item.appendChild(name);
        item.appendChild(meta);

        const tryLoad = () => {
            if (isDisabled) {
                if (status === "timeout") showToast("Timed out. Increase solver limit.", "bad");
                else if (status === "skip") showToast("Skipped (too big).", "bad");
                else showToast("This stage is marked unsolvable.", "bad");
                return;
            }
            loadStage(idx);
            closeModal();
        };

        item.addEventListener("click", tryLoad);
        item.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                tryLoad();
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
    if (validStageIndexes && validStageIndexes.length) {
        const p = validStageIndexes.indexOf(currentStageIndex);
        progressLabelEl.textContent = `${Math.max(1, p + 1)}/${validStageIndexes.length}`;
    } else {
        progressLabelEl.textContent = `${currentStageIndex + 1}/${STAGES.length}`;
    }

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
function nextValidIndex(fromIndex, delta) {
    if (!validStageIndexes || validStageIndexes.length === 0) {
        return Math.max(0, Math.min(STAGES.length - 1, fromIndex + delta));
    }

    const posInValid = validStageIndexes.indexOf(fromIndex);

    if (posInValid === -1) {
        if (delta > 0) {
            for (const vi of validStageIndexes) if (vi > fromIndex) return vi;
            return validStageIndexes[validStageIndexes.length - 1];
        } else {
            for (let i = validStageIndexes.length - 1; i >= 0; i--) {
                if (validStageIndexes[i] < fromIndex) return validStageIndexes[i];
            }
            return validStageIndexes[0];
        }
    }

    const nextPos = posInValid + (delta > 0 ? 1 : -1);
    if (nextPos < 0) return validStageIndexes[0];
    if (nextPos >= validStageIndexes.length) return validStageIndexes[validStageIndexes.length - 1];
    return validStageIndexes[nextPos];
}

undoBtn.addEventListener("click", undo);
resetBtn.addEventListener("click", reset);

prevBtn.addEventListener("click", () => loadStage(nextValidIndex(currentStageIndex, -1)));
nextBtn.addEventListener("click", () => loadStage(nextValidIndex(currentStageIndex, +1)));

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

    if (DEV_VALIDATE_STAGES) {
        setTimeout(() => validateAllStages(), 0);
    }
})();
