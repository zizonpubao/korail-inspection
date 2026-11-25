/* 불량 위치 2D 측면도 (시연용 도식). window.Diagram.render(container, items, opts) */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const W = 800, H = 220;
  const LINE = '#77777A', BODY = '#F5F7FA', BLUE = '#005BAC', BAD = '#C62828', BAD_BG = '#FDECEC';
  const URG = { immediate: { rank: 1, label: '즉시 조치', color: '#C62828' }, today: { rank: 2, label: '금일 내', color: '#E08600' }, next: { rank: 3, label: '다음 정비 시', color: '#77777A' } };
  // zone별 마커 기준점
  const ANCHOR = { cab: [60, 100], body: [170, 88], door: [258, 100], pantograph: [330, 13], hvac: [485, 22], bogie: [192, 198], under: [370, 160], coupler: [758, 108] };

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function htm(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  // 분야·항목명 -> zone
  function zoneOf(it) {
    const sec = it.section || '', lab = it.label || '';
    if (sec.indexOf('측정') >= 0) {
      if (/라이닝|차륜/.test(lab)) return 'bogie';
      if (/습판|팬터/.test(lab)) return 'pantograph';
      if (/공기압축기|축전지/.test(lab)) return 'under';
      return 'body';
    }
    if (/주행|제동/.test(sec)) return 'bogie';
    if (/연결/.test(sec)) return 'coupler';
    if (/출입문/.test(sec)) return 'door';
    if (/집전|전기/.test(sec)) return 'pantograph';
    if (/공조|급수/.test(sec)) return 'hvac';
    if (/차체|안전/.test(sec)) return 'body';
    if (/운전실/.test(sec)) return 'cab';
    if (/동력|추진/.test(sec)) return 'under';
    return 'body';
  }
  const circled = (n) => (n >= 1 && n <= 20 ? String.fromCharCode(0x2460 + n - 1) : n + '.');

  function drawTrain(svg, hit) {
    const stroke = (z) => (hit[z] ? { stroke: BAD, 'stroke-width': 2 } : { stroke: LINE, 'stroke-width': 1 });
    const fill = (z, normal) => (hit[z] ? BAD_BG : normal);
    const zone = (z) => el('g', { 'data-zone': z }, svg);
    el('line', { x1: 0, y1: 174, x2: W, y2: 174, stroke: LINE, 'stroke-width': 1, 'stroke-dasharray': '6 4' }, svg);
    // 차체
    let g = zone('body');
    el('rect', Object.assign({ x: 100, y: 50, width: 640, height: 98, rx: 3, fill: fill('body', BODY) }, stroke('body')), g);
    el('line', { x1: 100, y1: 118, x2: 740, y2: 118, stroke: BLUE, 'stroke-width': 3 }, g);
    // 창문 열
    g = zone('window');
    for (let x = 130; x < 720; x += 40) {
      if ((x > 225 && x < 285) || (x > 545 && x < 605)) continue;
      el('rect', { x: x, y: 66, width: 28, height: 26, rx: 2, fill: '#fff', stroke: LINE, 'stroke-width': 1 }, g);
    }
    // 운전실(전두부)
    g = zone('cab');
    el('path', Object.assign({ d: 'M100,50 C62,52 30,92 16,134 L16,148 L100,148 Z', fill: fill('cab', BODY) }, stroke('cab')), g);
    el('path', { d: 'M96,58 C70,60 50,84 40,104 L96,104 Z', fill: '#fff', stroke: LINE, 'stroke-width': 1 }, g);
    // 출입문 2개
    [240, 560].forEach((x) => {
      const gd = el('g', { 'data-zone': 'door' }, svg);
      el('rect', Object.assign({ x: x, y: 58, width: 36, height: 90, rx: 2, fill: fill('door', '#fff') }, stroke('door')), gd);
      el('line', { x1: x + 18, y1: 58, x2: x + 18, y2: 148, stroke: hit.door ? BAD : LINE, 'stroke-width': 1 }, gd);
    });
    // 팬터그래프
    g = zone('pantograph');
    el('path', Object.assign({ d: 'M300,50 L330,30 L360,50 M330,30 L330,26 M318,26 L342,26 M308,50 L352,50', fill: 'none', 'stroke-linejoin': 'round' }, stroke('pantograph')), g);
    // 지붕 공조 장치
    g = zone('hvac');
    el('rect', Object.assign({ x: 430, y: 36, width: 110, height: 14, fill: fill('hvac', '#fff') }, stroke('hvac')), g);
    // 대차 2개
    [192, 648].forEach((cx) => {
      const gb = el('g', { 'data-zone': 'bogie' }, svg);
      el('rect', Object.assign({ x: cx - 38, y: 148, width: 76, height: 8, fill: fill('bogie', BODY) }, stroke('bogie')), gb);
      [-22, 22].forEach((dx) => el('circle', Object.assign({ cx: cx + dx, cy: 162, r: 11, fill: fill('bogie', '#fff') }, stroke('bogie')), gb));
    });
    // 하부 기기함
    g = zone('under');
    el('rect', Object.assign({ x: 290, y: 148, width: 160, height: 24, fill: fill('under', '#fff') }, stroke('under')), g);
    el('line', { x1: 370, y1: 148, x2: 370, y2: 172, stroke: hit.under ? BAD : LINE, 'stroke-width': 1 }, g);
    // 급수/오물탱크(표시만)
    g = zone('tank');
    el('rect', { x: 490, y: 148, width: 90, height: 18, rx: 9, fill: '#fff', stroke: LINE, 'stroke-width': 1 }, g);
    // 연결기
    g = zone('coupler');
    el('rect', Object.assign({ x: 740, y: 124, width: 36, height: 14, fill: fill('coupler', BODY) }, stroke('coupler')), g);
    el('line', { x1: 748, y1: 124, x2: 748, y2: 138, stroke: hit.coupler ? BAD : LINE, 'stroke-width': 1 }, g);
  }

  function render(container, items, opts) {
    opts = opts || {};
    const click = !opts.static && typeof opts.onClick === 'function' ? opts.onClick : null;
    container.textContent = '';
    const defects = (items || []).filter((i) => i && i.status === 'defect')
      .map((i, idx) => ({ it: i, idx: idx, z: zoneOf(i), r: (URG[i.urgency] || { rank: 9 }).rank }))
      .sort((a, b) => a.r - b.r || a.idx - b.idx);
    defects.forEach((d, n) => { d.n = n + 1; });
    const hit = {};
    defects.forEach((d) => { hit[d.z] = true; });

    const wrap = htm('div', 'dg' + (opts.static ? ' dg-static' : ''));
    const svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', 'aria-label': '차량 측면도 불량 위치', xmlns: NS });
    svg.setAttribute('class', 'dg-svg');
    svg.style.width = '100%'; svg.style.height = 'auto';
    el('rect', { x: 0, y: 0, width: W, height: H, fill: '#fff' }, svg);
    drawTrain(svg, hit);

    // 마커: zone별로 나란히
    const byZone = {};
    defects.forEach((d) => { (byZone[d.z] = byZone[d.z] || []).push(d); });
    Object.keys(byZone).forEach((z) => {
      const list = byZone[z], a = ANCHOR[z] || ANCHOR.body, gap = 22;
      list.forEach((d, i) => {
        const x = a[0] + (i - (list.length - 1) / 2) * gap, y = a[1];
        const col = (URG[d.it.urgency] || URG.next).color;
        const g = el('g', { 'data-marker': d.n }, svg);
        el('circle', { cx: x, cy: y, r: 10, fill: col, stroke: '#fff', 'stroke-width': 1 }, g);
        const t = el('text', { x: x, y: y, dy: '0.35em', 'text-anchor': 'middle', fill: '#fff', 'font-size': 11, 'font-weight': 700, 'font-family': 'Pretendard, sans-serif' }, g);
        t.textContent = String(d.n);
        if (click) {
          g.style.cursor = 'pointer';
          g.addEventListener('click', () => click(d.it.key));
        }
      });
    });
    wrap.appendChild(svg);
    wrap.appendChild(htm('p', 'dg-note', '부위는 분야 기준 대략 위치입니다. (시연용 도식)'));

    if (!defects.length) {
      wrap.appendChild(htm('p', 'dg-none', '불량 없음'));
    } else {
      const ul = htm('ul', 'dg-legend');
      defects.forEach((d) => {
        const u = URG[d.it.urgency] || URG.next;
        const text = circled(d.n) + ' [' + u.label + '] ' + (d.it.section || '') + ' · ' + (d.it.label || '');
        const li = htm('li', null);
        const row = click ? htm('button', 'dg-row') : htm('span', 'dg-row');
        if (click) { row.type = 'button'; row.addEventListener('click', () => click(d.it.key)); }
        const dot = htm('span', 'dg-dot');
        dot.style.background = u.color;
        row.appendChild(dot);
        row.appendChild(htm('span', null, text));
        li.appendChild(row);
        ul.appendChild(li);
      });
      wrap.appendChild(ul);
    }
    container.appendChild(wrap);
  }

  window.Diagram = { render: render };
})();
