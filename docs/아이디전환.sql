-- 기존 이메일 계정 1개를 아이디 계정으로 바꾸고, 기존 이메일을 점검일지 받는 주소로 옮깁니다.
-- Supabase SQL Editor에서 한 번 실행하세요.
-- 아래 두 값만 바꿔 쓰세요 (파일 안의 hejeje97@naver.com / hejeje 를 모두 바꿉니다):
--   기존 이메일 : hejeje97@naver.com
--   새 아이디   : hejeje   (로그인 시 hejeje@korail-inspect.local 로 처리됨)

begin;

alter table public.profiles add column if not exists mail_to text;

-- 1) 기존 이메일을 받는 주소로 저장 (이메일 변경 전에 먼저)
update public.profiles
   set mail_to = 'hejeje97@naver.com'
 where id = (select id from auth.users where lower(email) = lower('hejeje97@naver.com'));

-- 2) 로그인 이메일을 아이디 형태로 변경
update auth.users
   set email = 'hejeje@korail-inspect.local'
 where lower(email) = lower('hejeje97@naver.com');

-- 3) identities 도 동일하게 변경
update auth.identities
   set identity_data = jsonb_set(identity_data, '{email}', to_jsonb('hejeje@korail-inspect.local'::text))
 where provider = 'email'
   and user_id = (select id from auth.users where email = 'hejeje@korail-inspect.local');

commit;

-- 확인
select u.email, p.name, p.mail_to
  from auth.users u
  left join public.profiles p on p.id = u.id
 where u.email = 'hejeje@korail-inspect.local';
