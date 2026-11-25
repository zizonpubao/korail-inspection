// 공개 가능한 값만 넣는다. service_role 키, Gemini 키 등 비밀값은 절대 넣지 않는다.
// 값이 비어 있으면 localStorage(로컬) 모드로 동작한다.
window.APP_CONFIG = {
  SUPABASE_URL: 'https://amqzwfdlvqpedltoelnb.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_yxd3A0nUVuXyCyz1lGFI1A_RQYWo-mP', // Publishable key (공개용)
  LOGIN_ID_DOMAIN: 'korail-inspect.local', // 아이디 로그인용 내부 도메인 (실제 메일 아님)
  TM_MODEL_URL: ''
};
