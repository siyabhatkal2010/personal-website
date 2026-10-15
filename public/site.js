// Shared behavior for every page: night mode (remembered across pages)
// and the language picker on the About me page.
(function () {
  var root = document.getElementById('root');
  var btn = document.getElementById('modebtn');

  function setNight(on, save) {
    if (!root) return;
    root.classList.toggle('night', on);
    if (btn) btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (save) {
      try { localStorage.setItem('siya-night', on ? '1' : '0'); } catch (e) {}
    }
  }

  var saved = false;
  try { saved = localStorage.getItem('siya-night') === '1'; } catch (e) {}
  setNight(saved, false);

  if (btn) {
    btn.addEventListener('click', function () {
      setNight(!root.classList.contains('night'), true);
    });
  }

  // Language picker (About me page)
  var greet = document.getElementById('greet');
  var sub = document.getElementById('greet-sub');
  var buttons = document.querySelectorAll('button.lang');
  buttons.forEach(function (b) {
    b.addEventListener('click', function () {
      buttons.forEach(function (o) { o.setAttribute('aria-pressed', o === b ? 'true' : 'false'); });
      if (greet) {
        greet.textContent = b.dataset.script;
        greet.setAttribute('lang', b.dataset.tag);
      }
      if (sub) sub.textContent = b.dataset.roman + ' · ' + b.dataset.name;
    });
  });
})();
