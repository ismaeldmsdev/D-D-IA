
/* ═══════════════════════════════════════════════════════
   CRÓNICAS DEL ABISMO — Motor de juego v3
   D20 Interactivo · Inventario dinámico · Diario de Misiones
   Streaming real · Persistencia total · Modal de inicio
   ════════════════════════════════════════════════════ */

/* Módulos cargados como <script> normales en index.html — acceso via window._RPG */
var _G = window._RPG || {};
var MAX_TOKENS    = _G.MAX_TOKENS;
var HISTORY_LIMIT = _G.HISTORY_LIMIT;
var SKILLS        = _G.SKILLS;
var XP_TABLE      = _G.XP_TABLE;
var ATTR_ABBR     = _G.ATTR_ABBR;
var ATTR_CLASS    = _G.ATTR_CLASS;
var ASI_LEVELS    = _G.ASI_LEVELS;
var ATTR_MAP      = _G.ATTR_MAP;
var STAT_TO_ES    = _G.STAT_TO_ES;
var resolveAttr   = _G.resolveAttr.bind(_G);
var isConsumable  = _G.isConsumable.bind(_G);
var $             = _G.$;
var $$            = _G.$$;
var calcMod       = _G.calcMod;
var fmtMod        = _G.fmtMod;
var vibe          = _G.vibe;
var debounce      = _G.debounce;
var lsSave        = _G.lsSave;
var escHtml       = _G.escHtml;
var mdToHtml      = _G.mdToHtml;
var sfx           = _G.sfx;
var buildDmCore   = _G.buildDmCore;

// ── Bloqueo de zoom táctil (iOS Safari ignora user-scalable=no) ──
document.addEventListener('gesturestart',  e => e.preventDefault());
document.addEventListener('gesturechange', e => e.preventDefault());
document.addEventListener('gestureend',    e => e.preventDefault());
let _lastTouch = 0;
document.addEventListener('touchend', e => {
  const now = Date.now();
  if (now - _lastTouch <= 300) {
    const tag = e.target?.tagName;
    if (tag !== 'INPUT' && tag !== 'TEXTAREA') e.preventDefault();
  }
  _lastTouch = now;
}, { passive: false });


