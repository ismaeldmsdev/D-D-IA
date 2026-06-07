/* ═══════════════════════════════════════════════════════
   WEB AUDIO SFX — Sintetizados vía AudioContext
   Sin archivos .mp3 · Compatible con autoplay de iOS/Safari
   Cargado como <script> normal — sin ES modules
   ════════════════════════════════════════════════════ */

window._RPG = window._RPG || {};

window._RPG.sfx = (function() {
  var _ctx = null;

  function _getCtx() {
    if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (_ctx.state === 'suspended') _ctx.resume();
    return _ctx;
  }

  function _makeEnv(gain, at, dt, sl, rt, now) {
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + at);
    gain.gain.linearRampToValueAtTime(sl, now + at + dt);
    gain.gain.linearRampToValueAtTime(0, now + at + dt + rt);
  }

  return {
    alert: function() {
      try {
        var ac = _getCtx(), now = ac.currentTime;
        [220, 440].forEach(function(freq, i) {
          var osc = ac.createOscillator(), g = ac.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + i * 0.18);
          osc.frequency.linearRampToValueAtTime(freq * 2, now + i * 0.18 + 0.14);
          g.gain.setValueAtTime(0, now + i * 0.18);
          g.gain.linearRampToValueAtTime(0.22, now + i * 0.18 + 0.04);
          g.gain.linearRampToValueAtTime(0, now + i * 0.18 + 0.22);
          osc.connect(g); g.connect(ac.destination);
          osc.start(now + i * 0.18); osc.stop(now + i * 0.18 + 0.25);
        });
      } catch(e) {}
    },

    roll: function() {
      try {
        var ac = _getCtx(), dur = 1.5, now = ac.currentTime, clicks = 28;
        for (var i = 0; i < clicks; i++) {
          var t   = now + (i / clicks) * dur;
          var buf = ac.createBuffer(1, ac.sampleRate * 0.012, ac.sampleRate);
          var data = buf.getChannelData(0);
          for (var s = 0; s < data.length; s++) data[s] = (Math.random() * 2 - 1) * 0.6;
          var src = ac.createBufferSource(), g = ac.createGain();
          var decay = 0.008 + (1 - i / clicks) * 0.025;
          src.buffer = buf;
          g.gain.setValueAtTime(0.35, t);
          g.gain.linearRampToValueAtTime(0, t + decay);
          src.connect(g); g.connect(ac.destination); src.start(t);
        }
      } catch(e) {}
    },

    result: function(isSuccess) {
      try {
        var ac = _getCtx(), now = ac.currentTime;
        if (isSuccess) {
          [523.25, 659.25, 783.99].forEach(function(freq, i) {
            var osc = ac.createOscillator(), g = ac.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, now + i * 0.05);
            _makeEnv(g, 0.01, 0.1, 0.6, 0.5, now + i * 0.05);
            osc.connect(g); g.connect(ac.destination);
            osc.start(now + i * 0.05); osc.stop(now + i * 0.05 + 0.7);
          });
        } else {
          var osc = ac.createOscillator(), g = ac.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(180, now);
          osc.frequency.linearRampToValueAtTime(55, now + 0.5);
          _makeEnv(g, 0.01, 0.08, 0.5, 0.4, now);
          g.gain.value = 0.3;
          osc.connect(g); g.connect(ac.destination);
          osc.start(now); osc.stop(now + 0.6);
        }
      } catch(e) {}
    },
  };
})();
