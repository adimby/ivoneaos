-- Storage : un dossier par workspace (« <workspace_id>/… »).
-- Les deux buckets sont privés. « logos » : les membres y déposent, remplacent et
-- suppriment leur logo ; anon (page publique, sans clé secrète) ne lit un logo que s'il
-- figure dans la copie figée d'un devis ou d'une facture émis (is_public_logo). La page
-- publique l'affiche par une URL signée créée avec la clé publique.
-- « documents » (PDF) reste privé : les membres lisent et ajoutent, mais ne remplacent ni
-- ne suppriment jamais un fichier (un PDF de facture émise ne doit pas être substitué) ;
-- chaque génération a un nom nouveau. Le serveur (clé secrète) n'est pas limité.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('logos', 'logos', false, 2 * 1024 * 1024, array['image/png', 'image/jpeg', 'image/webp']),
  ('documents', 'documents', false, 10 * 1024 * 1024, array['application/pdf'])
on conflict (id) do nothing;

-- Le premier segment du chemin doit être un workspace dont l'utilisateur est membre.
-- Comparaison en texte : un dossier qui n'est pas un uuid est simplement refusé.
-- my_workspace_ids() dans un (select …) : évaluée une fois par requête.
create policy "workspace_folder_select" on storage.objects for select to authenticated
  using (
    bucket_id in ('logos', 'documents')
    and (storage.foldername(name))[1] in (select w::text from public.my_workspace_ids() w)
  );

create policy "workspace_folder_insert" on storage.objects for insert to authenticated
  with check (
    bucket_id in ('logos', 'documents')
    and (storage.foldername(name))[1] in (select w::text from public.my_workspace_ids() w)
  );

create policy "workspace_logo_update" on storage.objects for update to authenticated
  using (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] in (select w::text from public.my_workspace_ids() w)
  )
  with check (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] in (select w::text from public.my_workspace_ids() w)
  );

create policy "workspace_logo_delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] in (select w::text from public.my_workspace_ids() w)
  );

-- Logo visible du client : celui d'un document émis (statut hors brouillon) du même
-- workspace. Rien d'autre du bucket n'est lisible sans session.
create function public.is_public_logo(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  folder constant text := split_part(object_name, '/', 1);
  ws uuid;
begin
  if folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  ws := folder::uuid;
  return exists (
    select 1 from public.quotes q
    where q.workspace_id = ws and q.status <> 'draft'
      and q.snapshot #>> '{freelancer,logo_path}' = object_name
  ) or exists (
    select 1 from public.invoices i
    where i.workspace_id = ws and i.status <> 'draft'
      and i.snapshot #>> '{freelancer,logo_path}' = object_name
  );
end;
$$;

revoke execute on function public.is_public_logo(text) from public, anon, authenticated;
grant execute on function public.is_public_logo(text) to anon, authenticated;

-- Pour anon et pour une freelance connectée qui ouvre la page publique d'une autre.
create policy "public_document_logo" on storage.objects for select to anon, authenticated
  using (bucket_id = 'logos' and public.is_public_logo(name));
