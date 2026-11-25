// 저장소 추상화: local(localStorage) / supabase 두 모드, 같은 인터페이스 (docs/PLAN.md 3.1)
(function () {
  'use strict';

  var cfg = window.APP_CONFIG || {};
  var useSupabase = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
  var initError = (useSupabase && !window.supabase)
    ? 'Supabase 라이브러리를 불러오지 못했습니다. 네트워크를 확인하고 새로고침하세요.' : null;
  var P = 'korail.';
  var SUMMARY_COLS = ['id', 'inspected_on', 'vehicle_type', 'train_no', 'inspection_type',
    'inspector_name', 'defect_count', 'urgent_count', 'created_at', 'user_id'];

  // ---------- 공통 유틸 ----------
  function lsGet(key) {
    try { return localStorage.getItem(P + key); } catch (e) { return null; }
  }
  function lsSet(key, val) {
    localStorage.setItem(P + key, val); // 호출 측에서 예외 처리
  }
  function lsDel(key) {
    try { localStorage.removeItem(P + key); } catch (e) { /* 무시 */ }
  }
  function readJson(key, fallback) {
    var raw = lsGet(key);
    if (raw == null) return fallback;
    try {
      var v = JSON.parse(raw);
      return v == null ? fallback : v;
    } catch (e) {
      lsDel(key); // 깨진 값 복구
      return fallback;
    }
  }
  function writeJson(key, val) {
    try {
      lsSet(key, JSON.stringify(val));
    } catch (e) {
      throw storageError(e);
    }
  }
  function isQuota(e) {
    return e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      e.code === 22 || e.code === 1014);
  }
  function storageError(e) {
    return isQuota(e)
      ? new Error('브라우저 저장 공간이 부족합니다. 오래된 이력이나 사진을 삭제한 뒤 다시 시도하세요.')
      : new Error('브라우저 저장소에 쓸 수 없습니다.');
  }
  function newId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  }
  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(new Error('사진을 읽을 수 없습니다.')); };
      fr.readAsDataURL(blob);
    });
  }
  function summarize(r) {
    var o = {};
    SUMMARY_COLS.forEach(function (c) { o[c] = r[c] === undefined ? null : r[c]; });
    return o;
  }
  var MAIL_RE = /^[^s@]+@[^s@]+.[^s@]+$/;
  // 점검일지 수신 이메일 검증 (빈 값은 null)
  function normMail(v) {
    v = String(v || '').trim();
    if (!v) return null;
    if (v.length > 120 || !MAIL_RE.test(v)) throw new Error('이메일 형식이 올바르지 않습니다');
    return v;
  }
  function photoPrefix(id) { return 'photo.' + id + '.'; }

  // ---------- local 구현 ----------
  var local = {
    init: function () { return Promise.resolve(); },
    signIn: function () { return Promise.reject(new Error('로컬 모드에서는 로그인을 사용하지 않습니다')); },
    signUp: function () { return Promise.reject(new Error('로컬 모드에서는 로그인을 사용하지 않습니다')); },
    signOut: function () { lsDel('localName'); return Promise.resolve(); },
    setMailTo: function (email) {
      var v;
      try { v = normMail(email); } catch (e) { return Promise.reject(e); }
      try { lsSet('mailTo', v || ''); } catch (e) { return Promise.reject(storageError(e)); }
      return Promise.resolve(v);
    },
    currentUser: function () {
      var name = lsGet('localName');
      return Promise.resolve(name ? { id: 'local', name: name, email: null, loginId: null, mailTo: lsGet('mailTo') || null } : null);
    },
    setLocalName: function (name) {
      try { lsSet('localName', String(name || '').trim()); } catch (e) { return Promise.reject(storageError(e)); }
      return Promise.resolve();
    },
    saveInspection: function (record) {
      try {
        var list = readJson('inspections', []);
        if (!Array.isArray(list)) list = [];
        var rec = Object.assign({}, record);
        if (!rec.id) rec.id = newId();
        rec.user_id = 'local';
        rec.created_at = rec.created_at || new Date().toISOString();
        var idx = -1;
        for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === rec.id) { idx = i; break; }
        if (idx >= 0) list[idx] = rec; else list.push(rec);
        writeJson('inspections', list);
        return Promise.resolve({ id: rec.id });
      } catch (e) { return Promise.reject(e); }
    },
    updateInspection: function (id, patch) {
      try {
        var list = readJson('inspections', []);
        var found = false;
        for (var i = 0; i < list.length; i++) {
          if (list[i] && list[i].id === id) { Object.assign(list[i], patch); found = true; break; }
        }
        if (!found) return Promise.reject(new Error('점검 기록을 찾을 수 없습니다.'));
        writeJson('inspections', list);
        return Promise.resolve();
      } catch (e) { return Promise.reject(e); }
    },
    listInspections: function (f) {
      f = f || {};
      var list = readJson('inspections', []);
      if (!Array.isArray(list)) list = [];
      var q = f.q ? String(f.q).trim().toLowerCase() : '';
      var out = list.filter(function (r) {
        if (!r) return false;
        if (f.vehicle && r.vehicle_type !== f.vehicle) return false;
        if (f.type && r.inspection_type !== f.type) return false;
        if (q && String(r.train_no || '').toLowerCase().indexOf(q) < 0) return false;
        return true;
      });
      out.sort(function (a, b) {
        return String(b.created_at || '').localeCompare(String(a.created_at || ''));
      });
      return Promise.resolve(out.map(summarize));
    },
    listInspectionsFull: function (f) {
      f = f || {};
      var list = readJson('inspections', []);
      if (!Array.isArray(list)) list = [];
      var out = list.filter(function (r) {
        if (!r) return false;
        if (f.from && String(r.inspected_on || '') < f.from) return false;
        if (f.vehicle && r.vehicle_type !== f.vehicle) return false;
        return true;
      });
      out.sort(function (a, b) {
        return String(b.inspected_on || '').localeCompare(String(a.inspected_on || '')) ||
          String(b.created_at || '').localeCompare(String(a.created_at || ''));
      });
      return Promise.resolve(out);
    },
    getInspection: function (id) {
      var list = readJson('inspections', []);
      for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return Promise.resolve(list[i]);
      return Promise.reject(new Error('점검 기록을 찾을 수 없습니다.'));
    },
    deleteInspection: function (id) {
      try {
        var list = readJson('inspections', []).filter(function (r) { return r && r.id !== id; });
        writeJson('inspections', list);
        // 사진 키 삭제
        var pre = P + photoPrefix(id), del = [];
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k && k.indexOf(pre) === 0) del.push(k);
        }
        del.forEach(function (k) { localStorage.removeItem(k); });
        return Promise.resolve();
      } catch (e) { return Promise.reject(e); }
    },
    uploadPhoto: function (inspectionId, itemKey, blobOrDataUrl) {
      var src = typeof blobOrDataUrl === 'string' ? Promise.resolve(blobOrDataUrl) : blobToDataUrl(blobOrDataUrl);
      return src.then(function (dataUrl) {
        try {
          lsSet(photoPrefix(inspectionId) + itemKey, dataUrl);
        } catch (e) {
          throw isQuota(e)
            ? new Error('저장 공간이 부족해 사진을 저장하지 못했습니다. 사진 없이 저장됩니다.')
            : storageError(e);
        }
        return 'local/' + inspectionId + '/' + itemKey + '.jpg';
      });
    },
    photoUrl: function (path) {
      var m = /^local\/([^/]+)\/([^/]+)\.jpg$/.exec(path || '');
      if (!m) return Promise.resolve(null);
      return Promise.resolve(lsGet(photoPrefix(m[1]) + m[2]));
    },
    accessToken: function () { return Promise.resolve(null); }
  };

  // ---------- supabase 구현 (골격, 4단계에서 완성) ----------
  var sb = null;
  var BUCKET = 'inspection-photos';

  function dataUrlToBlob(dataUrl) {
    var m = /^data:([^;,]+)?(;base64)?,(.*)$/.exec(dataUrl || '');
    if (!m) throw new Error('사진 형식이 올바르지 않습니다.');
    var bin = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: m[1] || 'image/jpeg' });
  }
  function requireUser() {
    return getSession().then(function (s) {
      if (!s) throw new Error('로그인이 필요합니다. 다시 로그인하세요.');
      return s.user;
    });
  }
  function fail(err, msg) {
    var m = err && err.message ? String(err.message) : '';
    if (/Failed to fetch|NetworkError/i.test(m)) return new Error('네트워크 연결을 확인하세요.');
    if (err && (err.code === '42501' || /row-level security|permission denied/i.test(m))) {
      return new Error('권한이 없습니다. 본인 기록만 수정할 수 있습니다.');
    }
    return new Error(msg);
  }

  var LOGIN_DOMAIN = cfg.LOGIN_ID_DOMAIN || 'korail-inspect.local';
  // 아이디 -> 내부 이메일. '@'가 있으면 기존 이메일 계정으로 보고 그대로 쓴다
  function toLoginEmail(idOrEmail) {
    var v = String(idOrEmail || '').replace(/\s+/g, '').toLowerCase();
    if (v.indexOf('@') >= 0) return v;
    if (!/^[a-z0-9_.-]{3,30}$/.test(v)) throw new Error('아이디는 영문·숫자 3~30자로 입력하세요');
    return v + '@' + LOGIN_DOMAIN;
  }
  function toLoginId(email) {
    var e = String(email || ''), suf = '@' + LOGIN_DOMAIN;
    return e.slice(-suf.length) === suf ? e.slice(0, -suf.length) : e;
  }
  function getSession() {
    return sb.auth.getSession().then(function (r) { return r.data && r.data.session; });
  }

  var remote = {
    init: function () {
      sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
      return getSession().then(function () { });
    },
    signIn: function (idOrEmail, pw) {
      return Promise.resolve().then(function () {
        return sb.auth.signInWithPassword({ email: toLoginEmail(idOrEmail), password: pw });
      }).then(function (r) {
        if (r.error) throw new Error(r.error.message);
        return remote.currentUser();
      });
    },
    signUp: function (idOrEmail, pw, name, mailTo) {
      var email, mail;
      return Promise.resolve().then(function () {
        email = toLoginEmail(idOrEmail); mail = normMail(mailTo);
        return sb.auth.signUp({ email: email, password: pw });
      }).then(function (r) {
        if (r.error) throw new Error(r.error.message);
        var user = r.data && r.data.user;
        if (!user) throw new Error('가입에 실패했습니다.');
        if (!r.data.session) throw new Error('이메일 확인이 켜져 있습니다. Supabase에서 Confirm email을 끄세요.');
        return sb.from('profiles').insert({ id: user.id, name: name, mail_to: mail }).then(function (p) {
          if (p.error) throw new Error(p.error.message);
          return { id: user.id, name: name, email: email, loginId: toLoginId(email), mailTo: mail };
        });
      });
    },
    signOut: function () {
      return sb.auth.signOut().then(function (r) { if (r.error) throw new Error(r.error.message); });
    },
    currentUser: function () {
      return getSession().then(function (s) {
        if (!s) return null;
        return sb.from('profiles').select('name,mail_to').eq('id', s.user.id).maybeSingle().then(function (p) {
          var name = (p.data && p.data.name) || (s.user.email || '').split('@')[0];
          return { id: s.user.id, name: name, email: s.user.email, loginId: toLoginId(s.user.email),
            mailTo: (p.data && p.data.mail_to) || null };
        });
      });
    },
    setLocalName: function () { return Promise.reject(new Error('로컬 모드 전용 함수입니다.')); },
    setMailTo: function (email) {
      return Promise.resolve().then(function () {
        var v = normMail(email);
        return requireUser().then(function (user) {
          return sb.from('profiles').update({ mail_to: v }).eq('id', user.id).select('id').then(function (r) {
            if (r.error) throw fail(r.error, '이메일을 저장하지 못했습니다.');
            if (!r.data || !r.data.length) throw new Error('프로필을 찾을 수 없어 저장하지 못했습니다.');
            return v;
          });
        });
      });
    },
    saveInspection: function (record) {
      return requireUser().then(function (user) {
        var rec = Object.assign({}, record);
        if (!rec.id) rec.id = newId();
        rec.user_id = user.id;
        delete rec.created_at;
        return sb.from('inspections').upsert(rec, { onConflict: 'id' }).then(function (r) {
          if (r.error) throw fail(r.error, '점검 기록을 저장하지 못했습니다.');
          return { id: rec.id };
        });
      });
    },
    updateInspection: function (id, patch) {
      var p = Object.assign({}, patch);
      delete p.id; delete p.user_id;
      return sb.from('inspections').update(p).eq('id', id).select('id').then(function (r) {
        if (r.error) throw fail(r.error, '점검 기록을 수정하지 못했습니다.');
        if (!r.data || !r.data.length) throw new Error('수정할 기록이 없거나 권한이 없습니다.');
      });
    },
    listInspections: function (f) {
      f = f || {};
      var q = sb.from('inspections').select(SUMMARY_COLS.join(',')).order('created_at', { ascending: false });
      if (f.vehicle) q = q.eq('vehicle_type', f.vehicle);
      if (f.type) q = q.eq('inspection_type', f.type);
      var kw = f.q ? String(f.q).trim().replace(/[%_,()\\]/g, '') : '';
      if (kw) q = q.ilike('train_no', '%' + kw + '%');
      return q.then(function (r) {
        if (r.error) throw fail(r.error, '점검 이력을 불러오지 못했습니다.');
        return r.data || [];
      });
    },
    listInspectionsFull: function (f) {
      f = f || {};
      var q = sb.from('inspections').select('*')
        .order('inspected_on', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1000);
      if (f.from) q = q.gte('inspected_on', f.from);
      if (f.vehicle) q = q.eq('vehicle_type', f.vehicle);
      return q.then(function (r) {
        if (r.error) throw fail(r.error, '정비 현황을 불러오지 못했습니다.');
        return r.data || [];
      });
    },
    getInspection: function (id) {
      return sb.from('inspections').select('*').eq('id', id).maybeSingle().then(function (r) {
        if (r.error) throw fail(r.error, '점검 기록을 불러오지 못했습니다.');
        if (!r.data) throw new Error('점검 기록을 찾을 수 없습니다.');
        return r.data;
      });
    },
    deleteInspection: function (id) {
      return requireUser().then(function (user) {
        var dir = user.id + '/' + id;
        // 사진 삭제 실패는 무시
        var photos = sb.storage.from(BUCKET).list(dir).then(function (l) {
          if (l.error || !l.data || !l.data.length) return;
          return sb.storage.from(BUCKET).remove(l.data.map(function (o) { return dir + '/' + o.name; }));
        }).catch(function () { });
        return photos.then(function () {
          return sb.from('inspections').delete().eq('id', id).select('id');
        }).then(function (r) {
          if (r.error) throw fail(r.error, '점검 기록을 삭제하지 못했습니다.');
          if (!r.data || !r.data.length) throw new Error('삭제할 기록이 없거나 본인 기록이 아닙니다.');
        });
      });
    },
    uploadPhoto: function (inspectionId, itemKey, blobOrDataUrl) {
      return requireUser().then(function (user) {
        var blob = typeof blobOrDataUrl === 'string' ? dataUrlToBlob(blobOrDataUrl) : blobOrDataUrl;
        var path = user.id + '/' + inspectionId + '/' + itemKey + '.jpg';
        return sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: true })
          .then(function (r) {
            if (r.error) throw fail(r.error, '사진을 업로드하지 못했습니다.');
            return path;
          });
      });
    },
    photoUrl: function (path) {
      if (!path) return Promise.resolve(null);
      return sb.storage.from(BUCKET).createSignedUrl(path, 3600).then(function (r) {
        if (r.error || !r.data) return null;
        return r.data.signedUrl;
      });
    },
    accessToken: function () {
      return getSession().then(function (s) { return s ? s.access_token : null; });
    }
  };

  // 라이브러리 로드 실패 시 local로 떨어지지 않고 supabase 함수가 오류를 던진다
  if (initError) {
    Object.keys(remote).forEach(function (k) {
      remote[k] = function () { return Promise.reject(new Error(initError)); };
    });
    remote.init = function () { return Promise.resolve(); };
    remote.currentUser = function () { return Promise.resolve(null); };
    remote.signOut = function () { return Promise.resolve(); };
  }
  var impl = useSupabase ? remote : local;

  // ---------- 공개 객체 ----------
  window.DB = {
    mode: useSupabase ? 'supabase' : 'local',
    initError: initError,
    init: impl.init,
    signIn: impl.signIn,
    signUp: impl.signUp,
    signOut: impl.signOut,
    currentUser: impl.currentUser,
    setLocalName: impl.setLocalName,
    setMailTo: impl.setMailTo,
    toLoginEmail: useSupabase ? toLoginEmail : function (v) { return String(v || '').trim(); },
    newId: newId,
    saveInspection: impl.saveInspection,
    updateInspection: impl.updateInspection,
    listInspections: impl.listInspections,
    listInspectionsFull: impl.listInspectionsFull,
    getInspection: impl.getInspection,
    deleteInspection: impl.deleteInspection,
    uploadPhoto: impl.uploadPhoto,
    photoUrl: impl.photoUrl,
    accessToken: impl.accessToken,
    // 임시 저장: 항상 localStorage
    saveDraft: function (obj) {
      try { lsSet('draft', JSON.stringify(obj)); return Promise.resolve(); }
      catch (e) { return Promise.reject(storageError(e)); }
    },
    loadDraft: function () { return Promise.resolve(readJson('draft', null)); },
    clearDraft: function () { lsDel('draft'); return Promise.resolve(); }
  };
})();
