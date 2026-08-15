-- ── Audit B: portal clients could delete a bookkeeper's files ────────────────
-- The documents METADATA delete policy is already scoped to uploaded_by =
-- auth.uid(), but the storage.objects delete policy let a portal client delete
-- ANY object in their client folder — including statements/files a bookkeeper
-- uploaded. Scope the client storage-delete to objects they own.
--
-- Portal + admin/collaborator uploads all go through the user's own browser
-- session, so Supabase stamps storage.objects.owner with the uploader's uid.
-- Admins keep full delete via "client-docs admin all"; collaborators via
-- "client-docs collab all". This only narrows the PORTAL CLIENT delete.
-- Run AFTER documents.sql / access.sql. Safe to re-run.

drop policy if exists "client-docs client delete" on storage.objects;
create policy "client-docs client delete" on storage.objects
  for delete
  using (
    bucket_id = 'client-docs'
    and (storage.foldername(name))[1] = public.current_client_id()::text
    and owner = auth.uid()
  );

notify pgrst, 'reload schema';
