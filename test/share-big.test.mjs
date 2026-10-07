/* RELEASE B: A BUILD TOO BIG FOR A LINK GOES AS A FILE (LABEL-LIST-FORMAT.md section 3b: "If a build is then too big for a
   share link, Release B offers a full-file sharing route ... It never strips an icon to make the link fit"), on the real app.js
   in jsdom. jsdom has no navigator.clipboard, so a copied link shows in the #share-url field (the planner's own fallback). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootPlanner, labelBuild, unit, plain } from './lib/label-env.mjs';

function boot(build) {
  const { app, window } = bootPlanner({ url: 'http://localhost:8124/' });
  const saved = [];
  window.URL.createObjectURL = (blob) => { saved.push(blob); return 'blob:x'; };
  window.URL.revokeObjectURL = () => {};
  assert.ok(app.applyBuild(plain(build))); app.refresh(); app.pushHistoryNow();
  return { app, window, saved };
}
// a label list carrying custom icon artwork (each icon an inline SVG of about `kb` KB), the label content Astra keeps in a build
function iconBuild(n, kb) {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="' + 'M1 1L9 9'.repeat(Math.floor(kb * 1024 / 8)) + '"/></svg>';
  const labels = Array.from({ length: n }, (_, i) => ({ id: `iconlabel${String(i).padStart(3, '0')}`, text: `Part ${i + 1}`, badge: { type: 'icon', svg } }));
  const assign = Object.fromEntries(labels.slice(0, 3).map((l, i) => [String(i + 1), l.id]));
  return labelBuild({ labelList: { format: 'modulith-labels', version: 1, labels }, labelAssign: assign },
    [unit(1, 0, 0, { label: 'Part 1' }), unit(2, 1, 0, { label: 'Part 2' }), unit(3, 2, 0, { label: 'Part 3' }), unit(4, 0, 2), unit(5, 1, 2), unit(6, 2, 2)]);
}
const note = (w) => w.document.getElementById('share-note');
const field = (w) => w.document.getElementById('share-url');

test('SB-1: an ordinary build copies its link, with no note', () => {
  const { app, window } = boot(labelBuild());
  app.shareLink();
  assert.equal(field(window).hidden, false);
  assert.match(field(window).value, /#build=/);
  assert.ok(field(window).value.length < app.SHARE_LINK_LONG);
  assert.equal(note(window).hidden, true);
  window.close();
});

test('SB-2: a long link is still copied, and the note offers the build file as the reliable copy', () => {
  const { app, window, saved } = boot(iconBuild(1, 20));
  app.shareLink();
  const len = field(window).value.length;
  assert.ok(len > app.SHARE_LINK_LONG && len <= app.SHARE_LINK_MAX, `a long but sendable link (${len})`);
  assert.equal(note(window).hidden, false);
  assert.match(note(window).textContent, /long link/);
  note(window).querySelector('button').click();
  assert.equal(saved.length, 1, 'the button saves the build file');
  window.close();
});

test('SB-3: a build too big for a link copies NO link and offers the file; the build keeps every icon', async () => {
  const { app, window, saved } = boot(iconBuild(6, 60));
  app.shareLink();
  assert.equal(field(window).hidden, true, 'no link shown or copied');
  assert.equal(note(window).hidden, false);
  assert.match(note(window).textContent, /too big for a link/);
  assert.equal(app.state.labelList.labels.length, 6, 'nothing trimmed');
  assert.ok(app.state.labelList.labels.every((l) => l.badge && l.badge.svg && l.badge.svg.length > 50000), 'every icon kept');
  note(window).querySelector('button').click();
  assert.equal(saved.length, 1);
  const text = await new Promise((res) => { const r = new window.FileReader(); r.onload = () => res(r.result); r.readAsText(saved[0]); });   // jsdom's Blob has no .text()
  const file = JSON.parse(text);
  assert.equal(file.data.labelList.labels.length, 6, 'the file carries the whole list');
  assert.ok(file.data.labelList.labels.every((l) => l.badge.svg.length > 50000), '... with its artwork');
  window.close();
});
