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

  /* Affiliate clicks: WHICH listing, not just "an affiliate link was clicked".
     Resolved from HARDWARE_BUY by href rather than from a data- attribute,
     because renderBom() builds those buttons as an HTML string in app.js —
     this way the ids live in one place (data.js) and can't drift out of step.
     The ids match the viewer's BUY table, so a magnet click from either app
     lands on the same dashboard row despite the two GoatCounter sites.
     ⚠ app.js's own outEvent() still emits a flat `hardware:buy` for these.
     That rollup is HIDDEN on the dashboard rather than removed here, so this
     file stays independent of app.js — see SHOWN_ABOVE in viewer/stats. */
  function hardwareId(href) {
    if (typeof HARDWARE_BUY === "undefined") return null;
    for (var name in HARDWARE_BUY)
      for (var i = 0; i < HARDWARE_BUY[name].length; i++)
        if (HARDWARE_BUY[name][i].url === href) return HARDWARE_BUY[name][i].id || null;
    return null;
  }

  // No boot queue, unlike the viewer's track(): every one of these is a click,
  // so count.js has long since loaded by the time one fires.
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t || typeof t.closest !== "function") return;   // e.g. a document-level target
    var a = t.closest("a[data-track]");
    if (a) { send(a.getAttribute("data-track")); return; }
    a = t.closest('a[rel~="sponsored"]');                // the affiliate buy buttons
    if (a) send("buy:hardware:" + (hardwareId(a.getAttribute("href")) || "unknown"));
  });

  if (typeof window !== "undefined" && window.__GEN2_PLANNER_TEST__)
    window.__GEN2_PLANNER_TEST__.trackLinksSend = send;
})();
