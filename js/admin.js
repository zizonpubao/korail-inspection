/* 정비 현황 화면 (SPEC 4.6). window.Admin = { render(rootEl, ctx), destroy() }
   외부 값은 모두 textContent로 넣는다. 저장·조회는 DB.*만 쓴다. */
(function () {
  'use strict';

  var COLOR = { blue: '#005BAC', blueLight: 'rgba(0,91,172,0.22)', imm: '#C62828', today: '#E08600', next: '#77777A', grid: '#EEF1F5', text: '#1B1F24' };
  var URG_LABEL = { immediate: '즉시 조치', today: '금일 내', next: '다음 정비 시' };

  var S = { root: null, ctx: null, token: 0, charts: [], filters: { days: 30, vehicle: '' }, busy: false, modal: null, body: null, status: null, btns: [] };

  // ---------- 작은 도우미 ----------
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = String(text);
    return e;
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseYmd(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function rint(a, b) { return Math.floor(rnd(a, b + 1)); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function toast(msg, kind) {
    var root = document.getElementById('toast-root');
    if (!root) return;
    var t = el('div', 'toast' + (kind ? ' ' + kind : ''), msg);
    root.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 3500);
  }

  // ---------- 데이터 ----------
  async function loadAll(from) {
    if (typeof DB.listInspectionsFull === 'function') return await DB.listInspectionsFull(from ? { from: from } : {});
    var list = await DB.listInspections({});
    var out = [];
    for (var i = 0; i < list.length; i++) {
      if (from && String(list[i].inspected_on) < from) continue;
      try { var r = await DB.getInspection(list[i].id); if (r) out.push(r); } catch (e) { /* 건너뜀 */ }
    }
    return out;
  }
  function itemsOf(rec) { return (rec.results && Array.isArray(rec.results.items)) ? rec.results.items : []; }
  function defectsOf(rec) { return itemsOf(rec).filter(function (it) { return it.status === 'defect'; }); }
  function hasImmediate(rec) { return defectsOf(rec).some(function (it) { return it.urgency === 'immediate'; }); }

  function aggregate(recs, days) {
    var a = { n: recs.length, defects: 0, judged: 0, immediate: 0, trainsImm: {}, daily: {}, byVehicle: {}, bySection: {}, byUrg: { immediate: 0, today: 0, next: 0 }, repeat: {}, trains: {}, immList: [] };
    recs.forEach(function (r) {
      var d = String(r.inspected_on);
      var day = a.daily[d] || (a.daily[d] = { n: 0, def: 0 });
      day.n++;
      var veh = r.vehicle_type || '-';
      var tk = veh + '|' + (r.train_no || '-');
      var t = a.trains[tk] || (a.trains[tk] = { train: r.train_no || '-', vehicle: veh, last: null, lastRec: null, n: 0, def: 0 });
      t.n++;
      if (!t.last || d > t.last || (d === t.last && String(r.created_at) > String(t.lastRec.created_at))) { t.last = d; t.lastRec = r; }
      if (a.byVehicle[veh] == null) a.byVehicle[veh] = 0;
      itemsOf(r).forEach(function (it) {
        if (it.status === 'ok' || it.status === 'defect') a.judged++;
        if (it.status !== 'defect') return;
        a.defects++; day.def++; t.def++;
        a.byVehicle[veh]++;
        var sec = it.section || '기타';
        a.bySection[sec] = (a.bySection[sec] || 0) + 1;
        if (it.urgency && a.byUrg[it.urgency] != null) a.byUrg[it.urgency]++;
        var rk = (it.section || '') + '|' + (it.label || it.key);
        var rp = a.repeat[rk] || (a.repeat[rk] = { label: it.label || it.key, section: it.section || '', n: 0, last: '' });
        rp.n++; if (d > rp.last) rp.last = d;
        if (it.urgency === 'immediate') {
          a.immediate++; a.trainsImm[tk] = true;
          a.immList.push({ id: r.id, date: d, created: String(r.created_at || ''), vehicle: veh, train: r.train_no || '-', label: it.label || it.key, memo: it.memo || '' });
        }
      });
    });
    a.dayList = [];
    var keys = Object.keys(a.daily).sort();
    var start, end = new Date();
    end = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    if (days) start = addDays(end, -(days - 1));
    else if (keys.length) { start = parseYmd(keys[0]); var le = parseYmd(keys[keys.length - 1]); if (le > end) end = le; }
    if (start) for (var d0 = start, guard = 0; d0 <= end && guard < 800; d0 = addDays(d0, 1), guard++) {
      var k = ymd(d0), v = a.daily[k] || { n: 0, def: 0 };
      a.dayList.push({ date: k, n: v.n, def: v.def });
    }
    a.repeatList = Object.keys(a.repeat).map(function (k2) { return a.repeat[k2]; })
      .sort(function (x, y) { return y.n - x.n || (y.last > x.last ? 1 : -1); }).slice(0, 10);
    a.trainList = Object.keys(a.trains).map(function (k2) { return a.trains[k2]; })
      .sort(function (x, y) { return y.def - x.def || (y.last > x.last ? 1 : -1); });
    a.immList.sort(function (x, y) { return y.date > x.date ? 1 : y.date < x.date ? -1 : (y.created > x.created ? 1 : -1); });
    a.immList = a.immList.slice(0, 10);
    a.sectionList = Object.keys(a.bySection).map(function (k2) { return [k2, a.bySection[k2]]; }).sort(function (x, y) { return y[1] - x[1]; });
    return a;
  }

  // ---------- 모달 ----------
  function closeModal() { if (S.modal && S.modal.parentNode) S.modal.parentNode.removeChild(S.modal); S.modal = null; }
  function confirmModal(title, body, okLabel, danger) {
    return new Promise(function (resolve) {
      closeModal();
      var ov = el('div', 'modal-overlay');
      var m = el('div', 'modal');
      m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
      m.appendChild(el('h2', null, title));
      m.appendChild(el('div', 'modal-body', body));
      var acts = el('div', 'modal-actions');
      var no = el('button', 'btn', '취소'); no.type = 'button';
      var ok = el('button', 'btn ' + (danger ? 'danger' : 'primary'), okLabel); ok.type = 'button';
      function done(v) { document.removeEventListener('keydown', onKey); closeModal(); resolve(v); }
      function onKey(e) { if (e.key === 'Escape') done(false); }
      no.addEventListener('click', function () { done(false); });
      ok.addEventListener('click', function () { done(true); });
      ov.addEventListener('click', function (e) { if (e.target === ov) done(false); });
      document.addEventListener('keydown', onKey);
      acts.appendChild(no); acts.appendChild(ok);
      m.appendChild(acts); ov.appendChild(m);
      document.body.appendChild(ov);
      S.modal = ov;
      ok.focus();
    });
  }

  // ---------- 예시 이력 생성 ----------
  var HEAVY = { brake_lining_visual: 9, m_brake_lining: 9, door_indicator: 8, pantograph_visual: 6, m_pantograph: 8, brake_air_leak: 3, door_operate: 2 };
  var TRAINS = { 'KTX-산천': ['(예시) 산천 03편성', '(예시) 산천 05편성', '(예시) 산천 08편성', '(예시) 산천 12편성', '(예시) 산천 15편성'],
    'KTX-청룡': ['(예시) 청룡 01편성', '(예시) 청룡 03편성', '(예시) 청룡 06편성', '(예시) 청룡 09편성'],
    'SRT': ['(예시) SRT 04편성', '(예시) SRT 07편성', '(예시) SRT 11편성', '(예시) SRT 13편성', '(예시) SRT 16편성'] };
  var MEMOS = ['이상 징후 확인, 재점검 필요 (예시)', '육안 점검 중 이상 발견 (예시)', '기준 미달로 확인됨 (예시)', '작동 불량, 정비 의뢰 (예시)', '마모 진행, 경과 관찰 (예시)', '체결 상태 불량 확인 (예시)'];

  function judgeMeasure(it, v) { return !((it.min != null && v < it.min) || (it.max != null && v > it.max)); }
  function measureValue(it, bad) {
    var dec = (it.step && it.step < 1) ? 1 : 0;
    var span = (it.max != null && it.min != null) ? (it.max - it.min) : (it.min != null ? it.min * 0.12 : it.max * 0.12);
    for (var i = 0; i < 20; i++) {
      var v;
      if (!bad) {
        if (it.min != null && it.max != null) v = it.min + span * rnd(0.2, 0.8);
        else if (it.min != null) v = it.min + span * rnd(0.15, 0.9);
        else v = it.max - span * rnd(0.15, 0.9);
      } else {
        if (it.min != null && (it.max == null || Math.random() < 0.6)) v = it.min - span * rnd(0.05, 0.25);
        else v = it.max + span * rnd(0.05, 0.25);
      }
      v = Number(v.toFixed(dec));
      if (judgeMeasure(it, v) === !bad) return v;
    }
    return bad ? (it.min != null ? it.min - 1 : it.max + 1) : (it.min != null ? it.min + 1 : it.max - 1);
  }
  function critText(it) {
    if (it.min != null && it.max != null) return it.min.toFixed(1) + ' ~ ' + it.max.toFixed(1);
    if (it.min != null) return (it.min % 1 ? it.min.toFixed(1) : String(it.min)) + ' 이상';
    return it.max + ' 이하';
  }
  function itemList(veh, type) {
    var out = [];
    window.ITEMS.sections.forEach(function (sec) {
      sec.items.forEach(function (it) {
        if (it.types.indexOf(type) < 0) return;
        if (it.vehicles && it.vehicles.indexOf(veh) < 0) return;
        out.push({ sec: sec.name, it: it });
      });
    });
    return out;
  }
  function makeRecord(idx, user) {
    var vehicles = window.ITEMS.vehicles;
    var veh = vehicles[idx % vehicles.length];
    var type = Math.random() < 0.7 ? '일상점검' : '월상점검';
    var list = itemList(veh, type);
    // 불량 개수 0~4, 항목은 가중치 추첨
    var r = Math.random(), nDef = r < 0.2 ? 0 : r < 0.5 ? 1 : r < 0.75 ? 2 : r < 0.92 ? 3 : 4;
    var pool = list.map(function (x, i) { return { i: i, w: HEAVY[x.it.key] || 1 }; });
    var bad = {};
    for (var k = 0; k < nDef && pool.length; k++) {
      var tot = pool.reduce(function (s, p) { return s + p.w; }, 0), t = Math.random() * tot, c = 0, j = 0;
      for (; j < pool.length; j++) { c += pool[j].w; if (t <= c) break; }
      if (j >= pool.length) j = pool.length - 1;
      bad[pool[j].i] = true; pool.splice(j, 1);
    }
    var items = list.map(function (x, i) {
      var it = x.it, isBad = !!bad[i];
      var o = { key: it.key, section: x.sec, label: it.label, kind: it.kind, status: 'ok', value: null, unit: null, criteria: null, memo: '', urgency: null, ai: null, photo: null };
      if (it.kind === 'measure') {
        o.value = measureValue(it, isBad); o.unit = it.unit; o.criteria = critText(it);
        o.status = judgeMeasure(it, o.value) ? 'ok' : 'defect';
      } else {
        o.status = isBad ? 'defect' : (Math.random() < 0.02 ? 'na' : 'ok');
      }
      if (o.status === 'defect') {
        var u = Math.random(); o.urgency = u < 0.15 ? 'immediate' : u < 0.6 ? 'today' : 'next';
        o.memo = it.label + ' ' + pick(MEMOS);
      }
      return o;
    });
    var def = items.filter(function (o) { return o.status === 'defect'; });
    var done = items.filter(function (o) { return o.status != null; }).length;
    var urg = def.filter(function (o) { return o.urgency === 'immediate'; }).length;
    var date = ymd(addDays(new Date(), -rint(0, 59)));
    return {
      id: DB.newId(), user_id: user.id, inspector_name: user.name,
      inspected_on: date, vehicle_type: veh, train_no: pick(TRAINS[veh] || ['(예시) 01편성']),
      inspection_type: type,
      results: { schema: 1, itemsVersion: window.ITEMS.version, demo: true, items: items,
        summary: { total: items.length, done: done, defect: def.length, urgent: urg, unchecked: items.length - done } },
      defect_count: def.length, urgent_count: urg, ai_report: null,
      created_at: date + 'T09:00:00.000Z'
    };
  }

  async function genDemo() {
    var ok = await confirmModal('예시 이력 생성', '최근 60일에 걸친 예시 점검 기록 40건을 만듭니다.\n기록에는 "(예시)"가 표시되며, 나중에 "예시 이력 삭제"로 지울 수 있습니다.', '생성', false);
    if (!ok || S.busy) return;
    var tk = S.token, total = 40, done = 0;
    setBusy(true);
    try {
      for (var i = 0; i < total; i++) {
        if (tk !== S.token) return;
        await DB.saveInspection(makeRecord(i, S.ctx.user));
        done++;
        setStatus('예시 이력 생성 중 ' + done + '/' + total);
      }
      toast('예시 이력 ' + done + '건을 만들었습니다.');
    } catch (e) {
      toast('예시 이력 생성 실패 (' + done + '건 저장): ' + (e && e.message ? e.message : e), 'error');
    }
    if (tk !== S.token) return;
    setBusy(false); setStatus('');
    await draw();
  }

  async function delDemo() {
    var ok = await confirmModal('예시 이력 삭제', '내가 만든 예시 기록(예시 표시가 있는 기록)만 삭제합니다.\n삭제한 기록은 되돌릴 수 없습니다.', '삭제', true);
    if (!ok || S.busy) return;
    var tk = S.token, n = 0;
    setBusy(true);
    try {
      var all = await loadAll();
      var mine = all.filter(function (r) { return r.results && r.results.demo === true && r.user_id === S.ctx.user.id; });
      for (var i = 0; i < mine.length; i++) {
        if (tk !== S.token) return;
        setStatus('예시 이력 삭제 중 ' + (i + 1) + '/' + mine.length);
        await DB.deleteInspection(mine[i].id); n++;
      }
      toast(n ? '예시 이력 ' + n + '건을 삭제했습니다.' : '삭제할 예시 기록이 없습니다.');
    } catch (e) {
      toast('예시 이력 삭제 실패 (' + n + '건 삭제): ' + (e && e.message ? e.message : e), 'error');
    }
    if (tk !== S.token) return;
    setBusy(false); setStatus('');
    await draw();
  }

  function setBusy(b) { S.busy = b; S.btns.forEach(function (x) { x.disabled = b; }); }
  function setStatus(t) { if (S.status) S.status.textContent = t; }

  // ---------- 화면 ----------
  function killCharts() { S.charts.forEach(function (c) { try { c.destroy(); } catch (e) { /* 무시 */ } }); S.charts = []; }

  function field(label, sel) { var f = el('label', 'field'); f.appendChild(el('span', null, label)); f.appendChild(sel); return f; }
  function select(opts, val, onChange) {
    var s = el('select');
    opts.forEach(function (o) { var op = el('option', null, o[1]); op.value = o[0]; if (String(o[0]) === String(val)) op.selected = true; s.appendChild(op); });
    s.addEventListener('change', function () { onChange(s.value); });
    return s;
  }

  function build() {
    S.root.textContent = '';
    var page = el('div', 'page adm');
    page.appendChild(el('h1', 'page-title', '정비 현황'));
    var bar = el('div', 'adm-bar');
    var fs = el('div', 'adm-filters');
    var pf = el('div', 'field'); pf.appendChild(el('span', null, '기간'));
    var segs = el('div', 'adm-seg'); segs.setAttribute('role', 'group'); segs.setAttribute('aria-label', '기간');
    var segBtns = [];
    [[7, '7일'], [30, '30일'], [90, '90일'], [0, '전체']].forEach(function (o) {
      var b = el('button', 'adm-seg-btn', o[1]); b.type = 'button';
      b.setAttribute('aria-pressed', S.filters.days === o[0] ? 'true' : 'false');
      b.addEventListener('click', function () {
        if (S.filters.days === o[0]) return;
        S.filters.days = o[0];
        segBtns.forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        draw();
      });
      segBtns.push(b); segs.appendChild(b);
    });
    pf.appendChild(segs); fs.appendChild(pf);
    var vopts = [['', '전체']].concat(window.ITEMS.vehicles.map(function (v) { return [v, v]; }));
    fs.appendChild(field('차종', select(vopts, S.filters.vehicle, function (v) { S.filters.vehicle = v; draw(); })));
    bar.appendChild(fs);
    var acts = el('div', 'adm-acts');
    var g = el('button', 'btn sm', '예시 이력 생성'); g.type = 'button'; g.addEventListener('click', genDemo);
    var d = el('button', 'btn sm danger', '예시 이력 삭제'); d.type = 'button'; d.addEventListener('click', delDemo);
    acts.appendChild(g); acts.appendChild(d);
    S.btns = [g, d];
    bar.appendChild(acts);
    page.appendChild(bar);
    S.status = el('p', 'adm-status muted');
    S.status.setAttribute('aria-live', 'polite');
    page.appendChild(S.status);
    S.body = el('div', 'adm-body');
    page.appendChild(S.body);
    S.root.appendChild(page);
    setBusy(S.busy);
  }

  function panel(title, wide, sub) {
    var p = el('section', 'adm-panel' + (wide ? ' wide' : ''));
    var h = el('div', 'adm-ph');
    h.appendChild(el('h2', null, title));
    if (sub) h.appendChild(el('span', 'adm-sub', sub));
    p.appendChild(h);
    return p;
  }
  function tableWrap(headers, rows, opt) {
    opt = opt || {};
    var wrap = el('div', 'adm-scroll');
    var t = el('table', 'grid adm-tbl');
    if (opt.widths) {
      var cg = el('colgroup');
      opt.widths.forEach(function (w) { var c = el('col'); if (w) c.style.width = w; cg.appendChild(c); });
      t.appendChild(cg);
    }
    var thead = el('thead'), tr = el('tr');
    headers.forEach(function (h) { var th = el('th', null, h); th.title = h; tr.appendChild(th); });
    thead.appendChild(tr); t.appendChild(thead);
    var tb = el('tbody');
    rows.forEach(function (row) {
      var r = el('tr');
      row.cells.forEach(function (c, i) {
        var td = el('td', c && c.cls ? c.cls : (opt.num && opt.num.indexOf(i) >= 0 ? 'num' : ''));
        if (c && c.node) td.appendChild(c.node); else { var tx = c && c.t != null ? c.t : (c == null ? '' : c); td.textContent = tx; if (tx !== '') td.title = String(tx); }
        r.appendChild(td);
      });
      if (row.onClick) {
        r.className = 'adm-click'; r.tabIndex = 0; r.setAttribute('role', 'link');
        r.addEventListener('click', row.onClick);
        r.addEventListener('keydown', function (e) { if (e.key === 'Enter') row.onClick(); });
      }
      tb.appendChild(r);
    });
    t.appendChild(tb); wrap.appendChild(t);
    return wrap;
  }
  function chartBox(title, id, labels, series, makeCfg, fallbackHeaders, fallbackRows, sub) {
    var p = panel(title, false, sub);
    if (window.Chart) {
      var box = el('div', 'adm-chart');
      var cv = el('canvas'); cv.id = id; cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', title);
      box.appendChild(cv); p.appendChild(box);
      p._init = function () {
        try {
          Chart.defaults.font.family = 'Pretendard, system-ui, "Malgun Gothic", sans-serif';
          Chart.defaults.font.size = 11; Chart.defaults.color = COLOR.next;
          S.charts.push(new Chart(cv.getContext('2d'), makeCfg()));
        } catch (e) {
          box.remove(); p.appendChild(tableWrap(fallbackHeaders, fallbackRows, { num: [1, 2] }));
        }
      };
    } else {
      p.appendChild(tableWrap(fallbackHeaders, fallbackRows, { num: [1, 2] }));
    }
    return p;
  }
  function baseOpts(extra) {
    var o = { animation: false, responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: true } },
      elements: { bar: { borderRadius: 0 } },
      scales: { x: { grid: { color: COLOR.grid }, ticks: { precision: 0, font: { size: 11 }, color: COLOR.next } }, y: { grid: { color: COLOR.grid }, beginAtZero: true, ticks: { precision: 0, font: { size: 11 }, color: COLOR.next } } } };
    if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
    return o;
  }


  // ---------- 지표 카드 ----------
  var SVGNS = 'http://www.w3.org/2000/svg';
  function sparkline(vals, color) {
    var svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('class', 'adm-spark'); svg.setAttribute('viewBox', '0 0 100 22');
    svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('aria-hidden', 'true');
    var max = Math.max.apply(null, vals), min = Math.min.apply(null, vals), rng = max - min;
    var pts = vals.map(function (v, i) {
      var x = vals.length > 1 ? i * 100 / (vals.length - 1) : 50;
      var y = rng ? 20 - (v - min) / rng * 18 : 11;
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
    var pl = document.createElementNS(SVGNS, 'polyline');
    pl.setAttribute('points', pts); pl.setAttribute('fill', 'none'); pl.setAttribute('stroke', color);
    pl.setAttribute('stroke-width', '1.5'); pl.setAttribute('vector-effect', 'non-scaling-stroke');
    pl.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(pl);
    return svg;
  }
  // 기간을 K구간으로 나눈 지표별 값
  function bucketize(recs, days) {
    var today = new Date(); today = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    var start, total;
    if (days) { start = addDays(today, -(days - 1)); total = days; }
    else {
      var min = null;
      recs.forEach(function (r) { var d = String(r.inspected_on); if (min === null || d < min) min = d; });
      start = min ? parseYmd(min) : today;
      total = Math.max(1, Math.round((today - start) / 86400000) + 1);
    }
    var K = days === 7 ? 7 : Math.min(10, Math.max(7, total));
    var bs = [];
    for (var i = 0; i < K; i++) bs.push({ n: 0, def: 0, judged: 0, imm: 0, tr: {} });
    recs.forEach(function (r) {
      var off = Math.round((parseYmd(r.inspected_on) - start) / 86400000);
      if (off < 0 || off >= total) return;
      var b = bs[Math.min(K - 1, Math.floor(off * K / total))];
      b.n++;
      itemsOf(r).forEach(function (it) {
        if (it.status === 'ok' || it.status === 'defect') b.judged++;
        if (it.status === 'defect') { b.def++; if (it.urgency === 'immediate') { b.imm++; b.tr[(r.vehicle_type || '-') + '|' + (r.train_no || '-')] = true; } }
      });
    });
    return bs;
  }
  function buildTiles(a, prev, info) {
    var days = info.days, bs = bucketize(info.recs, days);
    var nTr = Object.keys(a.trainsImm).length;
    var rateV = a.judged ? a.defects / a.judged * 100 : 0;
    var pRate = prev && prev.judged ? prev.defects / prev.judged * 100 : 0;
    var defs = [
      { k: '점검 수', v: a.n + '건', cur: a.n, pre: prev && prev.n, unit: '건', dir: 'neutral', ser: bs.map(function (b) { return b.n; }) },
      { k: '불량 건수', v: a.defects + '건', cur: a.defects, pre: prev && prev.defects, unit: '건', ser: bs.map(function (b) { return b.def; }) },
      { k: '불량률', v: rateV.toFixed(1) + '%', cur: rateV, pre: pRate, unit: '%p', dec: 1, ser: bs.map(function (b) { return b.judged ? b.def / b.judged * 100 : 0; }) },
      { k: '즉시조치 건수', v: a.immediate + '건', cur: a.immediate, pre: prev && prev.immediate, unit: '건', imm: true, ser: bs.map(function (b) { return b.imm; }) },
      { k: '즉시조치 편성 수', v: nTr + '편성', cur: nTr, pre: prev && Object.keys(prev.trainsImm).length, unit: '편성', imm: true, ser: bs.map(function (b) { return Object.keys(b.tr).length; }) }
    ];
    var tiles = el('div', 'adm-tiles');
    defs.forEach(function (t) {
      var c = el('div', 'adm-tile' + (t.imm ? ' imm' : ''));
      c.appendChild(el('div', 'adm-tile-k', t.k));
      c.appendChild(el('div', 'adm-tile-v', t.v));
      var d = el('div', 'adm-delta');
      if (!days) { d.textContent = '전체 기간'; d.className += ' flat'; }
      else {
        var diff = t.cur - t.pre, dec = t.dec || 0;
        var num = Math.abs(diff).toFixed(dec);
        if (Number(num) === 0) { d.textContent = '직전 ' + days + '일 대비 변동 없음'; d.className += ' flat'; }
        else {
          var up = diff > 0;
          d.className += t.dir === 'neutral' ? ' flat' : (up ? ' up' : ' down');
          d.textContent = '직전 ' + days + '일 대비 ' + (up ? '▲' : '▼') + ' ' + num + t.unit;
        }
      }
      c.appendChild(d);
      c.appendChild(sparkline(t.ser, t.imm ? COLOR.imm : COLOR.blue));
      tiles.appendChild(c);
    });
    return tiles;
  }

  function renderBody(a, prev, info) {
    S.body.textContent = '';
    if (!a.n) {
      S.body.appendChild(el('div', 'empty', "기록이 없습니다. '예시 이력 생성'으로 시연 데이터를 만들 수 있습니다."));
      return;
    }
    S.body.appendChild(buildTiles(a, prev, info));

    var grid = el('div', 'adm-grid');
    S.body.appendChild(grid);
    var panels = [];

    // 1 일자별 추이
    var dl = a.dayList;
    panels.push(chartBox('일자별 점검 수 · 불량 건수', 'adm-c-daily', dl, null, function () {
      var o = baseOpts({ plugins: { legend: { display: true, position: 'top', align: 'start', labels: { boxWidth: 10, boxHeight: 10, font: { size: 11 }, color: COLOR.next } } } });
      o.scales.x.ticks = { maxTicksLimit: 8, autoSkip: true, maxRotation: 0, font: { size: 11 }, color: COLOR.next };
      return { type: 'bar', data: { labels: dl.map(function (x) { return x.date.slice(5); }), datasets: [
        { type: 'bar', label: '점검 수', data: dl.map(function (x) { return x.n; }), backgroundColor: COLOR.blueLight, borderWidth: 0, maxBarThickness: 28, order: 2 },
        { type: 'line', label: '불량 건수', data: dl.map(function (x) { return x.def; }), borderColor: COLOR.blue, backgroundColor: COLOR.blue, borderWidth: 2, pointRadius: 2, tension: 0, order: 1 }] }, options: o };
    }, ['일자', '점검 수', '불량 건수'], dl.filter(function (x) { return x.n || x.def; }).map(function (x) { return { cells: [x.date, x.n, x.def] }; }), '막대 점검 수 · 선 불량 건수'));

    // 2 차종별
    var vk = window.ITEMS.vehicles;
    panels.push(chartBox('차종별 불량 건수', 'adm-c-veh', vk, null, function () {
      return { type: 'bar', data: { labels: vk, datasets: [{ data: vk.map(function (v) { return a.byVehicle[v] || 0; }), backgroundColor: COLOR.blue, borderWidth: 0, maxBarThickness: 28 }] }, options: baseOpts() };
    }, ['차종', '불량 건수'], vk.map(function (v) { return { cells: [v, a.byVehicle[v] || 0] }; })));

    // 3 분야별
    var sl = a.sectionList;
    var sp = chartBox('분야별 불량 건수', 'adm-c-sec', sl, null, function () {
      var o = baseOpts({ indexAxis: 'y' });
      o.scales = { x: { grid: { color: COLOR.grid }, beginAtZero: true, ticks: { precision: 0, font: { size: 11 }, color: COLOR.next } }, y: { grid: { display: false }, ticks: { font: { size: 11 }, color: COLOR.next } } };
      return { type: 'bar', data: { labels: sl.map(function (x) { return x[0]; }), datasets: [{ data: sl.map(function (x) { return x[1]; }), backgroundColor: COLOR.blue, borderWidth: 0, maxBarThickness: 22 }] }, options: o };
    }, ['분야', '불량 건수'], sl.map(function (x) { return { cells: [x[0], x[1]] }; }));
    if (sl.length > 6) { var cb = sp.querySelector('.adm-chart'); if (cb) cb.style.height = Math.min(360, 40 + sl.length * 28) + 'px'; }
    panels.push(sp);

    // 4 긴급도
    var uk = ['immediate', 'today', 'next'], uc = [COLOR.imm, COLOR.today, COLOR.next];
    panels.push(chartBox('긴급도 분포 (불량 항목)', 'adm-c-urg', uk, null, function () {
      var o = baseOpts({ indexAxis: 'y', plugins: { legend: { display: true, position: 'top', align: 'start', labels: { boxWidth: 10, boxHeight: 10, font: { size: 11 }, color: COLOR.next } } } });
      o.scales = { x: { stacked: true, grid: { color: COLOR.grid }, beginAtZero: true, ticks: { precision: 0, font: { size: 11 }, color: COLOR.next } }, y: { stacked: true, grid: { display: false }, ticks: { font: { size: 11 }, color: COLOR.next } } };
      return { type: 'bar', data: { labels: ['불량 항목'], datasets: uk.map(function (k, i) { return { label: URG_LABEL[k], data: [a.byUrg[k]], backgroundColor: uc[i], borderWidth: 0, maxBarThickness: 28 }; }) }, options: o };
    }, ['긴급도', '건수'], uk.map(function (k) { return { cells: [URG_LABEL[k], a.byUrg[k]] }; })));

    // 5 반복 불량
    var rp = panel('반복 불량 상위 10', false, '횟수 기준');
    var maxN = a.repeatList.length ? a.repeatList[0].n : 1;
    if (!a.repeatList.length) rp.appendChild(el('p', 'muted adm-none', '불량 기록이 없습니다.'));
    else {
      var rl = el('ol', 'adm-rank');
      a.repeatList.forEach(function (x) {
        var li = el('li', 'adm-rank-row');
        var nm = el('div', 'adm-rank-name');
        var t1 = el('div', 'adm-rank-label', x.label); t1.title = x.label;
        var t2 = el('div', 'adm-rank-sub', (x.section || '-') + ' · 최근 ' + x.last);
        nm.appendChild(t1); nm.appendChild(t2);
        var bar = el('div', 'adm-bar-track'); var f = el('div', 'adm-bar-fill'); f.style.width = Math.max(3, Math.round(x.n / maxN * 100)) + '%'; bar.appendChild(f);
        li.appendChild(nm); li.appendChild(bar); li.appendChild(el('div', 'adm-rank-n', x.n + '회'));
        rl.appendChild(li);
      });
      rp.appendChild(rl);
    }
    panels.push(rp);

    // 6 최근 즉시조치
    var ip = panel('최근 즉시조치 목록', true, '최대 10건 · 행을 누르면 상세');
    if (!a.immList.length) ip.appendChild(el('p', 'muted adm-none', '즉시조치 기록이 없습니다.'));
    else ip.appendChild(tableWrap(['일자', '차종', '편성', '항목', '메모'], a.immList.map(function (x) {
      return { cells: [x.date, x.vehicle, x.train, x.label, x.memo], onClick: function () { if (S.ctx && S.ctx.openDetail) S.ctx.openDetail(x.id); } };
    }), { widths: ['88px', '14%', '20%', '24%', ''] }));
    panels.push(ip);

    // 7 편성별
    var tp = panel('편성별 현황', true, '불량 많은 순');
    tp.appendChild(tableWrap(['편성번호', '차종', '최근 점검일', '점검 수', '누적 불량', '최근 즉시조치'], a.trainList.map(function (x) {
      var imm = hasImmediate(x.lastRec);
      return { cells: [x.train, x.vehicle, x.last, { t: x.n, cls: 'num' }, { t: x.def, cls: 'num' }, imm ? { t: '있음', cls: 'c-bad adm-strong' } : '없음'] };
    }), { widths: ['24%', '16%', '88px', '12%', '12%', ''] }));
    panels.push(tp);

    panels.forEach(function (p) { grid.appendChild(p); });
    panels.forEach(function (p) { if (p._init) p._init(); });
  }

  async function draw() {
    var tk = ++S.token;
    if (!S.body) return;
    S.body.textContent = '';
    S.body.appendChild(el('div', 'empty', '불러오는 중...'));
    killCharts();
    var recs;
    try {
      var from = S.filters.days ? ymd(addDays(new Date(), -(2 * S.filters.days - 1))) : undefined;
      recs = await loadAll(from);
    } catch (e) {
      if (tk !== S.token) return;
      S.body.textContent = '';
      S.body.appendChild(el('div', 'empty', '이력을 불러오지 못했습니다: ' + (e && e.message ? e.message : e)));
      return;
    }
    if (tk !== S.token) return;
    if (S.filters.vehicle) recs = recs.filter(function (r) { return r.vehicle_type === S.filters.vehicle; });
    var cur = recs, prev = null;
    if (S.filters.days) {
      var cf = ymd(addDays(new Date(), -(S.filters.days - 1)));
      cur = recs.filter(function (r) { return String(r.inspected_on) >= cf; });
      prev = recs.filter(function (r) { return String(r.inspected_on) < cf; });
    }
    renderBody(aggregate(cur, S.filters.days), prev ? aggregate(prev, 0) : null, { days: S.filters.days, recs: cur });
  }

  window.Admin = {
    render: async function (rootEl, ctx) {
      S.root = rootEl; S.ctx = ctx || {};
      S.busy = false;
      build();
      await draw();
    },
    destroy: function () {
      S.token++;
      killCharts(); closeModal();
      if (S.root) S.root.textContent = '';
      S.root = null; S.body = null; S.status = null; S.btns = []; S.busy = false;
    }
  };
})();
