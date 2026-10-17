/* Shared helpers for the team page and the host page. */
(function () {
  var TEAMS = [1, 2, 3, 4, 5, 6];
  var DEFAULT_NAMES = { 1: 'Red', 2: 'Amber', 3: 'Green', 4: 'Teal', 5: 'Blue', 6: 'Violet' };
  var audio = null;

  function blank() {
    var names = {}, scores = {};
    TEAMS.forEach(function (t) { names[t] = DEFAULT_NAMES[t]; scores[t] = 0; });
    return { round: 0, attempt: 0, open: false, excluded: [], names: names, scores: scores, winner: 0 };
  }

  // Merge a server state into a complete state object.
  function fromServer(s) {
    var b = blank();
    if (!s || typeof s !== 'object') return b;
    b.round = Number(s.round) || 0;
    b.attempt = Number(s.attempt) || 0;
    b.open = !!s.open;
    b.excluded = Array.isArray(s.excluded) ? s.excluded.map(Number) : [];
    b.winner = Number(s.winner) || 0;
    TEAMS.forEach(function (t) {
      if (s.names && typeof s.names[t] === 'string' && s.names[t]) b.names[t] = s.names[t];
      if (s.scores) b.scores[t] = Number(s.scores[t]) || 0;
    });
    return b;
  }

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }

  function unlockAudio() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
    } catch (e) {}
  }

  function playBuzz(mine, soundOn) {
    if (soundOn) {
      try {
        unlockAudio();
        if (!audio) throw 0;
        var t = audio.currentTime;
        (mine ? [[660, 0], [880, 0.12]] : [[330, 0], [247, 0.12]]).forEach(function (p) {
          var o = audio.createOscillator(), g = audio.createGain();
          o.type = 'square'; o.frequency.value = p[0];
          g.gain.setValueAtTime(0.0001, t + p[1]);
          g.gain.exponentialRampToValueAtTime(0.16, t + p[1] + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, t + p[1] + 0.22);
          o.connect(g); g.connect(audio.destination);
          o.start(t + p[1]); o.stop(t + p[1] + 0.25);
        });
      } catch (e) {}
    }
    if (mine) { try { if (navigator.vibrate) navigator.vibrate(200); } catch (e) {} }
  }

  function statusText(game, connected, loaded) {
    var w = game.winner;
    if (!loaded) return { s: 'idle', t: 'Connecting…' };
    if (!connected) return { s: 'idle', t: 'Reconnecting…' };
    if (!game.round) return { s: 'closed', t: 'Waiting for the first question' };
    var q = 'Question ' + game.round + (game.attempt ? ' · second chance' : '');
    if (w) return { s: 'locked', t: q + ' · ' + game.names[w] + ' buzzed first' };
    if (game.open) return { s: 'open', t: q + ' · buzzers open' };
    return { s: 'closed', t: q + ' · buzzers closed' };
  }

  window.BZ = {
    TEAMS: TEAMS, DEFAULT_NAMES: DEFAULT_NAMES,
    col: function (t) { return 'var(--t' + t + ')'; },
    blank: blank, fromServer: fromServer,
    lsGet: lsGet, lsSet: lsSet, ssGet: ssGet, ssSet: ssSet,
    unlockAudio: unlockAudio, playBuzz: playBuzz, statusText: statusText
  };
})();
