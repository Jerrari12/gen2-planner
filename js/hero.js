/* Parallax hero. A gentle slow drift: the photo starts at its TOP (0%) and pans
   down only a small fraction (PAN) across the scroll where the banner is still on
   screen — so it moves slower than the page and reveals softly instead of racing
   the whole image top-to-bottom. Resolution-independent (% of the cover overflow).
   Page chrome only — kept out of app.js (and the test harness). */
(function () {
  "use strict";
  var hero = document.getElementById("hero");
  var bg = document.getElementById("hero-bg");
  if (!hero || !bg) return;

  var ticking = false;

  function update() {
    var y = window.pageYOffset || document.documentElement.scrollTop || 0;
    var range = hero.offsetHeight || 1;          // banner is visible over this much scroll
    var PAN = 0.25;                                     // fraction of the image to drift (slow)
    var p = Math.max(0, Math.min(1, y / range)) * PAN; // 0% at top → PAN once scrolled off
    bg.style.backgroundPositionY = (p * 100).toFixed(1) + "%";
    ticking = false;
  }

  window.addEventListener("scroll", function () {
    if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
  }, { passive: true });

  update();
})();
