/* Team phone page. */
(function () {
  var B = window.BZ, TEAMS = B.TEAMS;
  var $ = function (id) { return document.getElementById(id); };

  var game = B.blank();
  var loaded = false, connected = false, failures = 0, inflight = false, lastKey = null;
  var myTeam = 0, pending = false, soundOn = true;

  function nm(t) { return game.names[t] || B.DEFAULT_NAMES[t]; }

  function showNote(msg) {
    var n = $('note');
    if (!msg) { n.hidden = true; return; }
    n.textContent = msg; n.hidden = false;
  }

  function canBuzz() {
    return loaded && connected && game.round > 0 && game.open && !game.winner && myTeam > 0 &&
      game.excluded.indexOf(myTeam) < 0 && !pending;
  }

  function buzzState() {
    var w = game.winner;
    if (!loaded) return { k: 'wait', main: 'WAIT', sub: 'Connecting' };
    if (!connected) return { k: 'off', main: 'OFFLINE', sub: 'Reconnecting' };
    if (!game.round) return { k: 'wait', main: 'WAIT', sub: 'No question yet' };
    if (w && w === myTeam) return { k: 'won', main: 'ANSWER NOW', sub: 'Your team buzzed first' };
    if (w) return { k: 'lost', main: nm(w).toUpperCase(), sub: 'buzzed first', win: w };
    if (game.excluded.indexOf(myTeam) >= 0) return { k: 'out', main: 'LOCKED OUT', sub: 'Your team already tried this question' };
    if (!game.open) return { k: 'wait', main: 'WAIT', sub: 'Buzzers are closed' };
    if (pending) return { k: 'pending', main: '…', sub: 'Sending' };
    return { k: 'go', main: 'BUZZ', sub: 'Tap the button' };
  }

  function render() {
    var w = game.winner, si = B.statusText(game, connected, loaded);
    $('status').setAttribute('data-s', si.s);
    $('statusText').textContent = si.t;
    $('sound').textContent = soundOn ? 'Sound on' : 'Sound off';
    $('sound').setAttribute('aria-pressed', String(soundOn));

    $('picker').hidden = myTeam > 0;
    $('stage').hidden = !myTeam;
    document.querySelectorAll('#pickerGrid .pick').forEach(function (b) {
      b.querySelector('.nm').textContent = nm(Number(b.dataset.t));
    });

    if (myTeam) {
      $('mySwatch').style.setProperty('--team', B.col(myTeam));
      $('myName').textContent = 'Team ' + myTeam + ' · ' + nm(myTeam);
      var bs = buzzState(), b = $('buzz');
      b.setAttribute('data-k', bs.k);
      b.disabled = (bs.k !== 'go');
      b.style.setProperty('--team', B.col(myTeam));
      b.style.setProperty('--win', bs.win ? B.col(bs.win) : 'var(--line)');
      $('buzzMain').textContent = bs.main;
      $('buzzMain').classList.toggle('long', bs.main.length > 7);
      $('buzzSub').textContent = bs.sub;
    }

    TEAMS.forEach(function (t) {
      var li = $('row' + t);
      li.classList.toggle('win', w === t);
      li.classList.toggle('me', myTeam === t);
      li.querySelector('.nm').textContent = nm(t);
      li.querySelector('.sc').textContent = String(game.scores[t]);
    });
  }

  function applyState(s) {
    game = B.fromServer(s);
    var key = game.round + ':' + game.attempt + ':' + game.winner;
    if (loaded && lastKey !== null && key !== lastKey && game.winner) {
      B.playBuzz(game.winner === myTeam, soundOn);
    }
    lastKey = key;
    loaded = true;
    render();
  }

  function refresh() {
    if (inflight || document.hidden) return;
    inflight = true;
    fetch('/api/state', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('bad'); return r.json(); })
      .then(function (s) { connected = true; failures = 0; applyState(s); })
      .catch(function () { failures += 1; if (failures >= 3) { connected = false; render(); } })
      .then(function () { inflight = false; });
  }

  function buzz() {
    B.unlockAudio();
    if (!canBuzz()) return;
    pending = true; showNote(''); render();
    fetch('/api/buzz', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ team: myTeam })
    })
      .then(function (r) { if (!r.ok) throw new Error('bad'); return r.json(); })
      .then(function (j) { if (j && j.state) applyState(j.state); })
      .catch(function () { showNote('Connection problem. Check your signal and tap again.'); })
      .then(function () { pending = false; render(); });
  }

  function pickTeam(t) {
    myTeam = t; B.lsSet('buzzer-team', String(t)); B.unlockAudio(); render();
  }

  function build() {
    var pg = $('pickerGrid'), bd = $('board');
    TEAMS.forEach(function (t) {
      var p = document.createElement('button');
      p.type = 'button'; p.className = 'pick'; p.dataset.t = String(t);
      p.style.setProperty('--team', B.col(t));
      var n = document.createElement('span'); n.className = 'num'; n.textContent = String(t);
      var l = document.createElement('span'); l.className = 'nm'; l.textContent = B.DEFAULT_NAMES[t];
      p.appendChild(n); p.appendChild(l);
      p.addEventListener('click', function () { pickTeam(t); });
      pg.appendChild(p);

      var li = document.createElement('li'); li.id = 'row' + t; li.style.setProperty('--team', B.col(t));
      var sw = document.createElement('span'); sw.className = 'swatch'; sw.style.setProperty('--team', B.col(t));
      var nn = document.createElement('span'); nn.className = 'nm';
      var sc = document.createElement('span'); sc.className = 'sc';
      li.appendChild(sw); li.appendChild(nn); li.appendChild(sc);
      bd.appendChild(li);
    });
  }

  function wire() {
    // pointerdown fires the moment a finger lands, which is what a buzzer needs.
    $('buzz').addEventListener('pointerdown', function (e) { e.preventDefault(); buzz(); });
    // Keyboard and assistive-tech activation arrive as a click with no pointer (detail 0).
    $('buzz').addEventListener('click', function (e) { if (e.detail === 0) buzz(); });
    $('change').addEventListener('click', function () { myTeam = 0; B.lsSet('buzzer-team', '0'); render(); });
    $('sound').addEventListener('click', function () {
      soundOn = !soundOn; B.lsSet('buzzer-sound', soundOn ? '1' : '0'); B.unlockAudio(); render();
    });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });
  }

  build(); wire();
  var saved = Number(B.lsGet('buzzer-team'));
  if (saved >= 1 && saved <= 6) myTeam = saved;
  soundOn = B.lsGet('buzzer-sound') !== '0';
  render();
  refresh();
  setInterval(refresh, 700);
})();
