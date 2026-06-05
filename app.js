
/* ═══════════════════════════════════════════════════════
   CRÓNICAS DEL ABISMO — Motor de juego v3
   D20 Interactivo · Inventario dinámico · Diario de Misiones
   Streaming real · Persistencia total · Modal de inicio
   ════════════════════════════════════════════════════ */
'use strict';

// Aplicar tema guardado antes de DOMContentLoaded para evitar parpadeo (FOUC)
if (localStorage.getItem('rpg_theme') === 'parchment') {
  document.body.classList.add('theme-parchment');
}

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
  // CONFIGURACIÓN
  // ─────────────────────────────────────────────────────
  const MAX_TOKENS    = 1000;  // Máximo por mensaje — evita cortes narrativos
  const HISTORY_LIMIT = 8; // Reducido: el Diario cubre el pasado lejano

  // ─────────────────────────────────────────────────────
  // HABILIDADES D&D 5e
  // ─────────────────────────────────────────────────────
  const SKILLS = [
    { id: 'athletics',     label: 'Atletismo',      attr: 'str' },
    { id: 'acrobatics',    label: 'Acrobacias',     attr: 'dex' },
    { id: 'stealth',       label: 'Sigilo',          attr: 'dex' },
    { id: 'sleight',       label: 'Juego de Manos', attr: 'dex' },
    { id: 'arcana',        label: 'Arcano',          attr: 'int' },
    { id: 'history',       label: 'Historia',        attr: 'int' },
    { id: 'investigation', label: 'Investigación',   attr: 'int' },
    { id: 'nature',        label: 'Naturaleza',      attr: 'int' },
    { id: 'religion',      label: 'Religión',        attr: 'int' },
    { id: 'animal',        label: 'Trato Animales',  attr: 'wis' },
    { id: 'insight',       label: 'Perspicacia',     attr: 'wis' },
    { id: 'medicine',      label: 'Medicina',        attr: 'wis' },
    { id: 'perception',    label: 'Percepción',      attr: 'wis' },
    { id: 'survival',      label: 'Supervivencia',   attr: 'wis' },
    { id: 'deception',     label: 'Engaño',          attr: 'cha' },
    { id: 'intimidation',  label: 'Intimidación',    attr: 'cha' },
    { id: 'performance',   label: 'Actuación',       attr: 'cha' },
    { id: 'persuasion',    label: 'Persuasión',      attr: 'cha' },
  ];

  // Umbrales XP D&D 5e (niveles 1-20)
  const XP_TABLE = [
    0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
    85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000,
  ];

  const ATTR_ABBR  = { str:'FUE', dex:'DES', con:'CON', int:'INT', wis:'SAB', cha:'CAR' };
  const ATTR_CLASS = { str:'tag-str', dex:'tag-dex', con:'tag-con', int:'tag-int', wis:'tag-wis', cha:'tag-cha' };
  const ASI_LEVELS = new Set([4, 8, 12, 16, 19]);

  // Mapa de normalización atributo/habilidad → stat ID
  const ATTR_MAP = {
    str:'str', fue:'str', fuerza:'str',
    dex:'dex', des:'dex', destreza:'dex',
    con:'con', constitucion:'con',
    int:'int', inteligencia:'int',
    wis:'wis', sab:'wis', sabiduria:'wis',
    cha:'cha', car:'cha', carisma:'cha',
    atletismo:'str',
    acrobacias:'dex', sigilo:'dex', 'juego de manos':'dex',
    arcano:'int', historia:'int', investigacion:'int', naturaleza:'int', religion:'int',
    'trato animales':'wis', perspicacia:'wis', medicina:'wis', percepcion:'wis', supervivencia:'wis',
    engano:'cha', intimidacion:'cha', actuacion:'cha', persuasion:'cha',
  };

  function resolveAttr(raw) {
    const normalized = raw.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .trim();
    return ATTR_MAP[normalized] || ATTR_MAP[raw.toLowerCase()] || 'str';
  }

  // Mapeo stat-id (str/dex/...) → clave en CLASE_STATS (fuerza/destreza/...)
  const STAT_TO_ES = { str:'fuerza', dex:'destreza', con:'constitucion', int:'inteligencia', wis:'sabiduria', cha:'carisma' };

  function isConsumable(name) {
    return /poci[oó]n|consumible|hierba|ung[uü]ento|elixir|poderoso/i.test(name);
  }

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
    pendingRoll:       null, // {attr, label} | null
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
  };

  // ─────────────────────────────────────────────────────
  // REFERENCIAS DOM
  // ─────────────────────────────────────────────────────
  const $  = id => document.getElementById(id);
  const $$ = sel => document.querySelectorAll(sel);

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
  const diceTrayBtn  = $('dice-tray-btn');
  const diceTray     = $('dice-tray');
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
  // UTILIDADES
  // ═══════════════════════════════════════════════════════
  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function mdToHtml(text) {
    return escHtml(text)
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*\n]+)\*/g,     '<em>$1</em>')
      .split('\n\n').filter(p => p.trim())
      .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
      .join('');
  }

  // ═══════════════════════════════════════════════════════
  // HP BAR
  // ═══════════════════════════════════════════════════════
  function updateHealth(target, currentHp, maxHp) {
    const cur = Math.max(0, parseInt(currentHp) || 0);
    const max = Math.max(1, parseInt(maxHp) || 1);
    const pct = Math.min(100, Math.round((cur / max) * 100));

    const barId  = target === 'enemy' ? 'enemy-hp-bar'  : 'player-hp-bar';
    const textId = target === 'enemy' ? 'enemy-hp-text' : 'player-hp-text';
    const bar = document.getElementById(barId);
    const txt = document.getElementById(textId);
    if (!bar) return;
    bar.style.width = pct + '%';
    if (txt) txt.textContent = `${cur} / ${max}`;

    if (pct > 60)      bar.style.background = target === 'enemy' ? 'linear-gradient(90deg,#e74c3c,#c0392b)' : 'linear-gradient(90deg,#2ecc71,#27ae60)';
    else if (pct > 25) bar.style.background = target === 'enemy' ? 'linear-gradient(90deg,#f39c12,#e67e22)' : 'linear-gradient(90deg,#f1c40f,#f39c12)';
    else               bar.style.background = target === 'enemy' ? 'linear-gradient(90deg,#7d1010,#c0392b)' : 'linear-gradient(90deg,#b71c1c,#7d1010)';
  }
  window.updateHealth = updateHealth;

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

    updateHealth('player', cur, max);
  }

  hpCurrent.addEventListener('input', updateHpBar);
  hpMax.addEventListener('input',     updateHpBar);
  updateHpBar();

  // ═══════════════════════════════════════════════════════
  // MODIFICADORES + STATS DINÁMICOS
  // ═══════════════════════════════════════════════════════
  const calcMod = v  => Math.floor((v - 10) / 2);
  const fmtMod  = m  => (m >= 0 ? `+${m}` : `${m}`);

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
    // Refrescar modificador en la bandeja de dados
    const trayMod = $(`tray-mod-${id}`);
    if (trayMod) {
      trayMod.textContent = fmtMod(m);
      trayMod.className = 'tray-mod' + (m > 0 ? ' positive' : m < 0 ? ' negative' : '');
    }
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
    if (e.key === 'Escape') {
      diceOverlay.classList.remove('visible');
      closeQuestModal?.();
    }
  });

  // ═══════════════════════════════════════════════════════
  // DADO D20 INTERACTIVO — Tirada solicitada por la IA
  // ═══════════════════════════════════════════════════════
  function activatePendingRoll(attrRaw) {
    const statId = resolveAttr(attrRaw);
    state.pendingRoll = { attr: statId, label: attrRaw };
    saveGameState();

    if (diceRollBtn) {
      diceRollBtn.disabled = false;
      diceRollBtn.classList.add('roll-requested');
      diceRollBtn.title = `¡La IA pide tirada de ${attrRaw}! Haz clic para lanzar`;
    }
  }

  function deactivatePendingRoll() {
    state.pendingRoll = null;
    saveGameState();

    if (diceRollBtn) {
      diceRollBtn.disabled = true;
      diceRollBtn.classList.remove('roll-requested');
      diceRollBtn.title = 'Esperando petición de tirada...';
    }
  }

  // ═══════════════════════════════════════════════════════
  // WEB AUDIO SFX — Sintetizados vía AudioContext (sin .mp3)
  // Cumple con la política de autoplay de iOS/Safari:
  // todos los sonidos se disparan desde un gesto del usuario.
  // ═══════════════════════════════════════════════════════
  const sfx = (() => {
    let ctx = null;

    function getCtx() {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }

    // Envolvente estándar: ataque → sustain → release
    function env(gain, at, dt, sl, rt, now) {
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(1, now + at);
      gain.gain.linearRampToValueAtTime(sl, now + at + dt);
      gain.gain.linearRampToValueAtTime(0, now + at + dt + rt);
    }

    return {
      // 1. Alerta mística — tono doble ascendente (lo→hi)
      alert() {
        try {
          const ac  = getCtx();
          const now = ac.currentTime;
          [220, 440].forEach((freq, i) => {
            const osc = ac.createOscillator();
            const g   = ac.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + i * 0.18);
            osc.frequency.linearRampToValueAtTime(freq * 2, now + i * 0.18 + 0.14);
            g.gain.setValueAtTime(0, now + i * 0.18);
            g.gain.linearRampToValueAtTime(0.22, now + i * 0.18 + 0.04);
            g.gain.linearRampToValueAtTime(0, now + i * 0.18 + 0.22);
            osc.connect(g); g.connect(ac.destination);
            osc.start(now + i * 0.18);
            osc.stop(now + i * 0.18 + 0.25);
          });
        } catch(e) { /* Safari puede bloquear si no hay gesto previo */ }
      },

      // 2. Dado rodando — cliqueos de ruido blanco intermitentes
      roll() {
        try {
          const ac  = getCtx();
          const dur = 1.5;
          const now = ac.currentTime;
          const clicks = 28; // número de impactos

          for (let i = 0; i < clicks; i++) {
            const t   = now + (i / clicks) * dur;
            const buf = ac.createBuffer(1, ac.sampleRate * 0.012, ac.sampleRate);
            const data = buf.getChannelData(0);
            for (let s = 0; s < data.length; s++) data[s] = (Math.random() * 2 - 1) * 0.6;
            const src = ac.createBufferSource();
            const g   = ac.createGain();
            // Los cliques aceleran hacia el final (más impactos por segundo)
            const decay = 0.008 + (1 - i / clicks) * 0.025;
            src.buffer = buf;
            g.gain.setValueAtTime(0.35, t);
            g.gain.linearRampToValueAtTime(0, t + decay);
            src.connect(g); g.connect(ac.destination);
            src.start(t);
          }
        } catch(e) {}
      },

      // 3. Revelación — acorde mayor (éxito) o descenso grave (fallo)
      result(isSuccess) {
        try {
          const ac  = getCtx();
          const now = ac.currentTime;
          if (isSuccess) {
            // Acorde mayor brillante: fundamental + tercera + quinta
            [523.25, 659.25, 783.99].forEach((freq, i) => {
              const osc = ac.createOscillator();
              const g   = ac.createGain();
              osc.type = 'triangle';
              osc.frequency.setValueAtTime(freq, now + i * 0.05);
              env(g, 0.01, 0.1, 0.6, 0.5, now + i * 0.05);
              osc.connect(g); g.connect(ac.destination);
              osc.start(now + i * 0.05);
              osc.stop(now + i * 0.05 + 0.7);
            });
          } else {
            // Descenso grave distorsionado: tono descendente con wave shaping
            const osc = ac.createOscillator();
            const g   = ac.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(180, now);
            osc.frequency.linearRampToValueAtTime(55, now + 0.5);
            env(g, 0.01, 0.08, 0.5, 0.4, now);
            g.gain.value = 0.3;
            osc.connect(g); g.connect(ac.destination);
            osc.start(now);
            osc.stop(now + 0.6);
          }
        } catch(e) {}
      },
    };
  })();

  // ═══════════════════════════════════════════════════════
  // HÁPTICA — navigator.vibrate con comprobación de soporte
  // ═══════════════════════════════════════════════════════
  function vibe(pattern) {
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch(e) {}
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

  function triggerDiceRoll() {
    if (!state.pendingRoll || state.isStreaming) return;

    const { attr, label } = state.pendingRoll;
    const statVal = parseInt($(`stat-${attr}`)?.value) || 10;
    const mod     = calcMod(statVal);
    const roll    = rollD20();
    const total   = roll + mod;

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
    titleEl.textContent  = `⚔ ¡PRUEBA DE ${label.toUpperCase()}!`;
    modEl.textContent    = mod !== 0 ? `Modificador: ${fmtMod(mod)} (${label})` : `Atributo: ${label}`;
    numberEl.textContent = '?';
    numberEl.style.color = '';
    hintEl.style.opacity = '1';

    diceBtn.classList.remove('rolling', 'revealed', 'crit-result', 'fail-result', 'good-result');
    overlay.classList.remove('fade-out');

    // ── FASE 1: Mostrar overlay ──
    overlay.setAttribute('aria-hidden', 'false');
    overlay.classList.add('visible');
    sfx.alert(); // Sonido de alerta al aparecer el overlay

    // ── FASE 2: Click en el dado → animación de lanzamiento ──
    function onDiceClick() {
      diceBtn.removeEventListener('click', onDiceClick);
      diceBtn.classList.add('rolling');
      hintEl.style.opacity = '0';

      sfx.roll(); // Cliqueo intermitente durante el giro

      // Microvibraciones sincronizadas con los 8 impactos más audibles
      for (let p = 0; p < 8; p++) {
        setTimeout(() => vibe(8), Math.round((p / 8) * 1500));
      }

      // Números aleatorios a 45ms durante 1500ms
      let spinInterval = setInterval(() => {
        numberEl.textContent = Math.floor(Math.random() * 20) + 1;
      }, 45);

      // ── FASE 3: Tras 1500ms — impacto y revelación ──
      setTimeout(() => {
        clearInterval(spinInterval);
        diceBtn.classList.remove('rolling');
        diceBtn.classList.add('revealed');

        numberEl.textContent = roll;

        const isCrit = roll === 20;
        const isFail = roll <= 4;
        if (isCrit)      diceBtn.classList.add('crit-result');
        else if (isFail) diceBtn.classList.add('fail-result');
        else             diceBtn.classList.add('good-result');

        sfx.result(!isFail);

        // Vibración háptica de revelación
        vibe(isCrit || roll === 1 ? [100, 50, 100] : 50);

        // Registrar en la Bitácora del Destino
        addRollToHistory(label, roll, mod, total);

        // ── FASE 4: Tras 1000ms con el resultado visible → fade-out + envío ──
        setTimeout(() => {
          overlay.classList.remove('visible');
          overlay.classList.add('fade-out');

          setTimeout(() => {
            overlay.classList.remove('fade-out');
            overlay.setAttribute('aria-hidden', 'true');

            const modStr = mod !== 0 ? ` ${fmtMod(mod)} (${label})` : '';
            const emoji  = isCrit ? ' ⚡ ¡CRÍTICO NATURAL!'
                         : roll === 1 ? ' 💀 ¡PIFIA NATURAL!'
                         : '';
            const msg = `🎲 Tirada de ${label}: ${roll}${modStr} = **${total}**${emoji}`;
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

  // ── Bandeja de dados manual ──────────────────────────────
  function closeDiceTray() {
    diceTray?.setAttribute('aria-hidden', 'true');
    diceTray?.classList.remove('open');
    diceTrayBtn?.classList.remove('active');
  }

  diceTrayBtn?.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = diceTray.classList.contains('open');
    if (isOpen) {
      closeDiceTray();
    } else {
      diceTray.setAttribute('aria-hidden', 'false');
      diceTray.classList.add('open');
      diceTrayBtn.classList.add('active');
    }
  });

  document.addEventListener('click', e => {
    if (diceTray?.classList.contains('open') &&
        !diceTray.contains(e.target) &&
        e.target !== diceTrayBtn) {
      closeDiceTray();
    }
  });

  // Comprobaciones de atributo desde la bandeja (igual que los botones de la hoja)
  $$('.dice-attr-btn').forEach(btn => {
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

      closeDiceTray();
    });
  });

  // Dados libres (D4–D100) desde la bandeja
  $$('.dice-free-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const sides = parseInt(btn.dataset.sides);
      const roll  = Math.floor(Math.random() * sides) + 1;

      diceNumber.className = 'dice-number';
      diceNumber.textContent = roll;
      if (sides === 20 && roll === 20) {
        diceNumber.classList.add('crit-success');
        diceDetail.textContent = `D20 → ${roll} ¡CRÍTICO NATURAL!`;
      } else if (sides === 20 && roll === 1) {
        diceNumber.classList.add('crit-fail');
        diceDetail.textContent = `D20 → ${roll} ¡PIFIA NATURAL!`;
      } else {
        diceDetail.textContent = `D${sides} → ${roll}`;
      }
      diceOverlay.classList.add('visible');

      const prefix = `[Tirada D${sides}: ${roll}] `;
      const current = playerInput.value.trim();
      playerInput.value = current ? current + ' ' + prefix : prefix;
      playerInput.focus();

      diceFlash.textContent = `🎲 D${sides}: ${roll}`;
      diceFlash.classList.add('visible');
      setTimeout(() => diceFlash.classList.remove('visible'), 4000);

      closeDiceTray();
    });
  });

  $('battle-panel-close')?.addEventListener('click', () => endCombat());

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
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.title = 'Ver detalles de la misión';
      el.innerHTML = `<span class="quest-dot"></span><span class="quest-title">${escHtml(q.title)}</span><span class="quest-expand-icon" aria-hidden="true">›</span>`;
      el.addEventListener('click', () => showQuestModal(q.id));
      el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') showQuestModal(q.id); });
      questActiveList.appendChild(el);
    });

    completed.forEach(q => {
      const el = document.createElement('div');
      el.className = 'quest-item quest-completed';
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.title = 'Ver detalles de la misión';
      el.innerHTML = `<span class="quest-check">✓</span><span class="quest-title">${escHtml(q.title)}</span><span class="quest-expand-icon" aria-hidden="true">›</span>`;
      el.addEventListener('click', () => showQuestModal(q.id));
      el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') showQuestModal(q.id); });
      questCompletedList.appendChild(el);
    });
  }

  // Compara dos títulos de misión ignorando artículos y variaciones menores
  function questSimilar(a, b) {
    const normalize = s => s.toLowerCase()
      .replace(/\b(un|una|el|la|los|las|de|del|al|con|por|para|que|en|a|y|e|o|u|ese|esa|este|esta)\b/g, ' ')
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ').trim();
    const wordsA = new Set(normalize(a).split(' ').filter(Boolean));
    const wordsB = new Set(normalize(b).split(' ').filter(Boolean));
    const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
    const union = new Set([...wordsA, ...wordsB]).size;
    return union > 0 && (intersection / union) >= 0.65;
  }

  function addQuest(questObj) {
    const t = (typeof questObj === 'string' ? questObj : questObj.title).trim();
    const description = typeof questObj === 'string' ? '' : (questObj.description || '');
    const already = state.quests.find(q =>
      q.title.toLowerCase() === t.toLowerCase() || questSimilar(q.title, t)
    );
    if (already) return;
    state.quests.push({ id: 'quest_' + Date.now(), title: t, description, status: 'active' });
    renderQuests();
    saveGameState();
    addSystemMessage(`📜 Nueva misión: "${t}"`);
    logProgress(`Aceptó la misión: "${t}".`, 'mision');
  }

  function completeQuest(title) {
    const t = title.trim();
    const quest = state.quests.find(
      q => q.status === 'active' && (
        q.title.toLowerCase() === t.toLowerCase() ||
        q.title.toLowerCase().includes(t.toLowerCase()) ||
        questSimilar(q.title, t)
      )
    );
    if (quest && quest.status !== 'completed') {
      quest.status = 'completed';
      renderQuests();
      saveGameState();
      addSystemMessage(`✓ Misión completada: "${quest.title}"`);
      logProgress(`Completó la misión: "${quest.title}".`, 'mision');
    }
  }

  // ── Modal de detalle de misión ───────────────────────────
  function showQuestModal(questId) {
    const quest = state.quests.find(q => q.id === questId);
    if (!quest) return;

    const modal      = $('quest-modal');
    const titleEl    = $('quest-modal-title');
    const descEl     = $('quest-modal-desc');
    const statusEl   = $('quest-modal-status');
    const iconEl     = $('quest-modal-icon');
    const completeBtn = $('quest-modal-complete-btn');

    titleEl.textContent = quest.title;

    if (quest.description) {
      descEl.textContent = quest.description;
      descEl.className = 'quest-modal-desc';
    } else {
      descEl.textContent = 'Sin descripción adicional registrada.';
      descEl.className = 'quest-modal-desc no-desc';
    }

    const isActive = quest.status === 'active';
    iconEl.textContent = isActive ? '📜' : '✅';
    statusEl.textContent = isActive ? '⬤ Activa' : '✓ Completada';
    statusEl.className = 'quest-modal-status ' + quest.status;
    completeBtn.style.display = isActive ? '' : 'none';

    completeBtn.onclick = () => {
      completeQuest(quest.title);
      closeQuestModal();
    };

    modal.removeAttribute('aria-hidden');
    modal.classList.add('visible');
  }

  function closeQuestModal() {
    const modal = $('quest-modal');
    modal.classList.remove('visible');
    modal.setAttribute('aria-hidden', 'true');
  }

  $('quest-modal-close-btn')?.addEventListener('click', closeQuestModal);
  $('quest-modal')?.addEventListener('click', e => {
    if (e.target === $('quest-modal')) closeQuestModal();
  });

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
    return el.querySelector('.dm-streaming');
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
      if (state.pendingRoll) localStorage.setItem('rpg_pending_roll', JSON.stringify(state.pendingRoll));
      else                   localStorage.removeItem('rpg_pending_roll');
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

  function getPlayerAvatarUrl(className) {
    const slug = (className || '').trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
    return slug ? `img/protagonistas/${slug}.png` : 'img/protagonistas/default.png';
  }

  function updatePlayerAvatar() {
    const imgEl = $('player-sheet-avatar-img');
    const combatImgEl = $('player-avatar-img');
    const cls = ($('char-class')?.value || state.charClass || '').trim();
    const url = getPlayerAvatarUrl(cls);
    
    if (imgEl) {
      imgEl.src = url;
      imgEl.onerror = () => {
        imgEl.onerror = null;
        imgEl.src = 'img/protagonistas/guerrero.png';
      };
    }
    
    if (combatImgEl) {
      combatImgEl.src = url;
      combatImgEl.onerror = () => {
        combatImgEl.onerror = null;
        combatImgEl.src = 'img/protagonistas/guerrero.png';
      };
    }
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
  function showEnemyCard(prompt, name) {
    const bData  = bestiario.enemigos[prompt] || lookupEnemyByName(name);
    const hpMax  = bData ? bData.hpMax : 10;
    const imgUrl = bData ? bData.img   : getEnemyImageUrl(name);

    updatePlayerAvatar();

    state.activeEnemy = {
      prompt, name, hpMax, hpCurrent: hpMax,
      dano: bData?.dano ?? null, ca: bData?.ca ?? null, img: imgUrl,
    };
    lsSave('rpg_active_enemy', JSON.stringify(state.activeEnemy));

    updateEntityUI('enemy', { name, img: imgUrl, hpMax }, true);
    vibe([20, 15, 50]);
  }

  function defeatEnemy() {
    const card    = $('enemy-card');
    const imgEl   = $('enemy-avatar-img');
    const overlay = $('death-overlay');
    if (!card?.classList.contains('active')) return;

    // Capturar nombre antes de que se limpie el estado
    const defeatedName = state.activeEnemy?.name || 'enemigo';
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
        state.activeEnemy = null;
        localStorage.removeItem('rpg_active_enemy');
        updateEntityUI('enemy', null, false); // actualiza estado y muestra NPC si hay uno pendiente
      }, 650);
    }, 1100);
  }

  // ─ Huida / fin narrativo del combate ────────────────
  function endCombat() {
    if (!uiState.inCombat) return;
    const card    = $('enemy-card');
    const imgEl   = $('enemy-avatar-img');
    const overlay = $('death-overlay');
    state.activeEnemy = null;
    localStorage.removeItem('rpg_active_enemy');
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

  // ─ NPCs ─────────────────────────────────────────────
  function showNpcCard(id) {
    const npcData = bestiario.npcs[id];
    if (!npcData) { console.warn(`[Bestiario] NPC no encontrado: "${id}"`); return; }
    state.activeNpc = { id, ...npcData };
    const locKey = state.currentLocation?.id || 'global';
    const storedName = state.npcNames[`${id}@${locKey}`];
    if (storedName) state.activeNpc.nombre = storedName;
    lsSave('rpg_active_npc', JSON.stringify(state.activeNpc));
    updateEntityUI('npc', state.activeNpc, true);
  }

  function hideNpcCard() {
    state.activeNpc = null;
    localStorage.removeItem('rpg_active_npc');
    updateEntityUI('npc', null, false);
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
      setTimeout(handleGameOver, 400);
      return;
    }

    if (pImg) { pImg.style.transition = 'filter 0.6s ease'; pImg.style.filter = 'grayscale(1) brightness(0.3)'; }

    setTimeout(() => {
      pCard.classList.add('defeated');

      // También inicia la animación de la tarjeta enemiga
      const rCard = $('enemy-card');
      if (rCard?.classList.contains('active')) rCard.classList.add('defeated');

      setTimeout(() => {
        if (pImg) { pImg.style.filter = ''; pImg.style.transition = ''; }
        handleGameOver(); // limpia estado y muestra overlay
      }, 650);
    }, 700);
  }

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
    showLevelUpToast(next, hpGained);

    const nextAsi = [...ASI_LEVELS].sort((a, b) => a - b).find(l => l > next) ?? '—';
    addSystemMessage(`✦ ¡NIVEL ${next}! +${hpGained} HP · Curado al máximo · Competencia: ${fmtMod(getProfBonus(next))} · Próximo ASI: nivel ${nextAsi}`);
    logProgress(`${state.charName || 'El aventurero'} alcanzó el nivel ${next} con ${newMax} HP máximos.`, 'nivel');

    let hayAsi = false;
    for (let lvl = prev + 1; lvl <= next; lvl++) {
      if (ASI_LEVELS.has(lvl)) { hayAsi = true; break; }
    }
    if (hayAsi) activarModoSubidaNivel();
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
  }

  function activarModoSubidaNivel() {
    state.puntosDisponibles = 2;
    _syncModoASI();
    addSystemMessage('✨ ¡MEJORA DE ATRIBUTO! Tienes 2 puntos para repartir. Pulsa los botones ＋ junto a cada estadística.');
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
  // SYSTEM PROMPT — dinámico con nombre, clase y nuevas etiquetas
  // ═══════════════════════════════════════════════════════
  function buildDmCore() {
    const name = $('char-name').value.trim() || state.charName || 'el aventurero';
    const cls  = $('char-class').value.trim() || state.charClass || 'aventurero';
    return `Eres un Dungeon Master experto narrando una campaña de rol de texto en español.
El personaje que controla el jugador se llama ${name} y es un/a ${cls}.

PROTOCOLO DE NARRACIÓN (OBLIGATORIO):
- Máximo 3 párrafos cortos por respuesta. Si una escena requiere más descripción, envía solo la primera parte y termina con "▶ *[escribe 'continúa' para seguir]*". Espera confirmación antes de enviar el resto. Nunca cortes una frase a mitad.
- Siempre termina con una pregunta o situación que requiera decisión del jugador.

REGLAS INQUEBRANTABLES:
- Narras siempre en segunda persona ("Ves...", "Sientes...", "Escuchas...")
- Tono dramático, cinematográfico y atmosférico. Describes entornos, sonidos, olores y texturas
- Cada respuesta avanza la historia y termina dejando una situación que requiere decisión
- Interpretas los dados con coherencia: 20 natural = éxito heroico épico; 1 = pifia catastrófica
- Respetas la hoja de personaje: HP, estadísticas e inventario definen lo que el personaje puede hacer
- Mantén la coherencia con el resumen de historia y el lore del mundo
- Respuestas de 2 a 4 párrafos. Sé evocador y concreto, no vago
- NUNCA rompas el personaje ni menciones que eres una IA

USO OBLIGATORIO DEL DIARIO DE CAMPAÑA (MEMORIA HISTÓRICA):
Antes de generar cualquier respuesta narrativa, DEBES leer el bloque "RESUMEN DE LA AVENTURA HASTA EL MOMENTO" que se te ha inyectado en el contexto. Tu obligación es:
1. Identificar activamente todos los NPCs mencionados (sus nombres, relaciones y estado: vivo/muerto/aliado/enemigo) y hacer referencias cruzadas naturales. Si el jugador interactúa con alguien que aparece en el diario, ese personaje DEBE recordar los eventos pasados y reaccionar en consecuencia (un tabernero cuyo hijo fue salvado dará las gracias o hará un descuento; un herrero al que se le pagó la deuda ofrecerá mejor precio; un guardia que fue burlado estará hostil).
2. Recordar todos los lugares visitados: sus nombres, atmósfera, habitantes relevantes y lo que ocurrió allí. No describas un lugar ya visitado como si fuera nuevo.
3. Respetar el estado actual de las misiones: si una misión está en el diario como completada, trátala como resuelta. Si está activa, puedes referirte a ella como objetivo pendiente.

PROHIBICIÓN ABSOLUTA DE CONTRADICCIONES:
Bajo ninguna circunstancia puedes contradecir los hechos registrados en el Diario de Campaña. Si el diario dice que un NPC murió, ese personaje está muerto para siempre y no puede reaparecer vivo. Si una ciudad fue destruida, sigue en ruinas. Si el jugador ya consiguió un objeto, no puede encontrarlo de nuevo. Los hechos del pasado son inmutables: son la realidad del mundo que habitas como narrador.

SISTEMA DE ETIQUETAS — REGLAS DE COHERENCIA ESTRICTAS:

[GAIN_XP: N] — REGLA DE CÓDIGO: esta etiqueta SOLO produce efecto si el mismo mensaje incluye [ENEMY_DEFEATED] o [COMPLETE_QUEST:]. Sin esas etiquetas, el motor DESCARTA el XP automáticamente. Por tanto:
  · Victoria en combate → REQUIERE [ENEMY_DEFEATED] en este turno. Usa 50–150 XP según dificultad.
  · Misión completada → REQUIERE [COMPLETE_QUEST: título] en este turno. Usa 100–200 XP.
  · Ambos en el mismo turno (derrota un jefe y cierra misión) → puedes incluir ambas etiquetas; el XP máximo combinado es 300.
  PROHIBICIÓN: NO incluyas [GAIN_XP] en conversaciones, exploración sin peligro, diálogos, transiciones ni acciones menores. El código lo ignorará de todas formas, pero mantenlo coherente con tu narración.
  LÍMITE: una sola etiqueta [GAIN_XP] por respuesta. Si incluyes varias, solo se aplica la primera.

[LOSE_HP: N] — Solo si el jugador recibe daño físico real en este turno. Rango: 1–999. Omítela si no hay daño.
[GAIN_HP: N] — Solo si el jugador se cura (poción, descanso, hechizo) en este turno. Omítela si no hay curación. Nunca uses [LOSE_HP] y [GAIN_HP] en la misma respuesta.

[REQUEST_ROLL: Atributo] — Cuando la historia exige que el jugador tire dados para resolver una acción (combate, habilidad, salvación). Usa el nombre español del atributo o habilidad (ej: "Fuerza", "Percepción", "Sigilo", "Destreza"). La interfaz activará automáticamente el botón de dado para el jugador. Incluye SOLO cuando sea dramáticamente necesario.

[ADD_ITEM: Nombre del Objeto] — Cuando el jugador obtenga un objeto, arma, armadura o recompensa tangible. El objeto se añadirá automáticamente a su inventario visual. Sé preciso con el nombre.
[REMOVE_ITEM: Nombre del Objeto] — Cuando el jugador pierda, consuma, entregue o destruya un objeto. Se eliminará del inventario. Usa el nombre exacto que se usó al añadirlo.

[ADD_QUEST: Título | Descripción completa] — Cuando el jugador acepte un nuevo encargo, misión u objetivo narrativo. El Título debe ser corto y descriptivo (máx. 5 palabras). La Descripción (tras el "|") debe explicar el objetivo, el contexto y la recompensa conocida en 1-2 frases. REGLA CRÍTICA: ANTES de usar esta etiqueta, consulta las "Misiones activas". Si ya existe una misión con el mismo objetivo, NO la vuelvas a añadir. Solo añade esta etiqueta UNA VEZ por misión nueva y real.
[COMPLETE_QUEST: Título de la Misión] — Cuando el jugador complete oficialmente una misión. Usa el mismo Título EXACTO que pusiste en [ADD_QUEST], sin cambiar ni una palabra.

[UPDATE_DIARY: Entrada narrativa] — OBLIGATORIO en cualquiera de estos casos:
  · Primera visita a un lugar con nombre (ciudad, aldea, mazmorra, taberna, torre, templo, bosque, etc.) — SIEMPRE, aunque sea una transición menor.
  · Derrota de un enemigo con nombre propio o relevante para la trama.
  · Obtención de un objeto clave, mágico o de valor narrativo.
  · Primer encuentro con un NPC con nombre propio (aliado, enemigo, neutral).
  · Alianza, traición, muerte de un personaje relevante, o giro narrativo mayor.
  Escribe 1-3 frases en tercera persona que capturen el tono emocional del momento, no solo los hechos secos. Ej: "El aventurero descendió a las catacumbas de Valdris. La oscuridad apestaba a muerte y el silencio era ensordecedor. Allí encontró al anciano Mordecai, encadenado pero vivo." Omite SOLO en conversación ordinaria sin lugares ni personajes nuevos.

[NPC_MEMO: Nombre|Actitud|Nota] — Registra la PRIMERA VEZ que el jugador interactúa con un NPC con nombre propio. Actitud: Aliado / Neutral / Hostil / Desconocido / Misterioso. Nota: una frase que capture quién es, qué quiere y qué relación tiene con el jugador. Ej: [NPC_MEMO: Tabernera Mira|Aliado|Vieja conocida del pueblo; guarda secretos sobre las desapariciones y ofrece información a cambio de favores]

[LOCATION_MEMO: Nombre del Lugar|Descripción] — Registra la PRIMERA VEZ que el jugador llega a un lugar con nombre. Descripción: una frase con su atmósfera, rasgo principal o importancia narrativa. Ej: [LOCATION_MEMO: Catacumbas de Valdris|Laberinto de criptas bajo la ciudad; huele a muerte y magia oscura; hogar de los no-muertos que sirven al Nigromante]

[MORAL_NOTE: Resumen de la decisión] — Registra decisiones moralmente relevantes que puedan tener consecuencias: traiciones, sacrificios, alianzas inusuales, abandono de inocentes, uso de magia oscura, pactos con entidades peligrosas. Ej: [MORAL_NOTE: El aventurero dejó escapar al bandido a cambio de información, desobedeciéndole al Gremio]

[COMPRESS_DIARY: Resumen comprimido] — Incluye SOLO cuando el sistema te avise de que la crónica es demasiado larga. Escribe un resumen comprimido de ≤400 palabras que reemplace los eventos anteriores. Prioriza: nombres de NPCs y su estado, localizaciones visitadas con su relevancia, decisiones morales, misiones activas y el estado actual de la historia. Descarta detalles menores.

[GENERATE_IMAGE: prompt-en-ingles] — Añade ÚNICAMENTE en estas tres situaciones:
  1. PERSONAJE NUEVO: cuando introduzcas por primera vez un NPC, monstruo o enemigo importante. Describe su aspecto visual.
  2. LOCALIZACIÓN: cuando el jugador llegue a un escenario relevante nuevo (mazmorra, taberna, bosque, ciudad). Describe la atmósfera.
  3. OBJETO CLAVE: cuando el jugador obtenga o vea un arma mágica, artefacto, mapa o tesoro con peso narrativo.
  Prompt SIEMPRE en inglés, palabras separadas por guiones, estilo dark-fantasy, máximo 8 palabras. Ej: [GENERATE_IMAGE: scarred-orc-warlord-torchlight-dramatic]
  IMPORTANTE: Para enemigos en combate activo usa [ENEMY_CARD] en su lugar, NO [GENERATE_IMAGE].

[ENEMY_CARD: id-bestiario|Nombre del Enemigo] — Añade cuando el jugador entre en combate directo con un enemigo. El primer campo DEBE ser exactamente uno de estos IDs del bestiario: goblin-1, goblin-2, orc, troll, dragon, skeletor, zombie, vampire, demonio, golem, gorgona, minotauro, nigromante, hombre-lobo, gargola, caballero, arana, arpia, ghost, mimo. El segundo campo es el nombre en español. Ej: [ENEMY_CARD: goblin-1|Goblin Explorador]

[ENEMY_LOSE_HP: N] — Añade CADA VEZ que el jugador infliga daño al enemigo. N = daño infligido. NO uses si el ataque falla. Actualiza la barra de HP del enemigo.

[ENEMY_DEFEATED] — Añade SOLO cuando el jugador derrota definitivamente al enemigo (HP ≤ 0). Elimina la tarjeta con animación.

[NPC_CARD: id-npc] — Añade cuando el jugador inicie una conversación relevante con un personaje del mundo. El id DEBE ser uno de: alcalde, alquimista, asesino, buffon, caballero-veterano, capitan-de-la-guardia, guardia-de-caminos, guardia-puerta, herrero, huerfano, mercader-oscuro, nina-mistica, paladin-espectral, rey, sacerdotisa, tabernero, viajero-tierras-lejanas. Muestra la tarjeta del NPC (SIN barra de vida) en el lateral. NO usar durante combate activo. Ej: [NPC_CARD: herrero]

[NPC_NAME: id-npc|Nombre] — Usa SOLO la primera vez que le das un nombre propio a un NPC en una ubicación concreta. El sistema vincula ese nombre a la ubicación actual: el mismo tipo de NPC tendrá nombres distintos en cada ciudad. Si el bloque NPC EN CONVERSACIÓN ya indica un nombre registrado para esta ubicación, NO uses esta etiqueta. Ej: [NPC_NAME: tabernero|Aldric el Gordo]

[SET_LOCATION: Nombre del Lugar] — Emite CADA VEZ que el jugador se traslade a un lugar con nombre, tanto en primera visita como en regreso. En primera visita úsalo JUNTO a [LOCATION_MEMO]. En revisitas úsalo solo. Es imprescindible para que el sistema sepa en qué ciudad está el jugador y asigne la identidad correcta a cada NPC. Ej: [SET_LOCATION: Puerto Oscuro]

[END_CONVERSATION] — Añade cuando la conversación con el NPC termine (el jugador se despide, cambia de escena o el diálogo llega a su fin natural). Oculta la tarjeta del NPC.

[END_COMBAT] — OBLIGATORIO si el combate termina sin que el enemigo sea derrotado: el jugador huye con éxito, se produce una tregua, el enemigo escapa, o la escena de batalla concluye por razones narrativas. Incluye SIEMPRE este tag al final de tu respuesta en esos casos para cerrar la interfaz de batalla. NO lo uses si el combate continúa. Si el enemigo llega a 0 HP usa [ENEMY_DEFEATED] en su lugar.

[UPDATE_WORLD: clave|valor] — Actualiza el Estado del Mundo cuando ocurra un cambio permanente: ciudad destruida/liberada, NPC clave muerto/aliado/traicionado, facción que cambia de actitud. Clave en kebab-case (ej: "ciudad-puerto-oscuro", "npc-rey-alaric", "faccion-gremio"). Valor: frase corta (ej: "destruida", "aliado-del-jugador", "muerto-en-acto-III"). Ej: [UPDATE_WORLD: ciudad-millhaven|saqueada-por-el-jugador]

Todas las etiquetas van SIEMPRE al final del mensaje, nunca en medio del texto.`;
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

    if (state.activeEnemy) {
      const e = state.activeEnemy;
      block += `\n\n=== COMBATE ACTIVO ===
Enemigo: ${e.name}${e.ca ? ` | CA: ${e.ca}` : ''}${e.dano ? ` | Daño: ${e.dano}` : ''}
HP Enemigo: ${e.hpCurrent ?? e.hpMax ?? '?'} / ${e.hpMax ?? '?'}
IMPORTANTE: Usa [ENEMY_LOSE_HP: N] cada vez que el jugador infliga daño al enemigo. Cuando el enemigo llega a 0 HP, usa [ENEMY_DEFEATED].`;
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
      'llama-3.3-70b-versatile', // Meta 70B — el mejor para narrativa
      'llama-3.1-70b-versatile', // Meta 70B alternativa
      'mixtral-8x7b-32768',      // Mixtral 8x7B — rápido y versátil
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
    let totalXP = 0, hpDelta = 0, enemyHpDelta = 0, rollAttr = null, diaryEntry = null;
    let enemyCardData = null, enemyDefeated = false, npcCardId = null, npcName = null, setLocation = null, endConversation = false, combatEnded = false, compressedDiary = null;
    const worldUpdates = [];
    const itemsToAdd = [], itemsToRemove = [];
    const questsToAdd = [], questsToComplete = [];
    const npcMemos = [], locationMemos = [], moralNotes = [];

    const cleaned = text
      .replace(/\[GAIN_XP:\s*(\d+)\s*\]/gi, (_, n) => {
        const v = parseInt(n, 10);
        if (v >= 1 && v <= 999 && totalXP === 0) totalXP = v; // solo la primera etiqueta, cap preventivo
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
      .replace(/\[REQUEST_ROLL:\s*([^\]]+)\]/gi, (_, attr) => {
        if (!rollAttr) rollAttr = attr.trim();
        return '';
      })
      .replace(/\[ADD_ITEM:\s*([^\]]+)\]/gi, (_, name) => {
        const n = name.trim(); if (n) itemsToAdd.push(n); return '';
      })
      .replace(/\[REMOVE_ITEM:\s*([^\]]+)\]/gi, (_, name) => {
        const n = name.trim(); if (n) itemsToRemove.push(n); return '';
      })
      .replace(/\[ADD_QUEST:\s*([^|\]]+)(?:\|([^\]]*))?\]/gi, (_, title, desc) => {
        const t = title.trim();
        if (t) questsToAdd.push({ title: t, description: (desc || '').trim() });
        return '';
      })
      .replace(/\[COMPLETE_QUEST:\s*([^\]]+)\]/gi, (_, title) => {
        const t = title.trim(); if (t) questsToComplete.push(t); return '';
      })
      .replace(/\[UPDATE_DIARY:\s*([^\]]+)\]/gi, (_, entry) => {
        const e = entry.trim(); if (e && !diaryEntry) diaryEntry = e;
        return '';
      })
      .replace(/\[GENERATE_IMAGE:\s*([^\]]+)\]/gi, () => '')
      .replace(/\[ENEMY_CARD:\s*([^|\]]+)\|?([^\]]*)\]/gi, (_, prompt, name) => {
        if (!enemyCardData) enemyCardData = {
          prompt: prompt.trim().replace(/\s+/g, '-').toLowerCase(),
          name:   (name.trim() || 'Enemigo'),
        };
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
      .trim();

    // ── Validación contextual de XP ──────────────────────
    // XP solo es válido si hay un evento concreto que lo justifique.
    let xpSource = null;
    if (totalXP > 0) {
      const hasCombat = enemyDefeated;
      const hasQuest  = questsToComplete.length > 0;
      if (hasCombat && hasQuest) {
        xpSource = 'combate + misión';
        totalXP  = Math.min(300, totalXP);
      } else if (hasCombat) {
        xpSource = 'combate';
        totalXP  = Math.min(150, totalXP);
      } else if (hasQuest) {
        xpSource = 'misión completada';
        totalXP  = Math.min(200, totalXP);
      } else {
        // Sin evento verificable → se descarta para evitar XP en conversaciones
        totalXP = 0;
      }
    }

    return { cleaned, totalXP, xpSource, hpDelta, enemyHpDelta, rollAttr, diaryEntry, enemyCardData, enemyDefeated, npcCardId, npcName, setLocation, worldUpdates, endConversation, combatEnded, compressedDiary, npcMemos, locationMemos, moralNotes, itemsToAdd, itemsToRemove, questsToAdd, questsToComplete };
  }

  function applyXpGain(amount, source) {
    if (amount <= 0) return;
    const xpEl = $('xp-current');
    if (!xpEl) return;
    const prevXP = parseInt(xpEl.value) || 0;
    const newXP  = prevXP + amount;
    xpEl.value = newXP;
    lsSave('rpg_xp-current', String(newXP));
    updateXpBar();
    checkLevelUp(prevXP, newXP);
    const srcLabel = source ? ` · ${source}` : '';
    addSystemMessage(`✨ +${amount.toLocaleString('es')} XP${srcLabel} — Total: ${newXP.toLocaleString('es')} XP`);
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
    const systemText = isOoc
      ? `ATENCIÓN — MODO DESARROLLADOR ACTIVO: Sal por completo de tu rol de Dungeon Master. No narres, no pidas tiradas de dados, no uses ninguna etiqueta del sistema de juego ([GAIN_XP], [LOSE_HP], [GAIN_HP], [REQUEST_ROLL], [ADD_ITEM], [REMOVE_ITEM], [ADD_QUEST], [COMPLETE_QUEST]). Responde de forma directa, técnica y transparente como una IA asistente respondiendo al desarrollador. Sé conciso y claro. El idioma de tu respuesta debe coincidir con el del mensaje que recibes.`
      : `${buildDmCore()}\n\n=== INSTRUCCIONES DEL MUNDO / LORE ===\n${loreText}\n\n${buildCharBlock()}\n\n=== CHECKLIST ANTES DE ENVIAR ===\n1. ¿Incluiste [GAIN_XP]? → Solo es válido si TAMBIÉN incluiste [ENEMY_DEFEATED] o [COMPLETE_QUEST:] en este turno. Sin esas etiquetas el XP se descarta. Si no hay victoria concreta, elimina [GAIN_XP].\n2. ¿Incluiste [ADD_QUEST]? → Revisa las "Misiones activas". Si ya existe una misión con el mismo objetivo, no la repitas.\n3. ¿Incluiste [UPDATE_DIARY]? → Es obligatorio en primera visita a un lugar, derrota de enemigo con nombre, objeto clave u NPC nuevo.`;

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
        totalXP, xpSource, hpDelta, enemyHpDelta, rollAttr, diaryEntry,
        enemyCardData, enemyDefeated, npcCardId, npcName, setLocation, worldUpdates, endConversation, combatEnded, compressedDiary,
        npcMemos, locationMemos, moralNotes,
        itemsToAdd, itemsToRemove,
        questsToAdd, questsToComplete,
      } = parseDmTags(fullText);

      typeWriterEffect(dmBody, mdToHtml(displayText));

      state.history.push({ role: 'assistant', content: displayText });
      state.chatLog.push({ type: 'dm', html: mdToHtml(displayText) });

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

      if (totalXP > 0)   applyXpGain(totalXP, xpSource);
      if (hpDelta !== 0) applyHpChange(hpDelta);
      if (rollAttr)      activatePendingRoll(rollAttr);

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

      // Ubicación — actualizar ANTES de mostrar tarjetas de NPC (orden crítico)
      if (setLocation) _setCurrentLocation(setLocation.toLowerCase().trim(), setLocation.trim());

      // Tarjeta de enemigo/NPC
      if (enemyCardData)   showEnemyCard(enemyCardData.prompt, enemyCardData.name);
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
  function debounce(fn, ms) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
  }

  function lsSave(key, value) {
    try { localStorage.setItem(key, value); }
    catch { console.warn(`localStorage lleno: "${key}" no guardado.`); }
  }

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
      renderInventory(); renderEquipment(); renderQuests();

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
    renderInventory(); renderEquipment(); renderQuests();
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

      renderInventory(); renderEquipment(); renderQuests();
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
        chatLog:         state.chatLog,
        history:         state.history,
        inventory:       state.inventory,
        quests:          state.quests,
        pendingRoll:     state.pendingRoll,
        campaignDiary:   state.campaignDiary,
        npcLog:          state.npcLog,
        locationLog:     state.locationLog,
        moralLog:        state.moralLog,
        playerStats:     state.playerStats,
        npcNames:        state.npcNames,
        currentLocation: state.currentLocation,
        worldState:      state.worldState,
        equipment:       state.equipment,
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

          state.chatLog         = data.chatLog         || [];
          state.history         = data.history         || [];
          state.inventory       = data.inventory       || [];
          state.quests          = data.quests          || [];
          state.pendingRoll     = data.pendingRoll     || null;
          state.charName        = data.charName        || '';
          state.charClass       = data.charClass       || '';
          state.campaignDiary   = data.campaignDiary   || '';
          state.npcLog          = data.npcLog          || {};
          state.locationLog     = data.locationLog     || {};
          state.moralLog        = data.moralLog        || [];
          state.playerStats     = data.playerStats     || { str:0, dex:0, con:0, int:0, wis:0, cha:0 };
          state.npcNames        = data.npcNames        || {};
          state.currentLocation = data.currentLocation || null;
          state.worldState      = data.worldState      || {};
          state.equipment       = data.equipment       || { arma: null, armadura: null, accesorio: null };
          saveChatLog(); saveGameState();

          lockCharFields();
          renderChatLog(state.chatLog);
          renderInventory(); renderEquipment(); syncInventoryTextarea();
          renderQuests();
          if (state.pendingRoll) activatePendingRoll(state.pendingRoll.label);
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
  // TOGGLE HABILIDADES
  // ═══════════════════════════════════════════════════════
  const skillsToggle = $('skills-toggle');
  const skillsBody   = $('skills-body');
  if (skillsToggle && skillsBody) {
    if (window.innerWidth < 768) {
      skillsBody.classList.add('collapsed');
      skillsToggle.textContent = '▶';
      skillsToggle.setAttribute('aria-expanded', 'false');
    }
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
