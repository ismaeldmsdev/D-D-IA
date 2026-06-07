/* ═══════════════════════════════════════════════════════
   UTILIDADES PURAS — sin dependencias de estado ni DOM
   Cargado como <script> normal — sin ES modules
   ════════════════════════════════════════════════════ */

window._RPG = window._RPG || {};

Object.assign(window._RPG, {

  $:  function(id)  { return document.getElementById(id); },
  $$: function(sel) { return document.querySelectorAll(sel); },

  calcMod: function(v) { return Math.floor((v - 10) / 2); },
  fmtMod:  function(m) { return m >= 0 ? '+' + m : '' + m; },

  vibe: function(pattern) {
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch(e) {}
  },

  debounce: function(fn, ms) {
    var timer;
    return function() {
      var args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function() { fn.apply(null, args); }, ms);
    };
  },

  lsSave: function(key, value) {
    try { localStorage.setItem(key, value); }
    catch(e) { console.warn('localStorage lleno: "' + key + '" no guardado.'); }
  },

  escHtml: function(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  mdToHtml: function(text) {
    var CONT_PLACEHOLDER = '\x00CONTINUE_BTN\x00';
    var continueBtn = '<button type="button" class="dm-continue-btn" onclick="(function(){var ta=document.getElementById(\'player-input\');if(ta){ta.value=\'continúa\';ta.dispatchEvent(new Event(\'input\'));document.getElementById(\'send-btn\')?.click();}})()">&#9654; Continuar la historia</button>';
    var cleaned = text
      .replace(/[▶►]?\s*\*?\[escribe\s+['"]?continu[aá]['"]?\s+para\s+seguir\]?\*?/gi, CONT_PLACEHOLDER)
      .replace(/[▶►]?\s*\*?\[press\s+['"]?continu[aá]['"]?\s+to\s+continue\]?\*?/gi, CONT_PLACEHOLDER);

    return window._RPG.escHtml(cleaned)
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*\n]+)\*/g,     '<em>$1</em>')
      .split('\n\n').filter(function(p) { return p.trim(); })
      .map(function(p) { return '<p>' + p.replace(/\n/g, '<br>') + '</p>'; })
      .join('')
      .replace(new RegExp(window._RPG.escHtml(CONT_PLACEHOLDER), 'g'), continueBtn);
  },

});
