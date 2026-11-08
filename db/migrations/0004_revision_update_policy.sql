-- Allow correcting the label of a revision (metadata only) for users who may upload to the project.
create policy rev_update on "proj-dashboard-document-revisions" for update to app_authenticated
  using (exists (select 1 from "proj-dashboard-documents" d where d.id = document_id and app_can_upload(d.project_id)))
  with check (exists (select 1 from "proj-dashboard-documents" d where d.id = document_id and app_can_upload(d.project_id)));

-- Stored files are immutable: forbid changing the file reference or size of an existing revision.
create or replace function trg_revisions_immutable() returns trigger language plpgsql as $$
begin
  if new.storage_key is distinct from old.storage_key or new.file_size is distinct from old.file_size
     or new.checksum is distinct from old.checksum or new.document_id is distinct from old.document_id
     or new.revision_no is distinct from old.revision_no then
    raise exception 'Permission denied: stored revision files are immutable' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger trg_revisions_immutable before update on "proj-dashboard-document-revisions" for each row execute function trg_revisions_immutable();
