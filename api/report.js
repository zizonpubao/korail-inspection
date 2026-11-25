// Vercel 함수: Supabase 토큰 검증 후 Gemini 호출 위임
const { generate } = require('./_gemini.js');

function send(res, code, obj) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return send(res, 405, { error: 'method_not_allowed' });
  }
  // Vercel에 어떤 이름으로 등록해도 동작하도록 여러 이름을 받는다
  const env = process.env;
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = env.SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY
    || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return send(res, 500, { error: 'server_not_configured' });

  const m = /^Bearer\s+(\S+)$/i.exec(req.headers['authorization'] || '');
  if (!m) return send(res, 401, { error: 'unauthorized' });
  try {
    const r = await fetch(url.replace(/\/+$/, '') + '/auth/v1/user', {
      headers: { apikey: anon, Authorization: 'Bearer ' + m[1] }
    });
    if (!r.ok) return send(res, 401, { error: 'unauthorized' });
  } catch (e) {
    return send(res, 502, { error: 'upstream' });
  }

  let body = req.body;
  const MAX_ANY = 3000000;
  if (typeof body === 'string' && body.length > MAX_ANY) return send(res, 413, { error: 'payload_too_large' });
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { return send(res, 400, { error: 'bad_request' }); }
  }
  if (!body || typeof body !== 'object') body = {};
  const q = req.query || {};
  const mode = String(q.mode || body.mode || 'report');
  if (['report', 'trend', 'vision', 'brief'].indexOf(mode) < 0) return send(res, 400, { error: 'bad_mode' });
  let len = 0;
  try { len = JSON.stringify(body).length; } catch (e) { return send(res, 400, { error: 'bad_request' }); }
  if (len > (mode === 'vision' ? MAX_ANY : 50000)) return send(res, 413, { error: 'payload_too_large' });
  if (mode === 'vision') {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(body.image || ''));
    if (!m) return send(res, 400, { error: 'bad_image' });
    const pad = m[2].endsWith('==') ? 2 : m[2].endsWith('=') ? 1 : 0;
    if (Math.floor(m[2].length * 3 / 4) - pad > 2 * 1024 * 1024) return send(res, 413, { error: 'image_too_large' });
  }
  if (mode === 'brief') {
    const cutS = (v) => {
      if (typeof v === 'string') return v.slice(0, 100);
      if (Array.isArray(v)) return v.map(cutS);
      if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = cutS(v[k]); return o; }
      return v;
    };
    body = {
      mode: 'brief',
      period: cutS(body.period),
      kpis: cutS(body.kpis),
      topDefects: cutS(Array.isArray(body.topDefects) ? body.topDefects.slice(0, 10) : []),
      trains: cutS(Array.isArray(body.trains) ? body.trains.slice(0, 15) : [])
    };
  }
  if (Array.isArray(body.defects) && body.defects.length > 50) {
    return send(res, 400, { error: 'too_many_defects' });
  }
  if (mode === 'trend' && Array.isArray(body.stats) && body.stats.length > 30) {
    return send(res, 400, { error: 'too_many_stats' });
  }
  if (mode === 'report') {
    const cut = (o, n) => {
      if (!o || typeof o !== 'object') return o;
      const out = Array.isArray(o) ? [] : {};
      for (const k of Object.keys(o)) out[k] = typeof o[k] === 'string' ? o[k].slice(0, n) : o[k];
      return out;
    };
    if (Array.isArray(body.defects)) body.defects = body.defects.map((d) => cut(d, 500));
    if (body.info && typeof body.info === 'object') body.info = cut(body.info, 100);
  }

  try {
    const out = await generate(mode, body);
    if (mode === 'vision') return send(res, 200, { result: out });
    return send(res, 200, { text: out });
  } catch (err) {
    const code = err && err.code;
    if (code === 'TIMEOUT') return send(res, 504, { error: 'timeout' });
    if (code === 'NO_KEY') return send(res, 500, { error: 'gemini_not_configured' });
    return send(res, 502, { error: 'upstream' + (err && err.detail ? ': ' + err.detail : (err && err.message ? ': ' + err.message : '')) });
  }
};
