/**
 * Identity V Hunter Skill Tracker - Professional Edition
 * Fully compliant with the improved strict specification.
 */

// ===================================
// DATA CONSTANTS
// ===================================
const TRAITS = [
    { id: "patroller", name: "巡視者", initialCT: 30, maxCT: 90, ratioBase: 80, group: null, size: "normal", order: 0 },
    { id: "abnormal", name: "異常", initialCT: 40, maxCT: 90, ratioBase: 90, group: "slot1", size: "half", order: 1 },
    { id: "excitement", name: "興奮", initialCT: 40, maxCT: 100, ratioBase: 100, group: "slot1", size: "half", order: 2 },
    { id: "teleport", name: "瞬間移動", initialCT: 45, maxCT: 100, ratioBase: 100, group: null, size: "normal", order: 3 },
    { id: "transition", name: "移形", initialCT: 50, maxCT: 100, ratioBase: 100, group: null, size: "large", order: 4 },
    { id: "blink", name: "神出鬼没", initialCT: 60, maxCT: 150, ratioBase: 150, group: null, size: "large", order: 5 }
];

const TIMERS_DEF = [
    { id: "burningEffect", name: "焼入れ効果", duration: 50, behavior: 'warn-once' },
    { id: "arrogance", name: "傲慢", duration: 52, behavior: 'warn-once' },
    { id: "decodeBoost", name: "解読加速", duration: 202, behavior: 'persistent' },
    { id: "blockRelease", name: "封鎖解除", duration: 30, behavior: 'once' },
    { id: "detention", name: "引き止める", duration: 120, powered: true },
    { id: "noExit", name: "幽閉の恐怖", duration: 20, powered: true }
];

const PHASES = {
    A: 'PHASE_A', // Initial CT running.
    B: 'PHASE_B', // 1st Trait chosen. Locked until 120s.
    C: 'PHASE_C', // Trump available. Switchable once.
    D: 'PHASE_D'  // 2nd Trait chosen. Locked forever.
};

const UI_MODE = { IDLE: 'idle', WAITING: 'waiting', GAME: 'game', POWERED: 'powered', RESTARTING: 'restarting' };

// ===================================
// CORE STATE
// ===================================
let state = {
    ui: UI_MODE.IDLE,
    phase: PHASES.A,
    gameStartedAt: null,
    firstTraitId: null,
    secondTraitId: null,
    matchTime: 0,

    traits: {},
    eco: {},

    startBtnTs: 0,
    restartCountdown: 0
};

// ===================================
// ENGINE
// ===================================
function init() {
    setupData();
    renderTraitGrid();
    bindEvents();
    requestAnimationFrame(tick);
}

function setupData() {
    TRAITS.forEach(t => {
        state.traits[t.id] = { status: 'initial', remaining: t.initialCT, startedAt: null, isCounting: false, ratioBase: t.ratioBase, maxCT: t.maxCT };
    });
    TIMERS_DEF.forEach(t => {
        state.eco[t.id] = { remaining: t.duration, isActive: false, isFinished: false, highlightUntil: 0 };
    });
}

function resetTool() {
    state.ui = UI_MODE.IDLE;
    state.phase = PHASES.A;
    state.gameStartedAt = null;
    state.firstTraitId = null;
    state.secondTraitId = null;
    state.matchTime = 0;
    setupData();
    updateButtonVisuals('START', 'キャラが見えたらタップ', '');
    updateUIColors();
}

function renderTraitGrid() {
    const container = document.getElementById('traits-container');
    container.innerHTML = '';

    // Group and sort to match layout logic
    const sorted = [...TRAITS].sort((a, b) => a.order - b.order);

    let i = 0;
    while (i < sorted.length) {
        const t = sorted[i];
        if (t.group === 'slot1') {
            const groupWrap = document.createElement('div');
            groupWrap.className = 'trait-group';
            groupWrap.appendChild(createHalfTrait(t));
            if (sorted[i + 1] && sorted[i + 1].group === 'slot1') {
                groupWrap.appendChild(createHalfTrait(sorted[i + 1]));
                i++;
            }
            container.appendChild(groupWrap);
        } else {
            container.appendChild(createFullTrait(t));
        }
        i++;
    }
}

function createFullTrait(t) {
    const el = document.createElement('div');
    el.id = `t-${t.id}`;
    el.className = `trait-card ${t.size === 'large' ? 'size-large' : ''} disabled`;
    el.innerHTML = `<div class="trait-label">${t.name}</div><div class="trait-timer">${t.initialCT}</div><div class="trait-icon">${getIcon(t.id)}</div>`;
    el.onclick = () => handleTraitClick(t.id);
    return el;
}

