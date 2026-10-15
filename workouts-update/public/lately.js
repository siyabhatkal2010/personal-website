// Life lately page: live music from /api/music and the guestbook.
(function () {
  // ---------- Music ----------
  var board = document.getElementById('lfm-board');
  var track = document.getElementById('lfm-track');
  var artist = document.getElementById('lfm-artist');
  var top = document.getElementById('lfm-top');
  var status = document.getElementById('lfm-status');

  function ago(ms) {
    var m = Math.round((Date.now() - ms) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + ' min ago';
    var h = Math.round(m / 60);
    if (h < 24) return h + (h === 1 ? ' hr ago' : ' hrs ago');
    var d = Math.round(h / 24);
    return d + (d === 1 ? ' day ago' : ' days ago');
  }

  function offline() {
    if (track) track.textContent = 'Taking a break';
    if (artist) artist.textContent = 'Music will be back shortly.';
    if (board) board.textContent = 'off air';
  }

  fetch('/api/music')
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (!d || !d.ok || !d.track) return offline();
      var t = d.track;
      if (track) track.textContent = t.name;
      if (artist) artist.textContent = t.artist;
      if (board) board.textContent = t.name + ' · ' + t.artist;
      if (status) status.textContent = t.nowPlaying ? '● playing now' : (t.playedAt ? ago(t.playedAt) : 'via Last.fm');
      if (top && d.topArtist) top.textContent = 'Top artist this month: ' + d.topArtist.name;
    })
    .catch(offline);

  // ---------- Workouts ----------
  var wkBoard = document.getElementById('wk-board');
  var wkTitle = document.getElementById('wk-title');
  var wkLatest = document.getElementById('wk-latest');
  var wkBars = document.getElementById('wk-bars');

  fetch('/api/workouts')
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (!d || !d.ok) return;
      var n = d.week.count;
      if (wkTitle) wkTitle.textContent = n === 1 ? '1 workout this week' : n + ' workouts this week';
      if (wkBoard) wkBoard.textContent = n + (n === 1 ? ' workout' : ' workouts') + ' this wk';
      if (wkLatest) {
        wkLatest.textContent = d.latest
          ? 'Latest: ' + d.latest.type + ' · ' + d.latest.minutes + ' min · ' + d.latest.day
          : 'Rest week so far.';
      }
      if (wkBars) {
        var max = Math.max(60, Math.max.apply(null, d.week.days));
        var names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        var label = [];
        Array.prototype.forEach.call(wkBars.children, function (col, i) {
          var bar = col.firstElementChild;
          var mins = d.week.days[i] || 0;
          var pct = Math.round((mins / max) * 100);
          if (!bar) return;
          bar.style.border = '1.5px solid #111';
          bar.style.background = mins
            ? 'linear-gradient(to top, #500000 ' + pct + '%, #FFFFFF ' + pct + '%)'
            : '#FFFFFF';
          bar.title = names[i] + ': ' + mins + ' min';
          label.push(names[i] + ' ' + mins + ' minutes');
        });
        wkBars.setAttribute('aria-label', 'Workout minutes this week: ' + label.join(', '));
      }
    })
    .catch(function () {});

  // ---------- Guestbook ----------
  // For now notes live only in this visitor's browser tab.
  // Next step: save them to a free Supabase table so everyone sees them.
  var name = document.getElementById('gb-name');
  var note = document.getElementById('gb-note');
  var count = document.getElementById('gb-count');
  var sign = document.getElementById('gb-sign');
  var err = document.getElementById('gb-err');
  var total = document.getElementById('gb-total');
  var empty = document.getElementById('gb-empty');
  var wall = document.getElementById('gb-wall');
  var entries = [];

  if (note && count) note.addEventListener('input', function () { count.textContent = note.value.length + '/140'; });
  [name, note].forEach(function (el) { if (el) el.addEventListener('input', function () { if (err) err.hidden = true; }); });

  function render() {
    if (!wall) return;
    wall.textContent = '';
    entries.forEach(function (e, i) {
      var card = document.createElement('div');
      card.style.cssText = 'position: relative; background: #FFFFFF; border: 2px solid #111; padding: 22px 16px 14px; box-shadow: 4px 4px 0 #111; display: flex; flex-direction: column; gap: 8px; transform: rotate(' + ((i * 37) % 7 - 3) + 'deg)';
      var tape = document.createElement('span');
      tape.style.cssText = 'position: absolute; top: -10px; left: 50%; width: 56px; height: 18px; margin-left: -28px; background: #D9D2C3; border: 1.5px solid #111; transform: rotate(-4deg)';
      var p = document.createElement('p');
      p.style.cssText = 'margin: 0; font-size: 15px; overflow-wrap: anywhere';
      p.textContent = e.note;
      var by = document.createElement('p');
      by.style.cssText = "margin: 0; font-family: 'Atkinson Hyperlegible Mono', ui-monospace, monospace; font-size: 12px; overflow-wrap: anywhere";
      by.textContent = '— ' + e.name + ' · ' + e.when;
      card.append(tape, p, by);
      wall.appendChild(card);
    });
    if (total) total.textContent = entries.length + (entries.length === 1 ? ' SIGNATURE' : ' SIGNATURES');
    if (empty) empty.hidden = entries.length > 0;
  }

  if (sign) sign.addEventListener('click', function () {
    var n = (name && name.value || '').trim();
    var t = (note && note.value || '').trim();
    if (!n || !t) { if (err) err.hidden = false; return; }
    entries.unshift({ name: n, note: t, when: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) });
    name.value = ''; note.value = ''; if (count) count.textContent = '0/140';
    render();
  });
})();
