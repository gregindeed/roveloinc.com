-- ── @handles + avatar photo upload ───────────────────────────────────────────
-- Adds a unique @handle to every profile (seeded from name/email) and a public
-- "avatars" storage bucket where a user can upload their own photo. Re-runnable.
-- Run AFTER profiles-identity.sql.

-- 1) Handle column + case-insensitive uniqueness.
alter table public.profiles add column if not exists handle text;
create unique index if not exists profiles_handle_lower_uniq
  on public.profiles (lower(handle)) where handle is not null;

-- 2) Seed a handle for anyone who doesn't have one yet: first word of the
--    display name, else the email local-part, stripped to [a-z0-9], with a
--    numeric suffix on collision.
do $$
declare
  r record;
  base text;
  cand text;
  n int;
  src text;
begin
  for r in
    select p.id, p.display_name, u.email
    from public.profiles p
    left join auth.users u on u.id = p.id
    where p.handle is null
  loop
    if coalesce(nullif(btrim(r.display_name), ''), '') <> '' then
      src := split_part(btrim(r.display_name), ' ', 1);
    else
      src := split_part(coalesce(r.email, 'user'), '@', 1);
    end if;
    base := lower(regexp_replace(src, '[^a-zA-Z0-9]', '', 'g'));
    if base = '' then base := 'user'; end if;
    cand := base;
    n := 1;
    while exists (select 1 from public.profiles where lower(handle) = cand) loop
      n := n + 1;
      cand := base || n::text;
    end loop;
    update public.profiles set handle = cand where id = r.id;
  end loop;
end $$;

-- 3) Public avatars bucket: anyone can read; you can only write your own folder
--    (path is "<user_id>/<file>").
insert into storage.buckets (id, name, public)
  values ('avatars', 'avatars', true)
  on conflict (id) do nothing;

drop policy if exists "avatars read"  on storage.objects;
drop policy if exists "avatars write" on storage.objects;
create policy "avatars read" on storage.objects for select
  using (bucket_id = 'avatars');
create policy "avatars write" on storage.objects for all
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

notify pgrst, 'reload schema';