function createHalfTrait(t) {
    const el = document.createElement('div');
    el.id = `t-${t.id}`;
    el.className = `trait-half disabled`;
    el.innerHTML = `<span class="trait-label">${t.name}</span><span class="trait-timer">${t.initialCT}</span>`;
    el.onclick = (e) => { e.stopPropagation(); handleTraitClick(t.id); };
    return el;
}

function getIcon(id) { return { patroller: '🐾', abnormal: '⚠️', excitement: '💥', teleport: '🌀', transition: '👤', blink: '⚡' }[id] || '🎯'; }

// ===================================
// INPUTS
// ===================================
function bindEvents() {
    document.getElementById('main-button').onclick = onPrimaryButtonClick;
}

function onPrimaryButtonClick() {
    const now = performance.now();
    if (state.ui === UI_MODE.IDLE) {
        state.ui = UI_MODE.WAITING;
        state.startBtnTs = now;
        document.getElementById('countdown-overlay').classList.remove('hidden');
        updateButtonVisuals('WAITING', '画面が割れる瞬間にタップ', 'waiting');
    } else if (state.ui === UI_MODE.WAITING) {
        startMatch();
    } else if (state.ui === UI_MODE.GAME) {
        powerUp();
    } else if (state.ui === UI_MODE.POWERED) {
        startRestartSequence();
    }
}

function startMatch() {
    const now = performance.now();
    state.ui = UI_MODE.GAME;
    state.gameStartedAt = now;
    state.phase = PHASES.A;
    document.getElementById('countdown-overlay').classList.add('hidden');

    // Auto-start everyone in Phase A (Initial CT)
    TRAITS.forEach(t => {
        const s = state.traits[t.id];
        s.isCounting = true;
        s.startedAt = now;
    });

    // Start eco timers
    TIMERS_DEF.filter(t => !t.powered).forEach(t => {
        state.eco[t.id].isActive = true;
        state.eco[t.id].startedAt = now;
    });

    updateButtonVisuals('POWERED', 'ゲートが開いたらタップ', 'powered');
}

function powerUp() {
    const now = performance.now();
    state.ui = UI_MODE.POWERED;
    state.poweredAt = now;

    TIMERS_DEF.filter(t => t.powered).forEach(t => {
        state.eco[t.id].isActive = true;
        state.eco[t.id].startedAt = now;
    });

    updateButtonVisuals('RESTART', '5秒待機後に再開', 'restart');
}

function startRestartSequence() {
    state.ui = UI_MODE.RESTARTING;
    state.startBtnTs = performance.now();
    document.getElementById('countdown-overlay').classList.remove('hidden');
}

function updateButtonVisuals(main, sub, cls) {
    const btn = document.getElementById('main-button');
    document.getElementById('button-text').innerText = main;
    document.getElementById('button-subtext').innerText = sub;
    btn.classList.remove('waiting', 'powered', 'restart');
    if (cls) btn.classList.add(cls);
}

// ===================================
// TRAIT INTERACTION (THE CORE RULES)
// ===================================
function handleTraitClick(id) {
    const now = performance.now();
    const trait = state.traits[id];

    // PHASE A: Start 1st Trait
    if (state.phase === PHASES.A) {
        if (trait.status === 'initial' && trait.remaining <= 0) {
            state.firstTraitId = id;
            startMaxCT(id, now);
            state.phase = PHASES.B;
        }
        return;
    }

    // PHASE B: Locked to 1st Trait only.
    if (state.phase === PHASES.B) {
        if (state.firstTraitId === id && trait.remaining <= 0) {
            startMaxCT(id, now);
        }
        return;
    }

    // PHASE C: Trump Available!
    if (state.phase === PHASES.C) {
        if (state.firstTraitId === id) {
            if (trait.remaining <= 0) startMaxCT(id, now);
        } else {
            // Switch to 2nd Trait
            state.secondTraitId = id;
            switchTrait(id, now);
            state.phase = PHASES.D;
        }
        return;
    }

    // PHASE D: Switched and Locked to 2nd Trait.
    if (state.phase === PHASES.D) {
        if (state.secondTraitId === id && trait.remaining <= 0) {
            startMaxCT(id, now);
        }
    }
}

