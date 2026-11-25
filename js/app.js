/* 화면 흐름, 체크리스트, 결과물, 이력. 저장은 DB.*, AI는 AI.*만 호출한다. */
(function () {
  'use strict';
  const IT = window.ITEMS;

  // ---------- 유틸 ----------
  const $ = (s, r) => (r || document).querySelector(s);
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k === 'dataset') Object.assign(e.dataset, v);
        else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
        else e.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const c of kids.flat()) {
      if (c == null || c === false) continue;
      e.append(c.nodeType ? c : String(c));
    }
    return e;
  }
  const p2 = (n) => String(n).padStart(2, '0');
  function todayStr() { const d = new Date(); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function toast(msg, kind) {
    const t = h('div', { class: 'toast ' + (kind || ''), text: msg });
    $('#toast-root').append(t);
    setTimeout(() => t.remove(), 4000);
  }
  function openModal(opt) {
    return new Promise((resolve) => {
      const prev = document.activeElement;
      let ov;
      const close = (v) => {
        ov.remove();
        document.removeEventListener('keydown', onKey);
        if (prev && prev.focus) prev.focus();
        resolve(v);
      };
      const onKey = (e) => { if (e.key === 'Escape') close(null); };
      const btns = opt.actions.map((a) => h('button', { type: 'button', class: 'btn ' + (a.kind || ''), onclick: () => close(a.value), text: a.label }));
      ov = h('div', { class: 'modal-overlay' },
        h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': opt.title },
          h('h2', { text: opt.title }),
          h('div', { class: 'modal-body' }, opt.body),
          h('div', { class: 'modal-actions' }, btns)));
      $('#modal-root').append(ov);
      document.addEventListener('keydown', onKey);
      btns[opt.focusFirst ? 0 : btns.length - 1].focus();
    });
  }
  const confirmModal = (title, msg, ok, danger) => openModal({
    title, body: msg, focusFirst: !!danger,
    actions: [{ label: '취소', value: false }, { label: ok || '확인', value: true, kind: danger ? 'danger' : 'primary' }]
  }).then((v) => v === true);

  const urgLabel = (k) => { const u = IT.urgency.find((x) => x.key === k); return u ? u.label : ''; };
  const urgRank = (k) => { const u = IT.urgency.find((x) => x.key === k); return u ? u.rank : 9; };
  const stLabel = (s) => ({ ok: '양호', defect: '불량', na: '해당없음' }[s] || '미체크');
  const decimals = (it) => { const s = String(it.step || 1); const i = s.indexOf('.'); return i < 0 ? 0 : s.length - i - 1; };
  const fmtNum = (n, it) => Number(n).toFixed(decimals(it));
  function criteriaText(it) {
    if (it.min != null && it.max != null) return fmtNum(it.min, it) + ' ~ ' + fmtNum(it.max, it);
    if (it.min != null) return fmtNum(it.min, it) + ' 이상';
    if (it.max != null) return fmtNum(it.max, it) + ' 이하';
    return '';
  }
  function judge(it, v) {
    if (v === '' || v == null || isNaN(v)) return null;
    if (it.min != null && v < it.min) return 'defect';
    if (it.max != null && v > it.max) return 'defect';
    return 'ok';
  }
  const gemText = (g) => g && g.verdict ? g.verdict + ' ' + Math.round((g.confidence || 0) * 100) + '%' : '';
  const aiText = (a) => {
    if (!a) return '';
    const p = [];
    if (a.top) p.push((a.gemini ? 'TM ' : '') + a.top + ' ' + Math.round(a.prob * 100) + '%');
    if (a.gemini && a.gemini.verdict) p.push('Gemini ' + gemText(a.gemini));
    return p.join(' / ');
  };
  const geminiOn = () => typeof AI !== 'undefined' && typeof AI.vision === 'function' && typeof AI.serverAvailable === 'function' && AI.serverAvailable() && typeof DB !== 'undefined' && DB.mode === 'supabase';

  // ---------- 상태 ----------
  const S = {
    user: null,
    info: { date: todayStr(), trainNo: '', vehicle: IT.vehicles[0], type: IT.types[0] },
    data: {},     // key -> { status, value, memo, urgency, ai, photo, panel }
    aiOn: false,
    view: '',
    last: null,   // 완료 결과
    busy: false
  };
  const getD = (key) => S.data[key] || (S.data[key] = { status: null, value: '', memo: '', urgency: 'today', ai: null, photo: null, panel: false });

  function visibleSections() {
    return IT.sections.map((sec) => ({
      id: sec.id, name: sec.name,
      items: sec.items.filter((i) => i.types.includes(S.info.type) && (!i.vehicles || i.vehicles.includes(S.info.vehicle)))
    })).filter((s) => s.items.length);
  }
  const visibleItems = () => visibleSections().flatMap((s) => s.items.map((i) => Object.assign({ sectionName: s.name }, i)));
  function hasInput() {
    return Object.values(S.data).some((d) => d.status || d.value !== '' || d.memo || d.photo);
  }
  function stats() {
    let total = 0, done = 0, defect = 0, urgent = 0, ok = 0, na = 0;
    visibleItems().forEach((it) => {
      const d = S.data[it.key]; total++;
      if (d && d.status) {
        done++;
        if (d.status === 'ok') ok++;
        else if (d.status === 'na') na++;
        else if (d.status === 'defect') { defect++; if (d.urgency === 'immediate') urgent++; }
      }
    });
    return { total, done, defect, urgent, ok, na, unchecked: total - done };
  }

  // ---------- 임시 저장 ----------
  let draftTimer;
  function scheduleDraft() { clearTimeout(draftTimer); draftTimer = setTimeout(saveDraftNow, 400); }
  function saveDraftNow() {
    try {
      const items = {};
      for (const k in S.data) {
        const d = S.data[k];
        if (d.status || d.value !== '' || d.memo) items[k] = { status: d.status, value: d.value, memo: d.memo, urgency: d.urgency, ai: d.ai };
      }
      Promise.resolve(DB.saveDraft({ info: S.info, items })).then(() => {
        const el = $('#save-state'); if (el) { const n = new Date(); el.textContent = '임시저장됨 ' + p2(n.getHours()) + ':' + p2(n.getMinutes()); }
      }).catch(() => {});
    } catch (e) { /* 무시 */ }
  }
  async function restoreDraft() {
    try {
      const d = await DB.loadDraft();
      if (!d || !d.info) return;
      const i = d.info;
      if (IT.vehicles.includes(i.vehicle)) S.info.vehicle = i.vehicle;
      if (IT.types.includes(i.type)) S.info.type = i.type;
      if (i.date) S.info.date = i.date;
      S.info.trainNo = i.trainNo || '';
      S.data = {};
      for (const k in (d.items || {})) { Object.assign(getD(k), d.items[k]); }
    } catch (e) { /* 무시 */ }
  }

  // ---------- 체크리스트 렌더 ----------
  const rows = {};
  const secRefs = {};

  const isMobile = () => window.matchMedia('(max-width: 600px)').matches;
  let secObs = null;
  function setSecOpen(ref, open) {
    ref.el.classList.toggle('collapsed', !open);
    ref.toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  function renderChecklist() {
    const list = $('#checklist'); list.textContent = '';
    const nav = $('#section-nav'); nav.textContent = '';
    for (const k in rows) delete rows[k];
    for (const k in secRefs) delete secRefs[k];
    if (secObs) { secObs.disconnect(); secObs = null; }
    visibleSections().forEach((sec) => {
      const hasCheck = sec.items.some((i) => i.kind === 'check');
      const cnt = h('span', { class: 'sec-count' });
      const bad = h('span', { class: 'sec-bad' });
      const body = h('div', { class: 'sec-body' }, sec.items.map(buildRow));
      const head = h('div', { class: 'sec-head', role: 'button', tabindex: '0', 'aria-expanded': 'true' },
        h('h2', { text: sec.name }), bad, cnt,
        hasCheck ? h('button', { type: 'button', class: 'btn sm', onclick: (e) => { e.stopPropagation(); allOk(sec); }, text: '모두 양호' }) : null,
        h('span', { class: 'chev', 'aria-hidden': 'true' }));
      const el = h('section', { class: 'sec', id: 'sec-' + sec.id }, head, body);
      list.append(el);
      const navCnt = h('span', { class: 'cnt' });
      const navBad = h('span', { class: 'nbad' });
      const navBtn = h('button', { type: 'button', class: 'nav-btn',
        onclick: () => { if (isMobile()) setSecOpen(secRefs[sec.id], true); el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } },
        h('span', { class: 'nname', text: sec.name }), h('span', { class: 'nright' }, navBad, navCnt));
      nav.append(navBtn);
      const ref = { sec, el, cnt, bad, navCnt, navBad, navBtn, toggle: head };
      secRefs[sec.id] = ref;
      const toggle = () => { if (isMobile()) setSecOpen(ref, el.classList.contains('collapsed')); };
      head.addEventListener('click', toggle);
      head.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === head) { e.preventDefault(); toggle(); } });
    });
    visibleItems().forEach((it) => syncRow(it.key));
    updateProgress();
    // 모바일 아코디언: 미완료 분야 중 첫 번째만 펼침
    let first = true;
    for (const id in secRefs) {
      const ref = secRefs[id];
      const incomplete = ref.sec.items.some((it) => !(S.data[it.key] && S.data[it.key].status));
      setSecOpen(ref, incomplete && first);
      if (incomplete) first = false;
    }
    observeSections();
  }
  // 현재 보고 있는 분야 표시
  function observeSections() {
    const ids = Object.keys(secRefs);
    if (!ids.length) return;
    const setCur = (id) => ids.forEach((k) => secRefs[k].navBtn.classList.toggle('current', k === id));
    setCur(ids[0]);
    if (!('IntersectionObserver' in window)) return;
    const vis = new Set();
    secObs = new IntersectionObserver((ents) => {
      ents.forEach((en) => { const id = en.target.id.slice(4); if (en.isIntersecting) vis.add(id); else vis.delete(id); });
      const cur = ids.find((k) => vis.has(k));
      if (cur) setCur(cur);
    }, { rootMargin: '-110px 0px -55% 0px', threshold: 0 });
    ids.forEach((k) => secObs.observe(secRefs[k].el));
  }

  // TM 준비 후 사진 버튼만 표시 (전체 재렌더로 포커스가 풀리지 않게)
  function showPhotoBtns() {
    for (const k in rows) { const b = rows[k].photoBtn; if (b) b.style.display = ''; syncRow(k); }
  }
  function buildRow(it) {
    const d = getD(it.key);
    const r = { it };
    rows[it.key] = r;
    r.el = h('div', { class: 'item', dataset: { key: it.key } });
    let ctrl;
    if (it.kind === 'check') {
      r.btns = {};
      ctrl = h('div', { class: 'ctrl' },
        h('div', { class: 'seg-group', role: 'group', 'aria-label': it.label + ' 판정' },
          [['ok', '양호'], ['defect', '불량'], ['na', '해당없음']].map(([v, t]) => {
            const b = h('button', { type: 'button', class: 'seg seg-' + v, 'aria-pressed': 'false', onclick: () => onCheck(it.key, v), text: t });
            r.btns[v] = b; return b;
          })),
        (r.photoBtn = h('button', { type: 'button', class: 'btn sm photo-toggle', style: (S.aiOn || geminiOn()) ? null : 'display:none', onclick: () => { d.panel = !d.panel; syncRow(it.key); }, text: '사진' })));
    } else {
      r.input = h('input', {
        type: 'number', inputmode: 'decimal', step: it.step || 'any', class: 'num', placeholder: '입력',
        'aria-label': it.label + ' 측정값', oninput: (e) => onMeasure(it.key, e.target.value)
      });
      r.badge = h('span', { class: 'badge' });
      ctrl = h('div', { class: 'measure' }, r.input,
        h('span', { class: 'crit', text: it.unit + ' · 기준 ' + criteriaText(it) }), r.badge);
    }
    r.el.append(h('div', { class: 'item-head' }, h('div', { class: 'item-label' }, h('span', { class: 'item-name', text: it.label })), ctrl));

    // 상세(불량) 영역
    r.memo = h('textarea', { rows: '2', placeholder: '특이사항 메모', 'aria-label': it.label + ' 특이사항', oninput: (e) => { d.memo = e.target.value; scheduleDraft(); } });
    r.urg = {};
    const urgName = 'urg-' + it.key;
    const urgBtns = IT.urgency.map((u) => {
      const inp = h('input', { type: 'radio', name: urgName, value: u.key, 'aria-label': u.label, onchange: () => { d.urgency = u.key; syncRow(it.key); updateProgress(); scheduleDraft(); } });
      r.urg[u.key] = inp;
      return h('label', { class: 'chip urg-' + u.key }, inp, h('span', { text: u.label }));
    });
    r.defectOnly = h('div', { class: 'd-main' },
      h('div', { class: 'd-row' }, h('span', { class: 'lbl', text: '긴급도' }), h('div', { class: 'chip-group', role: 'radiogroup', 'aria-label': '긴급도' }, urgBtns)),
      h('div', { class: 'd-row' }, h('span', { class: 'lbl', text: '특이사항 메모' }), r.memo));
    r.preview = h('img', { class: 'photo-preview', alt: it.label + ' 첨부 사진' });
    r.rmPhoto = h('button', { type: 'button', class: 'btn sm', text: '사진 삭제', onclick: () => { d.photo = null; d.ai = null; d.reqId = (d.reqId || 0) + 1; d.aiBusy = false; d.gemBusy = false; d.gemErr = false; syncRow(it.key); scheduleDraft(); } });
    r.aiBox = h('div', { class: 'ai-box' });
    r.detail = h('div', { class: 'item-detail' },
      r.defectOnly,
      h('div', { class: 'd-side' },
        h('div', { class: 'photo-row' },
          r.preview,
          h('label', { class: 'btn sm file-btn' }, '사진 선택',
            h('input', { type: 'file', accept: 'image/*', capture: 'environment', 'aria-label': it.label + ' 사진 첨부', onchange: (e) => onPhoto(it.key, e.target) })),
          r.rmPhoto),
        r.aiBox));
    r.el.append(r.detail);
    return r.el;
  }

  function syncRow(key) {
    const r = rows[key]; if (!r) return;
    const d = getD(key), it = r.it, st = d.status;
    r.el.classList.toggle('is-defect', st === 'defect');
    r.el.classList.toggle('is-ok', st === 'ok');
    r.el.classList.toggle('is-na', st === 'na');
    if (it.kind === 'check') {
      for (const v in r.btns) r.btns[v].setAttribute('aria-pressed', st === v ? 'true' : 'false');
    } else {
      if (document.activeElement !== r.input) r.input.value = d.value === '' ? '' : String(d.value);
      r.badge.textContent = st === 'ok' ? '양호' : st === 'defect' ? '불량' : '';
      r.badge.className = 'badge ' + (st === 'ok' || st === 'defect' ? st : '');
    }
    const open = st === 'defect' || (it.kind === 'check' && d.panel);
    r.detail.hidden = !open;
    r.defectOnly.hidden = st !== 'defect';
    r.detail.classList.toggle('no-def', st !== 'defect');
    for (const u in r.urg) r.urg[u].checked = d.urgency === u;
    if (document.activeElement !== r.memo) r.memo.value = d.memo;
    if (d.photo) { r.preview.src = d.photo; r.preview.hidden = false; r.rmPhoto.hidden = false; }
    else { r.preview.removeAttribute('src'); r.preview.hidden = true; r.rmPhoto.hidden = true; }
    renderAiBox(r, d);
  }

  function renderAiBox(r, d) {
    const box = r.aiBox; box.textContent = '';
    if (!d.photo) { box.hidden = true; return; }
    const tmShown = S.aiOn && (d.aiBusy || (d.ai && d.ai.top));
    const gem = d.ai && d.ai.gemini;
    if (!tmShown && !d.gemBusy && !gem && !d.gemErr) { box.hidden = true; return; }
    box.hidden = false;
    if (S.aiOn && d.aiBusy) box.append(h('p', { class: 'ai-line', text: 'AI 판정 중...' }));
    else if (d.ai && d.ai.top) {
      box.append(h('p', { class: 'ai-line', text: 'AI 참고: ' + d.ai.top + ' ' + Math.round(d.ai.prob * 100) + '%' }));
      Object.keys(d.ai.probs || {}).forEach((name) => {
        const pct = Math.round(d.ai.probs[name] * 100);
        const fill = h('div', { class: 'ai-fill' }); fill.style.width = pct + '%';
        box.append(h('div', { class: 'ai-bar' }, h('span', { text: name }), h('div', { class: 'ai-track' }, fill), h('span', { text: pct + '%' })));
      });
    }
    if (d.gemBusy) box.append(h('p', { class: 'gem-line gem-wait', text: 'Gemini 분석 중…' }));
    else if (gem) {
      const cls = String(gem.verdict).includes('의심') ? 'gem-bad' : gem.verdict === '정상' ? 'gem-ok' : 'gem-na';
      box.append(h('p', { class: 'gem-line' }, h('span', { class: 'gem-v ' + cls, text: 'Gemini: ' + gemText(gem) }), h('span', { text: gem.reason ? ' · ' + gem.reason : '' })));
    } else if (d.gemErr) box.append(h('p', { class: 'gem-line gem-na gem-err', text: 'Gemini 판단을 받지 못했습니다' }));
    box.append(h('p', { class: 'ai-note', text: 'AI 판정은 참고용이며 최종 판정은 점검자가 합니다' }));
    const sus = (d.ai && d.ai.top && String(d.ai.top).includes('의심')) || (gem && String(gem.verdict).includes('의심'));
    if (sus && d.status !== 'defect') {
      box.append(h('button', { type: 'button', class: 'btn sm', text: '불량으로 표시', onclick: () => onCheck(r.it.key, 'defect') }));
    }
  }

  function onCheck(key, v) {
    const d = getD(key);
    d.status = d.status === v ? null : v;
    syncRow(key); updateProgress(); scheduleDraft();
  }
  function onMeasure(key, val) {
    const it = rows[key].it, d = getD(key);
    d.value = val === '' ? '' : Number(val);
    d.status = judge(it, d.value);
    syncRow(key); updateProgress(); scheduleDraft();
  }
  function allOk(sec) {
    let n = 0;
    sec.items.forEach((it) => {
      if (it.kind !== 'check') return;
      const d = getD(it.key);
      if (!d.status) { d.status = 'ok'; n++; syncRow(it.key); }
    });
    if (!n) toast('새로 양호 처리할 미체크 항목이 없습니다');
    updateProgress(); scheduleDraft();
  }

  // 불량 위치 도식 (Diagram 없으면 패널 숨김)
  function diagPanel(box, items, title, opts) {
    if (!box) return;
    if (!window.Diagram) { box.hidden = true; return; }
    box.hidden = false; box.textContent = '';
    const body = h('div');
    box.append(h('h2', { class: 'sub-title', text: title }), body);
    window.Diagram.render(body, items, opts || {});
  }
  function scrollToItem(key) {
    const r = rows[key];
    if (!r || !r.el) return;
    const sec = r.el.closest('.sec');
    if (sec && isMobile()) { const ref = Object.values(secRefs).find((x) => x.el === sec); if (ref) setSecOpen(ref, true); }
    r.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function updateCkDiagram() {
    const box = $('#ck-diagram');
    if (!box) return;
    if (!window.Diagram) { box.hidden = true; return; }
    const defs = visibleItems().filter((it) => { const d = S.data[it.key]; return d && d.status === 'defect'; })
      .map((it) => ({ key: it.key, section: it.sectionName, label: it.label, status: 'defect', urgency: S.data[it.key].urgency }));
    box.hidden = false;
    $('#ck-diagram > summary').textContent = '불량 위치 보기' + (defs.length ? ' (' + defs.length + '건)' : '');
    if (box.open) window.Diagram.render($('#ck-diagram-body'), defs, { onClick: scrollToItem });
  }
  function updateProgress() {
    updateCkDiagram();
    const s = stats();
    const pc = (n) => (s.total ? n / s.total * 100 : 0) + '%';
    $('#pg-ok').style.width = pc(s.ok); $('#pg-bad').style.width = pc(s.defect); $('#pg-na').style.width = pc(s.na);
    const pct = s.total ? Math.round(s.done / s.total * 100) : 0;
    $('#pg-track').setAttribute('aria-valuenow', String(pct));
    $('#pg-done').textContent = s.done; $('#pg-total').textContent = s.total;
    $('#pg-ok-n').textContent = s.ok; $('#pg-bad-n').textContent = s.defect; $('#pg-na-n').textContent = s.na; $('#pg-un').textContent = s.unchecked;
    $('#pg-urg').textContent = s.urgent; $('#pg-urg-wrap').hidden = !s.urgent;
    $('#btn-complete').textContent = '점검 완료 (' + s.done + '/' + s.total + ')';
    for (const id in secRefs) {
      const ref = secRefs[id]; let t = 0, dn = 0, bd = 0;
      ref.sec.items.forEach((it) => { t++; const d = S.data[it.key]; if (d && d.status) { dn++; if (d.status === 'defect') bd++; } });
      const all = t > 0 && dn === t;
      ref.cnt.textContent = dn + '/' + t + ' 완료'; ref.cnt.classList.toggle('done', all);
      ref.bad.textContent = bd ? bd + ' 불량' : ''; ref.bad.hidden = !bd;
      ref.navCnt.textContent = dn + '/' + t; ref.navCnt.classList.toggle('done', all); ref.navCnt.classList.toggle('zero', dn === 0);
      ref.navBad.textContent = bd ? bd + ' 불량' : ''; ref.navBad.hidden = !bd;
      ref.navBtn.classList.toggle('done', all);
    }
    updateStepper();
  }
  // 단계 표시줄
  function updateStepper() {
    const bar = $('#stepbar'); if (!bar) return;
    bar.hidden = !(S.user && (S.view === 'inspect' || S.view === 'result'));
    const i = S.info, infoOk = !!(i.vehicle && i.type && i.date);
    const s = stats();
    let st;
    if (S.view === 'result') st = ['done', 'done', 'current'];
    else if (!infoOk) st = ['current', 'pending', 'pending'];
    else if (s.total > 0 && s.unchecked === 0) st = ['done', 'done', 'current'];
    else st = ['done', 'current', 'pending'];
    st.forEach((v, n) => {
      const el = $('#st-' + (n + 1)); el.className = 'st ' + v;
      $('.st-no', el).textContent = v === 'done' ? '✓' : String(n + 1);
    });
    const rec = S.view === 'result' && S.last ? S.last.rec : null;
    const vehicle = rec ? rec.vehicle_type : i.vehicle, tn = rec ? rec.train_no : i.trainNo, tp = rec ? rec.inspection_type : i.type;
    $('#st-sum').textContent = [vehicle, (tn || '').trim() || '편성번호 미입력', tp].join(' · ');
  }

  // ---------- 사진 ----------
  function resizeImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const max = 1024, w0 = img.naturalWidth, h0 = img.naturalHeight;
        const k = Math.min(1, max / Math.max(w0, h0));
        const c = document.createElement('canvas');
        c.width = Math.round(w0 * k); c.height = Math.round(h0 * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve({ dataUrl: c.toDataURL('image/jpeg', 0.8), canvas: c });
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지 오류')); };
      img.src = url;
    });
  }
  async function onPhoto(key, input) {
    const f = input.files && input.files[0]; input.value = '';
    if (!f) return;
    const d = getD(key);
    try {
      const res = await resizeImage(f);
      d.photo = res.dataUrl; d.ai = null; d.aiErr = false; d.gemErr = false; d.aiBusy = false; d.gemBusy = false;
      const id = d.reqId = (d.reqId || 0) + 1;
      syncRow(key);
      if (geminiOn()) runGemini(key, res.dataUrl, id);
      let on = S.aiOn;
      if (!on) { try { on = !!(await AI.tmAvailable()); } catch (e) { on = false; } if (on) { S.aiOn = true; showPhotoBtns(); } }
      if (on && d.reqId === id) runAi(key, res.canvas, id);
    } catch (e) { toast('사진을 불러오지 못했습니다', 'error'); }
  }
  async function runAi(key, canvas, id) {
    const d = getD(key);
    d.aiBusy = true; d.aiErr = false; syncRow(key);
    try {
      const res = await AI.classify(canvas);
      if (d.reqId !== id) return;
      d.ai = Object.assign({}, res, d.ai && d.ai.gemini ? { gemini: d.ai.gemini } : {}); scheduleDraft();
    } catch (e) { if (d.reqId === id) d.aiErr = true; }
    if (d.reqId !== id) return;
    d.aiBusy = false; syncRow(key);
  }
  async function runGemini(key, dataUrl, id) {
    const d = getD(key), it = rows[key] && rows[key].it;
    d.gemBusy = true; d.gemErr = false; syncRow(key);
    try {
      const g = await AI.vision(dataUrl, { section: it ? it.sectionName : '', label: it ? it.label : '' });
      if (d.reqId !== id) return;
      if (!g || !g.verdict) throw new Error('empty');
      d.ai = Object.assign({}, d.ai || {}, { gemini: { verdict: String(g.verdict), confidence: Number(g.confidence) || 0, reason: String(g.reason || '') } });
      scheduleDraft();
    } catch (e) { if (d.reqId !== id) return; d.gemErr = true; }
    d.gemBusy = false; syncRow(key);
  }

  // ---------- 기본 정보 / 버튼 ----------
  function fillInfoForm() {
    const dv = $('#f-vehicle'), dt = $('#f-type');
    if (!dv.options.length) {
      IT.vehicles.forEach((v) => dv.append(h('option', { value: v, text: v })));
      IT.types.forEach((v) => dt.append(h('option', { value: v, text: v })));
    }
    $('#f-date').value = S.info.date;
    $('#f-train').value = S.info.trainNo;
    dv.value = S.info.vehicle; dt.value = S.info.type;
    $('#f-inspector').value = S.user ? S.user.name || '' : '';
  }
  async function changeInfo(field, val, el) {
    if (S.info[field] === val) return;
    if (hasInput()) {
      const ok = await confirmModal('입력 내용 삭제', '차종 또는 점검 종류를 바꾸면 입력한 점검 내용이 모두 지워집니다. 계속할까요?', '변경', true);
      if (!ok) { el.value = S.info[field]; return; }
    }
    S.info[field] = val; S.data = {};
    try { await DB.clearDraft(); } catch (e) { /* 무시 */ }
    renderChecklist(); saveDraftNow();
  }
  function sampleTrain() { return { 'KTX-산천': '산천 12편성', 'KTX-청룡': '청룡 3편성', 'SRT': 'SRT 5편성' }[S.info.vehicle] || '12편성'; }
  function fillSample() {
    S.data = {};
    visibleItems().forEach((it) => {
      const d = getD(it.key);
      if (it.kind === 'measure') {
        d.value = it.sample; d.status = judge(it, it.sample);
        if (d.status === 'defect') { d.memo = '기준치 미달 (예시)'; d.urgency = 'today'; }
      } else d.status = 'ok';
    });
    IT.sampleDefects.forEach((sd) => {
      if (!rows[sd.key] && !visibleItems().some((i) => i.key === sd.key)) return;
      const d = getD(sd.key); d.status = 'defect'; d.urgency = sd.urgency; d.memo = sd.memo;
    });
    if (!S.info.trainNo.trim()) { S.info.trainNo = sampleTrain(); $('#f-train').value = S.info.trainNo; }
    renderChecklist(); saveDraftNow();
    toast('예시 데이터를 채웠습니다');
  }
  async function resetAll() {
    const ok = await confirmModal('초기화', '입력한 체크 결과, 측정값, 메모, 사진을 모두 지웁니다. 계속할까요?', '초기화', true);
    if (!ok) return;
    S.data = {};
    try { await DB.clearDraft(); } catch (e) { /* 무시 */ }
    renderChecklist(); saveDraftNow();
    toast('초기화했습니다');
  }

  // ---------- 레코드 ----------
  function buildRecord() {
    const items = visibleItems().map((it) => {
      const d = getD(it.key), isM = it.kind === 'measure', def = d.status === 'defect';
      return {
        key: it.key, section: it.sectionName, label: it.label, kind: it.kind,
        status: d.status || null,
        value: isM && d.value !== '' ? d.value : null,
        unit: isM ? it.unit : null,
        criteria: isM ? criteriaText(it) : null,
        memo: def ? (d.memo || '') : '',
        urgency: def ? d.urgency : null,
        ai: d.ai || null, photo: null
      };
    });
    const s = stats();
    const u = S.user || {};
    return {
      id: DB.newId(), user_id: u.id || null, inspector_name: u.name || '',
      inspected_on: S.info.date, vehicle_type: S.info.vehicle, train_no: S.info.trainNo.trim(),
      inspection_type: S.info.type,
      results: { schema: 1, itemsVersion: IT.version, items, summary: { total: s.total, done: s.done, defect: s.defect, urgent: s.urgent, unchecked: s.unchecked } },
      defect_count: s.defect, urgent_count: s.urgent, ai_report: null, created_at: new Date().toISOString()
    };
  }
  const defectsOf = (rec) => rec.results.items.filter((i) => i.status === 'defect').sort((a, b) => urgRank(a.urgency) - urgRank(b.urgency));
  function fileBase(rec) {
    const clean = (s) => String(s || '').replace(/[\\/:*?"<>|]/g, '').trim().replace(/\s+/g, '_');
    return '점검일지_' + clean(rec.vehicle_type) + '_' + (clean(rec.train_no) || '편성미상') + '_' + String(rec.inspected_on).replace(/-/g, '');
  }
  function actionText(rec) {
    const ds = defectsOf(rec);
    const lines = ['[조치 요청] ' + rec.inspected_on + ' ' + rec.vehicle_type + ' ' + (rec.train_no || '-') + ' ' + rec.inspection_type + ' (점검자 ' + rec.inspector_name + ')'];
    if (!ds.length) lines.push('불량 항목이 없습니다.');
    ds.forEach((d, i) => {
      let body = d.section + ' - ' + d.label;
      if (d.kind === 'measure') body += ' ' + d.value + d.unit + ' (기준 ' + d.criteria + ')';
      if (d.memo) body += ': ' + d.memo;
      lines.push((i + 1) + '. [' + urgLabel(d.urgency) + '] ' + body);
    });
    lines.push('※ 시연용 예시 데이터입니다.');
    return lines.join('\n');
  }

  // ---------- 엑셀 / CSV ----------
  function sheetRows(rec) {
    const R = rec.results, s = R.summary;
    const meta = [
      ['점검일지 (시연용 예시)'],
      ['점검일자', rec.inspected_on], ['점검자', rec.inspector_name], ['차종', rec.vehicle_type],
      ['편성번호', rec.train_no], ['점검 종류', rec.inspection_type],
      ['요약', '전체 ' + s.total + ' / 완료 ' + s.done + ' / 불량 ' + s.defect + ' / 즉시조치 ' + s.urgent + ' / 미체크 ' + s.unchecked],
      []
    ];
    const head = ['분야', '항목', '결과', '측정값', '단위', '기준', '긴급도', '특이사항'];
    const body = R.items.map((i) => [i.section, i.label, stLabel(i.status), i.value == null ? '' : i.value, i.unit || '', i.criteria || '', urgLabel(i.urgency), i.memo || '']);
    const foot = [[], [IT.notice]];
    const ds = defectsOf(rec);
    const dhead = ['번호', '분야', '항목', '측정값', '단위', '기준', '긴급도', '특이사항', 'AI 판정'];
    const dbody = ds.map((i, n) => [n + 1, i.section, i.label, i.value == null ? '' : i.value, i.unit || '', i.criteria || '', urgLabel(i.urgency), i.memo || '', aiText(i.ai)]);
    if (!dbody.length) dbody.push(['불량 항목 없음']);
    return { s1: meta.concat([head], body, foot), s2: [dhead].concat(dbody, [[], [IT.notice]]) };
  }
  function saveBlob(blob, name) {
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function exportExcel(rec) {
    const base = fileBase(rec), rowsets = sheetRows(rec);
    if (window.XLSX) {
      try {
        const wb = XLSX.utils.book_new();
        const w1 = XLSX.utils.aoa_to_sheet(rowsets.s1);
        w1['!cols'] = [{ wch: 18 }, { wch: 38 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 14 }, { wch: 12 }, { wch: 40 }];
        const w2 = XLSX.utils.aoa_to_sheet(rowsets.s2);
        w2['!cols'] = [{ wch: 6 }, { wch: 18 }, { wch: 38 }, { wch: 10 }, { wch: 8 }, { wch: 14 }, { wch: 12 }, { wch: 40 }, { wch: 20 }];
        XLSX.utils.book_append_sheet(wb, w1, '점검일지');
        XLSX.utils.book_append_sheet(wb, w2, '불량항목');
        XLSX.writeFile(wb, base + '.xlsx');
        return 'xlsx';
      } catch (e) { console.warn('xlsx 실패, CSV로 대체', e); }
    }
    const esc = (v) => { let t = String(v == null ? '' : v); if (typeof v !== 'number' && /^[=+\-@]/.test(t)) t = "'" + t; return /[",\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
    const csv = rowsets.s1.concat([[], ['[불량항목]']], rowsets.s2).map((r) => r.map(esc).join(',')).join('\r\n');
    saveBlob(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), base + '.csv');
    return 'csv';
  }

  // ---------- 일지(PDF/인쇄/미리보기) ----------
  function buildJournal(rec, photos, noDiagram) {
    photos = photos || {};
    const R = rec.results, s = R.summary;
    const root = h('div', { class: 'journal' });
    root.append(h('img', { class: 'j-logo', src: 'assets/korail-logo.webp', alt: '한국철도공사', width: '82', height: '20' }));
    root.append(h('h1', { text: '고속차량 점검일지' }), h('p', { class: 'j-sub', text: '(시연용 예시)' }));
    root.append(h('table', null, h('tbody', null,
      h('tr', null, h('th', { text: '점검일자' }), h('td', { text: rec.inspected_on }), h('th', { text: '점검 종류' }), h('td', { text: rec.inspection_type })),
      h('tr', null, h('th', { text: '차종' }), h('td', { text: rec.vehicle_type }), h('th', { text: '편성번호' }), h('td', { text: rec.train_no || '-' })),
      h('tr', null, h('th', { text: '점검자' }), h('td', { text: rec.inspector_name }),
        h('th', { text: '결과 요약' }), h('td', { text: '전체 ' + s.total + ' / 불량 ' + s.defect + ' / 즉시조치 ' + s.urgent + ' / 미체크 ' + s.unchecked })))));
    root.append(h('h2', { text: '점검 결과' }));
    const tb = h('tbody');
    let cur = null;
    R.items.forEach((i) => {
      if (i.section !== cur) { cur = i.section; tb.append(h('tr', { class: 'sec-row' }, h('td', { colspan: '4', text: cur }))); }
      tb.append(h('tr', null,
        h('td', { text: i.label }),
        h('td', { class: 'c ' + (i.status === 'defect' ? 'r-bad' : i.status === 'ok' ? 'r-ok' : ''), text: stLabel(i.status) }),
        h('td', { class: 'c', text: i.value == null ? '-' : i.value + ' ' + (i.unit || '') }),
        h('td', { class: 'c', text: i.criteria || '-' })));
    });
    root.append(h('table', null,
      h('colgroup', null, h('col', { style: 'width:46%' }), h('col', { style: 'width:14%' }), h('col', { style: 'width:20%' }), h('col', { style: 'width:20%' })),
      h('thead', null, h('tr', null, h('th', { text: '항목' }), h('th', { class: 'c', text: '결과' }), h('th', { class: 'c', text: '측정값' }), h('th', { class: 'c', text: '기준' }))), tb));
    root.append(h('h2', { text: '불량 항목' }));
    const ds = defectsOf(rec);
    if (!noDiagram && window.Diagram && ds.length) {
      const dbox = h('div', { class: 'j-diagram' });
      window.Diagram.render(dbox, R.items, { static: true });
      root.append(dbox);
    }
    if (!ds.length) root.append(h('p', { text: '불량 항목 없음' }));
    else {
      const dtb = h('tbody');
      ds.forEach((d, n) => {
        const detail = (d.kind === 'measure' ? d.value + d.unit + ' (기준 ' + d.criteria + ')' : '') + (d.memo ? (d.kind === 'measure' ? ' / ' : '') + d.memo : '');
        dtb.append(h('tr', null,
          h('td', { class: 'c', text: String(n + 1) }),
          h('td', { text: d.section + ' - ' + d.label }),
          h('td', { class: 'c r-bad', text: urgLabel(d.urgency) }),
          h('td', { text: (detail || '-') + (d.ai ? '\nAI 참고: ' + aiText(d.ai) : '') }),
          h('td', { class: 'c' }, photos[d.key] ? h('img', { class: 'j-thumb', src: photos[d.key], alt: '첨부 사진' }) : '-')));
      });
      root.append(h('table', null,
        h('colgroup', null, h('col', { style: 'width:6%' }), h('col', { style: 'width:30%' }), h('col', { style: 'width:12%' }), h('col', { style: 'width:34%' }), h('col', { style: 'width:18%' })),
        h('thead', null, h('tr', null, h('th', { class: 'c', text: '번호' }), h('th', { text: '분야 - 항목' }), h('th', { class: 'c', text: '긴급도' }), h('th', { text: '내용' }), h('th', { class: 'c', text: '사진' }))), dtb));
    }
    if (rec.ai_report) {
      root.append(h('h2', { text: '조치 요청 보고서 (AI 작성, 참고용)' }), h('div', { class: 'j-ai', text: rec.ai_report }));
    }
    root.append(h('table', { class: 'sign' }, h('tbody', null,
      h('tr', null, h('th', { class: 'c', text: '점검자' }), h('th', { class: 'c', text: '검토' }), h('th', { class: 'c', text: '승인' })),
      h('tr', null, h('td', { class: 'c', text: rec.inspector_name }), h('td'), h('td')))));
    root.append(h('p', { class: 'j-notice', text: IT.notice }));
    return root;
  }
  async function exportPdf(rec, photos) {
    const name = fileBase(rec) + '.pdf';
    if (window.html2pdf) {
      let stage;
      try {
        try { await document.fonts.load('12px Pretendard'); await document.fonts.ready; } catch (e) { /* 무시 */ }
        const journal = buildJournal(rec, photos);
        stage = h('div', { class: 'pdf-stage' }, journal);
        document.body.append(stage);
        try { await Promise.all([...stage.querySelectorAll('img')].map((im) => im.decode())); } catch (e) { /* 무시 */ }
        await html2pdf().set({
          margin: [10, 10, 10, 10], filename: name, image: { type: 'jpeg', quality: 0.95 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', '.sign'] }
        }).from(journal).save();
        stage.remove();
        return 'pdf';
      } catch (e) { console.warn('PDF 실패, 인쇄로 대체', e); if (stage) stage.remove(); }
    }
    printJournal(rec, photos);
    return 'print';
  }
  async function makePdfBase64(rec, photos) {
    if (!window.html2pdf) throw new Error('nolib');
    let stage;
    try {
      try { await document.fonts.load('12px Pretendard'); await document.fonts.ready; } catch (e) { /* 무시 */ }
      const journal = buildJournal(rec, photos);
      stage = h('div', { class: 'pdf-stage' }, journal);
      document.body.append(stage);
      try { await Promise.all([...stage.querySelectorAll('img')].map((im) => im.decode())); } catch (e) { /* 무시 */ }
      const uri = await html2pdf().set({
        margin: [10, 10, 10, 10], image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', '.sign'] }
      }).from(journal).outputPdf('datauristring');
      return String(uri).replace(/^data:[^,]*,/, '');
    } finally { if (stage) stage.remove(); }
  }
  const mailAvailable = () => typeof DB !== 'undefined' && DB.mode === 'supabase' && typeof AI !== 'undefined' && typeof AI.serverAvailable === 'function' && AI.serverAvailable() && typeof AI.sendJournal === 'function';
  const PDF_MAX_B64 = 4 * 1024 * 1024;
  async function sendJournalMail(rec, photos) {
    let b64 = await makePdfBase64(rec, photos);
    if (b64.length > PDF_MAX_B64 && photos && Object.keys(photos).length) b64 = await makePdfBase64(rec, {});
    if (b64.length > PDF_MAX_B64) throw new Error('PDF가 너무 큽니다');
    const s = rec.results.summary;
    const subject = '[점검일지] ' + rec.inspected_on + ' ' + rec.vehicle_type + ' ' + (rec.train_no || '-') + ' ' + rec.inspection_type + ' (불량 ' + s.defect + '건, 즉시 ' + s.urgent + '건)';
    const info = ['점검일자: ' + rec.inspected_on, '차종: ' + rec.vehicle_type + ' ' + (rec.train_no || '-'), '점검 종류: ' + rec.inspection_type, '점검자: ' + rec.inspector_name];
    const summary = info.join('\n') + '\n\n' + (rec.ai_report ? String(rec.ai_report) : actionText(rec));
    return AI.sendJournal({ filename: fileBase(rec) + '.pdf', pdfBase64: b64, subject, summary });
  }
  // 메일 발송 + 상태 표시. el이 없으면 토스트로 알림
  async function mailJournal(rec, photos, el, retryBtn) {
    const show = (cls, msg) => { if (el) setState(el, cls, msg); };
    if (retryBtn) retryBtn.hidden = true;
    show('', '발송 중…');
    try {
      const r = await sendJournalMail(rec, photos);
      const to = r && r.to ? r.to : '';
      show('ok', '발송 완료' + (to ? ' (' + to + ')' : ''));
      if (!el) toast('메일로 보냈습니다' + (to ? ' (' + to + ')' : ''));
      return true;
    } catch (e) {
      const msg = e && e.message === 'nolib' ? 'PDF 라이브러리를 불러오지 못해 발송하지 못했습니다' : '발송 실패';
      show('bad', msg);
      if (!el) toast(msg, 'error');
      if (retryBtn) retryBtn.hidden = false;
      return false;
    }
  }
  function sendResultMail(aiP) {
    const L = S.last, el = $('#res-mail'), btn = $('#btn-retry-mail');
    if (!mailAvailable()) { setState(el, '', '배포 주소에서 로그인하면 자동 발송됩니다'); btn.hidden = true; return Promise.resolve(); }
    setState(el, '', '발송 중…');
    const wait = aiP ? Promise.race([aiP, new Promise((r) => setTimeout(r, 5000))]) : Promise.resolve();
    return wait.then(() => mailJournal(L.rec, L.photos, el, btn));
  }
  function printJournal(rec, photos) {
    const area = $('#print-area'); area.textContent = ''; area.append(buildJournal(rec, photos));
    document.body.classList.add('print-mode');
    const done = () => { document.body.classList.remove('print-mode'); area.textContent = ''; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => window.print(), 100);
  }
  function dataUrlToBlob(u) {
    const [meta, b64] = u.split(',');
    const mime = (meta.match(/:(.*?);/) || [])[1] || 'image/jpeg';
    const bin = atob(b64), arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }
  async function toDataUrl(u) {
    try {
      if (!u) return null;
      if (String(u).startsWith('data:')) return u;
      const blob = await (await fetch(u)).blob();
      return await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });
    } catch (e) { return null; }
  }

  // ---------- 점검 완료 ----------
  function setState(el, cls, msg) { el.className = 'res-state ' + cls; el.textContent = msg; }

  async function onComplete() {
    if (S.busy) return;
    const s = stats();
    if (!s.total) { toast('점검 항목이 없습니다', 'warn'); return; }
    if (s.unchecked > 0) {
      const ok = await confirmModal('미체크 항목 안내', '미체크 항목이 ' + s.unchecked + '건 있습니다. 그래도 완료할까요?', '완료');
      if (!ok) return;
    }
    S.busy = true;
    const rec = buildRecord();
    const photos = {};
    visibleItems().forEach((it) => { const d = S.data[it.key]; if (d && d.photo) photos[it.key] = d.photo; });
    S.last = { rec, photos, paths: {}, saved: false, aiTried: false };
    location.hash = '#result';
    showResult();
    runCompletion().finally(() => { S.busy = false; });
  }
  function showResult() {
    const L = S.last;
    $('#res-text').textContent = actionText(L.rec);
    const sm = L.rec.results.summary, okN = L.rec.results.items.filter((i) => i.status === 'ok').length;
    diagPanel($('#res-diagram'), L.rec.results.items, '불량 위치');
    $('#rc-total').textContent = sm.total; $('#rc-ok').textContent = okN; $('#rc-bad').textContent = sm.defect; $('#rc-urg').textContent = sm.urgent;
    $('#res-ai-tag').hidden = true;
    $('#btn-retry-save').hidden = true;
    setState($('#res-xlsx'), '', '대기');
    setState($('#res-pdf'), '', '대기');
    setState($('#res-save'), '', '대기 중...');
    setState($('#res-mail'), '', '대기');
    $('#btn-retry-mail').hidden = true;
  }
  async function runCompletion() {
    const L = S.last, rec = L.rec;
    await saveServer();
    const aiP = tryAiReport();
    await Promise.all([aiP, sendResultMail(aiP)]);
    clearTimeout(draftTimer);
    try { await DB.clearDraft(); } catch (e) { /* 무시 */ }
    // 완료 레코드는 S.last에 보관하고 입력 상태는 새 점검으로 비움
    if (S.last === L) {
      S.data = {}; S.info.trainNo = '';
      if ($('#f-train')) $('#f-train').value = '';
      renderChecklist();
    }
  }
  async function saveServer() {
    const L = S.last, rec = L.rec, el = $('#res-save');
    setState(el, '', '저장 중...');
    $('#btn-retry-save').hidden = true;
    let fail = 0;
    try {
      for (const it of rec.results.items) {
        const ph = L.photos[it.key];
        if (!ph) continue;
        if (L.paths[it.key]) { it.photo = L.paths[it.key]; continue; }
        try {
          const path = await DB.uploadPhoto(rec.id, it.key, dataUrlToBlob(ph));
          L.paths[it.key] = path; it.photo = path;
        } catch (e) { it.photo = null; fail++; }
      }
      await DB.saveInspection(rec);
      L.saved = true;
      setState(el, 'ok', fail ? '저장 완료 (사진 ' + fail + '장은 저장하지 못했습니다)' : '저장 완료');
      if (fail) toast('사진 ' + fail + '장을 저장하지 못했습니다', 'warn');
    } catch (e) {
      setState(el, 'bad', '서버 저장 실패, 다시 시도');
      $('#btn-retry-save').hidden = false;
    }
  }
  async function tryAiReport() {
    const L = S.last;
    if (!L || L.aiTried) return;
    const rec = L.rec, ds = defectsOf(rec);
    if (!ds.length) return;
    L.aiTried = true;
    try {
      const text = await AI.report({
        mode: 'report',
        info: { date: rec.inspected_on, inspector: rec.inspector_name, vehicle: rec.vehicle_type, trainNo: rec.train_no, type: rec.inspection_type },
        defects: ds.map((d) => ({ section: d.section, label: d.label, value: d.value, unit: d.unit, criteria: d.criteria, urgency: urgLabel(d.urgency), memo: d.memo, ai: d.ai ? aiText(d.ai) : null }))
      });
      if (text && String(text).trim()) {
        rec.ai_report = String(text);
        if (S.last === L) { $('#res-text').textContent = rec.ai_report; $('#res-ai-tag').hidden = false; }
        if (L.saved) { try { await DB.updateInspection(rec.id, { ai_report: rec.ai_report }); } catch (e) { /* 무시 */ } }
      }
    } catch (e) { /* 규칙 문구 유지 */ }
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); toast('복사했습니다'); return; } catch (e) { /* 대체 */ }
    const ta = h('textarea', { 'aria-hidden': 'true' }); ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px';
    document.body.append(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (e) { /* 무시 */ }
    ta.remove(); toast(ok ? '복사했습니다' : '복사하지 못했습니다. 직접 선택해 복사하세요', ok ? '' : 'warn');
  }
  async function withBusy(btn, label, fn) {
    const old = [...btn.childNodes]; btn.disabled = true; btn.textContent = label;
    try { return await fn(); } finally { btn.disabled = false; btn.replaceChildren(...old); }
  }

  // ---------- 이력 ----------
  let histTimer;
  function setupHistoryFilters() {
    const v = $('#h-vehicle'), t = $('#h-type');
    if (v.options.length) return;
    v.append(h('option', { value: '', text: '전체' })); IT.vehicles.forEach((x) => v.append(h('option', { value: x, text: x })));
    t.append(h('option', { value: '', text: '전체' })); IT.types.forEach((x) => t.append(h('option', { value: x, text: x })));
    v.addEventListener('change', loadHistory); t.addEventListener('change', loadHistory);
    $('#h-q').addEventListener('input', () => { clearTimeout(histTimer); histTimer = setTimeout(loadHistory, 300); });
  }
  let histList = [];
  async function loadHistory() {
    const box = $('#h-list');
    box.textContent = ''; box.append(h('div', { class: 'empty', text: '불러오는 중...' }));
    try {
      const f = { vehicle: $('#h-vehicle').value || undefined, type: $('#h-type').value || undefined, q: $('#h-q').value.trim() || undefined };
      histList = await DB.listInspections(f) || [];
    } catch (e) {
      box.textContent = ''; box.append(h('div', { class: 'empty', text: '이력을 불러오지 못했습니다: ' + e.message })); return;
    }
    renderHistory();
  }
  function renderHistory() {
    const list = histList, sum = $('#h-summary'), box = $('#h-list');
    sum.textContent = '';
    const totalDef = list.reduce((a, r) => a + (r.defect_count || 0), 0);
    const cell = (k, v) => h('div', { class: 'sum-cell' }, h('div', { class: 'k', text: k }), h('div', { class: 'v', text: String(v) }));
    sum.append(cell('총 점검 수', list.length + '건'), cell('총 불량 수', totalDef + '건'));
    IT.vehicles.forEach((v) => sum.append(cell(v + ' 불량', list.filter((r) => r.vehicle_type === v).reduce((a, r) => a + (r.defect_count || 0), 0) + '건')));
    box.textContent = '';
    if (!list.length) { box.append(h('div', { class: 'empty', text: '점검 기록이 없습니다. 점검을 완료하면 이곳에 이력이 쌓입니다.' })); return; }
    const td = (label, content, cls) => h('td', { 'data-label': label, class: cls }, content);
    box.append(h('table', { class: 'grid stack' },
      h('thead', null, h('tr', null, ['일자', '차종', '편성번호', '점검 종류', '점검자', '불량 수', ''].map((t) => h('th', { text: t })))),
      h('tbody', null, list.map((r) => h('tr', null,
        td('일자', r.inspected_on), td('차종', r.vehicle_type), td('편성번호', r.train_no || '-'), td('점검 종류', r.inspection_type), td('점검자', r.inspector_name),
        td('불량 수', [String(r.defect_count || 0) + '건', r.urgent_count ? h('span', { class: 'badge-urg', text: '즉시 ' + r.urgent_count }) : null], 'num'),
        td('', h('a', { class: 'btn sm', href: '#detail/' + encodeURIComponent(r.id), text: '상세' })))))));
  }

  async function runTrend() {
    const box = $('#h-trend'); box.hidden = false; box.textContent = '';
    box.append(h('p', { text: '집계 중...' }));
    const recent = histList.slice(0, 30);
    if (!recent.length) { box.textContent = ''; box.append(h('p', { text: '분석할 기록이 없습니다.' })); return; }
    const recs = (await Promise.allSettled(recent.map((r) => DB.getInspection(r.id)))).filter((x) => x.status === 'fulfilled' && x.value).map((x) => x.value);
    const map = {};
    recs.forEach((rec) => ((rec.results && rec.results.items) || []).forEach((i) => {
      if (i.status !== 'defect') return;
      const e = map[i.key] || (map[i.key] = { label: i.label, section: i.section, count: 0 });
      e.count++;
    }));
    const stat = Object.values(map).sort((a, b) => b.count - a.count).slice(0, 10);
    const dates = recs.map((r) => r.inspected_on).sort();
    const period = { from: dates[0] || '', to: dates[dates.length - 1] || '', inspections: recs.length };
    box.textContent = '';
    box.append(h('h2', { text: '반복 불량 분석' }), h('p', { class: 'muted', text: '집계 기준: 최근 ' + recs.length + '건' + (period.from ? ' (' + period.from + ' ~ ' + period.to + ')' : '') }));
    if (!stat.length) { box.append(h('p', { text: '불량으로 기록된 항목이 없습니다.' })); return; }
    box.append(h('table', { class: 'grid' },
      h('thead', null, h('tr', null, ['순위', '분야', '항목', '불량 횟수'].map((t) => h('th', { text: t })))),
      h('tbody', null, stat.map((s, n) => h('tr', null, h('td', { text: String(n + 1) }), h('td', { text: s.section }), h('td', { text: s.label }), h('td', { class: 'num', text: s.count + '회' }))))));
    const aiP = h('p', { class: 'muted', text: 'AI 요약 작성 중...' }); box.append(aiP);
    try {
      const text = await AI.trend({ stats: stat, period });
      if (!text || !String(text).trim()) throw new Error('empty');
      aiP.remove();
      box.append(h('p', null, h('span', { class: 'tag', text: 'AI 작성' }), ' 참고용 요약'), h('div', { class: 'ai-text', text: String(text) }));
    } catch (e) { aiP.remove(); }
  }

  // ---------- 상세 ----------
  let curDetail = null;
  async function showDetail(id) {
    const body = $('#d-body'); body.textContent = ''; curDetail = null;
    $('#d-del').hidden = true; $('#d-mail').hidden = true;
    body.append(h('div', { class: 'empty', text: '불러오는 중...' }));
    let rec;
    try { rec = await DB.getInspection(id); } catch (e) { rec = null; }
    if (!rec) { body.textContent = ''; body.append(h('div', { class: 'empty', text: '기록을 찾을 수 없습니다.' })); return; }
    const photos = {};
    await Promise.all(((rec.results && rec.results.items) || []).filter((i) => i.photo).map(async (i) => {
      try { photos[i.key] = await toDataUrl(await DB.photoUrl(i.photo)); } catch (e) { /* 무시 */ }
    }));
    if (location.hash !== '#detail/' + encodeURIComponent(id) && location.hash !== '#detail/' + id) return;
    curDetail = { rec, photos };
    body.textContent = '';
    const dp = h('div', { class: 'dg-panel', hidden: true });
    body.append(dp);
    diagPanel(dp, rec.results.items, '불량 위치');
    body.append(h('div', { class: 'journal-wrap' }, buildJournal(rec, photos, true)));
    if (rec.ai_report) { /* 일지 안에 포함 */ }
    const me = S.user && S.user.id;
    $('#d-del').hidden = !(me && rec.user_id === me);
    $('#d-mail').hidden = !mailAvailable();
  }
  async function deleteDetail() {
    if (!curDetail) return;
    const rec = curDetail.rec;
    const ok = await confirmModal('기록 삭제', rec.inspected_on + ' ' + rec.vehicle_type + ' ' + (rec.train_no || '') + ' 점검 기록을 삭제합니다. 사진도 함께 삭제되며 되돌릴 수 없습니다.', '삭제', true);
    if (!ok) return;
    try { await DB.deleteInspection(rec.id); toast('삭제했습니다'); location.hash = '#history'; }
    catch (e) { toast('삭제하지 못했습니다: ' + e.message, 'error'); }
  }

  // ---------- 라우팅 ----------
  function showView(name) {
    S.view = name;
    ['login', 'inspect', 'result', 'history', 'detail', 'admin'].forEach((v) => { $('#view-' + v).hidden = v !== name; });
    $('#nav-inspect').classList.toggle('is-on', name === 'inspect' || name === 'result');
    $('#nav-history').classList.toggle('is-on', name === 'history' || name === 'detail');
    $('#nav-admin').classList.toggle('is-on', name === 'admin');
    window.scrollTo(0, 0);
    updateStepper();
  }
  async function showAdmin() {
    const root = document.getElementById('admin-root');
    try {
      if (!window.Admin) throw new Error('no admin');
      await window.Admin.render(root, { user: S.user, openDetail: (id) => { location.hash = '#detail/' + encodeURIComponent(id); } });
    } catch (e) { console.warn(e); root.textContent = '정비 현황을 불러오지 못했습니다'; }
  }
  function route() {
    if (!S.user) { $('#app-header').hidden = true; showView('login'); return; }
    $('#app-header').hidden = false;
    const hash = location.hash.slice(1) || 'inspect';
    const i = hash.indexOf('/');
    const name = i < 0 ? hash : hash.slice(0, i), arg = i < 0 ? '' : decodeURIComponent(hash.slice(i + 1));
    try { if (window.Admin && window.Admin.destroy) window.Admin.destroy(); } catch (e) { /* 무시 */ }
    if (name === 'admin') { showView('admin'); showAdmin(); }
    else if (name === 'history') { showView('history'); setupHistoryFilters(); loadHistory(); }
    else if (name === 'detail' && arg) { showView('detail'); showDetail(arg); }
    else if (name === 'result' && S.last) { showView('result'); }
    else { if (name !== 'inspect') { history.replaceState(null, '', '#inspect'); } showView('inspect'); }
  }

  // ---------- 로그인 ----------
  let signupMode = false;
  function setupLogin() {
    const local = DB.mode === 'local';
    $('#login-local').hidden = !local; $('#login-remote').hidden = local;
    if (local) {
      $('#login-local').onsubmit = async (e) => {
        e.preventDefault();
        const name = $('#ll-name').value.trim();
        if (!name) { $('#ll-error').textContent = '이름을 입력하세요.'; return; }
        try { await DB.setLocalName(name); await afterLogin(); } catch (err) { $('#ll-error').textContent = err.message; }
      };
    } else {
      const setMode = (su) => {
        signupMode = su;
        $('#tab-signin').classList.toggle('is-on', !su); $('#tab-signup').classList.toggle('is-on', su);
        $('#lr-name-wrap').hidden = !su; $('#lr-submit').textContent = su ? '회원가입' : '로그인';
        $('#lr-pw').setAttribute('autocomplete', su ? 'new-password' : 'current-password');
        $('#lr-error').textContent = '';
      };
      $('#tab-signin').onclick = () => setMode(false); $('#tab-signup').onclick = () => setMode(true);
      $('#form-remote').onsubmit = async (e) => {
        e.preventDefault();
        const email = $('#lr-email').value.trim(), pw = $('#lr-pw').value, name = $('#lr-name').value.trim();
        const err = $('#lr-error'); err.textContent = '';
        if (signupMode && !name) { err.textContent = '이름(점검자명)을 입력하세요.'; return; }
        const btn = $('#lr-submit'); btn.disabled = true;
        try {
          if (signupMode) await DB.signUp(email, pw, name); else await DB.signIn(email, pw);
          await afterLogin();
        } catch (ex) { err.textContent = ex.message || '로그인에 실패했습니다.'; }
        btn.disabled = false;
      };
    }
  }
  async function afterLogin() {
    S.user = await DB.currentUser();
    if (!S.user) { route(); return; }
    $('#hd-name').textContent = (S.user.name || S.user.email || '') + ' 점검자';
    S.info = { date: todayStr(), trainNo: '', vehicle: IT.vehicles[0], type: IT.types[0] };
    S.data = {};
    await restoreDraft();
    fillInfoForm(); renderChecklist();
    if (!location.hash || location.hash === '#login') history.replaceState(null, '', '#inspect');
    route();
  }
  async function logout() {
    clearTimeout(draftTimer);
    try { await DB.clearDraft(); } catch (e) { /* 무시 */ }
    try { await DB.signOut(); } catch (e) { /* 무시 */ }
    S.user = null; S.data = {}; S.last = null;
    S.info = { date: todayStr(), trainNo: '', vehicle: IT.vehicles[0], type: IT.types[0] };
    $('#ll-name').value = ''; $('#lr-pw').value = '';
    route();
  }

  // ---------- 시작 ----------
  document.addEventListener('DOMContentLoaded', () => { const d = $('#ck-diagram'); if (d) d.addEventListener('toggle', updateCkDiagram); });
  async function boot() {
    $('#foot-notice').textContent = IT.notice;
    try { await DB.init(); } catch (e) { toast('저장소 초기화 실패: ' + e.message, 'error'); }

    // 이벤트
    $('#f-date').addEventListener('change', (e) => { S.info.date = e.target.value || todayStr(); scheduleDraft(); updateStepper(); });
    $('#f-train').addEventListener('input', (e) => { S.info.trainNo = e.target.value; scheduleDraft(); updateStepper(); });
    $('#f-vehicle').addEventListener('change', (e) => changeInfo('vehicle', e.target.value, e.target));
    $('#f-type').addEventListener('change', (e) => changeInfo('type', e.target.value, e.target));
    $('#btn-sample').addEventListener('click', fillSample);
    $('#btn-reset').addEventListener('click', resetAll);
    $('#btn-complete').addEventListener('click', onComplete);
    $('#btn-logout').addEventListener('click', logout);
    $('#btn-copy').addEventListener('click', () => copyText($('#res-text').textContent));
    $('#btn-new').addEventListener('click', async () => {
      S.data = {}; S.info.trainNo = ''; S.info.date = todayStr(); S.last = null;
      try { await DB.clearDraft(); } catch (e) { /* 무시 */ }
      fillInfoForm(); renderChecklist(); location.hash = '#inspect';
    });
    $('#btn-redo-xlsx').addEventListener('click', () => S.last && withBusy($('#btn-redo-xlsx'), '생성 중', async () => {
      setState($('#res-xlsx'), '', '생성 중...');
      try {
        const r = exportExcel(S.last.rec);
        setState($('#res-xlsx'), r === 'xlsx' ? 'ok' : 'warn', r === 'xlsx' ? '다운로드 완료 (.xlsx)' : 'CSV로 대신 저장했습니다 (엑셀 라이브러리 불러오기 실패)');
      } catch (e) { setState($('#res-xlsx'), 'bad', '실패: ' + e.message); }
    }));
    $('#btn-redo-pdf').addEventListener('click', () => S.last && withBusy($('#btn-redo-pdf'), '생성 중', async () => {
      setState($('#res-pdf'), '', '생성 중...');
      try {
        const r = await exportPdf(S.last.rec, S.last.photos);
        setState($('#res-pdf'), r === 'pdf' ? 'ok' : 'warn', r === 'pdf' ? '다운로드 완료 (.pdf)' : '인쇄 창으로 대신 열었습니다 (PDF 라이브러리 불러오기 실패)');
      } catch (e) { setState($('#res-pdf'), 'bad', '실패: ' + e.message); }
    }));
    $('#btn-retry-save').addEventListener('click', async () => { await saveServer(); await tryAiReport(); });
    $('#btn-retry-mail').addEventListener('click', () => S.last && withBusy($('#btn-retry-mail'), '발송 중', () => mailJournal(S.last.rec, S.last.photos, $('#res-mail'), $('#btn-retry-mail'))));
    $('#d-mail').addEventListener('click', () => curDetail && withBusy($('#d-mail'), '발송 중', () => mailJournal(curDetail.rec, curDetail.photos, null, null)));
    $('#btn-trend').addEventListener('click', () => withBusy($('#btn-trend'), '분석 중', runTrend));
    $('#d-xlsx').addEventListener('click', () => curDetail && exportExcel(curDetail.rec));
    $('#d-pdf').addEventListener('click', () => curDetail && withBusy($('#d-pdf'), '생성 중', () => exportPdf(curDetail.rec, curDetail.photos)));
    $('#d-del').addEventListener('click', deleteDetail);
    window.addEventListener('hashchange', route);

    setupLogin();
    // 사진 AI 가용 여부는 기다리지 않고 나중에 반영
    try {
      Promise.resolve(AI.tmAvailable()).then((v) => {
        if (v && !S.aiOn) { S.aiOn = true; if (S.user) { showPhotoBtns(); } }
      }).catch(() => {});
    } catch (e) { /* 무시 */ }
    setTimeout(() => { try { if (geminiOn() && S.user) showPhotoBtns(); } catch (e) { /* 무시 */ } }, 1500);

    let u = null;
    try { u = await DB.currentUser(); } catch (e) { /* 무시 */ }
    if (u) await afterLogin(); else route();
  }
  boot();
})();
