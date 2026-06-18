/* Parallax hero. The banner is short, so instead of a slow drift we pan the
   photo's vertical position from its top (0%) to its bottom (100%) across the
   span of scroll where the banner is still on screen. The image therefore
   travels much faster than the page — by the time the short banner has scrolled
   off the top, you've seen the whole photo. Resolution-independent: 0%–100%
   always means top-to-bottom regardless of how the cover-scaled image overflows.
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
    var p = Math.max(0, Math.min(1, y / range)); // 0 at top → 1 once it's scrolled off
    bg.style.backgroundPositionY = (p * 100).toFixed(1) + "%";
    ticking = false;
  }

  window.addEventListener("scroll", function () {
    if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
  }, { passive: true });

  update();
})();