function startMaxCT(id, now) {
    const s = state.traits[id];

    // Stop ALL others just in case
    TRAITS.forEach(t => {
        if (t.id !== id) state.traits[t.id].isCounting = false;
    });

    s.status = 'max';
    s.remaining = s.maxCT;
    s.startedAt = now;
    s.isCounting = true;
}

function switchTrait(targetId, now) {
    const currentId = state.firstTraitId;
    if (!currentId) {
        // Fallback: If no first trait was selected, new one starts at 0 or maxCT?
        // In IDV, if you haven't used your trait for 120s, it's ready.
        const sTarget = state.traits[targetId];
        sTarget.status = 'max';
        sTarget.remaining = 0;
        sTarget.isCounting = false;
        return;
    }

    const sCurr = state.traits[currentId];
    const sTarget = state.traits[targetId];

    // Specification:
    // Ratio = (1st Remaining) / (1st MaxCT)
    // 2nd Remaining = (2nd MaxCT) * Ratio

    let currentRemaining;
    if (sCurr.isCounting) {
        const elapsed = (now - sCurr.startedAt) / 1000;
        const total = (sCurr.status === 'initial') ? TRAITS.find(t => t.id === currentId).initialCT : sCurr.remaining;
        currentRemaining = Math.max(0, total - elapsed);
    } else {
        currentRemaining = sCurr.remaining;
    }

    const progressRatio = currentRemaining / sCurr.maxCT;
    const newRem = sTarget.maxCT * progressRatio;

    // Freeze 1st Trait at its current value
    sCurr.remaining = currentRemaining;
    sCurr.isCounting = false;

    sTarget.status = 'max';
    sTarget.remaining = newRem;
    sTarget.isCounting = newRem > 0;
    sTarget.startedAt = now;
}

// ===================================
// ENGINE LOOP
// ===================================
function tick() {
    const now = performance.now();
    update(now);
    render(now);
    requestAnimationFrame(tick);
}

function update(now) {
    if (state.ui === UI_MODE.IDLE) return;

    // Start Countdown
    if (state.ui === UI_MODE.WAITING) {
        const diff = 5 - Math.floor((now - state.startBtnTs) / 1000);
        document.getElementById('countdown-number').innerText = Math.max(0, diff);
        if (diff <= 0) startMatch();
        return;
    }

    // Restart Countdown
    if (state.ui === UI_MODE.RESTARTING) {
        const diff = 5 - Math.floor((now - state.startBtnTs) / 1000);
        document.getElementById('countdown-number').innerText = Math.max(0, diff);
        if (diff <= 0) {
            document.getElementById('countdown-overlay').classList.add('hidden');
            resetTool();
            startMatch();
        }
        return;
    }

    state.matchTime = Math.floor((now - state.gameStartedAt) / 1000);

    // Trump card unlock logic (120s from match start)
    if (state.phase === PHASES.A || state.phase === PHASES.B) {
        if (state.matchTime >= 120) state.phase = PHASES.C;
    }

    // Traits update
    TRAITS.forEach(t => {
        const s = state.traits[t.id];
        if (!s.isCounting) return;

        const diff = (now - s.startedAt) / 1000;
        const total = (s.status === 'initial') ? t.initialCT : s.remaining;
        const currentRem = Math.max(0, total - diff);

        if (currentRem <= 0) {
            s.remaining = 0;
            s.isCounting = false;
            // No automatic transition here, wait for click if activeTraitId
        }
    });

    // Eco Timers update
    TIMERS_DEF.forEach(t => {
        const s = state.eco[t.id];
        if (!s.isActive || s.isFinished) return;
        const diff = (now - s.startedAt) / 1000;
        s.remaining = Math.max(0, t.duration - diff);
        if (s.remaining <= 0) {
            s.isFinished = true;
            if (t.behavior === 'warn-once') s.highlightUntil = now + 5000;
            if (t.behavior === 'persistent') s.isPersistentHighlight = true;
        }
    });
}

