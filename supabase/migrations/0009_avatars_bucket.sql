-- Storage: public 'avatars' bucket, path = {user_id}/{file}. Public (unlike
-- the private 'attachments' bucket) since avatars are meant to be visible to
-- anyone who can see the user's name (comments, assignees, member lists).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

create policy avatars_storage_select on storage.objects
  for select to public using (bucket_id = 'avatars');

create policy avatars_storage_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );

create policy avatars_storage_update on storage.objects
  for update to authenticated using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );

create policy avatars_storage_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );
