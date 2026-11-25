/* 불량 위치 3D 보기 (시연용). window.View3D.render(container, items, opts) -> Promise, destroy(container) */
(function () {
  'use strict';
  const SRC = 'https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js';
  const COL = { immediate: '#C62828', today: '#E08600', next: '#77777A' };
  const RANK = { immediate: 1, today: 2, next: 3 };
  let loading = null;

  function loadThree() {
    if (window.THREE) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = SRC;
      s.onload = () => (window.THREE ? res() : rej(new Error('no THREE')));
      s.onerror = () => rej(new Error('load fail'));
      document.head.appendChild(s);
    }).catch((e) => { loading = null; throw e; });
    return loading;
  }
  const circled = (n) => (n >= 1 && n <= 20 ? String.fromCharCode(0x2460 + n - 1) : String(n));

  // zone별 마커 기준점 (차량 로컬 좌표, 레일 윗면 y=0)
  const ANCHOR = {
    cab: [6.0, 3.1, 0], body: [-0.5, 2.0, 1.46], door: [-4.5, 3.1, 1.46], pantograph: [-1.4, 5.4, 0],
    hvac: [2.0, 4.0, 0], bogie: [2.6, 0.8, 1.0], under: [-0.35, 0.4, 0.9], coupler: [-6.9, 1.0, 0], window: [-0.7, 2.9, 1.42]
  };
  const ALONG_Z = { cab: 1, pantograph: 1, hvac: 1, coupler: 1 };

  // 차체 단면(아래 평평, 위 둥근 라운드 사각형)
  function bodyShape(T, hw, yb, yt, r) {
    const s = new T.Shape(), c = 0.12;
    s.moveTo(-hw + c, yb); s.lineTo(hw - c, yb); s.quadraticCurveTo(hw, yb, hw, yb + c);
    s.lineTo(hw, yt - r); s.bezierCurveTo(hw, yt - r * 0.45, hw - r * 0.45, yt, hw - r, yt);
    s.lineTo(-hw + r, yt); s.bezierCurveTo(-hw + r * 0.45, yt, -hw, yt - r * 0.45, -hw, yt - r);
    s.lineTo(-hw, yb + c); s.quadraticCurveTo(-hw, yb, -hw + c, yb);
    return s;
  }
  function roundRect(T, w, h, r) {
    const s = new T.Shape(), x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }

  // 단면 점들을 길이 방향으로 점점 줄여가며 이어 붙인 유선형 노즈(또는 그 일부 띠)
  const fw = (t) => Math.max(0.05, Math.pow(1 - Math.pow(t, 2.4), 0.6));
  const fv = (t) => Math.max(0.05, Math.pow(1 - Math.pow(t, 1.8), 0.6));
  function loft(T, pts, o) {
    const idx = [];
    pts.forEach((p, i) => { if (!o.filter || o.filter(p)) idx.push(i); });
    const n = idx.length, pos = [], ind = [];
    for (let r = 0; r <= o.segs; r++) {
      const t = o.t0 + (o.t1 - o.t0) * r / o.segs;
      const sw = fw(t) * o.boost, sv = fv(t) * o.boost, off = -1.0 * Math.pow(t, 2.2);
      idx.forEach((i) => {
        const p = pts[i];
        pos.push(o.x0 + o.len * t, o.yc + (p.y - o.yc) * sv + off, p.x * sw);
      });
    }
    for (let r = 0; r < o.segs; r++) {
      for (let i = 0; i < n - 1; i++) {
        const a = r * n + i, b = a + 1, c = a + n, d = c + 1;
        ind.push(a, c, b, b, c, d);
      }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setIndex(ind);
    g.computeVertexNormals();
    return g;
  }

  function build(T, reg) {
    const train = new T.Group();
    const zoneMeshes = {};
    const G = (g) => { reg.push(g); return g; };
    const M = (o) => { const m = new T.MeshStandardMaterial(o); reg.push(m); return m; };
    function tag(m, zone) {
      if (!zone) return m;
      m.userData.zone = zone; m.userData.orig = m.material;
      (zoneMeshes[zone] = zoneMeshes[zone] || []).push(m);
      return m;
    }
    function part(zone, geo, mat, x, y, z) {
      const m = new T.Mesh(geo, mat); m.position.set(x, y, z); train.add(m); return tag(m, zone);
    }
    function inst(zone, geo, mat, pts) {
      const im = new T.InstancedMesh(geo, mat, pts.length), d = new T.Object3D();
      pts.forEach((p, i) => { d.position.set(p[0], p[1], p[2]); d.updateMatrix(); im.setMatrixAt(i, d.matrix); });
      im.instanceMatrix.needsUpdate = true;
      train.add(im); return tag(im, zone);
    }
    function limb(zone, a, b, th, z, mat) {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const m = part(zone, G(new T.BoxGeometry(len, th, th)), mat, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z);
      m.rotation.z = Math.atan2(b[1] - a[1], b[0] - a[0]);
      return m;
    }

    const mBody = M({ color: '#F2F4F7', metalness: 0.3, roughness: 0.45 });
    const mBlue = M({ color: '#005BAC', metalness: 0.25, roughness: 0.45 });
    const mCyan = M({ color: '#00B2E3', metalness: 0.2, roughness: 0.4 });
    const mGlass = M({ color: '#1B2733', metalness: 0.6, roughness: 0.15 });
    const mDark = M({ color: '#4A515B', metalness: 0.5, roughness: 0.55 });
    const mGray = M({ color: '#8C96A3', metalness: 0.5, roughness: 0.5 });
    const mMetal = M({ color: '#B4BCC6', metalness: 0.8, roughness: 0.35 });
    const mDoor = M({ color: '#DDE3EA', metalness: 0.3, roughness: 0.5 });
    const mRubber = M({ color: '#2F343B', metalness: 0.1, roughness: 0.9 });
    const mWs = M({ color: '#141C26', metalness: 0.7, roughness: 0.12, transparent: true, opacity: 0.82, side: T.DoubleSide });
    const mNose = M({ color: '#F2F4F7', metalness: 0.3, roughness: 0.45, side: T.DoubleSide });

    const HW = 1.4, YB = 0.95, YT = 3.6, YC = (YB + YT) / 2, X0 = -6, L = 10;
    const shape = bodyShape(T, HW, YB, YT, 0.65);

    // 차체 (압출)
    const bg = G(new T.ExtrudeGeometry(shape, { depth: L, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 2, curveSegments: 10, steps: 1 }));
    bg.rotateY(Math.PI / 2); bg.translate(X0, 0, 0);
    part('body', bg, mBody, 0, 0, 0);
    // 도장 띠(Korail Blue + 포인트 Light Blue)
    const bandGeo = G(new T.BoxGeometry(L, 0.65, 0.04)), lineGeo = G(new T.BoxGeometry(L, 0.05, 0.04));
    [1.46, -1.46].forEach((z) => {
      part('body', bandGeo, mBlue, X0 + L / 2, 1.7, z);
      part('body', lineGeo, mCyan, X0 + L / 2, 2.1, z);
    });

    // 전두부 노즈 + 운전실 앞유리
    const pts = shape.getSpacedPoints(60);
    const nose = new T.Mesh(G(loft(T, pts, { x0: X0 + L, len: 4.3, segs: 12, t0: 0, t1: 1, yc: YC, boost: 1 })), mNose);
    train.add(nose); tag(nose, 'cab');
    const ws = new T.Mesh(G(loft(T, pts, { x0: X0 + L, len: 4.3, segs: 8, t0: 0.1, t1: 0.62, yc: YC, boost: 1.02, filter: (p) => p.y > 2.75 && Math.abs(p.x) < 1.0 })), mWs);
    train.add(ws);
    const lampGeo = G(new T.SphereGeometry(0.1, 10, 8));
    [0.45, -0.45].forEach((z) => part('cab', lampGeo, M({ color: '#FFF6D6', emissive: '#FFE9A0', emissiveIntensity: 0.6 }), 7.0, 1.5, z));

    // 측면 창문 열 (InstancedMesh)
    const wg = G(new T.ExtrudeGeometry(roundRect(T, 0.8, 0.7, 0.14), { depth: 0.05, bevelEnabled: false, curveSegments: 6 }));
    wg.translate(0, 0, -0.025);
    const wp = [];
    for (let i = 0; i < 6; i++) [1.47, -1.47].forEach((z) => wp.push([-3.2 + i * 1.0, 2.65, z]));
    inst('window', wg, mGlass, wp);

    // 출입문 2개 (윤곽 + 패널 + 작은 창)
    const dp = [];
    [-4.5, 3.0].forEach((x) => [1, -1].forEach((s) => dp.push([x, s])));
    inst('door', G(new T.BoxGeometry(1.14, 2.1, 0.03)), mDark, dp.map((d) => [d[0], 2.05, d[1] * 1.455]));
    inst('door', G(new T.BoxGeometry(1.0, 1.96, 0.04)), mDoor, dp.map((d) => [d[0], 2.05, d[1] * 1.47]));
    inst('door', G(new T.BoxGeometry(0.42, 0.55, 0.05)), mGlass, dp.map((d) => [d[0], 2.7, d[1] * 1.485]));

    // 지붕: 애자, 팬터그래프, 공조 장치
    const insGeo = G(new T.CylinderGeometry(0.07, 0.09, 0.22, 10));
    inst('pantograph', insGeo, mGray, [[-3.6, 3.7, 0], [-2.9, 3.7, 0], [-2.2, 3.7, 0]]);
    [0.35, -0.35].forEach((z) => part('pantograph', insGeo, mGray, -1.4, 3.7, z));
    part('pantograph', G(new T.BoxGeometry(1.3, 0.08, 0.9)), mDark, -1.4, 3.84, 0);
    const A = [-1.8, 3.9], K = [-0.9, 4.9], H = [-1.6, 5.7];
    const lowG = new T.BoxGeometry(1, 0.07, 0.07), upG = lowG; // 길이는 limb에서 별도 생성
    void lowG; void upG;
    [0.3, -0.3].forEach((z) => { limb('pantograph', A, K, 0.08, z, mDark); limb('pantograph', K, H, 0.07, z, mDark); });
    part('pantograph', G(new T.BoxGeometry(0.06, 0.06, 0.7)), mDark, K[0], K[1], 0);
    part('pantograph', G(new T.BoxGeometry(0.16, 0.06, 1.7)), mMetal, H[0], H[1] + 0.04, 0);
    part('hvac', G(new T.BoxGeometry(2.4, 0.28, 1.1)), mGray, 2.0, 3.74, 0);
    part('hvac', G(new T.CylinderGeometry(0.3, 0.3, 0.08, 18)), mDark, 2.7, 3.92, 0);
    part('hvac', G(new T.BoxGeometry(0.9, 0.06, 0.8)), mDark, 1.4, 3.91, 0);

    // 대차 2개: 사이드 프레임 + 가로보 + 차륜/차축/스프링
    const BX = [-3.6, 2.6];
    const wheelG = G(new T.CylinderGeometry(0.46, 0.46, 0.13, 22)); wheelG.rotateX(Math.PI / 2);
    const hubG = G(new T.CylinderGeometry(0.3, 0.3, 0.17, 16)); hubG.rotateX(Math.PI / 2);
    const axleG = G(new T.CylinderGeometry(0.07, 0.07, 1.6, 8)); axleG.rotateX(Math.PI / 2);
    const wp2 = [], ax = [], sp = [], sf = [], cb = [];
    BX.forEach((x) => {
      cb.push([x, 0.7, 0]);
      [0.95, -0.95].forEach((dx) => {
        ax.push([x + dx, 0.46, 0]);
        [0.72, -0.72].forEach((z) => wp2.push([x + dx, 0.46, z]));
        [0.92, -0.92].forEach((z) => sp.push([x + dx, 0.87, z]));
      });
      [0.92, -0.92].forEach((z) => sf.push([x, 0.7, z]));
    });
    inst('bogie', wheelG, mMetal, wp2);
    inst('bogie', hubG, mDark, wp2);
    inst('bogie', axleG, mGray, ax);
    inst('bogie', G(new T.CylinderGeometry(0.1, 0.1, 0.15, 10)), mMetal, sp);
    inst('bogie', G(new T.BoxGeometry(2.5, 0.2, 0.1)), mDark, sf);
    inst('bogie', G(new T.BoxGeometry(0.3, 0.2, 1.84)), mDark, cb);

    // 하부: 스커트 + 기기함(추진·변환장치)
    [1.32, -1.32].forEach((z) => part('under', G(new T.BoxGeometry(3.9, 0.3, 0.06)), mGray, -0.5, 0.8, z));
    part('under', G(new T.BoxGeometry(1.1, 0.6, 1.8)), mDark, -1.75, 0.65, 0);
    part('under', G(new T.BoxGeometry(1.3, 0.6, 1.8)), mGray, -0.35, 0.65, 0);
    part('under', G(new T.BoxGeometry(0.8, 0.5, 1.5)), mDark, 0.95, 0.7, 0);

    // 반대쪽 끝: 연결 덮개 + 연결기
    const cg = G(new T.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: false, curveSegments: 8 }));
    cg.rotateY(Math.PI / 2); cg.translate(X0 - 0.55, 0, 0);
    const cov = part('coupler', cg, mRubber, 0, YC * (1 - 0.88), 0);
    cov.scale.set(1, 0.88, 0.88);
    const shaft = part('coupler', G(new T.CylinderGeometry(0.1, 0.1, 0.9, 10)), mDark, -6.95, 1.05, 0);
    shaft.rotation.z = Math.PI / 2;
    part('coupler', G(new T.BoxGeometry(0.35, 0.3, 0.42)), mGray, -7.45, 1.05, 0);

    return { root: train, zoneMeshes: zoneMeshes };
  }

  function destroy(container) {
    const s = container && container._v3d;
    if (!s) return;
    s.dead = true;
    if (s.raf) cancelAnimationFrame(s.raf);
    if (s.ro) s.ro.disconnect();
    try { s.reg.forEach((o) => o.dispose && o.dispose()); } catch (e) { /* noop */ }
    try { s.renderer.dispose(); } catch (e) { /* noop */ }
    s.labels.forEach((l) => l.remove());
    if (s.host && s.host.parentNode) s.host.parentNode.removeChild(s.host);
    container._v3d = null;
  }

  function render(container, items, opts) {
    opts = opts || {};
    destroy(container);
    return loadThree().then(() => {
      const T = window.THREE;
      if (T.ColorManagement) T.ColorManagement.legacyMode = false;
      const zoneOf = (window.Diagram && window.Diagram.zoneOf) || (() => 'body');
      const defects = (items || []).filter((i) => i && i.status === 'defect')
        .map((i, idx) => ({ it: i, idx: idx, z: zoneOf(i), r: RANK[i.urgency] || 9 }))
        .sort((a, b) => a.r - b.r || a.idx - b.idx);
      defects.forEach((d, n) => { d.n = n + 1; });
      const byZone = {};
      defects.forEach((d) => { (byZone[d.z] = byZone[d.z] || []).push(d); });

      const host = document.createElement('div');
      host.className = 'v3d';
      container.appendChild(host);
      const w0 = Math.max(host.clientWidth || container.clientWidth || 320, 200);
      const h0 = host.clientHeight || 260;
      const renderer = new T.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w0, h0);
      renderer.outputEncoding = T.sRGBEncoding;
      renderer.toneMapping = T.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      renderer.setClearColor('#F5F7FA', 1);
      renderer.domElement.className = 'v3d-canvas';
      host.appendChild(renderer.domElement);

      const reg = [];
      const R = (o) => { reg.push(o); return o; };
      const scene = new T.Scene();
      scene.background = new T.Color('#F5F7FA');
      scene.fog = new T.Fog('#F5F7FA', 32, 85);
      scene.add(new T.HemisphereLight(0xffffff, 0xaab4c0, 1.0));
      const dl = new T.DirectionalLight(0xffffff, 1.5); dl.position.set(6, 12, 9); scene.add(dl);

      // 선로: 자갈 평면 + 침목 + 레일 2줄
      const mat = (c, m, r) => R(new T.MeshStandardMaterial({ color: c, metalness: m, roughness: r }));
      const ground = new T.Mesh(R(new T.PlaneGeometry(240, 240)), mat('#E6EAF0', 0, 1));
      ground.rotation.x = -Math.PI / 2; ground.position.y = -0.16; scene.add(ground);
      const ballast = new T.Mesh(R(new T.BoxGeometry(90, 0.3, 6)), mat('#6A6F76', 0, 1));
      ballast.position.y = -0.05; scene.add(ballast);
      const sleepers = new T.InstancedMesh(R(new T.BoxGeometry(0.3, 0.12, 3.0)), mat('#8A8D92', 0, 0.9), 120);
      const dm = new T.Object3D();
      for (let i = 0; i < 120; i++) { dm.position.set(-45 + i * 0.75, 0.06, 0); dm.updateMatrix(); sleepers.setMatrixAt(i, dm.matrix); }
      scene.add(sleepers);
      const railG = R(new T.BoxGeometry(90, 0.16, 0.1)), railM = mat('#B9C0C8', 0.8, 0.4);
      [0.72, -0.72].forEach((z) => { const r = new T.Mesh(railG, railM); r.position.set(0, 0.2, z); scene.add(r); });

      const camera = new T.PerspectiveCamera(38, w0 / h0, 0.1, 200);
      const target = new T.Vector3(0.4, 2.0, 0);
      const cam = { theta: 0.75, phi: 1.3, r: 20 };
      function fit() {
        const a = Math.max(1, Math.min(1.9, camera.aspect));
        cam.r = 31 / a;
      }
      fit();

      const built = build(T, reg);
      const train = built.root;
      train.position.y = 0.28; // 레일 위
      scene.add(train);

      // 불량 zone 재질: 긴급도 색 + emissive 펄스
      const hl = [];
      Object.keys(byZone).forEach((z) => {
        const c = COL[byZone[z][0].it.urgency] || COL.next;
        const m = R(new T.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.4, metalness: 0.2, roughness: 0.5 }));
        hl.push(m);
        (built.zoneMeshes[z] || []).forEach((mesh) => { mesh.material = m; });
      });

      const s = { host: host, renderer: renderer, labels: [], raf: 0, dead: false, reg: reg };
      container._v3d = s;
      const markers = [];
      Object.keys(byZone).forEach((z) => {
        const list = byZone[z], a = ANCHOR[z] || ANCHOR.body;
        list.forEach((d, i) => {
          const off = (i - (list.length - 1) / 2) * 0.8;
          const az = ALONG_Z[z];
          const col = COL[d.it.urgency] || COL.next;
          const ax = a[0] + (az ? 0 : off), ay = a[1], aza = a[2] + (az ? off : 0);
          const mx = ax, my = ay + 0.9, mz = aza + (aza > 0.5 ? 0.5 : aza < -0.5 ? -0.5 : 0);
          const m = new T.Mesh(R(new T.SphereGeometry(0.16, 12, 12)), R(new T.MeshBasicMaterial({ color: col })));
          m.position.set(mx, my, mz);
          train.add(m);
          const lg = R(new T.BufferGeometry().setFromPoints([new T.Vector3(ax, ay, aza), new T.Vector3(mx, my, mz)]));
          train.add(new T.Line(lg, R(new T.LineBasicMaterial({ color: col }))));
          const lab = document.createElement('div');
          lab.className = 'v3d-label';
          lab.textContent = circled(d.n);
          lab.style.background = col;
          if (typeof opts.onClick === 'function') lab.addEventListener('click', () => opts.onClick(d.it.key));
          host.appendChild(lab);
          s.labels.push(lab);
          markers.push({ mesh: m, lab: lab });
        });
      });

      let auto = true, drag = null;
      const cv = renderer.domElement;
      cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; auto = false; try { cv.setPointerCapture(e.pointerId); } catch (x) { /* noop */ } });
      cv.addEventListener('pointermove', (e) => {
        if (!drag) return;
        cam.theta -= (e.clientX - drag.x) * 0.008;
        cam.phi = Math.max(0.5, Math.min(1.45, cam.phi - (e.clientY - drag.y) * 0.005));
        drag = { x: e.clientX, y: e.clientY };
      });
      const end = () => { drag = null; };
      cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);

      function resize() {
        const w = host.clientWidth, h = host.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h);
        camera.aspect = w / h; camera.updateProjectionMatrix(); fit();
      }
      if (window.ResizeObserver) { s.ro = new ResizeObserver(resize); s.ro.observe(host); }

      const v = new T.Vector3();
      const t0 = performance.now();
      function loop() {
        if (s.dead) return;
        if (!container.isConnected) { destroy(container); return; }
        s.raf = requestAnimationFrame(loop);
        if (auto) cam.theta += 0.0035;
        const sp = Math.sin(cam.phi);
        camera.position.set(target.x + cam.r * sp * Math.cos(cam.theta), target.y + cam.r * Math.cos(cam.phi), target.z + cam.r * sp * Math.sin(cam.theta));
        camera.lookAt(target);
        const k = 0.4 + 0.2 * Math.sin((performance.now() - t0) / 1000 * 3.2);
        hl.forEach((m) => { m.emissiveIntensity = k; });
        renderer.render(scene, camera);
        const w = host.clientWidth, h = host.clientHeight;
        markers.forEach((mk) => {
          mk.mesh.getWorldPosition(v);
          v.y += 0.3;
          v.project(camera);
          mk.lab.style.display = v.z > 1 ? 'none' : '';
          mk.lab.style.left = ((v.x * 0.5 + 0.5) * w) + 'px';
          mk.lab.style.top = ((-v.y * 0.5 + 0.5) * h) + 'px';
        });
      }
      loop();
    });
  }

  window.View3D = { render: render, destroy: destroy };
})();
