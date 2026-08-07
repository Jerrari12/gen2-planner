/* track-links.js — declarative analytics for the planner's STATIC links.

   The hero bar and footer carry links that app.js never renders and that no
   existing handler sees: the JERRARI3D site, the Printables/Thangs PROFILE
   pages (discovery, not model downloads), the Instruction Hub, and the two
   "Starter kits" entry points into the kits gallery. All of them were
   invisible, so there was no way to tell whether they earn their space.

   Mark an anchor with `data-track="<event>"` and it counts. Adding a link
   later needs an attribute, not a code change — the same "one funnel" idea as
   the viewer's linkEl(), and the reason this is delegated on document rather
   than bound per element (it also survives any future re-render).

   ⚠ The event name lives in the MARKUP on purpose. Keep it a fixed vocabulary
   term — a destination or a placement, never a url, and never anything a user
   typed. That property is what lets both apps run without a consent banner.

   Deliberately standalone rather than a line in app.js: app.js's track() is
   private to its IIFE, and this way the file stays independent of whatever
   else is in flight there. Same payload shape as track() — if that ever
   changes, change it here too. */
(function () {
  "use strict";

  function send(name) {
    try {
      if (window.goatcounter && window.goatcounter.count)
        window.goatcounter.count({ path: name, title: name, event: true });
    } catch (e) { /* ignore — never let tracking throw */ }
  }

  // No boot queue, unlike the viewer's track(): every one of these is a click,
  // so count.js has long since loaded by the time one fires.
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t || typeof t.closest !== "function") return;   // e.g. a document-level target
    var a = t.closest("a[data-track]");
    if (a) send(a.getAttribute("data-track"));
  });

  if (typeof window !== "undefined" && window.__GEN2_PLANNER_TEST__)
    window.__GEN2_PLANNER_TEST__.trackLinksSend = send;
})();