document.addEventListener('DOMContentLoaded', () => {

  // ─────────────────────────────────────────────────────
  // BESTIARIO — cargado desde bestiario.json al inicio
  // ─────────────────────────────────────────────────────
  // Bestiario cargado via <script src="bestiario.js"> para compatibilidad con file://
  const _bd = window.BESTIARIO_DATA || { enemigos: {}, npcs: {} };
  const bestiario = { enemigos: _bd.enemigos || {}, npcs: _bd.npcs || {} };

  // ─────────────────────────────────────────────────────
  // ESTADO
  // ─────────────────────────────────────────────────────
  const state = {
    apiKey:            localStorage.getItem('rpg_api_key') || '',
    history:           [],
    chatLog:           [],
    isStreaming:       false,
    puntosDisponibles: 0,
    charName:          '',
    charClass:         '',
    inventory:         [],   // [{id, name, isConsumable}]
    quests:            [],   // [{id, title, status: 'active'|'completed'}]
    pendingRoll:       null, // {attr, label, mode:'normal'|'ventaja'|'desventaja'} | null
    deathSaves:        { successes: 0, failures: 0, active: false },
    campaignDiary:     '',   // Resumen acumulado de eventos importantes
    rollHistory:       [],   // [{label, roll, mod, total, type}] — hasta 30 entradas
    activeEnemy:       null, // {prompt, name, hpMax, hpCurrent, dano, ca, img} | null
    activeNpc:         null, // {id, nombre, img} | null — NPC en conversación
    progressLog:       [],   // [{ts, tipo, texto, nivel, hp}] — crónica técnica descargable
    npcLog:            {},   // { [key]: { name, attitude, note, ts } }
    locationLog:       {},   // { [key]: { name, notes:[], ts } }
    moralLog:          [],   // [{ ts, summary }]
    playerStats:       { str:0, dex:0, con:0, int:0, wis:0, cha:0 }, // Puntos ASI acumulados (sin base de clase)
    npcNames:          {},   // { ["npc-id@location-id"]: nombre } — nombre único por tipo de NPC y ubicación
    currentLocation:   null, // { id, name } | null — última ubicación conocida del jugador
    worldState:        {},   // { [clave]: valor } — estado global del mundo (ciudades, facciones, NPCs clave)
    equipment:         { arma: null, armadura: null, accesorio: null }, // slots de equipamiento activo
    gold:              0,   // monedas de oro del personaje
    spells:            [],  // [{id, name, tipo: 'cantrip'|'nivel1'}]
    preparedSpell:     null,// nombre del hechizo preparado actualmente
    spellSlotsUsed:    0,   // slots gastados (se recuperan al descansar)
    shopItems:         [],  // [{id, name, price, tipo}] — tienda activa
    conditions:        [],  // condiciones activas: ['veneno', 'aturdido', ...]
    factions:          {},  // { [id]: { name, value: -100..100 } }
    playerNotes:       '',  // notas libres del jugador
  };

  // ─────────────────────────────────────────────────────
  // REFERENCIAS DOM
  // ─────────────────────────────────────────────────────
  const hpCurrent = $('hp-current');
  const hpMax     = $('hp-max');
  const hpBar     = $('hp-bar');
  const hpPercent = $('hp-percent');

  const apiKeyInput  = $('api-key');
  const toggleApiBtn = $('toggle-api-key');
  const saveApiBtn   = $('save-api-btn');
  const apiDot       = $('api-dot');
  const apiLabel     = $('api-label');

  const playerInput  = $('player-input');
  const sendBtn      = $('send-btn');
  const diceRollBtn  = $('dice-roll-btn');
  const chatMessages = $('chat-messages');
  const statusDot    = $('status-dot');
  const statusText   = $('status-text');
  const diceFlash    = $('dice-flash');
  const msgCount     = $('msg-count');
  const tokenCount   = $('token-count');

  const worldLore    = $('world-lore');
  const storySummary = $('story-summary');

  const updateSummaryBtn = $('update-summary-btn');
  const clearChatBtn     = $('clear-chat-btn');
  const diceOverlay      = $('dice-overlay');
  const diceNumber       = $('dice-number');
  const diceDetail       = $('dice-detail');

  const charModal      = $('char-modal');
  const modalName      = $('modal-name');
  const modalClass     = $('modal-class');
  const modalStartBtn  = $('modal-start-btn');

  const inventoryList  = $('inventory-list');
  const inventoryEmpty = $('inventory-empty');
  const inventoryCount = $('inventory-count');

  const questActiveList    = $('quest-active-list');
  const questCompletedList = $('quest-completed-list');
  const questEmpty         = $('quest-empty');

  // ═══════════════════════════════════════════════════════
  // HP BAR
  // ═══════════════════════════════════════════════════════
  function updateHpBar() {
    const cur = Math.max(0, parseInt(hpCurrent.value) || 0);
    const max = Math.max(1, parseInt(hpMax.value) || 1);
    const pct = Math.min(100, Math.round((cur / max) * 100));

    hpBar.style.width = pct + '%';
    hpPercent.textContent = pct + '%';
    hpBar.style.animation = 'none';

    if (pct > 60)      hpBar.style.background = 'linear-gradient(to right,#c0392b,#e74c3c)';
    else if (pct > 25) hpBar.style.background = 'linear-gradient(to right,#e67e22,#f39c12)';
    else {
      hpBar.style.background = 'linear-gradient(to right,#7d1010,#c0392b)';
      hpBar.style.animation = 'pulse 1s infinite';
    }
  }

  hpCurrent.addEventListener('input', updateHpBar);
  hpMax.addEventListener('input',     updateHpBar);
  updateHpBar();

  // Update combat avatar HP bars
  function updateHealth(target, currentHp, maxHp) {
    const cur = Math.max(0, parseInt(currentHp) || 0);
    const max = Math.max(1, parseInt(maxHp) || 1);
    const pct = Math.min(100, Math.round((cur / max) * 100));

    const barId = target === 'enemy' ? 'enemy-hp-bar' : 'player-hp-bar';
    const textId = target === 'enemy' ? 'enemy-hp-text' : 'player-hp-text';
    const bar = document.getElementById(barId);
    const txt = document.getElementById(textId);
    if (!bar) return;
    bar.style.width = pct + '%';
    if (txt) txt.textContent = `${cur} / ${max}`;

    // Color feedback
    if (pct > 60)      bar.style.background = target === 'enemy' ? 'linear-gradient(90deg,#e74c3c,#c0392b)' : 'linear-gradient(90deg,#2ecc71,#27ae60)';
    else if (pct > 25) bar.style.background = target === 'enemy' ? 'linear-gradient(90deg,#f39c12,#e67e22)' : 'linear-gradient(90deg,#f1c40f,#f39c12)';
    else               bar.style.background = target === 'enemy' ? 'linear-gradient(90deg,#7d1010,#c0392b)' : 'linear-gradient(90deg,#b71c1c,#7d1010)';

    // Sync combat screen HP bars
    const csFillId = target === 'enemy' ? 'cs-enemy-hp-fill' : 'cs-player-hp-fill';
    const csTxtId  = target === 'enemy' ? 'cs-enemy-hp-text' : 'cs-player-hp-text';
    const csFill = $(csFillId);
    const csTxt  = $(csTxtId);
    if (csFill) { csFill.style.width = pct + '%'; _csApplyHpColor(csFill, pct, target === 'enemy'); }
    if (csTxt)  csTxt.textContent = `${cur} / ${max}`;
    if (target === 'enemy' && state.activeEnemy) {
      const csName = $('cs-enemy-name');
      const csImg  = $('cs-enemy-avatar');
      if (csName) csName.textContent = state.activeEnemy.name || '—';
      if (csImg && state.activeEnemy.img) {
        csImg.src = state.activeEnemy.img;
        csImg.onerror = () => { csImg.onerror = null; csImg.src = 'img/enemigos/goblin-1.png'; };
      }
    }
  }
  // Exponer para que la IA/DM pueda llamarlo
  window.updateHealth = updateHealth;

  // Keep player combat bar in sync with main HP inputs
  const origUpdateHpBar = updateHpBar;
  updateHpBar = function() {
    origUpdateHpBar();
    const cur = Math.max(0, parseInt(hpCurrent.value) || 0);
    const max = Math.max(1, parseInt(hpMax.value) || 1);
    updateHealth('player', cur, max);
  };
  // Rebind event listeners to the new updateHpBar
  try {
    hpCurrent.removeEventListener('input', origUpdateHpBar);
    hpMax.removeEventListener('input', origUpdateHpBar);
  } catch(e) {}
  hpCurrent.addEventListener('input', updateHpBar);
  hpMax.addEventListener('input', updateHpBar);
  // Run once to initialize combat bar
  updateHpBar();

  // ═══════════════════════════════════════════════════════
  // MODIFICADORES + STATS DINÁMICOS
  // ═══════════════════════════════════════════════════════
  // Valor base de la clase según CLASE_STATS (sin puntos de nivel)
  function getBaseStatValue(statId) {
    const cls = ($('char-class')?.value || state.charClass || '').trim();
    const clsData = window.CLASE_STATS?.[cls];
    if (!clsData) return 10;
    return clsData[STAT_TO_ES[statId]] ?? 10;
  }

  // Valor efectivo = base de clase + puntos ASI acumulados (cap 20)
  function getEffectiveStatValue(statId) {
    return Math.min(20, Math.max(1, getBaseStatValue(statId) + (state.playerStats[statId] ?? 0)));
  }

  // Sincroniza todos los inputs de atributos con el valor calculado y guarda en localStorage
  function syncStatDisplays() {
    ['str','dex','con','int','wis','cha'].forEach(id => {
      const val = getEffectiveStatValue(id);
      const el  = $(`stat-${id}`);
      if (el) { el.value = val; lsSave(`rpg_stat-${id}`, String(val)); }
      updateMod(id);
    });
    updateSkillBonuses();
  }

  function updateMod(id) {
    const inp = $(`stat-${id}`);
    const mod = $(`mod-${id}`);
    if (!inp || !mod) return;
    const m = calcMod(parseInt(inp.value) || 10);
    mod.textContent = fmtMod(m);
    mod.classList.toggle('positive', m > 0);
    mod.classList.toggle('negative', m < 0);
  }

  // ═══════════════════════════════════════════════════════
  // DADOS
  // ═══════════════════════════════════════════════════════
  function rollD20() { return Math.floor(Math.random() * 20) + 1; }

  function showDiceOverlay(roll, mod, label) {
    const total = roll + mod;
    diceNumber.className = 'dice-number';
    diceNumber.textContent = roll;

    if (roll === 20) {
      diceNumber.classList.add('crit-success');
      diceDetail.textContent = `¡CRÍTICO NATURAL! ${label} — Total: ${total}`;
    } else if (roll === 1) {
      diceNumber.classList.add('crit-fail');
      diceDetail.textContent = `¡PIFIA NATURAL! ${label} — ¡Desastre!`;
    } else {
      diceDetail.textContent = `${label} · D20(${roll}) ${fmtMod(mod)} = ${total}`;
    }
    diceOverlay.classList.add('visible');
  }

  // Dado D20 de atributos (botones de la hoja de personaje)
  $$('.roll-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const statId = btn.dataset.stat;
      const label  = btn.dataset.label;
      const val    = parseInt($(`stat-${statId}`)?.value) || 10;
      const mod    = calcMod(val);
      const roll   = rollD20();
      const total  = roll + mod;

      showDiceOverlay(roll, mod, label);

      let prefix;
      if (roll === 20)     prefix = `[¡Crítico! Tirada de ${label}: 20 natural → Total ${total}] `;
      else if (roll === 1) prefix = `[¡Pifia! Tirada de ${label}: 1 natural — fallo catastrófico] `;
      else                 prefix = `[Tirada de ${label}: ${roll} ${fmtMod(mod)} = ${total}] `;

      const current = playerInput.value.trim();
      playerInput.value = current ? current + ' ' + prefix : prefix;
      playerInput.focus();

      diceFlash.textContent = '🎲 ' + prefix.replace(/[\[\]]/g, '').trim();
      diceFlash.classList.add('visible');
      setTimeout(() => diceFlash.classList.remove('visible'), 4000);
    });
  });

  diceOverlay.addEventListener('click', () => diceOverlay.classList.remove('visible'));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') diceOverlay.classList.remove('visible');
  });

  // ═══════════════════════════════════════════════════════
  // DADO D20 INTERACTIVO — Tirada solicitada por la IA
  // ═══════════════════════════════════════════════════════
  function activatePendingRoll(attrRaw, mode = 'normal') {
    const statId = resolveAttr(attrRaw);
    state.pendingRoll = { attr: statId, label: attrRaw, mode };
    saveGameState();

    if (diceRollBtn) {
      diceRollBtn.disabled = false;
      diceRollBtn.classList.remove('roll-advantage', 'roll-disadvantage');
      diceRollBtn.classList.add('roll-requested');
      if (mode === 'ventaja')    diceRollBtn.classList.add('roll-advantage');
      if (mode === 'desventaja') diceRollBtn.classList.add('roll-disadvantage');
      const modeLabel = mode === 'ventaja' ? ' [VENTAJA]' : mode === 'desventaja' ? ' [DESVENTAJA]' : '';
      diceRollBtn.title = `¡La IA pide tirada de ${attrRaw}${modeLabel}! Haz clic para lanzar`;
    }
  }

  function deactivatePendingRoll() {
    state.pendingRoll = null;
    saveGameState();

    if (diceRollBtn) {
      diceRollBtn.disabled = true;
      diceRollBtn.classList.remove('roll-requested', 'roll-advantage', 'roll-disadvantage');
      diceRollBtn.title = 'Esperando petición de tirada...';
    }
  }

  // ═══════════════════════════════════════════════════════
  // HISTORIAL DE TIRADAS — Bitácora del Destino
  // ═══════════════════════════════════════════════════════
  function addRollToHistory(label, roll, mod, total) {
    const type = roll === 20 ? 'crit' : roll <= 4 ? 'fail' : 'good';
    state.rollHistory.unshift({ label, roll, mod, total, type });
    if (state.rollHistory.length > 30) state.rollHistory.pop();
    lsSave('rpg_roll_history', JSON.stringify(state.rollHistory));
    renderRollHistory();
  }

  function renderRollHistory() {
    const body  = $('rolls-body');
    const empty = $('rolls-empty');
    if (!body) return;

    body.querySelectorAll('.roll-entry').forEach(el => el.remove());

    if (state.rollHistory.length === 0) {
      if (empty) empty.style.display = 'block';
      return;
    }
    if (empty) empty.style.display = 'none';

    state.rollHistory.forEach(r => {
      const el      = document.createElement('div');
      el.className  = `roll-entry roll-entry-${r.type}`;
      const modStr  = r.mod !== 0 ? ` ${fmtMod(r.mod)}` : '';
      const icon    = r.type === 'crit' ? '⚡' : r.type === 'fail' ? '💀' : '✓';
      const outcome = r.type === 'crit' ? 'CRÍTICO'
                    : r.type === 'fail' ? 'PIFIA'
                    : String(r.total);
      el.innerHTML = `
        <span class="re-name">${escHtml(r.label)}</span>
        <span class="re-dice">${r.roll}${escHtml(modStr)}</span>
        <span class="re-outcome re-${r.type}">${icon} ${outcome}</span>`;
      body.appendChild(el);
    });
  }

  // Toggle colapsado de la bitácora
  const rollsToggle = $('rolls-toggle');
  const rollsBody   = $('rolls-body');
  if (rollsToggle && rollsBody) {
    rollsToggle.addEventListener('click', () => {
      const collapsed = rollsBody.classList.toggle('collapsed');
      rollsToggle.textContent = collapsed ? '▶' : '▼';
      rollsToggle.setAttribute('aria-expanded', String(!collapsed));
    });
  }

  // ═══════════════════════════════════════════════════════
  // INTERRUPTOR DE TEMA — Oscuro / Pergamino
  // ═══════════════════════════════════════════════════════
  const themeToggleBtn = $('theme-toggle');
  function applyTheme(isParchment) {
    document.body.classList.toggle('theme-parchment', isParchment);
    if (themeToggleBtn) themeToggleBtn.textContent = isParchment ? '🌑' : '🕯';
    lsSave('rpg_theme', isParchment ? 'parchment' : 'dark');
  }

  themeToggleBtn?.addEventListener('click', () => {
    applyTheme(!document.body.classList.contains('theme-parchment'));
  });

  // Sincronizar el icono del botón con el tema cargado al inicio
  if (document.body.classList.contains('theme-parchment') && themeToggleBtn) {
    themeToggleBtn.textContent = '🌑';
  }

  // ── Efectos cinemáticos BG3-style ─────────────────────
  function _spawnDiceParticles(container, type) {
    const colors = {
      crit: ['#ffe858','#ffd700','#ffb700','#fff4a0','#ffe000'],
      fail: ['#ff4422','#cc1a0a','#ff6633','#dd2200','#ff3311'],
      good: ['#00e890','#00bc70','#44ffc0','#00d080','#80ffe0'],
    };
    const palette = colors[type] || colors.good;
    const count   = type === 'crit' ? 18 : 12;
    for (let i = 0; i < count; i++) {
      const p    = document.createElement('div');
      p.className = 'dice-spark';
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const dist0 = 10 + Math.random() * 20;
      const dist1 = 60 + Math.random() * 90;
      const size  = 4 + Math.random() * 6;
      const dur   = 0.5 + Math.random() * 0.35;
      p.style.cssText = `
        --tx0: ${Math.cos(angle)*dist0}px; --ty0: ${Math.sin(angle)*dist0}px;
        --tx1: ${Math.cos(angle)*dist1}px; --ty1: ${Math.sin(angle)*dist1}px;
        --dur: ${dur}s;
        width:${size}px; height:${size}px;
        background:${palette[i % palette.length]};
        box-shadow: 0 0 ${size*2}px ${palette[i%palette.length]};
        animation-delay: ${Math.random()*0.08}s;
      `;
      container.appendChild(p);
      setTimeout(() => p.remove(), (dur + 0.15) * 1000);
    }
  }

  function _triggerImpactRing(type) {
    const ring = $('roll-impact-ring');
    if (!ring) return;
    ring.className = 'roll-impact-ring';
    void ring.offsetWidth;
    ring.classList.add(type === 'crit' ? 'gold' : type === 'fail' ? 'fail' : 'fire');
    setTimeout(() => { ring.className = 'roll-impact-ring'; }, 700);
  }

  function _triggerScreenFlash(type) {
    const flash = $('roll-screen-flash');
    if (!flash) return;
    flash.className = 'roll-screen-flash';
    void flash.offsetWidth;
    flash.classList.add(type === 'crit' ? 'flash-gold' : type === 'fail' ? 'flash-red' : 'flash-green');
    setTimeout(() => { flash.className = 'roll-screen-flash'; }, 500);
  }

  function _triggerCardShake() {
    const card = $('roll-cinematic-card');
    if (!card) return;
    card.classList.remove('impact-shake');
    void card.offsetWidth;
    card.classList.add('impact-shake');
    setTimeout(() => card.classList.remove('impact-shake'), 520);
  }

  function triggerDiceRoll() {
    if (!state.pendingRoll || state.isStreaming) return;

    const { attr, label, mode = 'normal' } = state.pendingRoll;
    const statVal = parseInt($(`stat-${attr}`)?.value) || 10;
    const mod     = calcMod(statVal);

    const roll1 = rollD20();
    const roll2 = mode !== 'normal' ? rollD20() : null;
    const roll  = mode === 'ventaja'    ? Math.max(roll1, roll2)
                : mode === 'desventaja' ? Math.min(roll1, roll2)
                : roll1;
    const discarded = mode !== 'normal' ? (roll === roll1 ? roll2 : roll1) : null;
    const total = roll + mod;

    deactivatePendingRoll();

    // ── Referencias al overlay cinemático ──
    const overlay  = $('roll-cinematic-overlay');
    const titleEl  = $('roll-cinematic-title');
    const hintEl   = $('roll-cinematic-hint');
    const diceBtn  = $('roll-d20-giant-btn');
    const numberEl = $('roll-d20-number-display');
    const modEl    = $('roll-cinematic-modifier');

    if (!overlay || !diceBtn) return; // fallback: nodo no encontrado

    // Setup inicial
    titleEl.textContent = mode === 'ventaja'    ? `⬆ ¡VENTAJA! — ${label.toUpperCase()}`
                        : mode === 'desventaja' ? `⬇ ¡DESVENTAJA! — ${label.toUpperCase()}`
                        : `⚔ ¡PRUEBA DE ${label.toUpperCase()}!`;
    modEl.textContent   = mod !== 0 ? `Modificador: ${fmtMod(mod)} (${label})` : `Atributo: ${label}`;
    numberEl.textContent = '?';
    numberEl.style.color = '';
    hintEl.style.opacity = '1';

    diceBtn.classList.remove('rolling', 'revealed', 'crit-result', 'fail-result', 'good-result');
    overlay.classList.remove('fade-out');

    // ── FASE 1: Mostrar overlay ──
    overlay.setAttribute('aria-hidden', 'false');
    overlay.classList.add('visible');
    sfx.alert(); // Sonido de alerta al aparecer el overlay

    const bgRunes = $('roll-bg-runes');

    // ── FASE 2: Click en el dado → animación de lanzamiento ──
    function onDiceClick() {
      diceBtn.removeEventListener('click', onDiceClick);
      diceBtn.classList.add('rolling');
      hintEl.style.opacity = '0';
      if (bgRunes) bgRunes.classList.add('active');

      sfx.roll(); // Cliqueo intermitente durante el giro

      // Microvibraciones sincronizadas con los 8 impactos más audibles
      for (let p = 0; p < 8; p++) {
        setTimeout(() => vibe(8), Math.round((p / 8) * 1500));
      }

      // Números aleatorios a 45ms durante 1500ms
      let spinInterval = setInterval(() => {
        numberEl.textContent = Math.floor(Math.random() * 20) + 1;
      }, 45);

      // ── FASE 3: Tras 1500ms — impacto y revelación BG3-style ──
      setTimeout(() => {
        clearInterval(spinInterval);
        if (bgRunes) bgRunes.classList.remove('active');
        diceBtn.classList.remove('rolling');
        diceBtn.classList.add('revealed');

        // Slam del número con animación
        numberEl.textContent = roll;
        numberEl.classList.remove('slam');
        void numberEl.offsetWidth;
        numberEl.classList.add('slam');

        const isCrit = roll === 20;
        const isFail = roll <= 4;
        const effectType = isCrit ? 'crit' : isFail ? 'fail' : 'good';
        if (isCrit)      diceBtn.classList.add('crit-result');
        else if (isFail) diceBtn.classList.add('fail-result');
        else             diceBtn.classList.add('good-result');

        // Efectos de impacto: onda + flash + partículas + sacudida
        const perspEl = $('roll-d20-perspective');
        _triggerImpactRing(effectType);
        _triggerScreenFlash(effectType);
        _triggerCardShake();
        if (perspEl) _spawnDiceParticles(perspEl, effectType);
        // Doble onda con retardo para críticos
        if (isCrit) setTimeout(() => _triggerImpactRing('crit'), 200);

        sfx.result(!isFail);

        // Vibración háptica de revelación
        vibe(isCrit || roll === 1 ? [100, 50, 100] : 50);

        // Mostrar ambos dados si hay ventaja/desventaja
        if (mode !== 'normal' && discarded !== null) {
          const modeIcon = mode === 'ventaja' ? '⬆' : '⬇';
          modEl.innerHTML = `${modeIcon} ${mode === 'ventaja' ? 'Ventaja' : 'Desventaja'}: `
            + `<span style="color:var(--gold-bright);font-weight:bold">${roll}</span>`
            + ` · <span style="opacity:0.4;text-decoration:line-through">${discarded}</span>`
            + (mod !== 0 ? ` ${fmtMod(mod)}` : '');
        }

        // Registrar en la Bitácora del Destino
        addRollToHistory(label, roll, mod, total);

        // ── FASE 4: Tras 1000ms con el resultado visible → fade-out + envío ──
        setTimeout(() => {
          overlay.classList.remove('visible');
          overlay.classList.add('fade-out');

          setTimeout(() => {
            overlay.classList.remove('fade-out');
            overlay.setAttribute('aria-hidden', 'true');

            const modStr  = mod !== 0 ? ` ${fmtMod(mod)} (${label})` : '';
            const modeStr = mode === 'ventaja'    ? ` [ventaja: ${roll} vs ${discarded}]`
                          : mode === 'desventaja' ? ` [desventaja: ${roll} vs ${discarded}]`
                          : '';
            const emoji  = isCrit ? ' ⚡ ¡CRÍTICO NATURAL!'
                         : roll === 1 ? ' 💀 ¡PIFIA NATURAL!'
                         : '';
            const msg = `🎲 Tirada de ${label}${modeStr}: ${roll}${modStr} = **${total}**${emoji}`;
            addPlayerMessage(msg);
            updateStats();
            callDM(msg);
          }, 440);
        }, 1000); // 1 segundo completo mostrando el resultado
      }, 1500);   // 1.5 segundos de giro 3D
    }

    diceBtn.addEventListener('click', onDiceClick);

    // Esc cierra el overlay sin tirar (la tirada queda pendiente)
    const escHandler = e => {
      if (e.key !== 'Escape') return;
      diceBtn.removeEventListener('click', onDiceClick);
      overlay.classList.remove('visible');
      overlay.setAttribute('aria-hidden', 'true');
      document.removeEventListener('keydown', escHandler);
      // Re-activar el pending roll para que el usuario pueda intentarlo de nuevo
      activatePendingRoll(label);
    };
    document.addEventListener('keydown', escHandler);
  }

  diceRollBtn?.addEventListener('click', triggerDiceRoll);

  // ── Dado libre (selector de tipo de dado) ──────────────
  const freeDiceTrigger = $('free-dice-trigger');
  const freeDiceMenu    = $('free-dice-menu');

  freeDiceTrigger?.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = freeDiceMenu.classList.toggle('open');
    freeDiceMenu.setAttribute('aria-hidden', String(!open));
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#free-dice-wrapper')) {
      freeDiceMenu?.classList.remove('open');
      freeDiceMenu?.setAttribute('aria-hidden', 'true');
    }
  });

  $$('.free-dice-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      const attrId = btn.dataset.attr;
      const label  = btn.dataset.label;
      freeDiceMenu.classList.remove('open');
      freeDiceMenu.setAttribute('aria-hidden', 'true');
      // Activar la tirada cinemática con ese atributo
      activatePendingRoll(label, 'normal');
      // Forzar ejecución inmediata de la tirada
      triggerDiceRoll();
    });
  });

  $('battle-panel-close')?.addEventListener('click', () => {
    if (uiState.inCombat) endCombat();
    else if (uiState.inConversation) hideNpcCard();
  });

  $('cs-close-btn')?.addEventListener('click', () => {
    if (uiState.inCombat) endCombat();
  });

  // ─ Enemy detail modal ───────────────────────────────
  $('enemy-stack-wrapper')?.addEventListener('click', e => {
    if (!state.activeEnemy) return;
    const ignored = ['battle-panel-close', 'enemy-detail-close'];
    if (ignored.includes(e.target?.id)) return;
    openEnemyDetailModal();
  });
  $('enemy-detail-close')?.addEventListener('click', closeEnemyDetailModal);
  $('enemy-detail-overlay')?.addEventListener('click', e => {
    if (e.target.id === 'enemy-detail-overlay') closeEnemyDetailModal();
  });

  // ─ Player card → hoja de personaje ──────────────────
  $('player-card')?.addEventListener('click', e => {
    if (!$('player-card').classList.contains('active')) return;
    const ignored = ['battle-panel-close'];
    if (ignored.includes(e.target?.id)) return;
    openPlayerStatsPanel();
  });
  $('player-detail-close')?.addEventListener('click', closePlayerStatsPanel);
  $('player-detail-overlay')?.addEventListener('click', e => {
    if (e.target.id === 'player-detail-overlay') closePlayerStatsPanel();
  });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if ($('enemy-detail-overlay')?.classList.contains('visible'))  closeEnemyDetailModal();
    if ($('player-detail-overlay')?.classList.contains('visible')) closePlayerStatsPanel();
  });

  // Acordeón: expandir/contraer tarjetas de enemigo al pulsar
  $('enemy-detail-body')?.addEventListener('click', e => {
    const block = e.target.closest('.enemy-stat-block');
    if (!block) return;
    const wasExpanded = block.classList.contains('is-expanded');
    const body = $('enemy-detail-body');
    body.querySelectorAll('.enemy-stat-block').forEach(b => {
      b.classList.remove('is-expanded');
      b.classList.add('is-collapsed');
      b.setAttribute('aria-expanded', 'false');
    });
    if (!wasExpanded) {
      block.classList.remove('is-collapsed');
      block.classList.add('is-expanded');
      block.setAttribute('aria-expanded', 'true');
    }
  });

  // ═══════════════════════════════════════════════════════
  // INVENTARIO DINÁMICO
  // ═══════════════════════════════════════════════════════
  // ── Tipo de objeto (determina slot de equipamiento) ──────
  function getItemTipo(name) {
    const n = name.toLowerCase();
    if (/espada|hacha|lanza|arco|daga|maza|bastón|staff|varita|cuchillo|garrote|martillo|tridente|ballesta|sable|filo|hoja|garra|cimitarra/i.test(n)) return 'arma';
    if (/armadura|escudo|cota|yelmo|casco|coraza|peto|manto de|capa de|guardia/i.test(n)) return 'armadura';
    if (/anillo|amuleto|collar|colgante|diadema|brazalete|talismán|broche|medallón|gema de/i.test(n)) return 'accesorio';
    if (/poción|consumible|hierba|ungüento|elixir|brebaje|antídoto/i.test(n)) return 'consumible';
    return 'misc';
  }

  function getEquipSlot(tipo) {
    return { arma: 'arma', armadura: 'armadura', accesorio: 'accesorio' }[tipo] ?? null;
  }

  // ── Render equipamiento ──────────────────────────────────
  function renderEquipment() {
    ['arma', 'armadura', 'accesorio'].forEach(slot => {
      const el = $(`equip-content-${slot}`);
      if (!el) return;
      const item = state.equipment[slot];
      if (item) {
        el.innerHTML = `
          <span class="equip-item-name">${escHtml(item.name)}</span>
          <button type="button" class="item-unequip-btn" data-slot="${slot}" title="Desequipar ${escHtml(item.name)}">↩</button>`;
      } else {
        el.innerHTML = '<span class="equip-slot-empty">vacío</span>';
      }
    });
  }

  // ── Equipar / Desequipar ─────────────────────────────────
  function equipItem(itemId) {
    const idx = state.inventory.findIndex(i => i.id === itemId);
    if (idx === -1) return;
    const item = state.inventory[idx];
    const slot = getEquipSlot(item.tipo);
    if (!slot) return;

    // Si el slot ya tiene algo, devolver al inventario primero
    if (state.equipment[slot]) state.inventory.push(state.equipment[slot]);

    state.inventory.splice(idx, 1);
    state.equipment[slot] = item;

    renderInventory(); renderEquipment(); syncInventoryTextarea(); saveGameState();
    addSystemMessage(`⚔ Equipas: "${item.name}"`);
  }

  function unequipItem(slot) {
    const item = state.equipment[slot];
    if (!item) return;
    state.equipment[slot] = null;
    state.inventory.push(item);
    renderInventory(); renderEquipment(); syncInventoryTextarea(); saveGameState();
    addSystemMessage(`📦 Desequipas: "${item.name}"`);
  }

  // Delegación de eventos para equipamiento (sobre el contenedor de slots)
  $('equipment-slots')?.addEventListener('click', e => {
    const btn = e.target.closest('.item-unequip-btn');
    if (btn) unequipItem(btn.dataset.slot);
  });

  function syncInventoryTextarea() {
    const textarea = $('inventory');
    if (textarea) textarea.value = state.inventory.map(i => i.name).join('\n');
  }

  function renderInventory() {
    if (!inventoryList) return;
    inventoryList.querySelectorAll('.inventory-item').forEach(el => el.remove());

    if (inventoryEmpty)  inventoryEmpty.style.display  = state.inventory.length === 0 ? 'block' : 'none';
    if (inventoryCount)  inventoryCount.textContent    = state.inventory.length;

    state.inventory.forEach(item => {
      // Migración: ítems sin tipo heredan uno derivado del nombre
      if (!item.tipo) item.tipo = getItemTipo(item.name);
      const slot = getEquipSlot(item.tipo);
      const el = document.createElement('div');
      el.className  = 'inventory-item';
      el.dataset.id = item.id;
      el.innerHTML  = `
        <span class="item-name">${escHtml(item.name)}</span>
        <div class="item-actions">
          ${item.isConsumable || item.tipo === 'consumible'
            ? `<button type="button" class="item-use-btn" data-id="${escHtml(item.id)}" title="Usar ${escHtml(item.name)}">🧪 Usar</button>`
            : ''}
          ${slot
            ? `<button type="button" class="item-equip-btn" data-id="${escHtml(item.id)}" title="Equipar ${escHtml(item.name)}">⚔</button>`
            : ''}
          <button type="button" class="item-del-btn" data-id="${escHtml(item.id)}" aria-label="Tirar ${escHtml(item.name)}">✕</button>
        </div>`;
      inventoryList.appendChild(el);
    });
  }

  // Delegación de eventos para usar/tirar objetos
  inventoryList?.addEventListener('click', e => {
    const useBtn   = e.target.closest('.item-use-btn');
    const equipBtn = e.target.closest('.item-equip-btn');
    const delBtn   = e.target.closest('.item-del-btn');
    if (useBtn)   useConsumable(useBtn.dataset.id);
    if (equipBtn) equipItem(equipBtn.dataset.id);
    if (delBtn) {
      state.inventory = state.inventory.filter(i => i.id !== delBtn.dataset.id);
      renderInventory(); syncInventoryTextarea(); saveGameState();
    }
  });

  function addInventoryItem(name) {
    const id   = 'item_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const tipo = getItemTipo(name);
    state.inventory.push({ id, name: name.trim(), tipo, isConsumable: tipo === 'consumible' });
    renderInventory();
    syncInventoryTextarea();
    saveGameState();
    addSystemMessage(`🎒 Obtienes: "${name.trim()}"`);
    logProgress(`Obtuvo el objeto: "${name.trim()}".`, 'objeto');
  }

  function removeInventoryItem(name) {
    const lower = name.toLowerCase().trim();

    // Buscar primero en inventario
    const idx = state.inventory.findIndex(
      i => i.name.toLowerCase() === lower || i.name.toLowerCase().includes(lower)
    );
    if (idx !== -1) {
      const removed = state.inventory.splice(idx, 1)[0];
      renderInventory(); syncInventoryTextarea(); saveGameState();
      addSystemMessage(`🗑 Pierdes: "${removed.name}"`);
      return true;
    }

    // Buscar también en slots de equipamiento
    for (const slot of ['arma', 'armadura', 'accesorio']) {
      const item = state.equipment[slot];
      if (item && (item.name.toLowerCase() === lower || item.name.toLowerCase().includes(lower))) {
        state.equipment[slot] = null;
        renderEquipment(); saveGameState();
        addSystemMessage(`🗑 Pierdes: "${item.name}" (equipado)`);
        return true;
      }
    }
    return false;
  }

  function useConsumable(id) {
    const item = state.inventory.find(i => i.id === id);
    if (!item) return;

    // 2d4 + 2
    const heal = Math.floor(Math.random() * 4) + 1 + Math.floor(Math.random() * 4) + 1 + 2;
    state.inventory = state.inventory.filter(i => i.id !== id);
    renderInventory();
    syncInventoryTextarea();
    saveGameState();
    applyHpChange(heal);
    addSystemMessage(`🧪 Usas "${item.name}" — recuperas ${heal} HP`);
  }

  // ═══════════════════════════════════════════════════════
  // ORO
  // ═══════════════════════════════════════════════════════
  function renderGold() {
    const el = $('gold-amount');
    if (el) el.textContent = state.gold.toLocaleString('es');
  }

  function addGold(amount) {
    if (amount <= 0) return;
    state.gold += amount;
    lsSave('rpg_gold', String(state.gold));
    renderGold();
    addSystemMessage(`💰 +${amount.toLocaleString('es')} monedas de oro — Total: ${state.gold.toLocaleString('es')} mo`);
    logProgress(`Obtuvo ${amount} monedas de oro.`, 'objeto');
  }

  function removeGold(amount) {
    if (amount <= 0) return;
    state.gold = Math.max(0, state.gold - amount);
    lsSave('rpg_gold', String(state.gold));
    renderGold();
    addSystemMessage(`💸 -${amount.toLocaleString('es')} monedas de oro — Quedan: ${state.gold.toLocaleString('es')} mo`);
  }

  // ═══════════════════════════════════════════════════════
  // HECHIZOS
  // ═══════════════════════════════════════════════════════
  function isMagicClass(className) {
    return MAGIC_CLASS_SLUGS.has(_classSlug(className));
  }

  function updateSpellSection() {
    const cls = ($('char-class')?.value || state.charClass || '').trim();
    const el  = $('spell-section');
    if (el) el.style.display = isMagicClass(cls) ? '' : 'none';
  }

  function renderSpellSlots() {
    const cls   = ($('char-class')?.value || state.charClass || '').trim();
    const lvl   = parseInt($('char-level')?.value) || 1;
    const total = getSpellSlotMax(cls, lvl);
    const avail = Math.max(0, total - state.spellSlotsUsed);
    const el    = $('spell-slots-display');
    if (!el) return;
    if (total === 0) { el.innerHTML = ''; return; }
    const slug      = _classSlug(cls);
    const restLabel = slug === 'brujo' ? 'D.Corto' : 'D.Largo';
    let html = '<div class="slot-pips">';
    for (let i = 0; i < total; i++) {
      html += `<span class="slot-pip ${i < avail ? 'slot-available' : 'slot-used'}"></span>`;
    }
    html += `</div><span class="slots-label">${avail}/${total} · ${restLabel}</span>`;
    el.innerHTML = html;
  }

  function renderSpells() {
    const listEl  = $('known-spells-list');
    const emptyEl = $('spells-empty');
    if (!listEl) return;
    listEl.querySelectorAll('.spell-item').forEach(e => e.remove());
    updateSpellSection();

    const prepNameEl = $('prepared-spell-name');
    if (prepNameEl) prepNameEl.textContent = state.preparedSpell || '—';
    const castBtn = $('cast-spell-btn');
    if (castBtn) castBtn.disabled = !state.preparedSpell;

    if (emptyEl) emptyEl.style.display = state.spells.length === 0 ? 'block' : 'none';

    state.spells.forEach(spell => {
      const isPrepared = spell.name === state.preparedSpell;
      const isCantrip  = spell.tipo === 'cantrip';
      const el = document.createElement('div');
      el.className = `spell-item${isPrepared ? ' spell-prepared' : ''}`;
      el.dataset.id = spell.id;
      el.innerHTML = `
        <span class="spell-tipo-badge ${isCantrip ? 'badge-cantrip' : 'badge-hechizo'}">${isCantrip ? 'T' : 'H'}</span>
        <span class="spell-name">${escHtml(spell.name)}</span>
        <div class="spell-actions">
          <button type="button" class="spell-prepare-btn${isPrepared ? ' active' : ''}" data-id="${escHtml(spell.id)}" title="${isPrepared ? 'Preparado' : 'Preparar'}">${isPrepared ? '✦' : '◇'}</button>
          <button type="button" class="spell-del-btn" data-id="${escHtml(spell.id)}" aria-label="Eliminar hechizo">✕</button>
        </div>`;
      listEl.appendChild(el);
    });
    renderSpellSlots();
  }

  function addSpell(name, tipo) {
    if (!name) return;
    tipo = (tipo || 'nivel1').toLowerCase() === 'cantrip' ? 'cantrip' : 'nivel1';
    const already = state.spells.find(s => s.name.toLowerCase() === name.toLowerCase().trim());
    if (already) return;
    const id = 'spell_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5);
    state.spells.push({ id, name: name.trim(), tipo });
    saveGameState();
    renderSpells();
    addSystemMessage(`✨ Aprendes el hechizo: "${name.trim()}"`);
  }

  function removeSpell(name) {
    const lower = name.toLowerCase().trim();
    const idx = state.spells.findIndex(s => s.name.toLowerCase() === lower || s.name.toLowerCase().includes(lower));
    if (idx === -1) return;
    const removed = state.spells.splice(idx, 1)[0];
    if (state.preparedSpell === removed.name) state.preparedSpell = null;
    saveGameState();
    renderSpells();
    addSystemMessage(`☁ Olvidas el hechizo: "${removed.name}"`);
  }

  function prepareSpell(spellId) {
    const spell = state.spells.find(s => s.id === spellId);
    if (!spell) return;
    state.preparedSpell = spell.name === state.preparedSpell ? null : spell.name;
    saveGameState();
    renderSpells();
  }

  function useSpellSlot() {
    const cls   = ($('char-class')?.value || state.charClass || '').trim();
    const lvl   = parseInt($('char-level')?.value) || 1;
    const total = getSpellSlotMax(cls, lvl);
    if (state.spellSlotsUsed < total) {
      state.spellSlotsUsed++;
      lsSave('rpg_spell_slots_used', String(state.spellSlotsUsed));
      renderSpellSlots();
    }
  }

  function restoreSpellSlots() {
    state.spellSlotsUsed = 0;
    lsSave('rpg_spell_slots_used', '0');
    renderSpellSlots();
    addSystemMessage('🌙 Slots de hechizo restaurados.');
  }

  // ═══════════════════════════════════════════════════════
  // EFECTOS DE ESTADO (CONDICIONES)
  // ═══════════════════════════════════════════════════════
  const CONDITION_DEFS = {
    veneno:     { label: 'Envenenado',  emoji: '🤢', cls: 'cond-bad'     },
    aturdido:   { label: 'Aturdido',    emoji: '💫', cls: 'cond-bad'     },
    cegado:     { label: 'Cegado',      emoji: '🙈', cls: 'cond-bad'     },
    asustado:   { label: 'Asustado',    emoji: '😱', cls: 'cond-bad'     },
    hechizado:  { label: 'Hechizado',   emoji: '💜', cls: 'cond-neutral' },
    paralizado: { label: 'Paralizado',  emoji: '⚡', cls: 'cond-bad'     },
    quemado:    { label: 'Quemado',     emoji: '🔥', cls: 'cond-fire'    },
    bendecido:  { label: 'Bendecido',   emoji: '✨', cls: 'cond-good'    },
    maldito:    { label: 'Maldito',     emoji: '💀', cls: 'cond-curse'   },
    invisible:  { label: 'Invisible',   emoji: '👻', cls: 'cond-neutral' },
    atado:      { label: 'Atado',       emoji: '⛓',  cls: 'cond-bad'     },
    agotado:    { label: 'Agotado',     emoji: '😴', cls: 'cond-bad'     },
    concentrado:{ label: 'Concentrado', emoji: '🧘', cls: 'cond-good'    },
    protegido:  { label: 'Protegido',   emoji: '🛡', cls: 'cond-good'    },
  };

  function _normalizeCondKey(s) {
    return s.toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function renderConditions() {
    const barCombat = $('conditions-bar-combat');
    const badgesSheet = $('conditions-badges-sheet');
    const sheetRow = $('conditions-sheet-row');

    const html = state.conditions.map(key => {
      const def = CONDITION_DEFS[key];
      const label = def ? def.label : key;
      const emoji = def ? def.emoji : '⚑';
      const cls   = def ? def.cls  : 'cond-bad';
      return `<span class="condition-badge ${cls}" title="${label}">${emoji}<span class="cond-label">${label}</span></span>`;
    }).join('');

    if (barCombat) barCombat.innerHTML = html;
    if (badgesSheet) badgesSheet.innerHTML = html || '<span class="cond-none">—</span>';
    if (sheetRow) sheetRow.style.display = state.conditions.length > 0 ? 'flex' : 'none';
    _syncCsConditions();
  }

  function addCondition(raw) {
    const key = _normalizeCondKey(raw);
    if (state.conditions.includes(key)) return;
    state.conditions.push(key);
    lsSave('rpg_conditions', JSON.stringify(state.conditions));
    renderConditions();
    const def = CONDITION_DEFS[key];
    addSystemMessage(`⚑ ${def?.emoji || ''} Condición: **${def?.label || raw}** aplicada.`);
  }

  function removeCondition(raw) {
    const key = _normalizeCondKey(raw);
    const idx = state.conditions.indexOf(key);
    if (idx < 0) return;
    state.conditions.splice(idx, 1);
    lsSave('rpg_conditions', JSON.stringify(state.conditions));
    renderConditions();
    const def = CONDITION_DEFS[key];
    addSystemMessage(`✓ ${def?.emoji || ''} Condición: **${def?.label || raw}** eliminada.`);
  }

  // ═══════════════════════════════════════════════════════
  // REPUTACIÓN CON FACCIONES
  // ═══════════════════════════════════════════════════════
  function _factionStatus(v) {
    if (v >= 100) return { label: 'Leyenda',   cls: 'rep-legend',  desc: 'Puedes invocar sus soldados en combate' };
    if (v >=  75) return { label: 'Héroe',     cls: 'rep-hero',    desc: 'Te reciben con honores, descuentos y favores' };
    if (v >=  40) return { label: 'Aliado',    cls: 'rep-ally',    desc: 'Cuentan contigo, te ofrecen ayuda activa' };
    if (v >=  10) return { label: 'Amistoso',  cls: 'rep-friend',  desc: 'Te tratan bien, acceso a servicios normales' };
    if (v >= -10) return { label: 'Neutral',   cls: 'rep-neutral', desc: 'Sin relación especial, trato imparcial' };
    if (v >= -40) return { label: 'Hostil',    cls: 'rep-hostile', desc: 'Desconfianza, precios altos o acceso denegado' };
    if (v >= -75) return { label: 'Enemigo',   cls: 'rep-enemy',   desc: 'Atacan a la vista, tienen órdenes de captura' };
    return               { label: 'Buscado',   cls: 'rep-enemy',   desc: 'Recompensa por tu cabeza, ataque inmediato' };
  }

  function renderFactions() {
    const body  = $('factions-body');
    const empty = $('factions-empty');
    if (!body) return;

    const entries = Object.values(state.factions);
    if (entries.length === 0) {
      if (empty) empty.style.display = 'block';
      body.querySelectorAll('.faction-item').forEach(e => e.remove());
      return;
    }
    if (empty) empty.style.display = 'none';
    body.querySelectorAll('.faction-item').forEach(e => e.remove());

    _updateSummonBtn();
    entries.sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).forEach(f => {
      const status  = _factionStatus(f.value);
      const halfPct = (Math.abs(f.value) / 100) * 50; // 0–50% de la mitad
      const fillLeft  = f.value >= 0 ? 50 : (50 - halfPct);
      const fillWidth = halfPct;
      const item   = document.createElement('div');
      item.className = 'faction-item';
      item.innerHTML = `
        <div class="faction-name-row">
          <span class="faction-name">${escHtml(f.name)}</span>
          <span class="faction-status ${status.cls}" title="${escHtml(status.desc)}">${status.label}</span>
        </div>
        <div class="faction-bar-track" title="${escHtml(status.desc)}">
          <div class="faction-bar-fill ${status.cls}" style="left:${fillLeft.toFixed(1)}%;width:${fillWidth.toFixed(1)}%"></div>
          <div class="faction-bar-mid"></div>
        </div>
        <div class="faction-rep-row">
          <span class="faction-desc">${escHtml(status.desc)}</span>
          <span class="faction-value">${f.value > 0 ? '+' : ''}${f.value} / 100</span>
        </div>`;
      body.appendChild(item);
    });
  }

  function registerFaction(name) {
    if (!name) return;
    const key = name.toLowerCase().trim();
    if (state.factions[key]) return; // ya existe, no sobreescribir
    state.factions[key] = { name: name.trim(), value: 0 };
    lsSave('rpg_factions', JSON.stringify(state.factions));
    renderFactions();
    _updateSummonBtn();
    addSystemMessage(`⚜ Nueva facción registrada: ${name.trim()}`);
  }

  function updateFaction(name, delta) {
    if (!name || isNaN(delta)) return;
    const key = name.toLowerCase().trim();
    if (!state.factions[key]) state.factions[key] = { name: name.trim(), value: 0 };
    const prev = state.factions[key].value;
    state.factions[key].value = Math.max(-100, Math.min(100, prev + delta));
    lsSave('rpg_factions', JSON.stringify(state.factions));
    renderFactions();
    const arrow = delta > 0 ? '▲' : '▼';
    const status = _factionStatus(state.factions[key].value);
    addSystemMessage(`⚜ ${name}: ${arrow}${Math.abs(delta)} → ${status.label} (${state.factions[key].value > 0 ? '+' : ''}${state.factions[key].value})`);
    _updateSummonBtn();
  }

  function _getSummonableFactions() {
    return Object.values(state.factions).filter(f => f.value >= 100);
  }

  function _updateSummonBtn() {
    const btn = $('summon-allies-btn');
    if (!btn) return;
    const eligible = _getSummonableFactions();
    btn.style.display = (uiState.inCombat && eligible.length > 0) ? 'block' : 'none';
  }

  function _setCombatFocusMode(active) {
    const screen    = $('combat-screen');
    const inputSlot = $('cs-input-slot');
    const chatPanel = document.querySelector('.panel-chat');
    const inputArea = document.querySelector('.chat-input-area');

    if (active) {
      _populateCombatScreen();
      if (inputArea && inputSlot && !inputSlot.contains(inputArea)) {
        inputSlot.appendChild(inputArea);
      }
      screen?.classList.add('active');
      screen?.setAttribute('aria-hidden', 'false');
    } else {
      if (inputArea && chatPanel && !chatPanel.contains(inputArea)) {
        chatPanel.appendChild(inputArea);
      }
      screen?.classList.remove('active');
      screen?.setAttribute('aria-hidden', 'true');
      $('cs-death-overlay')?.classList.remove('visible');
    }
  }

  function _populateCombatScreen() {
    const playerName = $('char-name')?.value?.trim() || 'Aventurero';
    const cur = Math.max(0, parseInt(hpCurrent?.value) || 0);
    const max = Math.max(1, parseInt(hpMax?.value) || 1);
    const pct = Math.min(100, Math.round((cur / max) * 100));

    const csPlayerName   = $('cs-player-name');
    const csPlayerFill   = $('cs-player-hp-fill');
    const csPlayerText   = $('cs-player-hp-text');
    const csPlayerAvatar = $('cs-player-avatar');

    if (csPlayerName)   csPlayerName.textContent   = playerName;
    if (csPlayerText)   csPlayerText.textContent   = `${cur} / ${max}`;
    if (csPlayerFill) { csPlayerFill.style.width = pct + '%'; _csApplyHpColor(csPlayerFill, pct, false); }

    const srcEl = $('player-avatar-img');
    if (csPlayerAvatar && srcEl?.src) csPlayerAvatar.src = srcEl.src;

    _syncCsConditions();

    if (state.activeEnemy) {
      const e = state.activeEnemy;
      const csEnemyName   = $('cs-enemy-name');
      const csEnemyFill   = $('cs-enemy-hp-fill');
      const csEnemyText   = $('cs-enemy-hp-text');
      const csEnemyAvatar = $('cs-enemy-avatar');
      const eCur = e.hpCurrent ?? e.hpMax ?? 10;
      const eMax = e.hpMax ?? 10;
      const ePct = Math.min(100, Math.round((eCur / eMax) * 100));
      if (csEnemyName)   csEnemyName.textContent   = e.name || '—';
      if (csEnemyText)   csEnemyText.textContent   = `${eCur} / ${eMax}`;
      if (csEnemyFill) { csEnemyFill.style.width = ePct + '%'; _csApplyHpColor(csEnemyFill, ePct, true); }
      if (csEnemyAvatar && e.img) {
        csEnemyAvatar.src = e.img;
        csEnemyAvatar.onerror = () => { csEnemyAvatar.onerror = null; csEnemyAvatar.src = 'img/enemigos/goblin-1.png'; };
      }
    }

    const loc = state.currentLocation?.name;
    const csLoc = $('cs-location');
    if (csLoc) csLoc.textContent = loc ? `📍 ${loc}` : '';

    const msgs = $('cs-narration-messages');
    if (msgs) msgs.innerHTML = '';
  }

  function _csApplyHpColor(fill, pct, isEnemy) {
    if (pct > 60)      fill.style.background = isEnemy ? 'linear-gradient(90deg,#e74c3c,#c0392b)' : 'linear-gradient(90deg,#2ecc71,#27ae60)';
    else if (pct > 25) fill.style.background = isEnemy ? 'linear-gradient(90deg,#f39c12,#e67e22)' : 'linear-gradient(90deg,#f1c40f,#f39c12)';
    else               fill.style.background = isEnemy ? 'linear-gradient(90deg,#7d1010,#c0392b)' : 'linear-gradient(90deg,#b71c1c,#7d1010)';
  }

  function _syncCsConditions() {
    const container = $('cs-conditions');
    if (!container) return;
    container.innerHTML = state.conditions.map(key => {
      const def = CONDITION_DEFS[key];
      return def ? `<span class="cs-condition-badge" title="${escHtml(def.label)}">${def.emoji || key}</span>` : '';
    }).join('');
  }

  $('summon-allies-btn')?.addEventListener('click', () => {
    const eligible = _getSummonableFactions();
    if (!eligible.length) return;

    if (eligible.length === 1) {
      _invokeFactionAllies(eligible[0].name);
      return;
    }

    // Múltiples facciones — mostrar mini-menú
    const existing = $('summon-faction-menu');
    if (existing) { existing.remove(); return; }

    const menu = document.createElement('div');
    menu.id = 'summon-faction-menu';
    menu.className = 'summon-faction-menu';
    eligible.forEach(f => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'summon-faction-option';
      btn.textContent = f.name;
      btn.addEventListener('click', () => { menu.remove(); _invokeFactionAllies(f.name); });
      menu.appendChild(btn);
    });
    $('summon-allies-btn').insertAdjacentElement('afterend', menu);
  });

  function _invokeFactionAllies(factionName) {
    const inp = $('user-input');
    if (!inp) return;
    inp.value = `Invoco a los aliados de ${factionName} para que me ayuden en este combate.`;
    $('send-btn')?.click();
  }

  $('factions-toggle')?.addEventListener('click', () => {
    const body = $('factions-body');
    const btn  = $('factions-toggle');
    if (!body || !btn) return;
    const collapsed = body.classList.toggle('collapsed');
    btn.textContent = collapsed ? '▶' : '▼';
    btn.setAttribute('aria-expanded', String(!collapsed));
  });

  // ═══════════════════════════════════════════════════════
  // NOTAS DEL JUGADOR
  // ═══════════════════════════════════════════════════════
  const playerNotesEl  = $('player-notes');
  const notesCounterEl = $('notes-char-count');
  let _notesSaveTimer  = null;

  function _updateNotesCounter() {
    if (notesCounterEl && playerNotesEl) {
      notesCounterEl.textContent = playerNotesEl.value.length;
    }
  }

  if (playerNotesEl) {
    playerNotesEl.value = state.playerNotes;
    _updateNotesCounter();
    playerNotesEl.addEventListener('input', () => {
      state.playerNotes = playerNotesEl.value;
      _updateNotesCounter();
      clearTimeout(_notesSaveTimer);
      _notesSaveTimer = setTimeout(() => {
        lsSave('rpg_player_notes', state.playerNotes);
      }, 600);
    });
  }

  $('notes-toggle')?.addEventListener('click', () => {
    const body = $('notes-body');
    const btn  = $('notes-toggle');
    if (!body || !btn) return;
    const collapsed = body.classList.toggle('collapsed');
    btn.textContent = collapsed ? '▶' : '▼';
    btn.setAttribute('aria-expanded', String(!collapsed));
  });

  // Evento: lista de hechizos conocidos (preparar / eliminar)
  $('known-spells-list')?.addEventListener('click', e => {
    const prepBtn = e.target.closest('.spell-prepare-btn');
    const delBtn  = e.target.closest('.spell-del-btn');
    if (prepBtn) prepareSpell(prepBtn.dataset.id);
    if (delBtn) {
      const spell = state.spells.find(s => s.id === delBtn.dataset.id);
      if (spell) removeSpell(spell.name);
    }
  });

  // Botón "Canalizar": rellena el input con el nombre del hechizo
  $('cast-spell-btn')?.addEventListener('click', () => {
    if (!state.preparedSpell) return;
    const spell     = state.spells.find(s => s.name === state.preparedSpell);
    const isCantrip = spell?.tipo === 'cantrip';
    const prefix    = `Lanzo "${state.preparedSpell}" `;
    const current   = playerInput?.value.trim() || '';
    if (playerInput) { playerInput.value = current ? current + ' ' + prefix : prefix; playerInput.focus(); }
    if (!isCantrip) addSystemMessage(`⚡ Canalizando "${state.preparedSpell}"...`);
  });

  // Botón "Descanso": recupera todos los slots
  $('rest-spell-btn')?.addEventListener('click', restoreSpellSlots);

  // ═══════════════════════════════════════════════════════
  // TIENDA / MERCADER
  // ═══════════════════════════════════════════════════════
  function showShop(items) {
    state.shopItems = items;
    const list = $('shop-items-list');
    const emptyEl = $('shop-empty');
    if (!list) return;
    list.querySelectorAll('.shop-item').forEach(e => e.remove());

    if (emptyEl) emptyEl.style.display = items.length === 0 ? 'block' : 'none';

    items.forEach(item => {
      const canAfford = state.gold >= item.price;
      const el = document.createElement('div');
      el.className = `shop-item${canAfford ? '' : ' shop-item-broke'}`;
      el.dataset.id = item.id;
      const typeIcon = { arma:'⚔', armadura:'🛡', accesorio:'💍', consumible:'🧪', pocion:'🧪', herramienta:'🔧', magico:'✨', misc:'📦' }[item.tipo] || '📦';
      el.innerHTML = `
        <span class="shop-item-icon">${typeIcon}</span>
        <div class="shop-item-info">
          <span class="shop-item-name">${escHtml(item.name)}</span>
          <span class="shop-item-price">🪙 ${item.price} mo</span>
        </div>
        <button type="button" class="shop-buy-btn" data-id="${escHtml(item.id)}" ${canAfford ? '' : 'disabled'} title="${canAfford ? 'Comprar' : 'Oro insuficiente'}">
          ${canAfford ? 'Comprar' : 'Sin oro'}
        </button>`;
      list.appendChild(el);
    });

    const goldEl = $('shop-gold-display');
    if (goldEl) goldEl.textContent = `${state.gold.toLocaleString('es')} mo`;

    const overlay = $('shop-overlay');
    if (overlay) { overlay.style.display = 'flex'; overlay.setAttribute('aria-hidden', 'false'); }
  }

  function hideShop() {
    const overlay = $('shop-overlay');
    if (overlay) { overlay.style.display = 'none'; overlay.setAttribute('aria-hidden', 'true'); }
  }

  function buyItem(itemId) {
    const item = state.shopItems.find(i => i.id === itemId);
    if (!item) return;
    if (state.gold < item.price) { addSystemMessage('💸 No tienes suficiente oro.'); return; }
    removeGold(item.price);
    addInventoryItem(item.name);
    state.shopItems = state.shopItems.filter(i => i.id !== itemId);
    showShop(state.shopItems);
  }

  $('shop-overlay')?.addEventListener('click', e => {
    if (e.target.id === 'shop-overlay' || e.target.closest('#shop-close')) hideShop();
    const buyBtn = e.target.closest('.shop-buy-btn');
    if (buyBtn) buyItem(buyBtn.dataset.id);
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && $('shop-overlay')?.style.display === 'flex') hideShop();
  });

  $('npc-shop-btn')?.addEventListener('click', () => {
    if (state.isStreaming) return;
    playerInput.value = '¿Qué tienes para vender?';
    playerInput.dispatchEvent(new Event('input'));
    sendBtn.click();
  });

  // ═══════════════════════════════════════════════════════
  // DIARIO DE MISIONES
  // ═══════════════════════════════════════════════════════
  function renderQuests() {
    if (!questActiveList || !questCompletedList) return;
    questActiveList.innerHTML    = '';
    questCompletedList.innerHTML = '';

    const active    = state.quests.filter(q => q.status === 'active');
    const completed = state.quests.filter(q => q.status === 'completed');

    if (questEmpty) questEmpty.style.display = state.quests.length === 0 ? 'block' : 'none';

    active.forEach(q => {
      const el = document.createElement('div');
      el.className = 'quest-item quest-active';
      el.innerHTML = `<span class="quest-dot"></span><span class="quest-title">${escHtml(q.title)}</span>`;
      questActiveList.appendChild(el);
    });

    completed.forEach(q => {
      const el = document.createElement('div');
      el.className = 'quest-item quest-completed';
      el.innerHTML = `<span class="quest-check">✓</span><span class="quest-title">${escHtml(q.title)}</span>`;
      questCompletedList.appendChild(el);
    });
  }

  function addQuest(title) {
    const already = state.quests.find(q => q.title.toLowerCase() === title.toLowerCase().trim());
    if (already) return;
    state.quests.push({ id: 'quest_' + Date.now(), title: title.trim(), status: 'active' });
    renderQuests();
    saveGameState();
    addSystemMessage(`📜 Nueva misión: "${title.trim()}"`);
    logProgress(`Aceptó la misión: "${title.trim()}".`, 'mision');
  }

  function completeQuest(title) {
    const lower = title.toLowerCase().trim();
    const quest = state.quests.find(
      q => q.title.toLowerCase() === lower || q.title.toLowerCase().includes(lower)
    );
    if (quest && quest.status !== 'completed') {
      quest.status = 'completed';
      renderQuests();
      saveGameState();
      addSystemMessage(`✓ Misión completada: "${quest.title}"`);
      logProgress(`Completó la misión: "${quest.title}".`, 'mision');
    }
  }

  // Toggle diario
  const questToggle = $('quest-toggle');
  const questBody   = $('quest-body');
  if (questToggle && questBody) {
    if (window.innerWidth < 768) {
      questBody.classList.add('collapsed');
      questToggle.textContent = '▶';
      questToggle.setAttribute('aria-expanded', 'false');
    }
    questToggle.addEventListener('click', () => {
      const collapsed = questBody.classList.toggle('collapsed');
      questToggle.textContent = collapsed ? '▶' : '▼';
      questToggle.setAttribute('aria-expanded', String(!collapsed));
    });
  }

  // ═══════════════════════════════════════════════════════
  // MENSAJES EN EL CHAT
  // ═══════════════════════════════════════════════════════
  function getCharInitials() {
    const n = $('char-name').value.trim();
    return n ? n.substring(0, 2).toUpperCase() : 'AV';
  }

  function addPlayerMessage(text, save = true) {
    const el = document.createElement('div');
    el.className = 'message player-message';
    el.innerHTML = `
      <div class="msg-avatar">${escHtml(getCharInitials())}</div>
      <div class="msg-body"><p>${escHtml(text)}</p></div>`;
    chatMessages.appendChild(el);
    scrollBottom();
    if (save) { state.chatLog.push({ type: 'player', content: text }); saveChatLog(); }
    if (uiState.inCombat) {
      const csEl = document.createElement('div');
      csEl.className = 'cs-narration-msg cs-narration-player';
      csEl.innerHTML = `
        <div class="cs-msg-avatar">${escHtml(getCharInitials())}</div>
        <div class="cs-msg-body"><p>${escHtml(text)}</p></div>`;
      const msgs = $('cs-narration-messages');
      if (msgs) { msgs.appendChild(csEl); msgs.scrollTop = msgs.scrollHeight; }
    }
  }

  function addDmMessage(html, save = true) {
    const el = document.createElement('div');
    el.className = 'message dm-message';
    el.innerHTML = `<div class="msg-avatar">DM</div><div class="msg-body">${html}</div>`;
    chatMessages.appendChild(el);
    scrollBottom();
    if (save) { state.chatLog.push({ type: 'dm', html }); saveChatLog(); }
  }

  function createDmStreamMessage() {
    const el = document.createElement('div');
    el.className = 'message dm-message';
    el.innerHTML = `
      <div class="msg-avatar">DM</div>
      <div class="msg-body dm-streaming">
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
      </div>`;
    chatMessages.appendChild(el);
    scrollBottom();
    const body = el.querySelector('.dm-streaming');
    if (uiState.inCombat) {
      const csEl = document.createElement('div');
      csEl.className = 'cs-narration-msg cs-narration-dm';
      csEl.innerHTML = `
        <div class="cs-msg-avatar">DM</div>
        <div class="cs-msg-body cs-streaming">
          <span class="typing-dot"></span>
          <span class="typing-dot"></span>
          <span class="typing-dot"></span>
        </div>`;
      const msgs = $('cs-narration-messages');
      if (msgs) { msgs.appendChild(csEl); msgs.scrollTop = msgs.scrollHeight; }
      body._csMirror = csEl.querySelector('.cs-streaming');
    }
    return body;
  }

  function addSystemMessage(text, save = true) {
    const el = document.createElement('div');
    el.className = 'message system-message';
    el.innerHTML = `<div class="msg-body"><p>${escHtml(text)}</p></div>`;
    chatMessages.appendChild(el);
    scrollBottom();
    if (save) { state.chatLog.push({ type: 'system', content: text }); saveChatLog(); }
  }

  function scrollBottom() { chatMessages.scrollTop = chatMessages.scrollHeight; }

  // ═══════════════════════════════════════════════════════
  // EFECTO MÁQUINA DE ESCRIBIR
  // ═══════════════════════════════════════════════════════
  let _completeTypewriter = null;

  function typeWriterEffect(element, html, speed = 18) {
    // Completar cualquier efecto previo antes de iniciar uno nuevo
    if (_completeTypewriter) { _completeTypewriter(); }

    element.innerHTML = html;

    // Recopilar todos los nodos de texto del árbol DOM renderizado
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) {
      if (n.textContent) nodes.push({ node: n, original: n.textContent });
    }
    if (!nodes.length) return;

    // Ocultar todo el texto
    nodes.forEach(({ node }) => { node.textContent = ''; });

    let active = true;
    let ti = 0, ci = 0;
    let tid = null;

    function complete() {
      if (!active) return;
      active = false;
      if (tid) clearTimeout(tid);
      nodes.forEach(({ node, original }) => { node.textContent = original; });
      scrollBottom();
      _completeTypewriter = null;
      document.removeEventListener('touchstart', onSkip);
    }

    function onSkip(e) {
      if (!e.target.closest('button, .roll-btn, .item-use-btn, .item-del-btn')) complete();
    }

    _completeTypewriter = complete;
    document.addEventListener('touchstart', onSkip, { passive: true });
    element.addEventListener('click', complete, { once: true });

    function tick() {
      if (!active) return;
      if (ti >= nodes.length) { complete(); return; }

      const { node, original } = nodes[ti];
      node.textContent = original.slice(0, ci + 1);
      const ch = original[ci] || '';
      ci++;
      if (ci >= original.length) { ti++; ci = 0; }

      const delay = /[.!?…]/.test(ch) ? speed * 5
                  : /[,;:\n]/.test(ch) ? speed * 2
                  : speed;

      scrollBottom();
      tid = setTimeout(tick, delay);
    }

    tick();
  }

  function updateStats() {
    const total = chatMessages.querySelectorAll('.message:not(.system-message)').length;
    msgCount.textContent = total;
    const chars = (worldLore.value.length + storySummary.value.length + 800 + state.history.length * 120);
    tokenCount.textContent = `~${Math.round(chars / 4).toLocaleString()}`;
  }

  // ═══════════════════════════════════════════════════════
  // PERSISTENCIA — CHAT LOG Y ESTADO DE JUEGO
  // ═══════════════════════════════════════════════════════
  function saveChatLog() {
    const _doSave = () => {
      localStorage.setItem('rpg_chat_log',       JSON.stringify(state.chatLog));
      localStorage.setItem('rpg_api_history',    JSON.stringify(state.history));
      localStorage.setItem('rpg_campaign_diary', state.campaignDiary);
    };
    try {
      _doSave();
    } catch {
      // localStorage lleno — recortar el historial visible y reintentar
      if (state.chatLog.length > 80) {
        state.chatLog = state.chatLog.slice(-80);
      }
      try { _doSave(); } catch { console.warn('localStorage lleno — guardado fallido.'); }
    }
  }

  function saveGameState() {
    try {
      localStorage.setItem('rpg_inventory_items', JSON.stringify(state.inventory));
      localStorage.setItem('rpg_quests',          JSON.stringify(state.quests));
      localStorage.setItem('rpg_npc_log',         JSON.stringify(state.npcLog));
      localStorage.setItem('rpg_location_log',    JSON.stringify(state.locationLog));
      localStorage.setItem('rpg_moral_log',       JSON.stringify(state.moralLog));
      localStorage.setItem('rpg_player_stats',    JSON.stringify(state.playerStats));
      localStorage.setItem('rpg_npc_names',       JSON.stringify(state.npcNames));
      localStorage.setItem('rpg_current_location', JSON.stringify(state.currentLocation));
      localStorage.setItem('rpg_world_state',      JSON.stringify(state.worldState));
      localStorage.setItem('rpg_equipment',         JSON.stringify(state.equipment));
      localStorage.setItem('rpg_puntos_disponibles', String(state.puntosDisponibles));
      localStorage.setItem('rpg_gold', String(state.gold));
      localStorage.setItem('rpg_spells', JSON.stringify(state.spells));
      localStorage.setItem('rpg_prepared_spell', state.preparedSpell || '');
      localStorage.setItem('rpg_spell_slots_used', String(state.spellSlotsUsed));
      if (state.pendingRoll) localStorage.setItem('rpg_pending_roll', JSON.stringify(state.pendingRoll));
      else                   localStorage.removeItem('rpg_pending_roll');
      localStorage.setItem('rpg_conditions',   JSON.stringify(state.conditions));
      localStorage.setItem('rpg_factions',     JSON.stringify(state.factions));
      localStorage.setItem('rpg_player_notes', state.playerNotes);
    } catch { console.warn('localStorage lleno — estado del juego no guardado.'); }
  }

  function loadChatLog() {
    try {
      state.chatLog      = JSON.parse(localStorage.getItem('rpg_chat_log')    || '[]');
      state.history      = JSON.parse(localStorage.getItem('rpg_api_history') || '[]');
      state.campaignDiary = localStorage.getItem('rpg_campaign_diary') || '';
    } catch { state.chatLog = []; state.history = []; state.campaignDiary = ''; }
  }

  function loadGameState() {
    try {
      state.inventory   = JSON.parse(localStorage.getItem('rpg_inventory_items') || '[]');
      state.quests      = JSON.parse(localStorage.getItem('rpg_quests')           || '[]');
      const pr          = localStorage.getItem('rpg_pending_roll');
      state.pendingRoll = pr ? JSON.parse(pr) : null;
    } catch {
      state.inventory   = [];
      state.quests      = [];
      state.pendingRoll = null;
    }
    // Cargar log de progreso y crónica estructurada
    try { state.progressLog = JSON.parse(localStorage.getItem('rpg_progress_log') || '[]'); }
    catch(e) { state.progressLog = []; }
    try { state.npcLog      = JSON.parse(localStorage.getItem('rpg_npc_log')      || '{}'); }
    catch(e) { state.npcLog = {}; }
    try { state.locationLog = JSON.parse(localStorage.getItem('rpg_location_log') || '{}'); }
    catch(e) { state.locationLog = {}; }
    try { state.moralLog    = JSON.parse(localStorage.getItem('rpg_moral_log')    || '[]'); }
    catch(e) { state.moralLog = []; }
    try { state.npcNames       = JSON.parse(localStorage.getItem('rpg_npc_names')       || '{}'); }
    catch(e) { state.npcNames = {}; }
    try { state.currentLocation = JSON.parse(localStorage.getItem('rpg_current_location') || 'null'); }
    catch(e) { state.currentLocation = null; }
    try { state.worldState = JSON.parse(localStorage.getItem('rpg_world_state') || '{}'); }
    catch(e) { state.worldState = {}; }
    try { state.equipment = JSON.parse(localStorage.getItem('rpg_equipment') || '{"arma":null,"armadura":null,"accesorio":null}'); }
    catch(e) { state.equipment = { arma: null, armadura: null, accesorio: null }; }
    state.puntosDisponibles = parseInt(localStorage.getItem('rpg_puntos_disponibles') || '0') || 0;
    state.gold = parseInt(localStorage.getItem('rpg_gold') || '0') || 0;
    try { state.spells = JSON.parse(localStorage.getItem('rpg_spells') || '[]'); } catch { state.spells = []; }
    state.preparedSpell  = localStorage.getItem('rpg_prepared_spell') || null;
    if (state.preparedSpell === '') state.preparedSpell = null;
    state.spellSlotsUsed = parseInt(localStorage.getItem('rpg_spell_slots_used') || '0') || 0;
    try { state.conditions    = JSON.parse(localStorage.getItem('rpg_conditions') || '[]'); }   catch { state.conditions = []; }
    try { state.factions      = JSON.parse(localStorage.getItem('rpg_factions')   || '{}'); }   catch { state.factions = {}; }
    state.playerNotes = localStorage.getItem('rpg_player_notes') || '';
    // Cargar puntos ASI — con migración automática desde saves antiguos
    try {
      const rawPS = localStorage.getItem('rpg_player_stats');
      if (rawPS) {
        state.playerStats = JSON.parse(rawPS);
      } else {
        // Migración: reconstruir bonus = valor guardado − base de clase
        const cls     = localStorage.getItem('rpg_char-class') || '';
        const clsData = window.CLASE_STATS?.[cls] || {};
        ['str','dex','con','int','wis','cha'].forEach(id => {
          const saved = parseInt(localStorage.getItem(`rpg_stat-${id}`) ?? '10') || 10;
          const base  = clsData[STAT_TO_ES[id]] ?? 10;
          state.playerStats[id] = Math.max(0, saved - base);
        });
        lsSave('rpg_player_stats', JSON.stringify(state.playerStats));
      }
    } catch(e) { state.playerStats = { str:0, dex:0, con:0, int:0, wis:0, cha:0 }; }

    // Migración: si no hay items array pero sí textarea, parsear líneas
    if (state.inventory.length === 0) {
      const textVal = localStorage.getItem('rpg_inventory') || '';
      const lines   = textVal.split('\n').filter(l => l.trim());
      lines.forEach(line => {
        state.inventory.push({
          id: 'item_legacy_' + Math.random().toString(36).slice(2),
          name: line.trim(),
          isConsumable: isConsumable(line),
        });
      });
      if (lines.length > 0) saveGameState();
    }
  }

  function renderChatLog(log) {
    chatMessages.innerHTML = '';
    for (const entry of log) {
      if (entry.type === 'player') {
        const el = document.createElement('div');
        el.className = 'message player-message';
        el.innerHTML = `
          <div class="msg-avatar">${escHtml(getCharInitials())}</div>
          <div class="msg-body"><p>${escHtml(entry.content)}</p></div>`;
        chatMessages.appendChild(el);
      } else if (entry.type === 'dm') {
        const el = document.createElement('div');
        el.className = 'message dm-message';
        el.innerHTML = `<div class="msg-avatar">DM</div><div class="msg-body">${entry.html}</div>`;
        chatMessages.appendChild(el);
      } else if (entry.type === 'system') {
        const el = document.createElement('div');
        el.className = 'message system-message';
        el.innerHTML = `<div class="msg-body"><p>${escHtml(entry.content)}</p></div>`;
        chatMessages.appendChild(el);
      } else if (entry.type === 'image') {
        const el = document.createElement('div');
        el.className = 'message dm-message';
        el.innerHTML = `
          <div class="msg-avatar">🔮</div>
          <div class="msg-body">
            <img src="${escHtml(entry.url)}"
                 alt="${escHtml((entry.prompt || '').replace(/-/g, ' '))}"
                 class="chat-image" loading="lazy" />
          </div>`;
        chatMessages.appendChild(el);
      }
    }
    scrollBottom();
  }

  // ═══════════════════════════════════════════════════════
  // BESTIARIO — búsqueda por ID o nombre
  // ═══════════════════════════════════════════════════════

  // Alias para IDs de NPC que la IA puede usar de forma distinta al bestiario
  const NPC_ALIASES = {
    comerciante: 'mercader-oscuro', tienda: 'mercader-oscuro', vendedor: 'mercader-oscuro',
    merchant: 'mercader-oscuro', shopkeeper: 'mercader-oscuro',
    guardia: 'guardia-puerta', guard: 'guardia-puerta', soldado: 'guardia-de-caminos',
    centinela: 'guardia-puerta', vigilante: 'guardia-puerta',
    capitan: 'capitan-de-la-guardia', capitán: 'capitan-de-la-guardia',
    rey: 'rey', king: 'rey', monarca: 'rey', principe: 'rey', príncipe: 'rey', noble: 'rey',
    sacerdote: 'sacerdotisa', sacerdotisa: 'sacerdotisa', priest: 'sacerdotisa', cura: 'sacerdotisa',
    tabernero: 'tabernero', posadero: 'tabernero', tavern: 'tabernero',
    herrero: 'herrero', smith: 'herrero', blacksmith: 'herrero',
    mago: 'alquimista', maga: 'alquimista', alquimista: 'alquimista', wizard: 'alquimista',
    alcalde: 'alcalde', mayor: 'alcalde',
    viajero: 'viajero-tierras-lejanas', traveler: 'viajero-tierras-lejanas',
    asesino: 'asesino', assassin: 'asesino',
    caballero: 'caballero-veterano', knight: 'caballero-veterano',
    huerfano: 'huerfano', orphan: 'huerfano', niño: 'huerfano',
    nina: 'nina-mistica', niña: 'nina-mistica', girl: 'nina-mistica',
    paladin: 'paladin-espectral', paladín: 'paladin-espectral', fantasma: 'paladin-espectral',
    bufon: 'buffon', bufón: 'buffon', jester: 'buffon',
  };

  function lookupNpcByName(id) {
    if (!id) return null;
    const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g,'-');
    const key = norm(id);
    // Búsqueda directa
    if (bestiario.npcs[key]) return { id: key, ...bestiario.npcs[key] };
    // Alias exacto
    const aliased = NPC_ALIASES[key];
    if (aliased && bestiario.npcs[aliased]) return { id: aliased, ...bestiario.npcs[aliased] };
    // Alias parcial (la IA puede usar "guardia-de-la-ciudad")
    for (const [alias, target] of Object.entries(NPC_ALIASES)) {
      if (key.includes(alias) || alias.includes(key)) {
        if (bestiario.npcs[target]) return { id: target, ...bestiario.npcs[target] };
      }
    }
    // Búsqueda parcial en claves del bestiario
    for (const [bKey, data] of Object.entries(bestiario.npcs)) {
      if (key.includes(bKey) || bKey.includes(key)) return { id: bKey, ...data };
    }
    // Búsqueda por nombre de NPC
    for (const [bKey, data] of Object.entries(bestiario.npcs)) {
      const bn = norm(data.nombre || '');
      if (key.includes(bn) || bn.includes(key)) return { id: bKey, ...data };
    }
    return null;
  }

  function lookupEnemyByName(name) {
    if (!name || !Object.keys(bestiario.enemigos).length) return null;
    const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const input = norm(name);
    if (bestiario.enemigos[input]) return { id: input, ...bestiario.enemigos[input] };
    for (const [key, data] of Object.entries(bestiario.enemigos)) {
      const bn = norm(data.nombre);
      if (input.includes(bn) || bn.includes(input)) return { id: key, ...data };
    }
    for (const [key, data] of Object.entries(bestiario.enemigos)) {
      if (input.includes(key) || key.includes(input.replace(/[^a-z0-9-]/g, ''))) return { id: key, ...data };
    }
    return null;
  }

  function getEnemyImageUrl(enemyNameOrId) {
    const found = bestiario.enemigos[enemyNameOrId] || lookupEnemyByName(enemyNameOrId);
    if (found) return found.img;
    // Fallback al mapa estático para compatibilidad con sesiones antiguas
    const name = (enemyNameOrId || '').toLowerCase();
    const imageMap = {
      goblin: 'img/enemigos/goblin-1.png', skeleton: 'img/enemigos/skeletor.png',
      esqueleto: 'img/enemigos/skeletor.png', spider: 'img/enemigos/arana.png',
      arana: 'img/enemigos/arana.png', orc: 'img/enemigos/orc.png',
      troll: 'img/enemigos/troll.png', dragon: 'img/enemigos/dragon.png',
      demonio: 'img/enemigos/demonio.png', vampire: 'img/enemigos/vampire.png',
      vampiro: 'img/enemigos/vampire.png', zombie: 'img/enemigos/zombie.png',
      golem: 'img/enemigos/golem.png', 'hombre-lobo': 'img/enemigos/hombre-lobo.png',
      lobo: 'img/enemigos/hombre-lobo.png', gargola: 'img/enemigos/gargola.png',
      caballero: 'img/enemigos/caballero.png', minotauro: 'img/enemigos/minotauro.png',
      nigromante: 'img/enemigos/nigromante.png',
    };
    for (const [key, path] of Object.entries(imageMap)) {
      if (name.includes(key)) return path;
    }
    return 'img/enemigos/goblin-1.png';
  }

  // \u2500 Progresi\u00f3n de clase: imagen + t\u00edtulo por niveles \u2500\u2500
  const CLASS_PROGRESSION = {
    'guerrero':   [
      { from: 1,  file: 'guerrero_base',    title: 'Guerrero'            },
      { from: 6,  file: 'guerrero_medio',   title: 'Veterano'            },
      { from: 13, file: 'guerrero_final',   title: 'Campe\u00f3n'             },
    ],
    'mago':       [
      { from: 1,  file: 'mago_base',        title: 'Mago Aprendiz'       },
      { from: 6,  file: 'mago_medio',       title: 'Mago'                },
      { from: 13, file: 'mago_final',       title: 'Archimago'           },
    ],
    'picaro':     [
      { from: 1,  file: 'picaro_base',      title: 'P\u00edcaro'              },
      { from: 6,  file: 'picaro_medio',     title: 'Ladr\u00f3n de Sombras'   },
      { from: 13, file: 'picaro_final',     title: 'Maestro Asesino'     },
    ],
    'clerigo':    [
      { from: 1,  file: 'clerigo_base',     title: 'Ac\u00f3lito'             },
      { from: 6,  file: 'clerigo_medio',    title: 'Cl\u00e9rigo'             },
      { from: 13, file: 'clerigo_final',    title: 'Sumo Sacerdote'      },
    ],
    'paladin':    [
      { from: 1,  file: 'paladin_base',     title: 'Escudero'            },
      { from: 6,  file: 'paladin_medio',    title: 'Palad\u00edn'             },
      { from: 13, file: 'paladin_final',    title: 'Caballero Sagrado'   },
    ],
    'barbaro':    [
      { from: 1,  file: 'barbaro_base',     title: 'B\u00e1rbaro'             },
      { from: 6,  file: 'barbaro_medio',    title: 'Berserker'           },
      { from: 13, file: 'barbaro_final',    title: 'Se\u00f1or de la Guerra'  },
    ],
    'bardo':      [
      { from: 1,  file: 'bardo_base',       title: 'Juglar'              },
      { from: 6,  file: 'bardo_medio',      title: 'Bardo'               },
      { from: 13, file: 'bardo_final',      title: 'Gran Trovador'       },
    ],
    'druida':     [
      { from: 1,  file: 'druida_base',      title: 'Druida Novicio'      },
      { from: 6,  file: 'druida_medio',     title: 'Druida'              },
      { from: 13, file: 'druida_final',     title: 'Archidruida'         },
    ],
    'explorador': [
      { from: 1,  file: 'explorador_base',  title: 'Rastreador'          },
      { from: 6,  file: 'explorador_medio', title: 'Explorador'          },
      { from: 13, file: 'explorador_final', title: 'Se\u00f1or del Bosque'    },
    ],
    'monje':      [
      { from: 1,  file: 'monje_base',       title: 'Novicio'             },
      { from: 6,  file: 'monje_medio',      title: 'Monje'               },
      { from: 13, file: 'monje_final',      title: 'Gran Maestro'        },
    ],
    'brujo':      [
      { from: 1,  file: 'brujo_base',       title: 'Iniciado'            },
      { from: 6,  file: 'brujo_medio',      title: 'Brujo'               },
      { from: 13, file: 'brujo_final',      title: 'Se\u00f1or de los Pactos' },
    ],
    'hechicero':  [
      { from: 1,  file: 'hechicero_base',   title: 'Aprendiz Arcano'     },
      { from: 6,  file: 'hechicero_medio',  title: 'Hechicero'           },
      { from: 13, file: 'hechicero_final',  title: 'Maestro Arcano'      },
    ],
  };

  function _classSlug(name) {
    return (name || '').trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  }

  function _classEntry(className, level) {
    const entries = CLASS_PROGRESSION[_classSlug(className)];
    if (!entries) return null;
    let match = entries[0];
    for (const e of entries) { if (level >= e.from) match = e; }
    return match;
  }

  function getClassTitle(className, level) {
    return _classEntry(className, level)?.title ?? (className || '');
  }

  function getPlayerAvatarUrl(className, level) {
    const entry = _classEntry(className, level);
    if (entry) return `img/protagonistas/${entry.file}.png`;
    const slug = _classSlug(className);
    return slug ? `img/protagonistas/${slug}.png` : 'img/protagonistas/guerrero_base.png';
  }

  function updatePlayerAvatar() {
    const imgEl       = $('player-sheet-avatar-img');
    const combatImgEl = $('player-avatar-img');
    const cls   = ($('char-class')?.value || state.charClass || '').trim();
    const level = parseInt($('char-level')?.value) || 1;
    const url   = getPlayerAvatarUrl(cls, level);

    if (imgEl) {
      imgEl.src = url;
      imgEl.onerror = () => { imgEl.onerror = null; imgEl.src = 'img/protagonistas/guerrero_base.png'; };
    }
    if (combatImgEl) {
      combatImgEl.src = url;
      combatImgEl.onerror = () => { combatImgEl.onerror = null; combatImgEl.src = 'img/protagonistas/guerrero_base.png'; };
    }

    const badge = $('class-title-badge');
    if (badge) {
      const title = getClassTitle(cls, level);
      badge.textContent = title;
      badge.style.display = title ? '' : 'none';
    }
  }

  // ── Config de clases mágicas ──────────────────────────────
  const MAGIC_CLASS_SLUGS = new Set(['mago','clerigo','paladin','bardo','druida','hechicero','brujo']);

  const CLASS_STARTING_SPELLS = {
    'mago':      [
      { name: 'Rayo de Escarcha',    tipo: 'cantrip' },
      { name: 'Prestidigitación',    tipo: 'cantrip' },
      { name: 'Proyectil Mágico',    tipo: 'nivel1'  },
      { name: 'Dormir',              tipo: 'nivel1'  },
      { name: 'Escudo Arcano',       tipo: 'nivel1'  },
    ],
    'clerigo':   [
      { name: 'Guía',                tipo: 'cantrip' },
      { name: 'Sagrado',             tipo: 'cantrip' },
      { name: 'Curar Heridas',       tipo: 'nivel1'  },
      { name: 'Bendición',           tipo: 'nivel1'  },
      { name: 'Detectar el Mal',     tipo: 'nivel1'  },
    ],
    'paladin':   [
      { name: 'Favor Divino',        tipo: 'nivel1'  },
      { name: 'Escudo de la Fe',     tipo: 'nivel1'  },
      { name: 'Curar Heridas',       tipo: 'nivel1'  },
    ],
    'bardo':     [
      { name: 'Burla Viciosa',       tipo: 'cantrip' },
      { name: 'Luz',                 tipo: 'cantrip' },
      { name: 'Curar Heridas',       tipo: 'nivel1'  },
      { name: 'Hechizar Persona',    tipo: 'nivel1'  },
      { name: 'Detectar Magia',      tipo: 'nivel1'  },
    ],
    'druida':    [
      { name: 'Druidismo',           tipo: 'cantrip' },
      { name: 'Producir Llama',      tipo: 'cantrip' },
      { name: 'Enredar',             tipo: 'nivel1'  },
      { name: 'Curar Heridas',       tipo: 'nivel1'  },
      { name: 'Hablar con Animales', tipo: 'nivel1'  },
    ],
    'hechicero': [
      { name: 'Chispa de Fuego',     tipo: 'cantrip' },
      { name: 'Rayo de Escarcha',    tipo: 'cantrip' },
      { name: 'Manos Ardientes',     tipo: 'nivel1'  },
      { name: 'Proyectil Mágico',    tipo: 'nivel1'  },
      { name: 'Escudo Arcano',       tipo: 'nivel1'  },
    ],
    'brujo':     [
      { name: 'Toque Escalofriante', tipo: 'cantrip' },
      { name: 'Rayo Eldritch',       tipo: 'cantrip' },
      { name: 'Maldición Hexed',     tipo: 'nivel1'  },
      { name: 'Armadura de Ágathys', tipo: 'nivel1'  },
      { name: 'Invocar Sombras',     tipo: 'nivel1'  },
    ],
  };

  function getSpellSlotMax(className, level) {
    const slug = _classSlug(className);
    if (!MAGIC_CLASS_SLUGS.has(slug)) return 0;
    if (slug === 'paladin') {
      const tbl = [0,0,2,3,3,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4];
      return tbl[Math.min(level, 20)];
    }
    if (slug === 'brujo') return Math.min(4, 1 + Math.floor((level - 1) / 4));
    const tbl = [0,2,3,4,4,5,6,6,7,8,8,9,9,10,10,11,11,12,12,13,13];
    return tbl[Math.min(level, 20)] || 2;
  }

  function renderChatImage(prompt) {
    if (!prompt) return;
    // Visiones del chat ahora usan una imagen por defecto estática para evitar CORS
    // (Este sistema se puede mejorar en el futuro con un catálogo de imágenes estáticas)
  }

  // ═══════════════════════════════════════════════════════
  // UI STATE — estados visuales unificados
  // ═══════════════════════════════════════════════════════
  const uiState = { inCombat: false, inConversation: false, isInspecting: false };

  // ── Función central de tarjetas ──────────────────────
  function updateEntityUI(type, entityData, show) {
    if (type === 'enemy')   uiState.inCombat      = show;
    if (type === 'npc')     uiState.inConversation = show;
    if (type === 'inspect') uiState.isInspecting   = show;

    _syncChatCombatPadding();
    _updateSummonBtn();
    _setCombatFocusMode(uiState.inCombat);

    // ─ Battle panel (contenedor visible cuando hay alguna tarjeta activa) ─
    const bPanel = $('battle-panel');
    const showPanel = uiState.inCombat || uiState.inConversation || uiState.isInspecting;
    if (bPanel) {
      bPanel.classList.toggle('active', showPanel);
      bPanel.setAttribute('aria-hidden', String(!showPanel));
    }

    // ─ Tarjeta jugador (izquierda) ─────────────────────
    const pCard = $('player-card');
    if (pCard) {
      const showP = uiState.inCombat || uiState.isInspecting;
      if (showP && !pCard.classList.contains('active')) {
        pCard.classList.add('active');
        pCard.setAttribute('aria-hidden', 'false');
        updateHpBar(); // sincronizar HP de combate con la hoja de personaje
      } else if (!showP && pCard.classList.contains('active')) {
        pCard.classList.remove('active');
        pCard.setAttribute('aria-hidden', 'true');
      }
    }

    // ─ Tarjeta derecha (enemigo / NPC); combate tiene prioridad ─
    const rCard   = $('enemy-card');
    const rImg    = $('enemy-avatar-img');
    const rName   = $('enemy-card-name');
    const rHdr    = rCard?.querySelector('.enemy-card-header');
    const overlay = $('death-overlay');
    if (!rCard) return;

    if (type === 'enemy' && show) {
      // Entrando en combate
      overlay?.classList.remove('visible');
      if (rImg) { rImg.style.filter = ''; rImg.style.transition = ''; }
      rCard.classList.remove('mode-npc', 'defeated');
      rCard.classList.add('mode-combat');
      if (rHdr) rHdr.textContent = '⚔';
      if (entityData) {
        if (rName) rName.textContent = entityData.name || 'Enemigo';
        if (rImg) {
          rImg.src = entityData.img || 'img/enemigos/goblin-1.png';
          rImg.onerror = () => { rImg.onerror = null; rImg.src = 'img/enemigos/goblin-1.png'; };
          rImg.alt = `Avatar de ${entityData.name || 'enemigo'}`;
        }
        updateHealth('enemy', entityData.hpMax || 10, entityData.hpMax || 10);
        _updateEnemyStack();
      }
      rCard.setAttribute('aria-hidden', 'false');
      rCard.classList.remove('active');
      void rCard.offsetWidth;
      rCard.classList.add('active');
      setTimeout(scrollBottom, 50); // desplazar al mensaje más reciente, por debajo de las tarjetas

    } else if (type === 'enemy' && !show) {
      // Combate terminado — si hay NPC en cola, mostrarlo tras breve pausa
      if (uiState.inConversation && state.activeNpc) {
        setTimeout(() => updateEntityUI('npc', state.activeNpc, true), 200);
      }

    } else if (type === 'npc' && show && !uiState.inCombat) {
      // Conversación con NPC (sin barra de HP; combate tiene prioridad)
      overlay?.classList.remove('visible');
      if (rImg) { rImg.style.filter = ''; rImg.style.transition = ''; }
      rCard.classList.remove('mode-combat', 'defeated');
      rCard.classList.add('mode-npc');
      if (rHdr) rHdr.textContent = '💬';
      if (entityData) {
        if (rName) rName.textContent = entityData.nombre || entityData.name || 'NPC';
        if (rImg) {
          rImg.src = entityData.img || 'img/npcs/guardia-puerta.png';
          rImg.onerror = () => { rImg.onerror = null; rImg.src = 'img/npcs/guardia-puerta.png'; };
          rImg.alt = `Avatar de ${entityData.nombre || 'NPC'}`;
        }
      }
      rCard.setAttribute('aria-hidden', 'false');
      rCard.classList.remove('active');
      void rCard.offsetWidth;
      rCard.classList.add('active');
      setTimeout(scrollBottom, 50);

    } else if (type === 'npc' && !show && !uiState.inCombat) {
      // Fin de conversación — animar salida
      if (rCard.classList.contains('active')) {
        rCard.classList.add('defeated');
        setTimeout(() => {
          rCard.classList.remove('active', 'defeated', 'mode-npc', 'mode-combat');
          rCard.setAttribute('aria-hidden', 'true');
          overlay?.classList.remove('visible');
          if (rImg) { rImg.style.filter = ''; rImg.style.transition = ''; }
        }, 650);
      }
    }
  }

  // ═══════════════════════════════════════════════════════
  // LOG DE PROGRESO — crónica técnica + LTM de la IA
  // ═══════════════════════════════════════════════════════

  // Tipos: 'nivel' | 'victoria' | 'objeto' | 'mision' | 'historia' | 'muerte' | 'resurreccion'
  function logProgress(texto, tipo = 'historia') {
    const entry = {
      ts:    new Date().toISOString(),
      tipo,
      texto,
      nivel: parseInt($('char-level')?.value) || 1,
      hp:    `${hpCurrent?.value ?? '?'}/${hpMax?.value ?? '?'}`,
    };
    state.progressLog.push(entry);
    if (state.progressLog.length > 500) state.progressLog.shift();
    try { localStorage.setItem('rpg_progress_log', JSON.stringify(state.progressLog)); } catch(e) {}

    // Para hitos clave, enriquecer también el Diario (LTM de la IA)
    // solo si no hay una entrada reciente idéntica (evitar duplicados con UPDATE_DIARY)
    if (['nivel', 'victoria', 'mision'].includes(tipo)) {
      const lastLines = state.campaignDiary.split('\n').slice(-5).join(' ');
      if (!lastLines.includes(texto.slice(0, 30))) {
        const sep = state.campaignDiary ? '\n' : '';
        state.campaignDiary += sep + '· ' + texto;
        saveChatLog();
      }
    }
  }

  // ─ Crónica estructurada — NPCs, localizaciones, hitos morales ──
  function addNpcMemo(name, attitude, note) {
    if (!name) return;
    const key = name.toLowerCase().trim();
    state.npcLog[key] = { name: name.trim(), attitude: attitude.trim(), note: note.trim(), ts: new Date().toISOString() };
    lsSave('rpg_npc_log', JSON.stringify(state.npcLog));
  }

  function addLocationMemo(name, note) {
    if (!name) return;
    const key = name.toLowerCase().trim();
    if (!state.locationLog[key]) state.locationLog[key] = { name: name.trim(), notes: [], ts: new Date().toISOString() };
    const trimmed = note?.trim();
    if (trimmed && !state.locationLog[key].notes.includes(trimmed)) state.locationLog[key].notes.push(trimmed);
    lsSave('rpg_location_log', JSON.stringify(state.locationLog));
    _setCurrentLocation(key, name.trim());
  }

  function _setCurrentLocation(id, name) {
    state.currentLocation = { id, name };
    lsSave('rpg_current_location', JSON.stringify(state.currentLocation));
  }

  function addMoralNote(summary) {
    if (!summary) return;
    state.moralLog.push({ ts: new Date().toISOString(), summary: summary.trim() });
    if (state.moralLog.length > 20) state.moralLog.shift();
    lsSave('rpg_moral_log', JSON.stringify(state.moralLog));
  }

  function updateWorldState(key, value) {
    if (!key) return;
    state.worldState[key.trim()] = value.trim();
    lsSave('rpg_world_state', JSON.stringify(state.worldState));
  }

  function buildDiaryContext() {
    const parts = [];
    const npcs  = Object.values(state.npcLog);
    if (npcs.length > 0) {
      parts.push('## PERSONAJES CONOCIDOS');
      npcs.forEach(n => parts.push(`- **${n.name}** [${n.attitude}]: ${n.note}`));
    }
    const locs = Object.values(state.locationLog);
    if (locs.length > 0) {
      parts.push('## LOCALIZACIONES VISITADAS');
      locs.forEach(l => {
        parts.push(`### [LUGAR] ${l.name}`);
        l.notes.forEach(nt => parts.push(`  · ${nt}`));
      });
    }
    if (state.moralLog.length > 0) {
      parts.push('## HITOS MORALES');
      state.moralLog.forEach(m => parts.push(`- ${m.summary}`));
    }
    if (state.campaignDiary.trim()) {
      parts.push('## EVENTOS DE LA CAMPAÑA');
      parts.push(state.campaignDiary.trim());
    }
    return parts.join('\n\n');
  }

  // ─ Gestión del indicador en el chat ────────────────
  function _syncChatCombatPadding() {
    const chatEl = $('chat-messages');
    if (!chatEl) return;
    const panelVisible = (uiState.inCombat || uiState.inConversation) &&
                         !$('battle-panel')?.classList.contains('nav-hidden');
    chatEl.classList.toggle('has-combat-ui', panelVisible);
  }

  // ─ Combate ──────────────────────────────────────────
  function showEnemyCard(prompt, name, count = 1) {
    const bData  = bestiario.enemigos[prompt] || lookupEnemyByName(name);
    const hpMax  = bData ? bData.hpMax : 10;
    const imgUrl = bData ? bData.img   : getEnemyImageUrl(name);
    const n      = Math.max(1, Math.min(6, count));

    const group = {
      prompt, name, hpMax, hpCurrent: hpMax,
      dano: bData?.dano ?? null, ca: bData?.ca ?? null, img: imgUrl,
      count: n,
    };

    if (state.activeEnemy && uiState.inCombat) {
      // Añadir nuevo grupo al encuentro en curso
      if (!state.activeEnemy.groups) state.activeEnemy.groups = [{ ...state.activeEnemy }];
      state.activeEnemy.groups.push(group);
      lsSave('rpg_active_enemy', JSON.stringify(state.activeEnemy));
      _updateEnemyStack();
      return;
    }

    // Nuevo encuentro
    updatePlayerAvatar();
    state.activeEnemy = { ...group, groups: [group] };
    lsSave('rpg_active_enemy', JSON.stringify(state.activeEnemy));
    updateEntityUI('enemy', { name, img: imgUrl, hpMax, count: n }, true);
    $('enemy-stack-wrapper')?.classList.add('has-active');
    _updateEnemyStack();
    vibe([20, 15, 50]);
  }

  function _updateEnemyStack() {
    const wrapper = $('enemy-stack-wrapper');
    if (!wrapper) return;

    const groups    = state.activeEnemy?.groups ?? (state.activeEnemy ? [state.activeEnemy] : []);
    const numGroups = groups.length;
    const g0count   = groups[0]?.count || 1;

    // Visual: por grupos distintos usa numGroups; por copia del mismo tipo usa g0count
    const stackN = numGroups > 1 ? Math.min(3, numGroups) : Math.min(3, g0count);
    wrapper.classList.remove('stack-1', 'stack-2', 'stack-3');
    wrapper.classList.add(`stack-${Math.max(1, stackN)}`);

    // Asignar imágenes a los ghost cards para que parezcan tarjetas reales
    const ghost1 = wrapper.querySelector('.ghost-1');
    const ghost2 = wrapper.querySelector('.ghost-2');
    const img0   = groups[0]?.img || '';
    // Para grupos distintos muestra la imagen del grupo siguiente; para copias del mismo tipo, misma imagen
    const img1   = (numGroups > 1 ? groups[1]?.img : img0) || img0;
    const img2   = (numGroups > 2 ? groups[2]?.img : img1) || img1;
    if (ghost1) ghost1.style.backgroundImage = img1 ? `url('${img1}')` : '';
    if (ghost2) ghost2.style.backgroundImage = img2 ? `url('${img2}')` : '';
  }

  function defeatEnemy() {
    const card    = $('enemy-card');
    const imgEl   = $('enemy-avatar-img');
    const overlay = $('death-overlay');
    if (!card?.classList.contains('active')) return;

    const defeatedName  = state.activeEnemy?.name || 'enemigo';
    const groups        = state.activeEnemy?.groups ?? (state.activeEnemy ? [state.activeEnemy] : []);
    const currentGroup  = groups[0];
    const remaining     = (currentGroup?.count || 1) - 1;

    closeEnemyDetailModal();
    logProgress(`Derrotó a ${defeatedName}.`, 'victoria');
    overlay?.classList.add('visible');
    sfx.result(false);
    vibe([80, 40, 120]);

    setTimeout(() => {
      if (imgEl) { imgEl.style.transition = 'filter 0.45s ease'; imgEl.style.filter = 'grayscale(1) brightness(0.45)'; }
    }, 280);

    setTimeout(() => {
      card.classList.add('defeated');
      setTimeout(() => {
        card.classList.remove('active', 'defeated', 'mode-combat');
        card.setAttribute('aria-hidden', 'true');
        overlay?.classList.remove('visible');
        if (imgEl) { imgEl.style.filter = ''; imgEl.style.transition = ''; }

        if (!state.activeEnemy) return; // endCombat() llamado mientras animaba

        if (remaining > 0) {
          // Quedan miembros del mismo grupo — decrementar y reanimar
          currentGroup.count     = remaining;
          currentGroup.hpCurrent = currentGroup.hpMax;
          state.activeEnemy.count     = remaining;
          state.activeEnemy.hpCurrent = currentGroup.hpMax;
          lsSave('rpg_active_enemy', JSON.stringify(state.activeEnemy));
          _updateEnemyStack();
          updateHealth('enemy', currentGroup.hpMax, currentGroup.hpMax);
          card.setAttribute('aria-hidden', 'false');
          card.classList.remove('active');
          void card.offsetWidth;
          card.classList.add('active', 'mode-combat');
        } else {
          // Grupo agotado — pasar al siguiente tipo de enemigo
          state.activeEnemy.groups.shift();
          const nextGroup = state.activeEnemy.groups[0];
          if (nextGroup) {
            state.activeEnemy = { ...nextGroup, groups: state.activeEnemy.groups };
            lsSave('rpg_active_enemy', JSON.stringify(state.activeEnemy));
            _updateEnemyStack();
            if (imgEl) imgEl.src = nextGroup.img;
            const nameEl = $('enemy-card-name');
            if (nameEl) nameEl.textContent = nextGroup.name;
            updateHealth('enemy', nextGroup.hpMax, nextGroup.hpMax);
            card.setAttribute('aria-hidden', 'false');
            card.classList.remove('active');
            void card.offsetWidth;
            card.classList.add('active', 'mode-combat');
          } else {
            // Todos los grupos derrotados
            state.activeEnemy = null;
            localStorage.removeItem('rpg_active_enemy');
            $('enemy-stack-wrapper')?.classList.remove('has-active');
            _updateEnemyStack();
            updateEntityUI('enemy', null, false);
          }
        }
      }, 650);
    }, 1100);
  }

  // ─ Huida / fin narrativo del combate ────────────────
  function endCombat() {
    if (!uiState.inCombat) return;
    const card    = $('enemy-card');
    const imgEl   = $('enemy-avatar-img');
    const overlay = $('death-overlay');
    closeEnemyDetailModal();
    $('enemy-stack-wrapper')?.classList.remove('has-active');
    state.activeEnemy = null;
    localStorage.removeItem('rpg_active_enemy');
    _updateEnemyStack();
    addSystemMessage('🏃 El combate ha concluido.');
    if (card?.classList.contains('active')) {
      card.classList.add('defeated');
      setTimeout(() => {
        card.classList.remove('active', 'defeated', 'mode-combat');
        card.setAttribute('aria-hidden', 'true');
        overlay?.classList.remove('visible');
        if (imgEl) { imgEl.style.filter = ''; imgEl.style.transition = ''; }
        updateEntityUI('enemy', null, false);
      }, 650);
    } else {
      updateEntityUI('enemy', null, false);
    }
  }
  window.endCombat = endCombat;

  // ─ Ficha de Enemigo — Modal de detalles ─────────────
  function _buildEnemyStatBlock(e, isCurrent) {
    const hp  = isCurrent ? e.hpCurrent : e.hpMax;
    const pct = Math.round((hp / e.hpMax) * 100);
    const statusClass = isCurrent ? 'enemy-stat-active-badge' : 'enemy-stat-wait-badge';
    const statusText  = isCurrent ? '⚔ EN COMBATE' : '⏳ EN ESPERA';
    const countText   = e.count > 1 ? ` · ×${e.count}` : '';
    const expandClass = isCurrent ? 'is-expanded' : 'is-collapsed';
    const typeClass   = isCurrent ? 'enemy-stat-active' : 'enemy-stat-waiting';
    return `
      <div class="enemy-stat-block ${expandClass} ${typeClass}" role="button" tabindex="0" aria-expanded="${isCurrent}">
        <div class="enemy-stat-compact">
          <img class="enemy-stat-img" src="${escHtml(e.img)}" alt="${escHtml(e.name)}"
               onerror="this.src='img/enemigos/goblin-1.png'">
          <div class="enemy-stat-compact-info">
            <div class="enemy-stat-name">${escHtml(e.name)}</div>
            <div class="enemy-stat-count ${statusClass}">${statusText}${countText}</div>
          </div>
          <span class="enemy-stat-chevron">▾</span>
        </div>
        <div class="enemy-stat-detail">
          <div class="enemy-stat-hp-row">
            <span class="enemy-stat-hp-label">Puntos de Vida</span>
            <div class="enemy-stat-hp-bar-wrap">
              <div class="enemy-stat-hp-bar" style="width:${pct}%"></div>
            </div>
            <div class="enemy-stat-hp-text">${hp} / ${e.hpMax}</div>
          </div>
          <div class="enemy-stat-grid">
            ${e.ca   ? `<div class="enemy-stat-cell"><span class="enemy-stat-label">Armadura (CA)</span><span class="enemy-stat-value">🛡 ${e.ca}</span></div>` : ''}
            ${e.dano ? `<div class="enemy-stat-cell"><span class="enemy-stat-label">Daño</span><span class="enemy-stat-value">⚔ ${e.dano}</span></div>` : ''}
          </div>
        </div>
      </div>`;
  }

  function openEnemyDetailModal() {
    const e       = state.activeEnemy;
    const overlay = $('enemy-detail-overlay');
    const body    = $('enemy-detail-body');
    if (!e || !overlay || !body) return;

    const groups = state.activeEnemy.groups ?? [state.activeEnemy];
    body.innerHTML = groups.map((g, i) => _buildEnemyStatBlock(g, i === 0)).join('');

    overlay.classList.add('visible');
    overlay.setAttribute('aria-hidden', 'false');
  }

  function closeEnemyDetailModal() {
    const overlay = $('enemy-detail-overlay');
    if (!overlay) return;
    overlay.classList.remove('visible');
    overlay.setAttribute('aria-hidden', 'true');
  }

  window.openEnemyDetailModal  = openEnemyDetailModal;
  window.closeEnemyDetailModal = closeEnemyDetailModal;

  // ─ Hoja de Personaje — Panel lateral ────────────────
  function openPlayerStatsPanel() {
    const overlay = $('player-detail-overlay');
    const body    = $('player-detail-body');
    if (!overlay || !body) return;

    const hp      = parseInt($('hp-current')?.value)         || 0;
    const maxHp   = parseInt($('hp-max')?.value)             || 1;
    const xp      = parseInt($('xp-current')?.value)         || 0;
    const xpNext  = parseInt($('xp-next')?.textContent)      || 300;
    const level   = parseInt($('char-level')?.value)         || 1;
    const charNameVal  = $('char-name')?.value  || 'Aventurero';
    const charClassVal = $('char-class')?.value || '—';
    const profBonus = $('prof-bonus-val')?.textContent       || '+2';

    const hpPct = Math.min(100, Math.round((hp / maxHp) * 100));
    const xpPct = Math.min(100, Math.round((xp / xpNext) * 100));

    const statKeys = [
      { key: 'str', abbr: 'FUE', icon: '⚔' },
      { key: 'dex', abbr: 'DES', icon: '🏃' },
      { key: 'con', abbr: 'CON', icon: '🛡' },
      { key: 'int', abbr: 'INT', icon: '📚' },
      { key: 'wis', abbr: 'SAB', icon: '👁' },
      { key: 'cha', abbr: 'CAR', icon: '✨' },
    ];
    const statsHtml = statKeys.map(({ key, abbr, icon }) => {
      const val    = getEffectiveStatValue(key);
      const mod    = Math.floor((val - 10) / 2);
      const modStr = mod >= 0 ? `+${mod}` : `${mod}`;
      return `<div class="ps-stat-cell">
        <span class="ps-stat-icon">${icon}</span>
        <span class="ps-stat-abbr">${abbr}</span>
        <span class="ps-stat-value">${val}</span>
        <span class="ps-stat-mod">${modStr}</span>
      </div>`;
    }).join('');

    const slotLabels = { arma: 'Arma', armadura: 'Armadura', accesorio: 'Accesorio' };
    const eqHtml = Object.entries(slotLabels).map(([slot, label]) => {
      const item = state.equipment[slot];
      return item
        ? `<div class="ps-equip-item"><span class="ps-equip-slot">${label}</span><span class="ps-equip-name">${escHtml(item.name)}</span></div>`
        : '';
    }).filter(Boolean).join('') || '<div class="ps-empty">Sin equipamiento activo</div>';

    body.innerHTML = `
      <div class="ps-identity">
        <div class="ps-name">${escHtml(charNameVal)}</div>
        <div class="ps-class">${escHtml(getClassTitle(charClassVal, level))} &middot; Nivel ${level}</div>
      </div>
      <div class="ps-section">
        <div class="ps-section-title">Vida</div>
        <div class="ps-hp-bar-wrap"><div class="ps-hp-bar" style="width:${hpPct}%"></div></div>
        <div class="ps-hp-text">${hp} / ${maxHp} HP</div>
      </div>
      <div class="ps-section">
        <div class="ps-section-title">Experiencia &middot; Competencia ${escHtml(profBonus)}</div>
        <div class="ps-xp-bar-wrap"><div class="ps-xp-bar" style="width:${xpPct}%"></div></div>
        <div class="ps-xp-text">${xp} / ${xpNext} XP</div>
      </div>
      <div class="ps-section">
        <div class="ps-section-title">Atributos</div>
        <div class="ps-stats-grid">${statsHtml}</div>
      </div>
      <div class="ps-section">
        <div class="ps-section-title">Equipamiento</div>
        <div class="ps-equip-list">${eqHtml}</div>
      </div>`;

    overlay.classList.add('visible');
    overlay.setAttribute('aria-hidden', 'false');
  }

  function closePlayerStatsPanel() {
    const overlay = $('player-detail-overlay');
    if (!overlay) return;
    overlay.classList.remove('visible');
    overlay.setAttribute('aria-hidden', 'true');
  }

  window.openPlayerStatsPanel  = openPlayerStatsPanel;
  window.closePlayerStatsPanel = closePlayerStatsPanel;

  // ─ Panel debug oculto — 7 taps en el avatar de la ficha ─
  {
    let _tapCount = 0, _tapTimer = null;

    function _openDebug() {
      const p = $('debug-panel');
      if (!p) return;
      p.style.display = 'flex';
      p.setAttribute('aria-hidden', 'false');
    }
    function _closeDebug() {
      const p = $('debug-panel');
      if (!p) return;
      p.style.display = 'none';
      p.setAttribute('aria-hidden', 'true');
    }

    // pointerdown es fiable en móvil y escritorio; touchstart podría dar doble-disparo
    $('char-sheet-avatar')?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      _tapCount++;
      clearTimeout(_tapTimer);
      _tapTimer = setTimeout(() => { _tapCount = 0; }, 2500);
      if (_tapCount >= 7) { _tapCount = 0; _openDebug(); }
    });

    $('debug-close')?.addEventListener('click', _closeDebug);
    $('debug-panel')?.addEventListener('click', e => {
      if (e.target.id === 'debug-panel') _closeDebug();
    });

    $('debug-xp-btn')?.addEventListener('click', () => {
      const v = parseInt($('debug-xp-val')?.value) || 0;
      if (v > 0) { applyXpGain(v); $('debug-xp-val').value = ''; }
    });

    $('debug-lvl-btn')?.addEventListener('click', () => {
      const target = Math.min(20, Math.max(1, parseInt($('debug-lvl-val')?.value) || 1));
      const xpEl   = $('xp-current');
      if (xpEl) {
        const needed = (XP_TABLE[target - 1] || 0) - (parseInt(xpEl.value) || 0);
        if (needed > 0) applyXpGain(needed);
      }
      if ($('debug-lvl-val')) $('debug-lvl-val').value = '';
    });

    $('debug-hp-btn')?.addEventListener('click', () => {
      const v = parseInt($('debug-hp-val')?.value) || 0;
      if (v !== 0) { applyHpChange(v); $('debug-hp-val').value = ''; }
    });

    $('debug-gold-btn')?.addEventListener('click', () => {
      const v = parseInt($('debug-gold-val')?.value) || 0;
      if (v > 0) { addGold(v); $('debug-gold-val').value = ''; }
    });
  }

  // ─ NPCs ─────────────────────────────────────────────
  const _SHOP_NPC_IDS = new Set(['mercader-oscuro', 'herrero', 'alquimista']);
  function _isShopNpc(id) {
    return _SHOP_NPC_IDS.has(id) || /mercader|herrero|alquimist|comerciant|tienda|vendedor/i.test(id || '');
  }

  function showNpcCard(id) {
    const found = bestiario.npcs[id] ? { id, ...bestiario.npcs[id] } : lookupNpcByName(id);
    if (!found) { console.warn(`[Bestiario] NPC no encontrado: "${id}"`); return; }
    state.activeNpc = { ...found };
    const locKey = state.currentLocation?.id || 'global';
    const storedName = state.npcNames[`${found.id}@${locKey}`];
    if (storedName) state.activeNpc.nombre = storedName;
    lsSave('rpg_active_npc', JSON.stringify(state.activeNpc));
    updateEntityUI('npc', state.activeNpc, true);
    const shopBtn = $('npc-shop-btn');
    if (shopBtn) shopBtn.style.display = _isShopNpc(found.id) ? 'block' : 'none';
  }

  function hideNpcCard() {
    state.activeNpc = null;
    localStorage.removeItem('rpg_active_npc');
    updateEntityUI('npc', null, false);
    const shopBtn = $('npc-shop-btn');
    if (shopBtn) shopBtn.style.display = 'none';
  }

  // ═══════════════════════════════════════════════════════
  // SISTEMA DE CHECKPOINTS
  // ═══════════════════════════════════════════════════════
  function createCheckpoint() {
    try {
      const cp = {
        savedAt:       Date.now(),
        chatLog:       state.chatLog.slice(),
        history:       state.history.slice(),
        campaignDiary: state.campaignDiary,
        inventory:     JSON.parse(JSON.stringify(state.inventory)),
        quests:        JSON.parse(JSON.stringify(state.quests)),
        pendingRoll:   state.pendingRoll,
        playerStats:   JSON.parse(JSON.stringify(state.playerStats)),
        npcNames:        JSON.parse(JSON.stringify(state.npcNames)),
        currentLocation: state.currentLocation ? { ...state.currentLocation } : null,
        worldState:      JSON.parse(JSON.stringify(state.worldState)),
        equipment:       JSON.parse(JSON.stringify(state.equipment)),
        fields:          {},
      };
      PERSIST_IDS.forEach(id => { const el = $(id); if (el) cp.fields[id] = el.value; });
      localStorage.setItem('rpg_checkpoint', JSON.stringify(cp));
    } catch(e) { console.warn('[Checkpoint] Guardado fallido:', e); }
  }

  function loadCheckpoint() {
    try {
      const raw = localStorage.getItem('rpg_checkpoint');
      if (!raw) return false;
      const cp = JSON.parse(raw);

      state.chatLog       = cp.chatLog       || [];
      state.history       = cp.history       || [];
      state.campaignDiary = cp.campaignDiary || '';
      state.inventory     = cp.inventory     || [];
      state.quests        = cp.quests        || [];
      state.pendingRoll   = cp.pendingRoll   || null;
      state.playerStats   = cp.playerStats   || { str:0, dex:0, con:0, int:0, wis:0, cha:0 };
      state.npcNames        = cp.npcNames        || {};
      state.currentLocation = cp.currentLocation || null;
      state.worldState      = cp.worldState      || {};
      state.equipment       = cp.equipment       || { arma: null, armadura: null, accesorio: null };

      Object.entries(cp.fields || {}).forEach(([id, val]) => {
        lsSave(`rpg_${id}`, String(val));
        const el = $(id); if (el) el.value = val;
      });

      saveChatLog(); saveGameState();

      chatMessages.innerHTML = '';
      renderChatLog(state.chatLog);
      renderInventory(); renderEquipment(); syncInventoryTextarea(); renderQuests();
      syncStatDisplays(); // Recalcular: base de clase + puntos ASI del checkpoint
      updateHpBar(); updateXpBar(); updateStats();

      return true;
    } catch(e) { console.warn('[Checkpoint] Error al cargar:', e); return false; }
  }

  // ═══════════════════════════════════════════════════════
  // GAME OVER
  // ═══════════════════════════════════════════════════════
  function handleGameOver() {
    // Limpiar estado de combate sin animaciones (ya se animó en triggerPlayerDeath)
    uiState.inCombat = false;
    state.activeEnemy = null;
    localStorage.removeItem('rpg_active_enemy');

    const pCard = $('player-card');
    const rCard = $('enemy-card');
    if (pCard) { pCard.classList.remove('active', 'defeated'); pCard.setAttribute('aria-hidden', 'true'); }
    if (rCard) { rCard.classList.remove('active', 'defeated', 'mode-combat', 'mode-npc'); rCard.setAttribute('aria-hidden', 'true'); }

    _syncChatCombatPadding();
    const bPanel = $('battle-panel');
    if (bPanel) { bPanel.classList.remove('active'); bPanel.setAttribute('aria-hidden', 'true'); }

    // Mostrar overlay de derrota
    const overlay = $('gameover-overlay');
    if (overlay) { overlay.classList.add('visible'); overlay.setAttribute('aria-hidden', 'false'); }
  }

  // ─ Muerte del jugador — animación + game over ────────
  function triggerPlayerDeath() {
    const pCard = $('player-card');
    const pImg  = $('player-avatar-img');

    if (!pCard?.classList.contains('active')) {
      setTimeout(startDeathSaves, 400);
      return;
    }

    if (pImg) { pImg.style.transition = 'filter 0.6s ease'; pImg.style.filter = 'grayscale(1) brightness(0.3)'; }

    setTimeout(() => {
      pCard.classList.add('defeated');
      const rCard = $('enemy-card');
      if (rCard?.classList.contains('active')) rCard.classList.add('defeated');
      setTimeout(() => {
        if (pImg) { pImg.style.filter = ''; pImg.style.transition = ''; }
        startDeathSaves();
      }, 650);
    }, 700);
  }

  function startDeathSaves() {
    state.deathSaves = { successes: 0, failures: 0, active: true };
    saveGameState();
    const panel = $('death-save-panel');
    if (panel) { panel.classList.add('visible'); panel.setAttribute('aria-hidden', 'false'); }
    renderDeathSaves();
    addSystemMessage('💀 ¡HP a 0! Tiradas de muerte activas — 3 éxitos para estabilizarte, 3 fallos significa la muerte.');
  }

  function renderDeathSaves() {
    ['success', 'failure'].forEach(type => {
      const dots = $(`death-${type}-dots`);
      if (!dots) return;
      const count = type === 'success' ? state.deathSaves.successes : state.deathSaves.failures;
      dots.querySelectorAll('.death-dot').forEach((dot, i) => {
        dot.classList.toggle('filled', i < count);
      });
    });
    const resultEl = $('death-save-result');
    if (resultEl && !state.deathSaves.active) resultEl.textContent = '';
  }

  function rollDeathSave() {
    if (!state.deathSaves.active || state.isStreaming) return;
    const roll = rollD20();
    const resultEl = $('death-save-result');

    if (roll === 20) {
      if (resultEl) resultEl.textContent = '⚡ ¡20 NATURAL! ¡Recuperas 1 HP!';
      setTimeout(() => resolveDeathSaves('stable', true), 900);
      return;
    }

    let { successes, failures } = state.deathSaves;
    let msg = '';
    if (roll === 1) {
      failures = Math.min(3, failures + 2);
      msg = `💀 PIFIA (1) — ¡Dos fallos! (${failures}/3)`;
    } else if (roll >= 10) {
      successes = Math.min(3, successes + 1);
      msg = `✓ Éxito (${roll}) — ${successes}/3`;
    } else {
      failures = Math.min(3, failures + 1);
      msg = `✗ Fallo (${roll}) — ${failures}/3`;
    }

    state.deathSaves.successes = successes;
    state.deathSaves.failures  = failures;
    saveGameState();
    renderDeathSaves();
    if (resultEl) resultEl.textContent = msg;
    addRollToHistory('Tirada de Muerte', roll, 0, roll);

    if (failures >= 3) setTimeout(() => resolveDeathSaves('dead'), 1200);
    else if (successes >= 3) setTimeout(() => resolveDeathSaves('stable'), 1200);
  }

  function resolveDeathSaves(outcome, critRecovery = false) {
    state.deathSaves.active = false;
    saveGameState();
    const panel = $('death-save-panel');
    if (panel) { panel.classList.remove('visible'); panel.setAttribute('aria-hidden', 'true'); }

    if (outcome === 'dead') {
      addSystemMessage('💀 Tres fallos — el aventurero ha muerto.');
      handleGameOver();
    } else {
      hpCurrent.value = 1;
      lsSave('rpg_hp-current', '1');
      updateHpBar();
      state.deathSaves = { successes: 0, failures: 0, active: false };
      saveGameState();
      const msg = critRecovery
        ? '⚡ ¡20 natural! El aventurero se recupera milagrosamente con 1 HP.'
        : '✓ ¡Estabilizado! El aventurero respira con 1 HP.';
      addSystemMessage(msg);
      callDM(msg);
    }
  }

  $('death-save-roll-btn')?.addEventListener('click', rollDeathSave);

  // ═══════════════════════════════════════════════════════
  // PROGRESIÓN — XP, nivel, competencia
  // ═══════════════════════════════════════════════════════
  function getProfBonus(level) {
    if (level >= 17) return 6;
    if (level >= 13) return 5;
    if (level >= 9)  return 4;
    if (level >= 5)  return 3;
    return 2;
  }

  function getLevelFromXP(xp) {
    for (let i = XP_TABLE.length - 1; i >= 0; i--) {
      if (xp >= XP_TABLE[i]) return i + 1;
    }
    return 1;
  }

  function getHpPerLevel() {
    const cls = ($('char-class')?.value || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (/barbaro/.test(cls))                                   return 7; // d12
    if (/guerrero|fighter|paladin|explorador|ranger/.test(cls)) return 6; // d10
    if (/mago|wizard|hechicero|sorcerer|brujo|warlock/.test(cls)) return 4; // d6
    return 5; // d8: pícaro, clérigo, bardo, druida, monje y resto
  }

  function updateXpBar() {
    const xp    = parseInt($('xp-current')?.value) || 0;
    const level = getLevelFromXP(xp);
    const lo    = XP_TABLE[level - 1] ?? 0;
    const hi    = XP_TABLE[level]     ?? null;
    const barEl = $('xp-bar'), nextEl = $('xp-next'), pctEl = $('xp-percent');
    if (!barEl) return;
    if (hi === null) {
      if (nextEl) nextEl.textContent = '—';
      barEl.style.width = '100%';
      if (pctEl) pctEl.textContent = 'Máx.';
    } else {
      if (nextEl) nextEl.textContent = hi.toLocaleString('es');
      const pct = Math.min(100, Math.round(((xp - lo) / (hi - lo)) * 100));
      barEl.style.width = pct + '%';
      if (pctEl) pctEl.textContent = pct + '%';
    }
  }

  function updateSkillBonuses() {
    const level = parseInt($('char-level')?.value) || 1;
    const prof  = getProfBonus(level);
    SKILLS.forEach(s => {
      const v   = parseInt($(`stat-${s.attr}`)?.value) || 10;
      const mod = calcMod(v) + prof;
      const el  = $(`skb-${s.id}`);
      if (!el) return;
      el.textContent = fmtMod(mod);
      el.className   = 'skill-bonus' + (mod > 0 ? ' positive' : mod < 0 ? ' negative' : '');
    });
    const profEl = $('prof-bonus-val');
    if (profEl) profEl.textContent = fmtMod(prof);
  }

  function buildSkillRows() {
    const body = $('skills-body');
    if (!body) return;
    body.innerHTML = SKILLS.map(s => `
      <div class="skill-row">
        <span class="skill-tag ${ATTR_CLASS[s.attr]}">${ATTR_ABBR[s.attr]}</span>
        <span class="skill-name">${s.label}</span>
        <span class="skill-bonus" id="skb-${s.id}">+0</span>
        <button type="button" class="skill-d20"
          data-label="${s.label}" data-attr="${s.attr}"
          aria-label="Tirada de ${s.label}">🎲</button>
      </div>`).join('');

    body.querySelectorAll('.skill-d20').forEach(btn => {
      btn.addEventListener('click', () => {
        const { label, attr } = btn.dataset;
        const level = parseInt($('char-level')?.value) || 1;
        const bonus = calcMod(parseInt($(`stat-${attr}`)?.value) || 10) + getProfBonus(level);
        const roll  = rollD20();
        const total = roll + bonus;
        showDiceOverlay(roll, bonus, label);
        let prefix;
        if (roll === 20)     prefix = `[¡Crítico! Prueba de ${label}: 20 natural → ${total}] `;
        else if (roll === 1) prefix = `[¡Pifia! Prueba de ${label}: 1 natural] `;
        else                 prefix = `[Prueba de ${label}: ${roll} ${fmtMod(bonus)} = ${total}] `;
        const cur = playerInput.value.trim();
        playerInput.value = cur ? cur + ' ' + prefix : prefix;
        playerInput.focus();
        diceFlash.textContent = '🎲 ' + prefix.replace(/[\[\]]/g, '').trim();
        diceFlash.classList.add('visible');
        setTimeout(() => diceFlash.classList.remove('visible'), 4000);
      });
    });
  }

  function showLevelUpToast(level, hpGained) {
    const el = $('levelup-toast');
    if (!el) return;
    el.textContent = `✦ ¡NIVEL ${level}! +${hpGained} HP máximos · ¡Curado al máximo! ✦`;
    el.classList.add('visible');
    setTimeout(() => el.classList.remove('visible'), 4800);
  }

  // ═══════════════════════════════════════════════════════
  // CHECK LEVEL UP — cura al 100% al subir nivel (D&D 5e confort rule)
  // ═══════════════════════════════════════════════════════
  function checkLevelUp(prevXP, newXP) {
    const prev = getLevelFromXP(prevXP);
    const next = getLevelFromXP(newXP);
    if (next <= prev) return;

    const levelEl = $('char-level');
    if (levelEl) { levelEl.value = next; lsSave('rpg_char-level', String(next)); }

    const hpGained = getHpPerLevel() * (next - prev);
    const newMax   = (parseInt(hpMax.value) || 1) + hpGained;

    hpMax.value     = newMax;  lsSave('rpg_hp-max',     String(newMax));
    hpCurrent.value = newMax;  lsSave('rpg_hp-current', String(newMax));

    updateHpBar();
    updateSkillBonuses();
    updatePlayerAvatar();
    renderSpellSlots();
    showLevelUpToast(next, hpGained);

    const nextAsi = [...ASI_LEVELS].sort((a, b) => a - b).find(l => l > next) ?? '—';
    addSystemMessage(`✦ ¡NIVEL ${next}! +${hpGained} HP · Curado al máximo · Competencia: ${fmtMod(getProfBonus(next))} · Próximo ASI: nivel ${nextAsi}`);
    logProgress(`${state.charName || 'El aventurero'} alcanzó el nivel ${next} con ${newMax} HP máximos.`, 'nivel');

    let asiCount = 0;
    for (let lvl = prev + 1; lvl <= next; lvl++) {
      if (ASI_LEVELS.has(lvl)) asiCount++;
    }
    if (asiCount > 0) activarModoSubidaNivel(asiCount);
  }

  // ═══════════════════════════════════════════════════════
  // MODO ASI
  // ═══════════════════════════════════════════════════════
  function _syncModoASI() {
    const activo  = state.puntosDisponibles > 0;
    const banner  = $('alloc-banner');
    const statsEl = $('stats-section');
    const ptsEl   = $('alloc-points');
    const btns    = document.querySelectorAll('.btn-stat-plus');

    if (ptsEl)   ptsEl.textContent = state.puntosDisponibles;
    if (banner)  banner.classList.toggle('visible', activo);
    if (statsEl) statsEl.classList.toggle('stat-allocating', activo);
    btns.forEach(b => { b.style.display = activo ? 'inline-flex' : 'none'; });
    // Auto-expandir atributos cuando hay puntos por distribuir
    if (activo) {
      const statsBody = $('stats-body');
      const statsBtn  = $('stats-toggle');
      if (statsBody?.classList.contains('collapsed')) {
        statsBody.classList.remove('collapsed');
        if (statsBtn) { statsBtn.textContent = '▼'; statsBtn.setAttribute('aria-expanded', 'true'); }
      }
    }
    lsSave('rpg_puntos_disponibles', String(state.puntosDisponibles));
  }

  function activarModoSubidaNivel(asiCount = 1) {
    state.puntosDisponibles += asiCount * 2;
    _syncModoASI();
    const pts = state.puntosDisponibles;
    addSystemMessage(`✨ ¡MEJORA DE ATRIBUTO! Tienes ${pts} punto${pts !== 1 ? 's' : ''} para repartir. Pulsa los botones ＋ junto a cada estadística.`);
  }

  function asignarPunto(statId) {
    if (state.puntosDisponibles <= 0) return;
    if (getEffectiveStatValue(statId) >= 20) return; // cap en 20

    state.playerStats[statId] = (state.playerStats[statId] ?? 0) + 1;
    lsSave('rpg_player_stats', JSON.stringify(state.playerStats));

    // Actualizar el input y guardar el valor combinado (base + bonus) para compatibilidad
    const newVal = getEffectiveStatValue(statId);
    const input  = $(`stat-${statId}`);
    if (input) { input.value = newVal; lsSave(`rpg_stat-${statId}`, String(newVal)); }

    updateMod(statId);
    updateSkillBonuses();
    state.puntosDisponibles--;
    _syncModoASI();
    if (state.puntosDisponibles === 0)
      addSystemMessage('✦ Atributos guardados. ¡Que la nueva fuerza te lleve lejos, aventurero!');
  }

  // ═══════════════════════════════════════════════════════
  // HOJA DE PERSONAJE — bloque para el sistema prompt
  // ═══════════════════════════════════════════════════════
  function buildCharBlock() {
    const name  = $('char-name').value.trim()  || 'Sin nombre';
    const cls   = $('char-class').value.trim() || 'Sin clase';
    const lvl   = $('char-level').value        || '1';
    const hpC   = hpCurrent.value              || '?';
    const hpM   = hpMax.value                  || '?';
    const equipEntries = Object.entries(state.equipment)
      .filter(([, item]) => item)
      .map(([slot, item]) => {
        const label = { arma: 'Arma', armadura: 'Armadura', accesorio: 'Accesorio' }[slot];
        return `  ${label}: ${item.name}`;
      });
    const inv = state.inventory.length > 0
      ? state.inventory.map(i => i.name).join(', ')
      : 'Vacío';
    const sum   = storySummary.value.trim() || '(Sin resumen. Primera sesión.)';
    const xp    = parseInt($('xp-current')?.value) || 0;
    const prof  = getProfBonus(parseInt(lvl) || 1);

    const STATS = {
      str:'Fuerza', dex:'Destreza', con:'Constitución',
      int:'Inteligencia', wis:'Sabiduría', cha:'Carisma',
    };
    const statsLine = Object.entries(STATS).map(([id, label]) => {
      const v = parseInt($(`stat-${id}`)?.value) || 10;
      return `${label}: ${v}(${fmtMod(calcMod(v))})`;
    }).join(' | ');

    const activeQuests = state.quests.filter(q => q.status === 'active').map(q => q.title).join(', ') || 'Ninguna';

    // Nota de clase para que la IA use los stats en la narrativa
    const clsNote = window.CLASE_STATS?.[cls]
      ? `\nNota: estos atributos son los de un/a ${cls} auténtico/a — úsalos activamente en la narración (ej. un Bárbaro con Fuerza 18 derriba puertas de golpe; un Mago con Inteligencia 18 recuerda detalles arcanos; un Pícaro con Destreza 18 actúa en las sombras).`
      : '';

    let block = `=== HOJA DE PERSONAJE ===
Nombre: ${name} | Clase: ${cls} | Nivel: ${lvl} | HP: ${hpC}/${hpM} | XP: ${xp}
Bonus de Competencia: ${fmtMod(prof)}
Atributos: ${statsLine}${clsNote}
=== EQUIPAMIENTO ACTIVO ===
${equipEntries.length > 0
  ? equipEntries.join('\n') + '\nREGLA: Los NPCs pueden reaccionar visualmente al equipamiento (miedo ante armas malditas, respeto ante armaduras nobles, curiosidad ante accesorios extraños).'
  : '(Sin equipo)'}
=== INVENTARIO (MOCHILA) ===
${inv}
Misiones activas: ${activeQuests}

=== RESUMEN / MEMORIA DE HISTORIA ===
${sum}`;

    if (isMagicClass(cls) && state.spells.length > 0) {
      const lvl   = parseInt($('char-level')?.value) || 1;
      const total = getSpellSlotMax(cls, lvl);
      const avail = Math.max(0, total - state.spellSlotsUsed);
      const cantripList = state.spells.filter(s => s.tipo === 'cantrip').map(s => s.name).join(', ') || 'Ninguno';
      const hechizos    = state.spells.filter(s => s.tipo !== 'cantrip').map(s => s.name).join(', ') || 'Ninguno';
      block += `\n\n=== MAGIA ===
Trucos (sin límite): ${cantripList}
Hechizos conocidos: ${hechizos}
Slots disponibles: ${avail}/${total}
Hechizo preparado: ${state.preparedSpell || 'Ninguno'}
REGLA: Usa [SPELL_USED] cuando el personaje lanza un hechizo que consume un slot. Usa [RESTORE_SPELLS] después de un descanso largo${cls.toLowerCase() === 'Brujo' ? ' o corto' : ''}.`;
    }

    if (state.activeEnemy) {
      const e   = state.activeEnemy;
      const ca  = e.ca   ?? '?';
      const hp  = e.hpCurrent ?? e.hpMax ?? '?';
      const hpM = e.hpMax ?? '?';
      const dmg = e.dano  ?? '1d6';
      block += `\n\n=== COMBATE ACTIVO ===
Enemigo: ${e.name} | HP: ${hp}/${hpM} | CA: ${ca} | Daño por ataque: ${dmg}

PROTOCOLO DE COMBATE — SIGUE ESTOS PASOS EN ORDEN:

TURNO DEL JUGADOR (cuando intente atacar o usar habilidad ofensiva):
  PASO 1 → Emite [REQUEST_ROLL: Fuerza] (o el atributo relevante) y PARA aquí.
           NO narres el resultado. NO calcules el dado. Espera la tirada del jugador.
  PASO 2 → Cuando el jugador envíe su tirada (ej: "🎲 Tirada de Fuerza: 14 + 2 = 16"):
           • Si total ≥ CA (${ca}): impacta → narra el golpe → calcula daño con ${dmg} → [ENEMY_LOSE_HP: N]
           • Si total < CA (${ca}): falla → narra el fallo → NO emitas [ENEMY_LOSE_HP]
  PASO 3 → Si HP enemigo queda ≤ 0 tras el daño: [ENEMY_DEFEATED] + [GAIN_XP: 75–150]

TURNO DEL ENEMIGO (después de resolver el ataque del jugador, si sigue vivo):
  → Narra el contraataque del ${e.name} → tira ${dmg} mentalmente → [LOSE_HP: N]

REGLAS ABSOLUTAS:
  • NUNCA calcules la tirada del jugador tú mismo
  • NUNCA combines PASO 1 y PASO 2 en el mismo mensaje
  • El jugador DEBE lanzar el dado físicamente antes de saber si impactó`;
    }

    if (state.activeNpc) {
      const n = state.activeNpc;
      const locKey       = state.currentLocation?.id   || 'global';
      const locDisplay   = state.currentLocation?.name || null;
      const campaignName = state.npcNames[`${n.id}@${locKey}`];
      block += `\n\n=== NPC EN CONVERSACIÓN ===
Nombre: ${campaignName || n.nombre}${n.status ? ` | Estatus: ${n.status}` : ''}${n.autoridad ? ` | Autoridad: ${n.autoridad}` : ''}
Personalidad: ${n.personalidad || 'Desconocida'}
Ubicación actual: ${locDisplay || 'Desconocida'}
${campaignName
  ? `El jugador ya conoce a este NPC en "${locDisplay || 'esta ubicación'}" — su nombre es "${campaignName}". Úsalo con naturalidad. NO uses [NPC_NAME].`
  : `REGLA DE IDENTIDAD: Este NPC no tiene nombre registrado en "${locDisplay || 'esta ubicación'}". Los NPCs del mismo tipo son personas distintas en cada ciudad. Genera un nombre único para el "${n.nombre}" de ${locDisplay ? `"${locDisplay}"` : 'aquí'} y registralo con [NPC_NAME: ${n.id}|Nombre].`}
IMPORTANTE: Interpreta a este personaje con coherencia total a su personalidad y rango social. Su nivel de autoridad determina cómo trata al jugador y qué puede ofrecerle o negarle. Usa [END_CONVERSATION] cuando el diálogo concluya de forma natural.`;
    }

    if (state.conditions.length > 0) {
      block += '\n\n=== CONDICIONES ACTIVAS DEL JUGADOR ===\n';
      block += state.conditions.map(key => {
        const def = CONDITION_DEFS[key];
        return `${def?.emoji || '⚑'} ${def?.label || key}`;
      }).join(', ');
      block += '\nREGLA: Estas condiciones afectan activamente lo que el personaje puede hacer. Un jugador paralizado no puede actuar. Uno envenenado sufre daño periódico. Uno cegado tiene desventaja en ataques. Narra las consecuencias con coherencia.';
    }

    const _significantFactions = Object.values(state.factions).filter(f => Math.abs(f.value) >= 10);
    if (_significantFactions.length > 0) {
      block += '\n\n=== REPUTACIÓN CON FACCIONES ===\n';
      block += _significantFactions.map(f => {
        const s = _factionStatus(f.value);
        return `${f.name}: ${f.value > 0 ? '+' : ''}${f.value} (${s.label})`;
      }).join('\n');
      block += '\nREGLA: Los NPCs de facciones con reputación negativa tratan al jugador con hostilidad. Con reputación positiva ofrecen descuentos, favores e información privilegiada. Un "Enemigo" puede atacar al jugador a la vista. Un "Héroe" es recibido con honor.';
    }

    const _worldEntries = Object.entries(state.worldState);
    if (_worldEntries.length > 0) {
      block += '\n\n=== ESTADO DEL MUNDO ===\n';
      block += _worldEntries.map(([k, v]) => `${k}: ${v}`).join('\n');
      block += '\nEstos son hechos inmutables del mundo. Actúa en consecuencia: un NPC muerto no puede aparecer vivo, una ciudad destruida sigue en ruinas, una facción hostil no te recibe con amabilidad.';
    }

    // Alerta de auto-compresión cuando la crónica crece demasiado
    const _diaryLen = buildDiaryContext().length;
    if (_diaryLen > 2800) {
      block += `\n\n⚠ CRÓNICA DEMASIADO LARGA (${_diaryLen} chars): En tu próxima respuesta añade [COMPRESS_DIARY: resumen] con los eventos más relevantes en ≤400 palabras. Mantén nombres de personajes, localizaciones y decisiones clave; omite detalles menores.`;
    }

    return block;
  }

  // ═══════════════════════════════════════════════════════
  // VENTANA DESLIZANTE DEL HISTORIAL API
  // ═══════════════════════════════════════════════════════
  function getWindowedHistory() {
    let win = state.history.slice(-HISTORY_LIMIT);
    while (win.length > 0 && win[0].role === 'assistant') win = win.slice(1);
    return win;
  }

  function _buildMessages(systemText) {
    const messages = [{ role: 'system', content: systemText }];

    // Inyectar el Diario de Campaña estructurado como contexto histórico blindado
    const _diaryCtx = buildDiaryContext();
    if (_diaryCtx.trim()) {
      messages.push(
        {
          role: 'user',
          content: `=== CRÓNICA DE LA CAMPAÑA (MEMORIA HISTÓRICA) ===\n${_diaryCtx}`,
        },
        {
          role: 'assistant',
          content: 'Entendido. He leído la crónica completa: conozco a los personajes, las localizaciones visitadas, los hitos morales y los eventos de la campaña. Mantendré total coherencia con estos hechos.',
        }
      );
    }

    messages.push(
      ...getWindowedHistory().map(msg => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content,
      }))
    );

    return messages;
  }

  // ═══════════════════════════════════════════════════════
  // STREAMING SSE
  // ═══════════════════════════════════════════════════════
  async function readSSEStream(res, dmBody) {
    if (!res.body) throw new Error('El navegador no soporta streaming de respuestas.');
    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer   = '';
    let fullText = '';

    dmBody.innerHTML = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') return fullText;
          try {
            const chunk = JSON.parse(payload);
            const token = chunk?.choices?.[0]?.delta?.content ?? '';
            if (token) {
              fullText += token;
              dmBody.textContent = fullText;
              scrollBottom();
            }
          } catch { /* fragmento incompleto */ }
        }
      }
    } finally {
      try { reader.releaseLock(); } catch {}
    }
    return fullText;
  }

  // ═══════════════════════════════════════════════════════
  // GROQ — streaming
  // ═══════════════════════════════════════════════════════
  async function _callGroq(key, systemText, dmBody) {
    const models = [
      'openai/gpt-oss-120b',     // El más inteligente y literario (120B)
      'llama-3.3-70b-versatile', // Meta 70B — excelente para rol
      'openai/gpt-oss-20b',      // Modelo intermedio ultra-veloz
      'llama-3.1-8b-instant',    // Salvavidas rápido
    ];
    for (const model of models) {
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model, messages: _buildMessages(systemText), max_tokens: MAX_TOKENS, stream: true,
          }),
        });
        if (!res.ok) { console.warn(`Groq: HTTP ${res.status} con ${model}`); continue; }
        const fullText = await readSSEStream(res, dmBody);
        if (fullText) { console.log(`✓ Groq: ${model}`); return { fullText, modelUsed: `groq/${model}` }; }
      } catch(e) { console.warn(`Groq: error con ${model}`, e); }
    }
    throw new Error('Groq no respondió. Verifica tu clave en console.groq.com.');
  }

  // ═══════════════════════════════════════════════════════
  // OPENROUTER — streaming
  // ═══════════════════════════════════════════════════════
  async function _callOpenRouter(key, systemText, dmBody) {
    const models = [
      'meta-llama/llama-3.1-8b-instruct:free',
      'mistralai/mistral-7b-instruct:free',
      'qwen/qwen-2.5-7b-instruct:free',
    ];
    const headers = {
      'Authorization': 'Bearer ' + key,
      'Content-Type': 'application/json',
      'X-Title': 'Cronicas del Abismo',
    };
    for (const model of models) {
      try {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST', mode: 'cors', headers,
          body: JSON.stringify({ model, messages: _buildMessages(systemText), stream: true }),
        });
        if (!res.ok) { console.warn(`OpenRouter: HTTP ${res.status} con ${model}`); continue; }
        const fullText = await readSSEStream(res, dmBody);
        if (fullText) { console.log(`✓ OpenRouter: ${model}`); return { fullText, modelUsed: model }; }
      } catch(e) { console.warn(`OpenRouter: error con ${model}`, e); }
    }
    throw new Error('Todos los modelos de OpenRouter fallaron. Prueba con una clave de Groq (console.groq.com, gratis).');
  }

  // ═══════════════════════════════════════════════════════
  // PARSEO DE ETIQUETAS — 10 etiquetas reconocidas
  // ═══════════════════════════════════════════════════════
  function parseDmTags(text) {
    // Normalizar etiquetas que el modelo emite sin corchetes (ej: "ENEMY_DEFEATED" → "[ENEMY_DEFEATED]")
    text = text
      .replace(/(?<!\[)\b(ENEMY_DEFEATED|END_CONVERSATION|END_COMBAT|SPELL_USED|RESTORE_SPELLS)\b(?!\])/g, '[$1]')
      .replace(/(?<!\[)\b(GAIN_XP|LOSE_HP|GAIN_HP|ENEMY_LOSE_HP|ADD_ITEM|REMOVE_ITEM|ADD_GOLD|REMOVE_GOLD|REQUEST_ROLL|ENEMY_CARD|NPC_CARD|ADD_QUEST|COMPLETE_QUEST|UPDATE_DIARY|GENERATE_IMAGE|SET_LOCATION|NPC_NAME|NPC_MEMO|LOCATION_MEMO|MORAL_NOTE|UPDATE_WORLD|COMPRESS_DIARY|ADD_SPELL|REMOVE_SPELL|OPEN_SHOP|ADD_CONDITION|REMOVE_CONDITION|FACTION_REP|FACTION_INTRO):\s*([^\n\[]{1,300})/g, '[$1: $2]');

    let totalXP = 0, hpDelta = 0, enemyHpDelta = 0, goldDelta = 0, rollAttr = null, rollMode = 'normal', diaryEntry = null, imagePrompt = null;
    const enemyCardList = []; let enemyDefeated = false, npcCardId = null, npcName = null, setLocation = null, endConversation = false, combatEnded = false, compressedDiary = null;
    const worldUpdates = [];
    const itemsToAdd = [], itemsToRemove = [];
    const questsToAdd = [], questsToComplete = [];
    const npcMemos = [], locationMemos = [], moralNotes = [];
    const spellsToAdd = [], spellsToRemove = [];
    let spellUsed = false, restoreSpells = false;
    let shopData = null;
    const conditionsToAdd = [], conditionsToRemove = [];
    const factionUpdates = [], factionIntros = [];

    const cleaned = text
      .replace(/\[GAIN_XP:\s*(\d+)\s*\]/gi, (_, n) => {
        const v = parseInt(n, 10);
        if (v >= 1 && v <= 50000) totalXP += v;
        return '';
      })
      .replace(/\[LOSE_HP:\s*(\d+)\s*\]/gi, (_, n) => {
        const v = parseInt(n, 10);
        if (v >= 1 && v <= 9999) hpDelta -= v;
        return '';
      })
      .replace(/\[GAIN_HP:\s*(\d+)\s*\]/gi, (_, n) => {
        const v = parseInt(n, 10);
        if (v >= 1 && v <= 9999) hpDelta += v;
        return '';
      })
      .replace(/\[ENEMY_LOSE_HP:\s*(\d+)\s*\]/gi, (_, n) => {
        const v = parseInt(n, 10);
        if (v >= 1 && v <= 9999) enemyHpDelta += v;
        return '';
      })
      .replace(/\[REQUEST_ROLL:\s*([^\]]+)\]/gi, (_, raw) => {
        if (!rollAttr) {
          const parts = raw.split('|');
          rollAttr = parts[0].trim();
          const m = (parts[1] || '').trim().toLowerCase();
          rollMode = (m === 'ventaja' || m === 'desventaja') ? m : 'normal';
        }
        return '';
      })
      .replace(/\[ADD_ITEM:\s*([^\]]+)\]/gi, (_, name) => {
        const n = name.trim(); if (n) itemsToAdd.push(n); return '';
      })
      .replace(/\[REMOVE_ITEM:\s*([^\]]+)\]/gi, (_, name) => {
        const n = name.trim(); if (n) itemsToRemove.push(n); return '';
      })
      .replace(/\[ADD_QUEST:\s*([^\]]+)\]/gi, (_, title) => {
        const t = title.trim(); if (t) questsToAdd.push(t); return '';
      })
      .replace(/\[COMPLETE_QUEST:\s*([^\]]+)\]/gi, (_, title) => {
        const t = title.trim(); if (t) questsToComplete.push(t); return '';
      })
      .replace(/\[UPDATE_DIARY:\s*([^\]]+)\]/gi, (_, entry) => {
        const e = entry.trim(); if (e && !diaryEntry) diaryEntry = e;
        return '';
      })
      .replace(/\[GENERATE_IMAGE:\s*([^\]]+)\]/gi, (_, prompt) => {
        const p = prompt.trim().replace(/\s+/g, '-').toLowerCase();
        if (p && !imagePrompt) imagePrompt = p;
        return '';
      })
      .replace(/\[ENEMY_CARD:\s*([^|\]]+)\|?([^|\]]*)\|?([^\]]*)\]/gi, (_, prompt, name, countStr) => {
        enemyCardList.push({
          prompt: prompt.trim().replace(/\s+/g, '-').toLowerCase(),
          name:   (name.trim() || 'Enemigo'),
          count:  Math.max(1, Math.min(6, parseInt(countStr.trim()) || 1)),
        });
        return '';
      })
      .replace(/\[ENEMY_DEFEATED\]/gi,    () => { enemyDefeated  = true; return ''; })
      .replace(/\[NPC_CARD:\s*([^\]]+)\]/gi, (_, id) => {
        const i = id.trim(); if (i && !npcCardId) npcCardId = i;
        return '';
      })
      .replace(/\[NPC_NAME:\s*([^|\]]+)\|([^\]]+)\]/gi, (_, id, nombre) => {
        const i = id.trim(), n = nombre.trim();
        if (i && n && !npcName) npcName = { id: i, nombre: n };
        return '';
      })
      .replace(/\[SET_LOCATION:\s*([^\]]+)\]/gi, (_, name) => {
        const n = name.trim(); if (n && !setLocation) setLocation = n;
        return '';
      })
      .replace(/\[UPDATE_WORLD:\s*([^|\]]+)\|([^\]]+)\]/gi, (_, key, value) => {
        const k = key.trim(), v = value.trim();
        if (k && v) worldUpdates.push({ key: k, value: v });
        return '';
      })
      .replace(/\[END_CONVERSATION\]/gi, () => { endConversation = true; return ''; })
      .replace(/\[END_COMBAT\]/gi,       () => { combatEnded    = true; return ''; })
      .replace(/\[NPC_MEMO:\s*([^|\]]+)\|([^|\]]+)\|([^\]]+)\]/gi, (_, name, attitude, note) => {
        npcMemos.push({ name: name.trim(), attitude: attitude.trim(), note: note.trim() });
        return '';
      })
      .replace(/\[LOCATION_MEMO:\s*([^|\]]+)\|([^\]]+)\]/gi, (_, name, note) => {
        locationMemos.push({ name: name.trim(), note: note.trim() });
        return '';
      })
      .replace(/\[MORAL_NOTE:\s*([^\]]+)\]/gi, (_, summary) => {
        moralNotes.push(summary.trim());
        return '';
      })
      .replace(/\[COMPRESS_DIARY:\s*([\s\S]+?)\]/gi, (_, summary) => {
        const s = summary.trim(); if (s) compressedDiary = s;
        return '';
      })
      .replace(/\[ADD_SPELL:\s*([^|\]]+)\|?([^\]]*)\]/gi, (_, name, tipo) => {
        const n = name.trim();
        const t = (tipo.trim() || 'nivel1').toLowerCase();
        if (n) spellsToAdd.push({ name: n, tipo: t === 'cantrip' ? 'cantrip' : 'nivel1' });
        return '';
      })
      .replace(/\[REMOVE_SPELL:\s*([^\]]+)\]/gi, (_, name) => {
        const n = name.trim(); if (n) spellsToRemove.push(n); return '';
      })
      .replace(/\[SPELL_USED\]/gi, () => { spellUsed = true; return ''; })
      .replace(/\[RESTORE_SPELLS\]/gi, () => { restoreSpells = true; return ''; })
      .replace(/\[OPEN_SHOP:\s*([^\]]+)\]/gi, (_, raw) => {
        const items = raw.split(';').map(s => s.trim()).filter(Boolean).map(entry => {
          const [name, priceStr, tipo] = entry.split('|').map(p => p.trim());
          if (!name) return null;
          const price = Math.max(1, parseInt(priceStr) || 10);
          const t = (tipo || 'misc').toLowerCase();
          return { id: 'shop_' + Date.now() + '_' + Math.random().toString(36).slice(2, 4), name, price, tipo: ['arma','armadura','accesorio','consumible','pocion','herramienta','magico','misc'].includes(t) ? t : 'misc' };
        }).filter(Boolean);
        if (items.length) shopData = items;
        return '';
      })
      .replace(/\[ADD_GOLD:\s*(\d+)\s*\]/gi, (_, n) => {
        const v = parseInt(n, 10);
        if (v >= 1) goldDelta += v;
        return '';
      })
      .replace(/\[REMOVE_GOLD:\s*(\d+)\s*\]/gi, (_, n) => {
        const v = parseInt(n, 10);
        if (v >= 1) goldDelta -= v;
        return '';
      })
      .replace(/\[ADD_CONDITION:\s*([^\]]+)\]/gi, (_, name) => {
        const n = name.trim(); if (n) conditionsToAdd.push(n); return '';
      })
      .replace(/\[REMOVE_CONDITION:\s*([^\]]+)\]/gi, (_, name) => {
        const n = name.trim(); if (n) conditionsToRemove.push(n); return '';
      })
      .replace(/\[FACTION_REP:\s*([^|\]]+)\|([^\]]+)\]/gi, (_, name, delta) => {
        const d = parseInt(String(delta).replace(/[^-\d]/g, ''), 10);
        if (name.trim() && !isNaN(d)) factionUpdates.push({ name: name.trim(), delta: d });
        return '';
      })
      .replace(/\[FACTION_INTRO:\s*([^\]]+)\]/gi, (_, name) => {
        const n = name.trim(); if (n) factionIntros.push(n); return '';
      })
      .trim();

    return { cleaned, totalXP, hpDelta, enemyHpDelta, goldDelta, rollAttr, rollMode, diaryEntry, imagePrompt, enemyCardList, enemyDefeated, npcCardId, npcName, setLocation, worldUpdates, endConversation, combatEnded, compressedDiary, npcMemos, locationMemos, moralNotes, itemsToAdd, itemsToRemove, questsToAdd, questsToComplete, spellsToAdd, spellsToRemove, spellUsed, restoreSpells, shopData, conditionsToAdd, conditionsToRemove, factionUpdates, factionIntros };
  }

  function applyXpGain(amount) {
    if (amount <= 0) return;
    const xpEl = $('xp-current');
    if (!xpEl) return;
    const prevXP = parseInt(xpEl.value) || 0;
    const newXP  = prevXP + amount;
    xpEl.value = newXP;
    lsSave('rpg_xp-current', String(newXP));
    updateXpBar();
    checkLevelUp(prevXP, newXP);
    addSystemMessage(`✨ +${amount.toLocaleString('es')} XP — Total: ${newXP.toLocaleString('es')} XP`);
  }

  function applyHpChange(delta) {
    if (delta === 0) return;
    const maxHp = parseInt(hpMax.value)     || 1;
    const curHp = parseInt(hpCurrent.value) || 0;
    const newHp = Math.min(maxHp, Math.max(0, curHp + delta));
    hpCurrent.value = newHp;
    lsSave('rpg_hp-current', String(newHp));
    updateHpBar();
    if (delta < 0) {
      addSystemMessage(`🩸 ${Math.abs(delta)} puntos de daño — HP: ${newHp}/${maxHp}`);
      if (newHp === 0) {
        addSystemMessage('💀 ¡El personaje ha caído! HP a 0.');
        logProgress(`${state.charName || 'El aventurero'} cayó en combate (HP a 0).`, 'muerte');
        if (uiState.inCombat) setTimeout(triggerPlayerDeath, 1200);
      }
    } else {
      addSystemMessage(`💚 +${delta} HP recuperados — HP: ${newHp}/${maxHp}`);
    }
  }

  // ═══════════════════════════════════════════════════════
  // ORQUESTADOR PRINCIPAL
  // ═══════════════════════════════════════════════════════
  // isOoc: mensaje [OG] — modo fuera de personaje, sin mecánicas de rol
  async function callDM(userMessage, isOoc = false) {
    const key = (apiKeyInput.value || state.apiKey || '').trim();
    if (!key) {
      addSystemMessage('⚠ Configura tu API Key en el panel derecho. Obtén una gratis en console.groq.com (recomendado) u openrouter.ai.');
      return;
    }

    // Completar cualquier typewriter en curso antes de la nueva respuesta
    if (_completeTypewriter) { _completeTypewriter(); }

    // En modo OOC el mensaje no entra en el historial de API para no contaminar el contexto del DM
    if (!isOoc) state.history.push({ role: 'user', content: userMessage });

    const loreText   = worldLore.value.trim() || 'Mundo de fantasía estándar medieval oscuro.';
    const _dmName    = $('char-name').value.trim() || state.charName || 'el aventurero';
    const _dmCls     = $('char-class').value.trim() || state.charClass || 'aventurero';
    const systemText = isOoc
      ? `ATENCIÓN — MODO DESARROLLADOR ACTIVO: Sal por completo de tu rol de Dungeon Master. No narres, no pidas tiradas de dados, no uses ninguna etiqueta del sistema de juego ([GAIN_XP], [LOSE_HP], [GAIN_HP], [REQUEST_ROLL], [ADD_ITEM], [REMOVE_ITEM], [ADD_QUEST], [COMPLETE_QUEST]). Responde de forma directa, técnica y transparente como una IA asistente respondiendo al desarrollador. Sé conciso y claro. El idioma de tu respuesta debe coincidir con el del mensaje que recibes.`
      : `${buildDmCore(_dmName, _dmCls)}\n\n=== INSTRUCCIONES DEL MUNDO / LORE ===\n${loreText}\n\n${buildCharBlock()}\n\n=== RECORDATORIO FINAL ANTES DE RESPONDER ===\n${
  uiState.inCombat
    ? `ESTÁS EN COMBATE. Antes de responder, comprueba:\n1. ¿El jugador acaba de enviar su tirada? → compara con la CA del enemigo (ver bloque COMBATE ACTIVO arriba) y aplica daño con [ENEMY_LOSE_HP: N].\n2. ¿El jugador acaba de pedir atacar pero NO ha tirado aún? → responde SOLO con [REQUEST_ROLL: Fuerza] (o atributo relevante). Nada más.\n3. ¿El enemigo llega a 0 HP? → [ENEMY_DEFEATED] + [GAIN_XP: N].\n4. ¿Has calculado tú la tirada del jugador? → BORRA ese cálculo. El jugador LANZA el dado.`
    : `Comprueba: ¿has incluido [GAIN_XP]? Solo es válido si en este turno el jugador ha derrotado un enemigo o cerrado un hito narrativo. Si tu narración no describe esa victoria, elimina la etiqueta.`
}\nLa coherencia entre texto y etiquetas es obligatoria.`;

    setDmState('thinking');
    const dmBody = createDmStreamMessage();

    try {
      const { fullText, modelUsed } = key.startsWith('gsk_')
        ? await _callGroq(key, systemText, dmBody)
        : await _callOpenRouter(key, systemText, dmBody);

      if (isOoc) {
        // Modo OOC: mostrar respuesta limpia, sin parsear etiquetas ni aplicar efectos
        const oocHtml = mdToHtml(fullText.trim());
        dmBody.innerHTML = oocHtml;
        state.chatLog.push({ type: 'dm', html: oocHtml });
        saveChatLog();
        console.log(`✓ [OOC] ${modelUsed}`);
        return { text: fullText.trim(), modelUsed };
      }

      // Modo normal: parsear etiquetas y aplicar mecánicas
      const {
        cleaned: displayText,
        totalXP, hpDelta, enemyHpDelta, goldDelta, rollAttr, rollMode, diaryEntry, imagePrompt,
        enemyCardList, enemyDefeated, npcCardId, npcName, setLocation, worldUpdates, endConversation, combatEnded, compressedDiary,
        npcMemos, locationMemos, moralNotes,
        itemsToAdd, itemsToRemove,
        questsToAdd, questsToComplete,
        spellsToAdd, spellsToRemove, spellUsed, restoreSpells,
        shopData,
        conditionsToAdd, conditionsToRemove, factionUpdates, factionIntros,
      } = parseDmTags(fullText);

      // El streaming ya mostró el texto char-a-char; solo aplicar HTML formateado
      if (_completeTypewriter) { _completeTypewriter(); }
      const finalHtml = mdToHtml(displayText);
      dmBody.innerHTML = finalHtml;
      if (dmBody._csMirror) {
        dmBody._csMirror.className = 'cs-msg-body';
        dmBody._csMirror.innerHTML = finalHtml;
        const csMsgs = $('cs-narration-messages');
        if (csMsgs) csMsgs.scrollTop = csMsgs.scrollHeight;
      }
      scrollBottom();

      state.history.push({ role: 'assistant', content: displayText });
      state.chatLog.push({ type: 'dm', html: finalHtml });

      // Añadir entrada al Diario de Campaña si la IA detectó un evento importante
      if (diaryEntry) {
        const separator = state.campaignDiary ? '\n' : '';
        state.campaignDiary += separator + '· ' + diaryEntry;
      }

      // Aplicar crónica estructurada
      npcMemos.forEach(m       => addNpcMemo(m.name, m.attitude, m.note));
      locationMemos.forEach(m  => addLocationMemo(m.name, m.note));
      moralNotes.forEach(s     => addMoralNote(s));
      worldUpdates.forEach(({ key, value }) => {
        updateWorldState(key, value);
        addSystemMessage(`🌍 ${key}: ${value}`);
      });

      // Aplicar compresión del diario si la IA lo ha resumido
      if (compressedDiary) {
        state.campaignDiary = compressedDiary;
        addSystemMessage('📜 Crónica comprimida — los eventos más relevantes han sido preservados.');
      }

      saveChatLog(); // guarda chat + historial + diario en un solo paso
      if (diaryEntry || npcMemos.length || locationMemos.length || moralNotes.length) {
        createCheckpoint(); // checkpoint automático en cada evento del diario
        if (diaryEntry) logProgress(diaryEntry, 'historia');
      }

      console.log(`✓ ${modelUsed}`);

      if (totalXP > 0)   applyXpGain(totalXP);
      if (hpDelta !== 0) applyHpChange(hpDelta);
      if (goldDelta > 0) addGold(goldDelta);
      else if (goldDelta < 0) removeGold(-goldDelta);
      if (rollAttr)      activatePendingRoll(rollAttr, rollMode);

      // Daño infligido al enemigo → actualizar barra de HP
      if (enemyHpDelta > 0 && state.activeEnemy) {
        state.activeEnemy.hpCurrent = Math.max(0, (state.activeEnemy.hpCurrent ?? state.activeEnemy.hpMax ?? 10) - enemyHpDelta);
        updateHealth('enemy', state.activeEnemy.hpCurrent, state.activeEnemy.hpMax ?? 10);
        lsSave('rpg_active_enemy', JSON.stringify(state.activeEnemy));
      }

      itemsToAdd.forEach(name    => addInventoryItem(name));
      itemsToRemove.forEach(name  => removeInventoryItem(name));
      questsToAdd.forEach(title   => addQuest(title));
      questsToComplete.forEach(title => completeQuest(title));
      spellsToAdd.forEach(({ name, tipo }) => addSpell(name, tipo));
      spellsToRemove.forEach(name => removeSpell(name));
      if (spellUsed)     useSpellSlot();
      if (restoreSpells) restoreSpellSlots();
      if (shopData)      showShop(shopData);
      conditionsToAdd.forEach(name    => addCondition(name));
      conditionsToRemove.forEach(name => removeCondition(name));
      factionIntros.forEach(name      => registerFaction(name));
      factionUpdates.forEach(({ name, delta }) => updateFaction(name, delta));

      // Ubicación — actualizar ANTES de mostrar tarjetas de NPC (orden crítico)
      if (setLocation) _setCurrentLocation(setLocation.toLowerCase().trim(), setLocation.trim());

      // Tarjeta de enemigo/NPC
      for (const ec of enemyCardList) showEnemyCard(ec.prompt, ec.name, ec.count || 1);
      if (enemyDefeated)   defeatEnemy();
      if (combatEnded)     endCombat();
      if (npcCardId)       showNpcCard(npcCardId);
      if (endConversation) hideNpcCard();

      // Nombre de NPC asignado por la IA — clave compuesta npc-id@location-id
      if (npcName) {
        const locKey = state.currentLocation?.id || 'global';
        const compositeKey = `${npcName.id}@${locKey}`;
        state.npcNames[compositeKey] = npcName.nombre;
        lsSave('rpg_npc_names', JSON.stringify(state.npcNames));
        if (state.activeNpc?.id === npcName.id) {
          state.activeNpc.nombre = npcName.nombre;
          const rName = $('enemy-card-name');
          if (rName) rName.textContent = npcName.nombre;
        }
      }

      // Imagen en el chat (entornos, objetos, NPCs no combativos)
      if (imagePrompt) renderChatImage(imagePrompt);

      return { text: displayText, modelUsed };

    } catch (err) {
      const isOffline = !navigator.onLine || err instanceof TypeError;
      const msg = isOffline
        ? '📶 Sin conexión a internet. Verifica tu red y vuelve a intentarlo.'
        : err.message;
      dmBody.innerHTML = `<p style="color:var(--red-bright)">⚠ ${escHtml(msg)}</p>`;
      if (!isOoc) state.history.pop();
      console.error('[RPG API Error]', err);
    } finally {
      dmBody.classList.remove('dm-streaming');
      setDmState('ready');
      updateStats();
    }
  }

  // ═══════════════════════════════════════════════════════
  // ENVIAR MENSAJE
  // ═══════════════════════════════════════════════════════
  async function handleSend() {
    if (state.isStreaming) return;
    const raw = playerInput.value.trim();
    if (!raw) return;

    // Detectar modo OOC: el mensaje empieza estrictamente con [OG]
    const isOoc = /^\[OG\]/i.test(raw);
    const text  = isOoc ? raw.replace(/^\[OG\]\s*/i, '').trim() : raw;

    if (!text) return; // [OG] sin mensaje → ignorar silenciosamente

    addPlayerMessage(raw); // muestra el mensaje original incluyendo [OG]
    playerInput.value = '';
    playerInput.style.height = 'auto';
    updateStats();
    await callDM(text, isOoc);
  }

  sendBtn.addEventListener('click', handleSend);
  playerInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); handleSend(); }
  });
  playerInput.addEventListener('input', () => {
    playerInput.style.height = 'auto';
    playerInput.style.height = Math.min(playerInput.scrollHeight, 120) + 'px';
  });

  // ═══════════════════════════════════════════════════════
  // ESTADO DM
  // ═══════════════════════════════════════════════════════
  function setDmState(mode) {
    state.isStreaming = mode === 'thinking';
    sendBtn.disabled  = state.isStreaming;
    if (mode === 'thinking') {
      statusDot.className    = 'status-dot thinking';
      statusText.textContent = 'Dungeon Master narrando...';
    } else {
      statusDot.className    = 'status-dot ready';
      statusText.textContent = 'Dungeon Master listo';
    }
  }

  // ═══════════════════════════════════════════════════════
  // API KEY
  // ═══════════════════════════════════════════════════════
  function setApiStatus(ok, msg) {
    apiDot.className     = 'dot ' + (ok ? 'dot-on' : 'dot-err');
    apiLabel.textContent = ok ? 'Configurada ✓' : (msg || 'No configurada');
  }

  if (state.apiKey) { apiKeyInput.value = state.apiKey; setApiStatus(true); setDmState('ready'); }

  toggleApiBtn.addEventListener('click', () => {
    const isPass = apiKeyInput.type === 'password';
    apiKeyInput.type     = isPass ? 'text' : 'password';
    toggleApiBtn.textContent = isPass ? '🙈' : '👁';
  });

  saveApiBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (!key) { setApiStatus(false, 'Introduce una clave válida'); return; }
    state.apiKey = key;
    localStorage.setItem('rpg_api_key', key);
    setApiStatus(true); setDmState('ready');
    addSystemMessage('✓ API Key guardada. El Dungeon Master está listo para narrar tu aventura.');
  });

  // ═══════════════════════════════════════════════════════
  // PERSISTENCIA DE CAMPOS
  // ═══════════════════════════════════════════════════════
  const PERSIST_IDS = [
    'char-name', 'char-class', 'char-level',
    'hp-current', 'hp-max',
    'stat-str', 'stat-dex', 'stat-con', 'stat-int', 'stat-wis', 'stat-cha',
    'world-lore', 'story-summary',
    'xp-current',
  ];

  PERSIST_IDS.forEach(id => {
    const el = $(id);
    if (!el) return;
    const saved = localStorage.getItem(`rpg_${id}`);
    if (saved !== null) el.value = saved;
    el.addEventListener('input', debounce(() => lsSave(`rpg_${id}`, el.value), 400));
  });

  const classInput = $('char-class');
  if (classInput) {
    classInput.addEventListener('input', updatePlayerAvatar);
  }

  // ═══════════════════════════════════════════════════════
  // MODAL DE CREACIÓN DE PERSONAJE
  // ═══════════════════════════════════════════════════════
  function showCharModal() {
    if (charModal) charModal.classList.add('visible');
    if (modalName) modalName.focus();
  }

  function hideCharModal() { if (charModal) charModal.classList.remove('visible'); }

  function lockCharFields() {
    $('char-name')?.setAttribute('readonly', '');
    $('char-class')?.setAttribute('readonly', '');
  }

  if (modalStartBtn) {
    modalStartBtn.addEventListener('click', () => {
      const name = modalName?.value.trim();
      const cls  = modalClass?.value;
      if (!name) { modalName?.focus(); return; }
      if (!cls)  { modalClass?.focus(); return; }

      state.charName  = name;
      state.charClass = cls;

      const nameEl  = $('char-name');
      const classEl = $('char-class');
      if (nameEl)  { nameEl.value  = name; lsSave('rpg_char-name',  name); }
      if (classEl) { classEl.value = cls;  lsSave('rpg_char-class', cls);  }

      // Aplicar estadísticas base de la clase desde stats-clases.js
      const clsStats = window.CLASE_STATS?.[cls];
      const _statMap = { fuerza:'str', destreza:'dex', constitucion:'con', inteligencia:'int', sabiduria:'wis', carisma:'cha' };
      if (clsStats) {
        Object.entries(_statMap).forEach(([esKey, enKey]) => {
          const val = String(clsStats[esKey] ?? 10);
          const el  = $(`stat-${enKey}`);
          if (el) { el.value = val; lsSave(`rpg_stat-${enKey}`, val); }
        });
        ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(updateMod);
      }

      // HP base: usa el valor de CLASE_STATS si está disponible, sino fórmula genérica
      const hpBase = clsStats
        ? clsStats.hp
        : Math.max(1, getHpPerLevel() + Math.floor(((parseInt($('stat-con')?.value || '10') - 10) / 2)));
      hpMax.value     = hpBase; lsSave('rpg_hp-max',     String(hpBase));
      hpCurrent.value = hpBase; lsSave('rpg_hp-current', String(hpBase));
      updateHpBar();

      lockCharFields();
      updatePlayerAvatar();
      updateSkillBonuses();
      hideCharModal();

      chatMessages.innerHTML = '';
      state.chatLog = []; state.history = []; state.inventory = []; state.quests = [];
      state.campaignDiary = ''; state.activeNpc = null; state.activeEnemy = null;
      state.npcLog = {}; state.locationLog = {}; state.moralLog = [];
      state.playerStats = { str:0, dex:0, con:0, int:0, wis:0, cha:0 };
      state.gold = 0; state.spells = []; state.preparedSpell = null; state.spellSlotsUsed = 0;
      state.shopItems = [];
      state.conditions = []; state.factions = {};
      localStorage.removeItem('rpg_conditions'); localStorage.removeItem('rpg_factions');
      // Hechizos iniciales según clase
      (CLASS_STARTING_SPELLS[_classSlug(cls)] || []).forEach(({ name, tipo }) => {
        const id = 'spell_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5);
        state.spells.push({ id, name, tipo });
      });
      uiState.inCombat = false; uiState.inConversation = false; uiState.isInspecting = false;
      $('chat-messages')?.classList.remove('has-combat-ui');
      localStorage.removeItem('rpg_active_enemy'); localStorage.removeItem('rpg_active_npc');
      localStorage.removeItem('rpg_npc_log'); localStorage.removeItem('rpg_location_log'); localStorage.removeItem('rpg_moral_log');
      localStorage.removeItem('rpg_player_stats');
      const _newRCard = $('enemy-card'), _newPCard = $('player-card'), _newPanel = $('battle-panel');
      if (_newRCard)  { _newRCard.classList.remove('active','defeated','mode-combat','mode-npc'); _newRCard.setAttribute('aria-hidden','true'); }
      if (_newPCard)  { _newPCard.classList.remove('active'); _newPCard.setAttribute('aria-hidden','true'); }
      if (_newPanel)  { _newPanel.classList.remove('active'); _newPanel.setAttribute('aria-hidden','true'); }
      _hideGameOverOverlay?.();
      saveChatLog(); saveGameState();
      renderInventory(); renderEquipment(); renderQuests(); renderGold(); renderSpells(); renderSpells();

      addSystemMessage(`✦ ${name} el/la ${cls} comienza su aventura. ¡Que los dioses te acompañen!`);
    });
  }

  [modalName, modalClass].forEach(el => {
    el?.addEventListener('keydown', e => { if (e.key === 'Enter') modalStartBtn?.click(); });
  });

  // ═══════════════════════════════════════════════════════
  // BOTONES DE CONTEXTO
  // ═══════════════════════════════════════════════════════
  updateSummaryBtn.addEventListener('click', () => {
    addSystemMessage('📖 Resumen actualizado. La IA usará este contexto en el próximo turno.');
    updateStats();
  });

  clearChatBtn.addEventListener('click', () => {
    if (!confirm('¿Comenzar una nueva partida? El historial del chat se borrará y la memoria de la IA se reiniciará.')) return;
    chatMessages.innerHTML = '';
    state.history = []; state.chatLog = [];
    saveChatLog();
    setDmState('ready');
    addSystemMessage('— Nueva partida iniciada. El Dungeon Master aguarda tu primera acción. —');
    updateStats();
  });

  // ═══════════════════════════════════════════════════════
  // RESET PROGRESIÓN
  // ═══════════════════════════════════════════════════════
  const btnReset = $('btn-reset-prog');
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      if (!confirm('¿Resetear nivel, XP y todos los atributos a sus valores iniciales?\nEl nombre, inventario y chat no se borrarán.')) return;
      const levelEl = $('char-level'), xpEl = $('xp-current');
      if (levelEl) { levelEl.value = 1; lsSave('rpg_char-level', '1'); }
      if (xpEl)    { xpEl.value    = 0; lsSave('rpg_xp-current', '0'); }
      // HP: usa el valor base de la clase, o 10 si no hay clase
      const _resetCls     = ($('char-class')?.value || state.charClass || '').trim();
      const _resetClsData = window.CLASE_STATS?.[_resetCls];
      const _resetHp      = _resetClsData?.hp ?? 10;
      hpMax.value     = _resetHp; lsSave('rpg_hp-max',     String(_resetHp));
      hpCurrent.value = _resetHp; lsSave('rpg_hp-current', String(_resetHp));
      // Atributos: resetear puntos ASI y recalcular desde la base de clase
      state.playerStats = { str:0, dex:0, con:0, int:0, wis:0, cha:0 };
      lsSave('rpg_player_stats', JSON.stringify(state.playerStats));
      syncStatDisplays(); // pinta base de clase (sin puntos de nivel)
      state.puntosDisponibles = 0;
      _syncModoASI();
      updateHpBar(); updateSkillBonuses(); updateXpBar();
      const _baseMsg = _resetClsData ? `Atributos de ${_resetCls} restaurados` : 'Atributos a 10';
      addSystemMessage(`↺ Progresión reseteada — Nivel 1 · 0 XP · ${_baseMsg}.`);
    });
  }

  // ═══════════════════════════════════════════════════════
  // BOTONES DE GAME OVER
  // ═══════════════════════════════════════════════════════
  function _hideGameOverOverlay() {
    const o = $('gameover-overlay');
    if (o) { o.classList.remove('visible'); o.setAttribute('aria-hidden', 'true'); }
  }

  $('btn-load-checkpoint')?.addEventListener('click', () => {
    _hideGameOverOverlay();
    if (loadCheckpoint()) {
      addSystemMessage('⏪ Partida restaurada al último punto de control.');
      // Reset any leftover combat state
      uiState.inCombat = false; uiState.inConversation = false;
      updateEntityUI('inspect', null, false); // trigger panel re-sync
    } else {
      addSystemMessage('⚠ No hay punto de control disponible. Se guarda automáticamente en cada evento del Diario.');
    }
  });

  $('btn-restart-death')?.addEventListener('click', () => {
    _hideGameOverOverlay();
    // Reinicio directo sin confirmación (el jugador ya decidió desde el overlay)
    const savedKey = localStorage.getItem('rpg_api_key') || '';
    localStorage.clear();
    if (savedKey) localStorage.setItem('rpg_api_key', savedKey);
    state.history = []; state.chatLog = []; state.inventory = []; state.quests = [];
    state.campaignDiary = ''; state.activeNpc = null; state.activeEnemy = null;
    state.npcLog = {}; state.locationLog = {}; state.moralLog = [];
    state.playerStats = { str:0, dex:0, con:0, int:0, wis:0, cha:0 };
    uiState.inCombat = false; uiState.inConversation = false; uiState.isInspecting = false;
    $('chat-messages')?.classList.remove('has-combat-ui');
    const _goRCard = $('enemy-card'), _goPCard = $('player-card'), _goPanel = $('battle-panel');
    if (_goRCard)  { _goRCard.classList.remove('active','defeated','mode-combat','mode-npc'); _goRCard.setAttribute('aria-hidden','true'); }
    if (_goPCard)  { _goPCard.classList.remove('active'); _goPCard.setAttribute('aria-hidden','true'); }
    if (_goPanel)  { _goPanel.classList.remove('active'); _goPanel.setAttribute('aria-hidden','true'); }
    chatMessages.innerHTML = '';
    PERSIST_IDS.forEach(id => {
      const el = $(id); if (!el) return;
      if (id === 'char-level') el.value = '1';
      else if (id === 'hp-current' || id === 'hp-max') el.value = '10';
      else if (id.startsWith('stat-')) el.value = '10';
      else if (id === 'xp-current') el.value = '0';
      else el.value = '';
      if (id === 'char-name' || id === 'char-class') el.removeAttribute('readonly');
    });
    renderInventory(); renderEquipment(); renderQuests(); renderGold(); renderSpells();
    updateHpBar(); updateXpBar();
    ['str','dex','con','int','wis','cha'].forEach(updateMod);
    updateSkillBonuses(); setDmState('ready');
    showCharModal();
  });

  // ═══════════════════════════════════════════════════════
  // WIPE TOTAL
  // ═══════════════════════════════════════════════════════
  const btnWipe = $('btn-wipe');
  if (btnWipe) {
    btnWipe.addEventListener('click', () => {
      if (!confirm('⚠ ¿Estás seguro de que quieres borrar tu personaje y toda la historia?\nEsto no se puede deshacer.')) return;
      const savedKey = localStorage.getItem('rpg_api_key') || '';
      localStorage.clear();
      if (savedKey) localStorage.setItem('rpg_api_key', savedKey);

      state.history = []; state.chatLog = [];
      state.inventory = []; state.quests = [];
      state.charName = ''; state.charClass = '';
      state.campaignDiary = '';
      state.rollHistory = [];
      localStorage.removeItem('rpg_roll_history');
      state.activeEnemy = null; state.activeNpc = null;
      state.npcLog = {}; state.locationLog = {}; state.moralLog = [];
      state.playerStats = { str:0, dex:0, con:0, int:0, wis:0, cha:0 };
      localStorage.removeItem('rpg_active_enemy');
      localStorage.removeItem('rpg_active_npc');
      localStorage.removeItem('rpg_npc_log');
      localStorage.removeItem('rpg_location_log');
      localStorage.removeItem('rpg_moral_log');
      localStorage.removeItem('rpg_player_stats');
      uiState.inCombat = false; uiState.inConversation = false; uiState.isInspecting = false;
      $('chat-messages')?.classList.remove('has-combat-ui');
      const _wipeRCard = $('enemy-card'), _wipePCard = $('player-card'), _wipePanel = $('battle-panel');
      if (_wipeRCard)  { _wipeRCard.classList.remove('active','defeated','mode-combat','mode-npc'); _wipeRCard.setAttribute('aria-hidden','true'); }
      if (_wipePCard)  { _wipePCard.classList.remove('active'); _wipePCard.setAttribute('aria-hidden','true'); }
      if (_wipePanel)  { _wipePanel.classList.remove('active'); _wipePanel.setAttribute('aria-hidden','true'); }
      _hideGameOverOverlay?.();
      state.puntosDisponibles = 0;
      deactivatePendingRoll();

      chatMessages.innerHTML = '';
      PERSIST_IDS.forEach(id => {
        const el = $(id);
        if (!el) return;
        if (id === 'char-level') el.value = '1';
        else if (id === 'hp-current' || id === 'hp-max') el.value = '10';
        else if (id.startsWith('stat-')) el.value = '10';
        else if (id === 'xp-current') el.value = '0';
        else el.value = '';
        if (id === 'char-name' || id === 'char-class') el.removeAttribute('readonly');
      });

      state.conditions = []; state.factions = {}; state.playerNotes = '';
      if (playerNotesEl) { playerNotesEl.value = ''; _updateNotesCounter(); }
      renderInventory(); renderEquipment(); renderQuests(); renderGold(); renderSpells();
      renderConditions(); renderFactions();
      updateHpBar(); updateXpBar();
      ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(updateMod);
      updateSkillBonuses(); _syncModoASI(); setDmState('ready');
      showCharModal();
    });
  }

  // ═══════════════════════════════════════════════════════
  // DIARIO DE CAMPAÑA — Botón y modal de lectura
  // ═══════════════════════════════════════════════════════
  const btnDiary    = $('btn-diary');
  const diaryModal  = $('diary-modal');
  const diaryBody   = $('diary-body');
  const diaryClose  = $('diary-close-btn');

  function openDiaryModal() {
    if (!diaryModal || !diaryBody) return;
    const ctx = buildDiaryContext();
    if (!ctx.trim()) {
      diaryBody.innerHTML = `<p class="diary-empty">El diario está vacío. Los eventos importantes de tu aventura aparecerán aquí cuando ocurran.</p>`;
    } else {
      diaryBody.innerHTML = ctx.trim().split('\n').map(line => {
        if (line.startsWith('## '))      return `<h3 class="diary-section">${escHtml(line.slice(3))}</h3>`;
        if (line.startsWith('### '))     return `<h4 class="diary-subsection">${escHtml(line.slice(4))}</h4>`;
        if (line.startsWith('- **') || line.startsWith('  · ') || line.startsWith('- '))
                                         return `<div class="diary-entry">${escHtml(line)}</div>`;
        return line.trim() ? `<div class="diary-entry">${escHtml(line)}</div>` : '';
      }).filter(Boolean).join('');
    }
    diaryModal.classList.add('visible');
  }

  function closeDiaryModal() {
    diaryModal?.classList.remove('visible');
  }

  btnDiary?.addEventListener('click', openDiaryModal);
  diaryClose?.addEventListener('click', closeDiaryModal);
  diaryModal?.addEventListener('click', e => {
    if (e.target === diaryModal) closeDiaryModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && diaryModal?.classList.contains('visible')) closeDiaryModal();
  });

  // ═══════════════════════════════════════════════════════
  // EXPORTAR PARTIDA
  // ═══════════════════════════════════════════════════════
  const btnExport = $('btn-export');
  if (btnExport) {
    btnExport.addEventListener('click', () => {
      const gameState = {
        version: 3,
        exportedAt: new Date().toISOString(),
        charName:  $('char-name')?.value  || '',
        charClass: $('char-class')?.value || '',
        fields: {},
        chatLog:       state.chatLog,
        history:       state.history,
        inventory:     state.inventory,
        quests:        state.quests,
        pendingRoll:   state.pendingRoll,
        campaignDiary: state.campaignDiary,
        npcLog:        state.npcLog,
        locationLog:   state.locationLog,
        moralLog:      state.moralLog,
        playerStats:   state.playerStats,
      };
      PERSIST_IDS.forEach(id => {
        const el = $(id); if (el) gameState.fields[id] = el.value;
      });
      gameState.fields['world-lore']    = worldLore.value;
      gameState.fields['story-summary'] = storySummary.value;

      const blob = new Blob([JSON.stringify(gameState, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      const n    = ($('char-name').value || 'aventurero').replace(/\s+/g, '_').toLowerCase();
      a.href     = url;
      a.download = `cronicas_${n}_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      addSystemMessage('📤 Partida exportada correctamente. Guarda el archivo en un lugar seguro.');
    });
  }

  // ═══════════════════════════════════════════════════════
  // IMPORTAR PARTIDA
  // ═══════════════════════════════════════════════════════
  const btnImport  = $('btn-import');
  const importFile = $('import-file');
  if (btnImport && importFile) {
    btnImport.addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', () => {
      const file = importFile.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const data = JSON.parse(e.target.result);
          if (!data.fields || !data.chatLog) throw new Error('Formato de archivo no válido.');

          Object.entries(data.fields).forEach(([id, val]) => {
            lsSave(`rpg_${id}`, String(val));
            const el = $(id); if (el) el.value = val;
          });

          state.chatLog       = data.chatLog       || [];
          state.history       = data.history       || [];
          state.inventory     = data.inventory     || [];
          state.quests        = data.quests        || [];
          state.pendingRoll   = data.pendingRoll   || null;
          state.charName      = data.charName      || '';
          state.charClass     = data.charClass     || '';
          state.campaignDiary = data.campaignDiary || '';
          state.npcLog        = data.npcLog        || {};
          state.locationLog   = data.locationLog   || {};
          state.moralLog      = data.moralLog      || [];
          state.playerStats   = data.playerStats   || { str:0, dex:0, con:0, int:0, wis:0, cha:0 };
          saveChatLog(); saveGameState();

          lockCharFields();
          renderChatLog(state.chatLog);
          renderInventory(); syncInventoryTextarea();
          renderQuests(); renderGold();
          if (state.pendingRoll) activatePendingRoll(state.pendingRoll.label, state.pendingRoll.mode || 'normal');
          syncStatDisplays(); // Recalcular stats desde clase + puntos ASI importados
          updateHpBar(); updateXpBar(); updateStats();

          addSystemMessage(`📥 Partida importada. Bienvenido de vuelta, ${data.charName || 'aventurero'}.`);
        } catch(err) {
          addSystemMessage(`⚠ Error al importar: ${err.message}`);
        }
        importFile.value = '';
      };
      reader.readAsText(file);
    });
  }

  // ═══════════════════════════════════════════════════════
  // ASI — delegación de eventos
  // ═══════════════════════════════════════════════════════
  const statsSection = $('stats-section');
  if (statsSection) {
    statsSection.addEventListener('click', e => {
      const btn = e.target.closest('.btn-stat-plus');
      if (btn) asignarPunto(btn.dataset.stat);
    });
  }

  // ═══════════════════════════════════════════════════════
  // TOGGLE ATRIBUTOS
  // ═══════════════════════════════════════════════════════
  $('stats-toggle')?.addEventListener('click', () => {
    const body = $('stats-body');
    const btn  = $('stats-toggle');
    if (!body || !btn) return;
    const collapsed = body.classList.toggle('collapsed');
    btn.textContent = collapsed ? '▶' : '▼';
    btn.setAttribute('aria-expanded', String(!collapsed));
    // Si hay puntos por distribuir, expandir automáticamente
    if (!collapsed && state.puntosDisponibles > 0) _syncModoASI();
  });

  // ═══════════════════════════════════════════════════════
  // TOGGLE HABILIDADES
  // ═══════════════════════════════════════════════════════
  const skillsToggle = $('skills-toggle');
  const skillsBody   = $('skills-body');
  if (skillsToggle && skillsBody) {
    skillsToggle.addEventListener('click', () => {
      const collapsed = skillsBody.classList.toggle('collapsed');
      skillsToggle.textContent = collapsed ? '▶' : '▼';
      skillsToggle.setAttribute('aria-expanded', String(!collapsed));
    });
  }

  // ═══════════════════════════════════════════════════════
  // NAVEGACIÓN MÓVIL
  // ═══════════════════════════════════════════════════════
  const mobileNav = document.getElementById('mobile-nav');
  if (mobileNav) {
    const allPanels = document.querySelectorAll('.game-layout .panel');
    mobileNav.querySelectorAll('[data-target]').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetClass = btn.dataset.target;
        mobileNav.querySelectorAll('[data-target]').forEach(b =>
          b.classList.toggle('mnav-active', b === btn)
        );
        allPanels.forEach(panel => {
          const isTarget = panel.classList.contains(targetClass);
          panel.classList.toggle('tab-active', isTarget);
          panel.classList.toggle('tab-hidden', !isTarget);
        });
        if (targetClass === 'panel-chat') chatMessages.scrollTop = chatMessages.scrollHeight;
        // Tarjetas de combate: solo visibles en la pantalla de Historia
        const bPanel = $('battle-panel');
        if (bPanel) {
          const hidePanel = targetClass !== 'panel-chat';
          bPanel.classList.toggle('nav-hidden', hidePanel);
          _syncChatCombatPadding(); // actualizar padding al cambiar panel
        }
      });
    });
  }

  // ═══════════════════════════════════════════════════════
  // INICIALIZACIÓN
  // ═══════════════════════════════════════════════════════
  (function init() {
    ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(updateMod);
    buildSkillRows();
    updateSkillBonuses();
    updateXpBar();
    updateHpBar();
    updateStats();

    loadGameState();
    renderInventory();
    syncInventoryTextarea();
    renderQuests();
    renderGold();
    renderSpells();
    renderConditions();
    renderFactions();
    if (playerNotesEl && state.playerNotes) {
      playerNotesEl.value = state.playerNotes;
      _updateNotesCounter();
    }

    // Cargar historial de tiradas
    try { state.rollHistory = JSON.parse(localStorage.getItem('rpg_roll_history') || '[]'); } catch(e) { state.rollHistory = []; }
    renderRollHistory();

    // Restaurar tarjeta de enemigo/NPC activo si el juego se cerró durante combate o conversación
    try {
      const savedEnemy = localStorage.getItem('rpg_active_enemy');
      if (savedEnemy) {
        const enemy = JSON.parse(savedEnemy);
        if (enemy?.name) {
          state.activeEnemy = enemy;
          updateEntityUI('enemy', { name: enemy.name, img: enemy.img, hpMax: enemy.hpMax }, true);
          if (enemy.hpCurrent !== undefined && enemy.hpMax) {
            updateHealth('enemy', enemy.hpCurrent, enemy.hpMax);
            if (state.activeEnemy) state.activeEnemy.hpCurrent = enemy.hpCurrent;
          }
          if (!enemy.groups) enemy.groups = [{ ...enemy }];
          _updateEnemyStack();
          $('enemy-stack-wrapper')?.classList.add('has-active');
        }
      } else {
        const savedNpc = localStorage.getItem('rpg_active_npc');
        if (savedNpc) {
          const npc = JSON.parse(savedNpc);
          if (npc?.id) {
            state.activeNpc = npc;
            updateEntityUI('npc', npc, true);
          }
        }
      }
    } catch(e) {}

    // Restaurar tirada pendiente si la había
    if (state.pendingRoll && diceRollBtn) {
      diceRollBtn.disabled = false;
      diceRollBtn.classList.add('roll-requested');
      diceRollBtn.title = `¡Tirar D20 de ${state.pendingRoll.label}!`;
    }

    const savedName  = localStorage.getItem('rpg_char-name')  || '';
    const savedClass = localStorage.getItem('rpg_char-class') || '';

    if (savedName && savedClass) {
      state.charName  = savedName;
      state.charClass = savedClass;
      lockCharFields();
      updatePlayerAvatar();
      syncStatDisplays(); // Recalcular stats: base de clase + puntos ASI guardados
      loadChatLog();
      if (state.chatLog.length > 0) {
        chatMessages.innerHTML = '';
        renderChatLog(state.chatLog);
      }
      // Detectar personaje muerto al cargar: si HP <= 0, mostrar game over
      const loadedHp = parseInt(hpCurrent.value) || 0;
      if (loadedHp === 0) {
        setTimeout(() => {
          const overlay = $('gameover-overlay');
          if (overlay && !overlay.classList.contains('visible')) {
            // Limpiar cualquier tarjeta de combate pendiente primero
            uiState.inCombat = false;
            uiState.inConversation = false;
            const bPanel = $('battle-panel');
            if (bPanel) { bPanel.classList.remove('active'); bPanel.setAttribute('aria-hidden', 'true'); }
            overlay.classList.add('visible');
            overlay.setAttribute('aria-hidden', 'false');
          }
        }, 700);
      }
    } else {
      showCharModal();
    }
  })();

  console.log(`🎲 Crónicas del Abismo v3 · D20 Interactivo · Inventario · Quest Log · Streaming`);
});
