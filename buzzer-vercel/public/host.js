/* Host console. Every change goes through /api/host with the PIN. */
(function () {
  var B = window.BZ, TEAMS = B.TEAMS;
  var $ = function (id) { return document.getElementById(id); };

  var game = B.blank();
  var pin = '', unlocked = false;
  var loaded = false, connected = false, failures = 0, inflight = false, lastKey = null;
  var soundOn = true, resetTimer = 0, chain = Promise.resolve(), timer = 0;

  function nm(t) { return game.names[t] || B.DEFAULT_NAMES[t]; }
  function points() { var v = parseInt($('pts').value, 10); return isFinite(v) && v > 0 ? v : 0; }

  function showNote(msg) {
    var n = $('note');
    if (!msg) { n.hidden = true; return; }
    n.textContent = msg; n.hidden = false;
  }

  function render() {
    if (!unlocked) return;
    var w = game.winner, si = B.statusText(game, connected, loaded);
    $('status').setAttribute('data-s', si.s);
    $('statusText').textContent = si.t;
    $('sound').textContent = soundOn ? 'Sound on' : 'Sound off';
    $('sound').setAttribute('aria-pressed', String(soundOn));

    $('hostQ').textContent = game.round ? ('Question ' + game.round + (game.attempt ? ' · second chance' : '')) : 'No question yet';
    var hint;
    if (!game.round) hint = 'Open buzzers to start question 1.';
    else if (w) hint = nm(w) + ' buzzed first. Judge the answer below.';
    else if (game.open) hint = 'Buzzers are open. Waiting for a team to buzz.';
    else hint = 'Buzzers are closed.';
    $('hostHint').textContent = hint;
    $('hClose').disabled = !(game.open && !w);
    $('judge').hidden = !(w && game.open);
    if (w) {
      $('judgeWho').textContent = nm(w) + ' is answering';
      $('hCorrect').textContent = 'Correct, add ' + points();
    }
    TEAMS.forEach(function (t) {
      var inp = $('name' + t);
      if (document.activeElement !== inp) inp.value = game.names[t];
      $('hsc' + t).textContent = String(game.scores[t]);
    });
  }

  function applyState(s) {
    game = B.fromServer(s);
    var key = game.round + ':' + game.attempt + ':' + game.winner;
    if (loaded && lastKey !== null && key !== lastKey && game.winner) B.playBuzz(false, soundOn);
    lastKey = key;
    loaded = true;
    render();
  }

  function lock(msg) {
    unlocked = false; pin = ''; B.ssSet('buzzer-pin', '');
    clearInterval(timer); timer = 0;
    $('console').hidden = true; $('login').hidden = false; $('sound').hidden = true;
    var e = $('loginErr');
    if (msg) { e.textContent = msg; e.hidden = false; } else { e.hidden = true; }
  }

  function hostCall(action, extra) {
    var body = Object.assign({ pin: pin, action: action }, extra || {});
    return fetch('/api/host', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401 || r.status === 429) { var err = new Error(j.error || 'Wrong PIN'); err.auth = true; throw err; }
        if (!r.ok) throw new Error(j.error || 'Server error');
        return j;
      });
    });
  }

  // One change at a time, in the order the host tapped.
  function act(action, extra) {
    chain = chain.then(function () {
      return hostCall(action, extra)
        .then(function (j) { showNote(''); if (j.state) applyState(j.state); })
        .catch(function (e) {
          if (e.auth) lock(e.message);
          else showNote(e.message === 'Failed to fetch' ? 'Connection problem. Try again.' : e.message);
        });
    });
    return chain;
  }

  function refresh() {
    if (inflight || document.hidden || !unlocked) return;
    inflight = true;
    fetch('/api/state', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('bad'); return r.json(); })
      .then(function (s) { connected = true; failures = 0; applyState(s); })
      .catch(function () { failures += 1; if (failures >= 3) { connected = false; render(); } })
      .then(function () { inflight = false; });
  }

  function enter() {
    unlocked = true;
    $('login').hidden = true; $('console').hidden = false; $('sound').hidden = false;
    $('shareUrl').value = location.origin + '/';
    render(); refresh();
    if (!timer) timer = setInterval(refresh, 700);
  }

  function tryLogin(p) {
    pin = p;
    return hostCall('check').then(function (j) {
      B.ssSet('buzzer-pin', p);
      if (j.state) applyState(j.state);
      enter();
    }).catch(function (e) { lock(e.message === 'Failed to fetch' ? 'Connection problem. Try again.' : e.message); });
  }

  function build() {
    var ht = $('hostTeams');
    TEAMS.forEach(function (t) {
      var h = document.createElement('li');
      var sw = document.createElement('span'); sw.className = 'swatch'; sw.style.setProperty('--team', B.col(t));
      var inp = document.createElement('input'); inp.type = 'text'; inp.id = 'name' + t; inp.maxLength = 20;
      inp.setAttribute('aria-label', 'Name for team ' + t);
      inp.addEventListener('change', function () { act('rename', { team: t, name: inp.value }); });
      var minus = document.createElement('button'); minus.type = 'button'; minus.className = 'step'; minus.textContent = '−';
      minus.setAttribute('aria-label', 'Subtract 1 point from team ' + t);
      var sc = document.createElement('span'); sc.className = 'sc'; sc.id = 'hsc' + t;
      var plus = document.createElement('button'); plus.type = 'button'; plus.className = 'step'; plus.textContent = '+';
      plus.setAttribute('aria-label', 'Add 1 point to team ' + t);
      minus.addEventListener('click', function () { act('adjust', { team: t, delta: -1 }); });
      plus.addEventListener('click', function () { act('adjust', { team: t, delta: 1 }); });
      h.appendChild(sw); h.appendChild(inp); h.appendChild(minus); h.appendChild(sc); h.appendChild(plus);
      ht.appendChild(h);
    });
  }

  function wire() {
    $('loginForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var v = $('pin').value;
      if (v) tryLogin(v);
    });
    $('sound').addEventListener('click', function () {
      soundOn = !soundOn; B.lsSet('buzzer-sound', soundOn ? '1' : '0'); B.unlockAudio(); render();
    });
    $('pts').addEventListener('input', render);
    $('hOpen').addEventListener('click', function () { B.unlockAudio(); act('open'); });
    $('hClose').addEventListener('click', function () { act('close'); });
    $('hCorrect').addEventListener('click', function () { act('correct', { points: points() }); });
    $('hWrong').addEventListener('click', function () { act('wrong'); });
    $('hNone').addEventListener('click', function () { act('none'); });
    $('hReset').addEventListener('click', function () {
      var b = $('hReset');
      if (!resetTimer) {
        b.textContent = 'Tap again to reset all scores';
        resetTimer = setTimeout(function () { resetTimer = 0; b.textContent = 'Reset scores'; }, 4000);
        return;
      }
      clearTimeout(resetTimer); resetTimer = 0; b.textContent = 'Reset scores';
      act('resetScores');
    });
    $('copy').addEventListener('click', function () {
      var i = $('shareUrl');
      var done = function () { $('copy').textContent = 'Copied'; setTimeout(function () { $('copy').textContent = 'Copy'; }, 1500); };
      try {
        navigator.clipboard.writeText(i.value).then(done, function () { i.select(); });
      } catch (e) { i.select(); }
    });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });
  }

  build(); wire();
  soundOn = B.lsGet('buzzer-sound') !== '0';
  var saved = B.ssGet('buzzer-pin');
  if (saved) tryLogin(saved);
})();
