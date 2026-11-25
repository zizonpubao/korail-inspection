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

  // zone별 마커 기준점 (차량 로컬 좌표)
  const ANCHOR = {
    cab: [6.0, 1.3, 0], body: [0, 1.4, 0.85], door: [-2.5, 1.0, 0.85], pantograph: [0, 2.9, 0],
    hvac: [2.6, 2.3, 0], bogie: [3.2, 0.6, 0.95], under: [-0.2, 0.0, 0.6], coupler: [-5.6, 0.8, 0], window: [1, 1.5, 0.85]
  };

  function build(T) {
    const root = new T.Group();
    const zoneMeshes = {};
    const wheels = [];
    function add(zone, geo, color, x, y, z) {
      const m = new T.Mesh(geo, new T.MeshLambertMaterial({ color: color }));
      m.position.set(x, y, z);
      m.userData.zone = zone;
      root.add(m);
      (zoneMeshes[zone] = zoneMeshes[zone] || []).push(m);
      return m;
    }
    const GRAY = '#E9EDF2', BLUE = '#005BAC', DARK = '#8C96A3';
    add('body', new T.BoxGeometry(10, 1.6, 1.4), GRAY, 0, 1.2, 0);
    [0.71, -0.71].forEach((z) => add('window', new T.BoxGeometry(8.4, 0.35, 0.04), BLUE, 0, 1.55, z));
    const nose = add('cab', new T.ConeGeometry(0.8, 1.6, 12), GRAY, 5.8, 1.2, 0);
    nose.rotation.z = -Math.PI / 2;
    [-2.5, 1.5].forEach((x) => [0.72, -0.72].forEach((z) => add('door', new T.BoxGeometry(0.9, 1.3, 0.05), '#FFFFFF', x, 1.05, z)));
    const l1 = add('pantograph', new T.CylinderGeometry(0.04, 0.04, 1.3, 6), DARK, -0.35, 2.4, 0); l1.rotation.z = 0.5;
    const l2 = add('pantograph', new T.CylinderGeometry(0.04, 0.04, 1.3, 6), DARK, 0.35, 2.4, 0); l2.rotation.z = -0.5;
    add('pantograph', new T.BoxGeometry(0.9, 0.05, 0.1), DARK, 0, 3.0, 0);
    add('hvac', new T.BoxGeometry(2.2, 0.35, 0.9), DARK, 2.6, 2.17, 0);
    [-3.2, 3.2].forEach((x) => {
      add('bogie', new T.BoxGeometry(2.0, 0.2, 0.9), DARK, x, 0.45, 0);
      [-0.6, 0.6].forEach((dx) => [0.5, -0.5].forEach((z) => {
        const w = add('bogie', new T.CylinderGeometry(0.3, 0.3, 0.12, 16), '#4A4F57', x + dx, 0.3, z);
        w.rotation.x = Math.PI / 2;
        wheels.push(w);
      }));
    });
    add('under', new T.BoxGeometry(3, 0.35, 1.0), DARK, 0, 0.3, 0);
    add('coupler', new T.BoxGeometry(0.6, 0.25, 0.35), DARK, -5.3, 0.8, 0);
    return { root: root, zoneMeshes: zoneMeshes, wheels: wheels };
  }

  function destroy(container) {
    const s = container && container._v3d;
    if (!s) return;
    s.dead = true;
    if (s.raf) cancelAnimationFrame(s.raf);
    if (s.ro) s.ro.disconnect();
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
      renderer.setClearColor(0xffffff, 1);
      renderer.domElement.className = 'v3d-canvas';
      host.appendChild(renderer.domElement);

      const scene = new T.Scene();
      scene.background = new T.Color('#FFFFFF');
      scene.add(new T.AmbientLight(0xffffff, 0.75));
      const dl = new T.DirectionalLight(0xffffff, 0.6); dl.position.set(5, 10, 7); scene.add(dl);
      scene.add(new T.GridHelper(24, 24, '#E3E8EF', '#E3E8EF'));
      const camera = new T.PerspectiveCamera(40, w0 / h0, 0.1, 100);
      camera.position.set(0, 4.5, 17); camera.lookAt(0, 1.2, 0);

      const built = build(T);
      const train = built.root;
      scene.add(train);
      Object.keys(byZone).forEach((z) => {
        const c = COL[byZone[z][0].it.urgency] || COL.next;
        (built.zoneMeshes[z] || []).forEach((m) => { m.material.color.set(c); m.material.emissive.set(c); m.material.emissiveIntensity = 0.25; });
      });

      const s = { host: host, renderer: renderer, labels: [], raf: 0, dead: false };
      container._v3d = s;
      const markers = [];
      Object.keys(byZone).forEach((z) => {
        const list = byZone[z], a = ANCHOR[z] || ANCHOR.body;
        list.forEach((d, i) => {
          const off = (i - (list.length - 1) / 2) * 0.6;
          const alongZ = (z === 'cab' || z === 'pantograph' || z === 'hvac');
          const col = COL[d.it.urgency] || COL.next;
          const m = new T.Mesh(new T.SphereGeometry(0.16, 12, 12), new T.MeshBasicMaterial({ color: col }));
          m.position.set(a[0] + (alongZ ? 0 : off), a[1] + 0.35, a[2] + (alongZ ? off : 0));
          train.add(m);
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

      train.rotation.y = -0.6;
      let auto = true, drag = null;
      const cv = renderer.domElement;
      cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; auto = false; try { cv.setPointerCapture(e.pointerId); } catch (x) { /* noop */ } });
      cv.addEventListener('pointermove', (e) => {
        if (!drag) return;
        train.rotation.y += (e.clientX - drag.x) * 0.01;
        train.rotation.x = Math.max(-0.3, Math.min(0.4, train.rotation.x + (e.clientY - drag.y) * 0.004));
        drag = { x: e.clientX, y: e.clientY };
      });
      const end = () => { drag = null; };
      cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);

      function resize() {
        const w = host.clientWidth, h = host.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h);
        camera.aspect = w / h; camera.updateProjectionMatrix();
      }
      if (window.ResizeObserver) { s.ro = new ResizeObserver(resize); s.ro.observe(host); }

      const v = new T.Vector3();
      function loop() {
        if (s.dead) return;
        if (!container.isConnected) { destroy(container); return; }
        s.raf = requestAnimationFrame(loop);
        if (auto) train.rotation.y += 0.004;
        built.wheels.forEach((m) => { m.rotation.y += 0.05; });
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
