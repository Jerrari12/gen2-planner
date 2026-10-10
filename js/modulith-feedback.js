/* MODULITH Feedback & support - ONE shared dialog for every MODULITH tool (planner, Label Studio, Part Picker,
   3D Build Studio). The planner owns this file; the other tools vendor it byte for byte and pin its hash, so the
   wording, the email templates and the diagnostic lines are the same everywhere (Astra 2026-10-10).

   It sends nothing itself: a static site cannot. "Open email app" opens a mailto: link, "Copy message" copies the whole
   message (address, subject and body) for webmail users. The address is assembled when the dialog opens - that deters
   naive page scrapers, nothing more; it is not spam protection. Subject tags ([MODULITH <tool>] Help/Problem/Idea) are
   for sorting mail, not for filtering spam.

   Usage (classic script, no dependencies):
     MODULITHFeedback.open({
       tool: 'Planner',                 // shown in the subject and the footer line
       version: 'v2610',                // optional
       buildLink: () => url | null,     // optional: offered as an UNCHECKED "Include a link to this build"
       track: (name) => {},             // optional analytics hook; fixed names: feedback:open, feedback:<kind>,
                                        //   feedback:email, feedback:copy
     });
     MODULITHFeedback.button(opts)      // a ready-made <button> that opens it ("Feedback & support")
*/
(function () {
  'use strict';
  if (window.MODULITHFeedback) return;

  var ADDRESS = ['support', 'jerrari3d.com'].join('@');
  var LABEL = 'Feedback & support';
  var MAILTO_MAX = 1800;        // mail apps on Windows truncate or refuse long mailto: links past ~2000 characters
  var LINK_MAX = 1200;          // a build link longer than this is not put in the email; the user attaches the build file

  var KINDS = [
    { id: 'help', tag: 'Help', title: 'Get help', hint: "Can't work out how to do something?",
      body: 'What are you trying to do?\n\n\nWhere did you get stuck?\n\n' },
    { id: 'problem', tag: 'Problem', title: 'Report a problem', hint: 'Something broke or looks wrong?',
      body: 'What happened?\n\n\nWhat did you expect to happen?\n\n\nHow to make it happen again (if you know):\n1. \n' },
    { id: 'idea', tag: 'Idea', title: 'Suggest an improvement', hint: 'An idea that would make it better?',
      body: 'Your idea:\n\n\nWhat would it help you do?\n\n' }
  ];

  var CSS =
    '.mfb-dialog{max-width:min(460px,calc(100vw - 32px));width:100%;padding:0;border:1px solid #4a4b50;border-radius:12px;' +
    'background:#2c2d31;color:#ececee;font:15px/1.45 "Segoe UI",system-ui,-apple-system,sans-serif;box-shadow:0 16px 48px rgba(0,0,0,.5)}' +
    '.mfb-dialog::backdrop{background:rgba(10,11,14,.6)}' +
    '.mfb-in{padding:18px 18px 16px}' +
    '.mfb-head{display:flex;align-items:center;gap:10px;margin:0 0 4px}' +
    '.mfb-head h2{flex:1;margin:0;font:700 1.1rem "Space Grotesk","Segoe UI",system-ui,sans-serif;color:#ececee}' +
    '.mfb-x{appearance:none;border:none;background:none;color:#a6a8ad;font-size:1.1rem;cursor:pointer;padding:4px 6px;border-radius:6px}' +
    '.mfb-x:hover,.mfb-x:focus-visible{color:#ececee;outline:2px solid #ff6a1a;outline-offset:1px}' +
    '.mfb-sub{margin:0 0 14px;color:#a6a8ad;font-size:.9rem}' +
    '.mfb-kinds{display:grid;gap:8px}' +
    '.mfb-kind{appearance:none;text-align:left;width:100%;cursor:pointer;padding:10px 12px;border-radius:8px;border:2px solid #4a4b50;' +
    'background:#1d1e20;color:#ececee;font:inherit}' +
    '.mfb-kind b{display:block;font-weight:700}' +
    '.mfb-kind span{display:block;color:#a6a8ad;font-size:.85rem}' +
    '.mfb-kind:hover{border-color:#d9550f}' +
    '.mfb-kind:focus-visible{outline:2px solid #ff6a1a;outline-offset:2px}' +
    '.mfb-kind[aria-pressed="true"]{border-color:#ff6a1a}' +
    '.mfb-step2[hidden]{display:none}' +
    '.mfb-step2{margin-top:14px;border-top:1px solid #4a4b50;padding-top:12px}' +
    '.mfb-check{display:flex;gap:8px;align-items:flex-start;margin:0 0 10px;font-size:.9rem;cursor:pointer}' +
    '.mfb-check input{margin-top:3px;accent-color:#ff6a1a;width:16px;height:16px;flex:none}' +
    '.mfb-check small{display:block;color:#a6a8ad}' +
    '.mfb-acts{display:flex;flex-wrap:wrap;gap:8px;margin:4px 0 10px}' +
    '.mfb-btn{appearance:none;cursor:pointer;font:700 .9rem "Segoe UI",system-ui,sans-serif;padding:9px 16px;border-radius:8px;' +
    'border:2px solid #ff6a1a;background:#ff6a1a;color:#1d1e20;text-decoration:none;display:inline-block}' +
    '.mfb-btn.ghost{background:transparent;color:#ff6a1a}' +
    '.mfb-btn:hover{filter:brightness(1.1)}' +
    '.mfb-btn:focus-visible{outline:2px solid #ececee;outline-offset:2px}' +
    '.mfb-to{margin:0;color:#a6a8ad;font-size:.85rem}' +
    '.mfb-to b{color:#ececee;font-weight:600;user-select:all}' +
    '.mfb-note{margin:8px 0 0;color:#a6a8ad;font-size:.85rem}' +
    '.mfb-status{margin:8px 0 0;font-size:.85rem;color:#4cc38a;min-height:1.2em}' +
    '.mfb-copybox{width:100%;box-sizing:border-box;min-height:120px;margin-top:8px;background:#1d1e20;color:#ececee;' +
    'border:1px solid #4a4b50;border-radius:8px;padding:8px;font:12px/1.4 ui-monospace,Consolas,monospace}' +
    '.mfb-trigger{appearance:none;cursor:pointer;display:inline-flex;align-items:center;gap:6px;font:600 .85rem "Segoe UI",system-ui,sans-serif;' +
    'padding:5px 11px;border-radius:999px;border:1px solid rgba(255,255,255,.3);background:rgba(20,21,23,.35);color:#ececee;white-space:nowrap}' +
    '.mfb-trigger:hover{border-color:#ff6a1a}' +
    '.mfb-trigger:focus-visible{outline:2px solid #ff6a1a;outline-offset:2px}' +
    '.mfb-trigger svg{width:16px;height:16px;flex:none}';

  var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" ' +
    'aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z"/><path d="M9.5 9.5a2.5 2.5 0 0 1 4.8 1c0 1.7-2.3 2-2.3 3.4"/>' +
    '<path d="M12 16.8v.01"/></svg>';

  function css() {
    if (document.getElementById('mfb-css')) return;
    var s = document.createElement('style');
    s.id = 'mfb-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else e.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }
  // a page address without its query or hash: those can carry a whole build (and its drawer labels)
  function cleanPage() {
    try { return location.origin + location.pathname; } catch (e) { return ''; }
  }
  // "Chrome 141 on Windows" - enough to reproduce a problem, nothing more
  function browserLine() {
    try {
      var ua = navigator.userAgent, b = 'a browser', m;
      if ((m = ua.match(/Edg\/(\d+)/))) b = 'Edge ' + m[1];
      else if ((m = ua.match(/OPR\/(\d+)/))) b = 'Opera ' + m[1];
      else if ((m = ua.match(/Firefox\/(\d+)/))) b = 'Firefox ' + m[1];
      else if ((m = ua.match(/Chrome\/(\d+)/))) b = 'Chrome ' + m[1];
      else if ((m = ua.match(/Version\/(\d+).*Safari/))) b = 'Safari ' + m[1];
      var os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS'
        : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'an unknown system';
      return b + ' on ' + os;
    } catch (e) { return ''; }
  }

  // The message for one kind. Pure apart from the page/browser reads, so it can be tested.
  function compose(opts, kindId, withBuild) {
    var k = KINDS.filter(function (x) { return x.id === kindId; })[0] || KINDS[0];
    var tool = String((opts && opts.tool) || 'MODULITH').slice(0, 40);
    var subject = '[MODULITH ' + tool + '] ' + k.tag;
    var lines = ['--', 'MODULITH ' + tool + ((opts && opts.version) ? ' ' + String(opts.version).slice(0, 40) : '')];
    var page = String((opts && opts.page) || cleanPage()).split(/[?#]/)[0];   // never a query or a hash, whoever supplies it
    if (page) lines.push('Page: ' + page);
    if (k.id === 'problem') { var b = (opts && opts.browser) || browserLine(); if (b) lines.push('Browser: ' + b); }
    var note = '';
    if (withBuild && opts && typeof opts.buildLink === 'function') {
      var link = null;
      try { link = opts.buildLink(); } catch (e) { link = null; }
      if (link && String(link).length <= LINK_MAX) lines.push('Build: ' + link);
      else if (link) {
        lines.push('Build: too big for an email link - I will attach the build file.');
        note = opts.attachHint || 'Your build is too big to put in an email link. Save it as a build file and attach that to your email.';
      }
    }
    var body = k.body + '\n' + lines.join('\n') + '\n';
    var mailto = 'mailto:' + ADDRESS + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    return { to: ADDRESS, subject: subject, body: body, mailto: mailto, tooLong: mailto.length > MAILTO_MAX, note: note };
  }

  function copyText(text, box) {
    var done = function (ok) { return ok; };
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return done(true); }, function () { return done(false); });
    }
    return Promise.resolve(false).then(function () { box.hidden = false; box.value = text; box.focus(); box.select(); return false; });
  }

  var dlg = null, state = null;
  function build() {
    css();
    var title = el('h2', { id: 'mfb-title', text: LABEL });
    var x = el('button', { type: 'button', class: 'mfb-x', 'aria-label': 'Close' }); x.textContent = '✕';
    var kinds = el('div', { class: 'mfb-kinds', role: 'group', 'aria-label': 'What do you need?' });
    KINDS.forEach(function (k) {
      var b = el('button', { type: 'button', class: 'mfb-kind', 'data-kind': k.id, 'aria-pressed': 'false' },
        [el('b', { text: k.title }), el('span', { text: k.hint })]);
      kinds.appendChild(b);
    });
    var chk = el('input', { type: 'checkbox', id: 'mfb-build' });
    var chkLab = el('label', { class: 'mfb-check', for: 'mfb-build' },
      [chk, el('span', {}, [document.createTextNode('Include a link to this build'),
        el('small', { text: 'The link holds your whole layout and your drawer labels, so we can open exactly what you see.' })])]);
    var open = el('a', { class: 'mfb-btn', href: '#', text: 'Open email app' });   // no target: a mailto: link hands off to the mail app, the page stays
    var copy = el('button', { type: 'button', class: 'mfb-btn ghost', text: 'Copy message' });
    var to = el('p', { class: 'mfb-to' }, [document.createTextNode('To: '), el('b', { text: ADDRESS })]);
    var note = el('p', { class: 'mfb-note', text: 'Add screenshots in your email if they help. The message is only sent when you send it.' });
    var status = el('p', { class: 'mfb-status', role: 'status' });
    var box = el('textarea', { class: 'mfb-copybox', readonly: 'readonly', 'aria-label': 'The message, to copy' }); box.hidden = true;
    var step2 = el('div', { class: 'mfb-step2' }, [chkLab, el('div', { class: 'mfb-acts' }, [open, copy]), to, note, status, box]);
    step2.hidden = true;
    var inner = el('div', { class: 'mfb-in' }, [el('div', { class: 'mfb-head' }, [title, x]),
      el('p', { class: 'mfb-sub', text: 'Questions, problems and ideas all go to ' + ADDRESS + '. Pick one to start an email.' }), kinds, step2]);
    var d = el('dialog', { class: 'mfb-dialog', 'aria-labelledby': 'mfb-title' }, [inner]);
    document.body.appendChild(d);

    function refresh() {
      if (!state.kind) return;
      var m = compose(state.opts, state.kind, chk.checked);
      open.href = m.tooLong ? 'mailto:' + ADDRESS + '?subject=' + encodeURIComponent(m.subject) : m.mailto;
      state.msg = m;
      status.textContent = m.note || (m.tooLong ? 'This message is long for an email link: use Copy message and paste it into your email.' : '');
      status.style.color = (m.note || m.tooLong) ? '#e8b04b' : '';
      box.hidden = true;
    }
    kinds.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('.mfb-kind'); if (!b) return;
      state.kind = b.getAttribute('data-kind');
      Array.prototype.forEach.call(kinds.children, function (c) { c.setAttribute('aria-pressed', c === b ? 'true' : 'false'); });
      step2.hidden = false;
      chkLab.hidden = !(state.opts && typeof state.opts.buildLink === 'function');
      refresh();
      fire('feedback:' + state.kind);
    });
    chk.addEventListener('change', refresh);
    open.addEventListener('click', function () { fire('feedback:email'); });
    copy.addEventListener('click', function () {
      var m = state.msg; if (!m) return;
      var text = 'To: ' + m.to + '\nSubject: ' + m.subject + '\n\n' + m.body;
      copyText(text, box).then(function (ok) {
        status.style.color = '';
        status.textContent = ok ? 'Copied. Paste it into a new email to ' + ADDRESS + '.' : 'Select the message below and copy it.';
      });
      fire('feedback:copy');
    });
    x.addEventListener('click', function () { shut(d); });
    d.addEventListener('click', function (e) { if (e.target === d) shut(d); });   // a click on the backdrop
    d.addEventListener('close', function () { if (state && state.back && state.back.focus) { try { state.back.focus(); } catch (e) {} } });
    return { d: d, chk: chk, kinds: kinds, step2: step2, status: status, box: box };
  }
  // a browser without <dialog> methods (pre-2022) gets the open attribute and its removal
  function shut(d) {
    if (typeof d.close === 'function') d.close();
    else { d.removeAttribute('open'); d.dispatchEvent(new Event('close')); }
  }
  function fire(name) { try { if (state && state.opts && typeof state.opts.track === 'function') state.opts.track(name); } catch (e) {} }

  function openDialog(opts) {
    if (!dlg) dlg = build();
    state = { opts: opts || {}, kind: null, msg: null, back: document.activeElement };
    dlg.chk.checked = false;                      // a build link is opt-in, every time
    dlg.step2.hidden = true;
    dlg.status.textContent = '';
    Array.prototype.forEach.call(dlg.kinds.children, function (c) { c.setAttribute('aria-pressed', 'false'); });
    if (typeof dlg.d.showModal === 'function') dlg.d.showModal(); else dlg.d.setAttribute('open', '');
    var first = dlg.kinds.querySelector('.mfb-kind'); if (first) first.focus();
    fire('feedback:open');
  }

  function button(opts, text) {
    css();
    var b = el('button', { type: 'button', class: 'mfb-trigger', 'aria-label': LABEL, title: LABEL, 'aria-haspopup': 'dialog' });
    b.innerHTML = ICON;
    b.appendChild(el('span', { class: 'mfb-trigger-text', text: text || LABEL }));
    b.addEventListener('click', function () { openDialog(typeof opts === 'function' ? opts() : opts); });
    return b;
  }

  window.MODULITHFeedback = { open: openDialog, button: button, compose: compose, ADDRESS: ADDRESS, LABEL: LABEL, KINDS: KINDS };
})();
