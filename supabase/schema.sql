-- HEALTHMATE: جدول بيانات المستخدم + RLS + حذف الحساب. آمن للتشغيل أكتر من مرة (idempotent).
-- شغّله في Supabase SQL Editor.

create table if not exists public.healthmate_user_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null default now()
);

-- version: تحكم تفاؤلي (compare-and-set). العميل بيكتب بشرط version = اللي قراه، فلو جهازين كتبوا مع بعض
-- التاني بيكتشف التعارض ويعيد الدمج بدل ما يمسح شغل الأول (last-writer-wins).
alter table public.healthmate_user_data add column if not exists version bigint not null default 1;

-- حد أقصى لحجم الصف عشان حساب واحد ما يملاش القاعدة (2 ميجا من الـ JSON)
alter table public.healthmate_user_data drop constraint if exists healthmate_data_size;
alter table public.healthmate_user_data add constraint healthmate_data_size check (pg_column_size(data) <= 2097152);

alter table public.healthmate_user_data enable row level security;

drop policy if exists "Users can read their own health data" on public.healthmate_user_data;
create policy "Users can read their own health data"
  on public.healthmate_user_data for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own health data" on public.healthmate_user_data;
create policy "Users can create their own health data"
  on public.healthmate_user_data for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own health data" on public.healthmate_user_data;
create policy "Users can update their own health data"
  on public.healthmate_user_data for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own health data" on public.healthmate_user_data;
create policy "Users can delete their own health data"
  on public.healthmate_user_data for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- الدور anon مالوش أي صلاحية على الجدول
revoke all on public.healthmate_user_data from anon;
grant select, insert, update, delete on public.healthmate_user_data to authenticated;

-- "احذف حسابي وبياناتي": بتحذف المستخدم الحالي من auth.users، والصف بيتحذف بالـ cascade.
-- security definer عشان المستخدم العادي مالوش صلاحية على auth.users، وبتحذف المستخدم صاحب الجلسة بس (auth.uid()).
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- يخلّي API بتاع Supabase يلاحظ الجدول/العمود فورًا (من غيره ممكن تظهر PGRST204/PGRST205 لحد ما الكاش يتحدّث).
notify pgrst, 'reload schema';
