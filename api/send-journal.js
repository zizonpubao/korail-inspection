// Vercel 함수: 로그인 사용자의 가입 이메일로 점검일지 PDF 발송 (Gmail SMTP)
function send(res, code, obj) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
}

// 사용자별 호출 횟수 (인스턴스 메모리)
const hits = new Map();
function limited(id) {
  const now = Date.now();
  const arr = (hits.get(id) || []).filter((t) => now - t < 60000);
  if (arr.length >= 5) { hits.set(id, arr); return true; }
  arr.push(now);
  hits.set(id, arr);
  if (hits.size > 500) {
    for (const [k, v] of hits) { if (!v.some((t) => now - t < 60000)) hits.delete(k); }
  }
  return false;
}

function mask(addr) {
  const [u, d] = String(addr).split('@');
  return (u || '').slice(0, 2) + '***@' + (d || '');
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return send(res, 405, { error: 'method_not_allowed' });
  }
  const env = process.env;
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = env.SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY
    || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return send(res, 500, { error: 'server_not_configured' });

  const m = /^Bearer\s+(\S+)$/i.exec(req.headers['authorization'] || '');
  if (!m) return send(res, 401, { error: 'unauthorized' });

  let user;
  try {
    const r = await fetch(url.replace(/\/+$/, '') + '/auth/v1/user', {
      headers: { apikey: anon, Authorization: 'Bearer ' + m[1] }
    });
    if (!r.ok) return send(res, 401, { error: 'unauthorized' });
    user = await r.json();
  } catch (e) {
    return send(res, 502, { error: 'upstream' });
  }
  const authEmail = user && typeof user.email === 'string' ? user.email : '';
  const okMail = (a) => typeof a === 'string' && a.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a);

  // 수신자: 프로필의 mail_to 우선, 없으면 실제 가입 이메일
  let to = '';
  try {
    if (user && user.id) {
      const pr = await fetch(url.replace(/\/+$/, '') + '/rest/v1/profiles?id=eq.' + encodeURIComponent(user.id) + '&select=mail_to', {
        headers: { apikey: anon, Authorization: 'Bearer ' + m[1] }
      });
      if (pr.ok) {
        const rows = await pr.json();
        const mt = rows && rows[0] && typeof rows[0].mail_to === 'string' ? rows[0].mail_to.trim() : '';
        if (okMail(mt)) to = mt;
      }
    }
  } catch (e) { /* 조회 실패 시 아래 대체 경로 */ }
  if (!to && okMail(authEmail) && !/@korail-inspect\.local$/i.test(authEmail)) to = authEmail;
  if (!to) return send(res, 400, { error: 'no_mail_to' });

  const gUser = env.GMAIL_USER;
  const gPass = String(env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
  if (!gUser || !gPass) return send(res, 500, { error: 'mail_not_configured' });

  if (limited(String(user.id || authEmail || to))) return send(res, 429, { error: 'too_many_requests' });

  let body = req.body;
  if (typeof body === 'string') {
    if (body.length > 6000000) return send(res, 413, { error: 'payload_too_large' });
    try { body = JSON.parse(body); } catch (e) { return send(res, 400, { error: 'bad_request' }); }
  }
  if (!body || typeof body !== 'object') return send(res, 400, { error: 'bad_request' });

  let b64 = String(body.pdfBase64 || '').replace(/^data:[^,]*,/, '').replace(/\s+/g, '');
  if (!b64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return send(res, 400, { error: 'bad_pdf' });
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  if (Math.floor(b64.length * 3 / 4) - pad > 4 * 1024 * 1024) return send(res, 413, { error: 'pdf_too_large' });

  let filename = String(body.filename || '').replace(/[^\w가-힣.\-()]/g, '');
  filename = filename.replace(/\.pdf$/i, '').slice(0, 96) || 'journal';
  filename += '.pdf';
  const subject = String(body.subject || '점검일지').replace(/[\r\n]+/g, ' ').slice(0, 120);
  const summary = String(body.summary || '').slice(0, 4000);

  try {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: gUser, pass: gPass } });
    await transporter.sendMail({
      from: '"고속차량 점검일지 (시연용)" <' + gUser + '>',
      to,
      subject,
      text: summary + '\n\n※ 시연용 예시 데이터입니다. 이 메일은 자동 발송되었습니다.',
      attachments: [{ filename, content: Buffer.from(b64, 'base64'), contentType: 'application/pdf' }]
    });
  } catch (e) {
    // 원인 파악용: SMTP 오류 코드만 전달 (비밀번호는 포함되지 않음)
    const why = [e && e.code, e && e.responseCode, e && e.command].filter(Boolean).join(' ');
    return send(res, 502, { error: 'send_failed' + (why ? ': ' + String(why).slice(0, 80) : '') });
  }
  return send(res, 200, { ok: true, to: mask(to) });
};
