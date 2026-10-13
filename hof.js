// Hall of Fame: unlimited entries persisted in localStorage, rendered with a
// virtualized list so it stays fast no matter how many scores pile up.
const HallOfFame = (() => {
  'use strict';

  const KEY = 'tetris.hallOfFame.v1';
  const ROW_H = 40;
  const OVERSCAN = 6;
  const MEDALS = ['', '\u{1F947}', '\u{1F948}', '\u{1F949}'];

  let entries = load();
  let ranked = [];
  let rankById = new Map();
  let view = [];
  let highlightId = null;
  let scheduled = false;
  const els = {};

  function isValid(e) {
    return e && typeof e.name === 'string' && Number.isFinite(e.score);
  }

  function normalize(e) {
    return {
      id: typeof e.id === 'string' && e.id ? e.id : uid(),
      name: cleanName(e.name),
      score: Math.max(0, Math.floor(e.score)),
      lines: Math.max(0, Math.floor(Number(e.lines) || 0)),
      level: Math.max(1, Math.floor(Number(e.level) || 1)),
      time: Math.max(0, Math.floor(Number(e.time) || 0)),
      date: Number.isFinite(e.date) ? e.date : Date.now(),
    };
  }

  function load() {
    try {
      const data = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(data) ? data.filter(isValid).map(normalize) : [];
    } catch (err) {
      return [];
    }
  }

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(entries));
      return true;
    } catch (err) {
      message('Could not save: browser storage is full or disabled.');
      return false;
    }
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function cleanName(name) {
    const n = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 16);
    return n || 'Anonymous';
  }

  function byRank(a, b) {
    return b.score - a.score || b.lines - a.lines || a.date - b.date;
  }

  const SORTS = {
    rank: byRank,
    lines: (a, b) => b.lines - a.lines || byRank(a, b),
    level: (a, b) => b.level - a.level || byRank(a, b),
    newest: (a, b) => b.date - a.date,
    oldest: (a, b) => a.date - b.date,
    name: (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || byRank(a, b),
  };

  function reindex() {
    ranked = entries.slice().sort(byRank);
    rankById = new Map(ranked.map((e, i) => [e.id, i + 1]));
  }

  // Rank a score would get right now (ties go to the earlier entry).
  function rankFor(score) {
    let lo = 0;
    let hi = ranked.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (ranked[mid].score >= score) lo = mid + 1;
      else hi = mid;
    }
    return lo + 1;
  }

  function best() {
    return ranked.length ? ranked[0].score : 0;
  }

  function count() {
    return entries.length;
  }

  function add(data) {
    const entry = normalize({ ...data, id: uid(), date: Date.now() });
    entries.push(entry);
    persist();
    reindex();
    highlightId = entry.id;
    refresh();
    scrollToEntry(entry.id);
    return rankById.get(entry.id);
  }

  // ---------- rendering ----------

  const fmtNum = (n) => n.toLocaleString();
  const fmtDate = (t) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: '2-digit' });
  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function parseRankQuery(q) {
    const m = /^#\s*(\d+)$/.exec(q);
    return m ? parseInt(m[1], 10) : null;
  }

  function refresh() {
    const q = els.search.value.trim();
    const rankJump = parseRankQuery(q);
    const sortKey = rankJump ? 'rank' : els.sort.value;
    let list;
    if (q && !rankJump) {
      const needle = q.toLowerCase();
      list = entries.filter((e) => e.name.toLowerCase().includes(needle));
    } else {
      list = entries.slice();
    }
    view = sortKey === 'rank' ? (list.length === ranked.length ? ranked.slice() : list.sort(byRank)) : list.sort(SORTS[sortKey]);

    els.list.style.height = view.length * ROW_H + 'px';
    els.empty.hidden = view.length > 0;
    els.empty.textContent = entries.length ? 'No matching entries.' : 'No legends yet. Be the first!';
    const total = entries.length;
    const noun = total === 1 ? 'entry' : 'entries';
    els.count.textContent = q && !rankJump ? `${fmtNum(view.length)} of ${fmtNum(total)} ${noun}` : `${fmtNum(total)} ${noun}`;
    els.clear.disabled = total === 0;
    els.export.disabled = total === 0;

    if (rankJump) {
      const idx = Math.min(Math.max(rankJump, 1), view.length) - 1;
      if (idx >= 0) centerIndex(idx);
    }
    renderRows();
  }

  function renderRows() {
    scheduled = false;
    const vp = els.viewport;
    const height = vp.clientHeight || 600;
    const start = Math.max(0, Math.floor(vp.scrollTop / ROW_H) - OVERSCAN);
    const end = Math.min(view.length, Math.ceil((vp.scrollTop + height) / ROW_H) + OVERSCAN);
    let html = '';
    for (let i = start; i < end; i++) {
      const e = view[i];
      const rank = rankById.get(e.id);
      let cls = 'hof-row';
      if (rank <= 3) cls += ' top' + rank;
      if (e.id === highlightId) cls += ' me';
      html +=
        `<li class="${cls}" style="transform:translateY(${i * ROW_H}px)" title="${esc(e.name)} \u2022 ${fmtTime(e.time)} played">` +
        `<span class="c-rank">${rank <= 3 ? MEDALS[rank] : fmtNum(rank)}</span>` +
        `<span class="c-name">${esc(e.name)}</span>` +
        `<span class="c-score">${fmtNum(e.score)}</span>` +
        `<span class="c-lines">${fmtNum(e.lines)}</span>` +
        `<span class="c-level">${e.level}</span>` +
        `<span class="c-date">${fmtDate(e.date)}</span>` +
        `</li>`;
    }
    els.list.innerHTML = html;
  }

  function fmtTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function schedule() {
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(renderRows);
    }
  }

  function centerIndex(idx) {
    const vp = els.viewport;
    vp.scrollTop = Math.max(0, idx * ROW_H - (vp.clientHeight - ROW_H) / 2);
  }

  function scrollToEntry(id) {
    let idx = view.findIndex((e) => e.id === id);
    if (idx < 0) {
      els.search.value = '';
      refresh();
      idx = view.findIndex((e) => e.id === id);
    }
    if (idx >= 0) {
      centerIndex(idx);
      renderRows();
    }
  }

  function reveal() {
    els.root.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (highlightId) scrollToEntry(highlightId);
  }

  let msgTimer = 0;
  function message(text) {
    if (!els.msg) return;
    els.msg.textContent = text;
    els.msg.hidden = false;
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => { els.msg.hidden = true; }, 4000);
  }

  // ---------- import / export ----------

  function exportJson() {
    const blob = new Blob([JSON.stringify(ranked, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tetris-hall-of-fame-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!Array.isArray(data)) throw new Error('not a list');
        const known = new Set(entries.map((e) => e.id));
        let added = 0;
        for (const raw of data) {
          if (!isValid(raw)) continue;
          const e = normalize(raw);
          if (known.has(e.id)) continue;
          known.add(e.id);
          entries.push(e);
          added++;
        }
        persist();
        reindex();
        refresh();
        message(`Imported ${fmtNum(added)} new ${added === 1 ? 'entry' : 'entries'}.`);
      } catch (err) {
        message('That file is not a valid Hall of Fame export.');
      }
    };
    reader.readAsText(file);
  }

  function clearAll() {
    if (!entries.length) return;
    if (!confirm('Delete all ' + fmtNum(entries.length) + ' Hall of Fame entries? This cannot be undone.')) return;
    entries = [];
    highlightId = null;
    persist();
    reindex();
    refresh();
  }

  // ---------- setup ----------

  function init() {
    els.root = document.getElementById('hof');
    els.viewport = document.getElementById('hofViewport');
    els.list = document.getElementById('hofList');
    els.empty = document.getElementById('hofEmpty');
    els.count = document.getElementById('hofCount');
    els.search = document.getElementById('hofSearch');
    els.sort = document.getElementById('hofSort');
    els.export = document.getElementById('hofExport');
    els.import = document.getElementById('hofImport');
    els.file = document.getElementById('hofFile');
    els.clear = document.getElementById('hofClear');
    els.msg = document.getElementById('hofMsg');

    els.viewport.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    els.search.addEventListener('input', () => { els.viewport.scrollTop = 0; refresh(); });
    els.sort.addEventListener('change', () => { els.viewport.scrollTop = 0; refresh(); els.sort.blur(); });
    els.export.addEventListener('click', (e) => { e.currentTarget.blur(); exportJson(); });
    els.import.addEventListener('click', (e) => { e.currentTarget.blur(); els.file.click(); });
    els.file.addEventListener('change', () => {
      if (els.file.files[0]) importJson(els.file.files[0]);
      els.file.value = '';
    });
    els.clear.addEventListener('click', (e) => { e.currentTarget.blur(); clearAll(); });

    // Keep several open tabs in sync.
    window.addEventListener('storage', (e) => {
      if (e.key !== KEY) return;
      entries = load();
      reindex();
      refresh();
    });

    reindex();
    refresh();
  }

  return { init, add, rankFor, best, count, reveal };
})();