// ===================================
// RENDERING
// ===================================
function render(now) {
    // Labels
    const min = Math.floor(state.matchTime / 60);
    const sec = state.matchTime % 60;
    document.getElementById('match-time-value').innerText = `${min}:${sec.toString().padStart(2, '0')}`;

    // Header stats
    const br = state.eco.blockRelease;
    document.getElementById('block-release-value').innerText = Math.ceil(br.remaining);
    document.getElementById('block-release-container').className = `header-card block-timer ${br.isActive && !br.isFinished ? 'active' : ''} ${br.isFinished ? 'ready' : ''}`;

    // Powered strip
    document.getElementById('detention-value').innerText = Math.ceil(state.eco.detention.remaining);
    document.getElementById('no-exit-value').innerText = Math.ceil(state.eco.noExit.remaining);
    document.getElementById('detention-card').className = `powered-card ${state.eco.detention.isActive ? 'active' : 'disabled'}`;
    document.getElementById('no-exit-card').className = `powered-card ${state.eco.noExit.isActive ? 'active' : 'disabled'}`;

    // Eco grid
    ['burningEffect', 'arrogance', 'decodeBoost'].forEach(id => {
        const s = state.eco[id];
        const domId = id.replace('Effect', '').replace('Boost', '') + '-card';
        const valId = id.replace('Effect', '').replace('Boost', '') + '-value';
        document.getElementById(valId).innerText = Math.ceil(s.remaining);
        const card = document.getElementById(domId);

        card.className = 'eco-item';
        if (s.isActive && !s.isFinished) {
            card.classList.add(s.remaining <= 10 ? 'warning' : 'active');
        } else if (s.isFinished) {
            if (now < s.highlightUntil || s.isPersistentHighlight) {
                card.classList.add('ready');
                if (now < s.highlightUntil) card.classList.add('blinking');
                // Decode Boost stays ready (green) indefinitely until restart
            }
        }
    });

    // Trait rendering
    TRAITS.forEach(t => {
        const s = state.traits[t.id];
        const el = document.getElementById(`t-${t.id}`);
        const timerText = el.querySelector('.trait-timer');

        // Value calc
        let v;
        if (s.isCounting) {
            const seed = (s.status === 'initial') ? t.initialCT : s.remaining;
            v = Math.max(0, seed - (now - s.startedAt) / 1000);
        } else {
            if (s.remaining <= 0) v = 0;
            else if (s.status === 'initial') v = t.initialCT;
            else v = s.remaining; // Frozen or switched
        }
        timerText.innerText = Math.ceil(v);

        // Styling classes
        el.classList.remove('disabled', 'state-initial', 'state-active', 'state-ready', 'warning', 'danger', 'selecting', 'frozen');

        if (state.ui === UI_MODE.IDLE || state.ui === UI_MODE.WAITING) {
            el.classList.add('disabled');
        } else {
            // Rules per Phase
            switch (state.phase) {
                case PHASES.A:
                    if (v <= 0) el.classList.add('state-ready');
                    else el.classList.add('state-initial');
                    break;
                case PHASES.B:
                    if (state.firstTraitId === t.id) {
                        el.classList.add('state-active');
                        if (v <= 0) el.classList.add('state-ready');
                        else if (v <= 5) el.classList.add('danger');
                        else if (v <= 10) el.classList.add('warning');
                    } else {
                        el.classList.add('disabled');
                    }
                    break;
                case PHASES.C:
                    if (state.firstTraitId === t.id) {
                        el.classList.add('state-active');
                        if (v <= 0) el.classList.add('state-ready');
                    } else {
                        el.classList.add('selecting');
                    }
                    break;
                case PHASES.D:
                    if (state.secondTraitId === t.id) {
                        el.classList.add('state-active');
                        if (v <= 0) el.classList.add('state-ready');
                        else if (v <= 5) el.classList.add('danger');
                        else if (v <= 10) el.classList.add('warning');
                    } else if (state.firstTraitId === t.id) {
                        el.classList.add('frozen');
                    } else {
                        el.classList.add('disabled'); // Half transparent
                    }
                    break;
            }
        }
    });

    // Trump Card Bar
    const tc = document.getElementById('trump-card');
    const tt = document.getElementById('trump-timer');
    tc.classList.remove('available', 'used', 'disabled');

    if (state.phase === PHASES.D) {
        tc.classList.add('used');
        tt.innerText = '使用済み';
    } else if (state.phase === PHASES.C) {
        tc.classList.add('available');
        tt.innerText = '使用可能！他特質を選択で切り替え';
    } else {
        tc.classList.add('disabled');
        if (state.gameStartedAt) {
            const r = Math.max(0, 120 - state.matchTime);
            tt.innerText = `有効まで: ${Math.ceil(r)}秒`;
        } else {
            tt.innerText = '有効まで: 120秒';
        }
    }
}

function updateUIColors() {
    // Initial UI reset handled by render in Idaho's next frame
}

init();
