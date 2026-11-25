/* AI 연동: Teachable Machine(사진 판정 보조) + Gemini(/api/report) */
(function () {
  var TF_URL = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@1.3.1/dist/tf.min.js';
  var TM_URL = 'https://cdn.jsdelivr.net/npm/@teachablemachine/image@0.8.5/dist/teachablemachine-image.min.js';
  var TIMEOUT_MS = 20000;

  var modelPromise = null;
  var warned = false;

  function warnOnce(msg, e) {
    if (warned) return;
    warned = true;
    console.warn('[AI] ' + msg, e && e.message ? e.message : '');
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('스크립트 로드 실패')); };
      document.head.appendChild(s);
    });
  }

  function loadModel() {
    if (modelPromise) return modelPromise;
    var cfg = window.APP_CONFIG || {};
    var url = (cfg.TM_MODEL_URL || '').trim();
    if (!url) {
      modelPromise = Promise.resolve(null);
      return modelPromise;
    }
    if (url.charAt(url.length - 1) !== '/') url += '/';
    modelPromise = (async function () {
      try {
        if (!window.tf) await loadScript(TF_URL);
        if (!window.tmImage) await loadScript(TM_URL);
        return await window.tmImage.load(url + 'model.json', url + 'metadata.json');
      } catch (e) {
        warnOnce('Teachable Machine 모델을 불러오지 못했습니다.', e);
        return null;
      }
    })();
    return modelPromise;
  }

  async function tmAvailable() {
    try { return !!(await loadModel()); } catch (e) { return false; }
  }

  async function classify(el) {
    var model = await loadModel();
    if (!model) throw new Error('AI 모델을 사용할 수 없습니다');
    var preds = await model.predict(el);
    var probs = {};
    var top = null, best = -1;
    for (var i = 0; i < preds.length; i++) {
      var p = preds[i];
      probs[p.className] = p.probability;
      if (p.probability > best) { best = p.probability; top = p.className; }
    }
    return { top: top, prob: best, probs: probs };
  }

  async function post(url, body, raw, timeoutMs) {
    if (location.protocol === 'file:') throw new Error('file:// 에서는 AI 보고서를 쓸 수 없습니다');
    var token = await window.DB.accessToken();
    if (!token) throw new Error('로그인 필요');
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, timeoutMs || TIMEOUT_MS);
    try {
      var res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify(body),
        signal: ctrl.signal
      });
      var data = null;
      try { data = await res.json(); } catch (e) { /* 본문 없음 */ }
      if (!res.ok) throw new Error((data && data.error) || ('요청 실패 (' + res.status + ')'));
      if (raw) return data;
      if (!data || typeof data.text !== 'string' || !data.text) throw new Error('빈 응답');
      return data.text;
    } catch (e) {
      if (e && e.name === 'AbortError') throw new Error('응답 시간 초과');
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  function report(payload) {
    var body = Object.assign({}, payload, { mode: 'report' });
    return post('/api/report', body);
  }

  function trend(arg) {
    var stats = arg, period;
    if (arg && !Array.isArray(arg) && typeof arg === 'object' && 'stats' in arg) {
      stats = arg.stats;
      period = arg.period;
    }
    return post('/api/report?mode=trend', { mode: 'trend', stats: stats, period: period });
  }

  function vision(dataUrl, item) {
    return post('/api/report', { mode: 'vision', image: dataUrl, item: item }, true).then(function (d) {
      var r = d && d.result;
      if (!r || typeof r.verdict !== 'string') throw new Error('빈 응답');
      return { verdict: r.verdict, confidence: r.confidence, reason: r.reason };
    });
  }

  function brief(payload) {
    return post('/api/report', Object.assign({}, payload, { mode: 'brief' }));
  }

  function sendJournal(p) {
    return post('/api/send-journal', {
      filename: p.filename, pdfBase64: p.pdfBase64, subject: p.subject, summary: p.summary
    }, true, 30000).then(function (d) {
      if (!d || !d.ok) throw new Error('발송 실패');
      return { ok: true, to: d.to };
    });
  }

  function serverAvailable() {
    var p = location.protocol, h = location.hostname;
    return (p === 'http:' || p === 'https:') && h !== 'localhost' && h !== '127.0.0.1';
  }

  window.AI = { tmAvailable: tmAvailable, classify: classify, report: report, trend: trend,
    vision: vision, brief: brief, sendJournal: sendJournal, serverAvailable: serverAvailable };
})();
