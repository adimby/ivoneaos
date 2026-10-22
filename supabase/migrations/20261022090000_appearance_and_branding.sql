-- Personnalisation (docs/spec-mvp.md, « Personnalisation ») :
--   1. Apparence de l'application, par personne (profiles) : mode clair / sombre /
--      automatique et palette parmi des palettes vérifiées.
--   2. Image de marque des devis et factures, par workspace : logo affiché ou non, taille
--      et position, bannière d'en-tête, couleurs principale et d'accent, police.
--   3. Copie figée : l'image de marque entre dans la copie prise à l'émission ; un document
--      envoyé ne change pas si la freelance modifie sa marque ensuite.
--   4. Bannière : même bucket privé que le logo (« logos », ajouts seulement), lisible sans
--      session seulement si elle figure dans un document émis.
-- Migration rejouable (if not exists, create or replace), sans suppression.

-- ---------------------------------------------------------------------------
-- 1. Apparence (profil)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists theme_mode text not null default 'light'
    constraint profiles_theme_mode_check check (theme_mode in ('light', 'dark', 'auto')),
  add column if not exists theme_palette text not null default 'ocean'
    constraint profiles_theme_palette_check check (theme_palette in ('ocean', 'foret', 'prune', 'corail', 'ardoise', 'sable'));

-- Chacun modifie sa propre ligne (politique own_update) et seulement ces colonnes-là.
grant update (theme_mode, theme_palette) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Image de marque (workspace)
-- ---------------------------------------------------------------------------
alter table public.workspaces
  add column if not exists brand_show_logo boolean not null default true,
  add column if not exists brand_logo_size text not null default 'medium'
    constraint workspaces_brand_logo_size_check check (brand_logo_size in ('small', 'medium', 'large')),
  add column if not exists brand_logo_position text not null default 'left'
    constraint workspaces_brand_logo_position_check check (brand_logo_position in ('left', 'center')),
  add column if not exists brand_banner_path text
    constraint workspaces_brand_banner_path_check
    check (brand_banner_path is null or starts_with(brand_banner_path, id::text || '/')),
  add column if not exists brand_primary_color text not null default '#01515A'
    constraint workspaces_brand_primary_color_check check (brand_primary_color ~ '^#[0-9A-F]{6}$'),
  add column if not exists brand_accent_color text not null default '#A45C36'
    constraint workspaces_brand_accent_color_check check (brand_accent_color ~ '^#[0-9A-F]{6}$'),
  add column if not exists brand_font text not null default 'liberation-sans'
    constraint workspaces_brand_font_check
    check (brand_font in ('liberation-sans', 'montserrat', 'nunito', 'spectral', 'barlow-condensed'));

-- Mêmes règles que le reste du profil pro : les membres (RLS du workspace) modifient ces
-- colonnes, rien d'autre (le plan reste au serveur). invoice_footer l'était déjà.
grant update (brand_show_logo, brand_logo_size, brand_logo_position, brand_banner_path,
  brand_primary_color, brand_accent_color, brand_font)
  on public.workspaces to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Copie figée à l'émission
-- ---------------------------------------------------------------------------
create or replace function public.document_snapshot(p_workspace_id uuid, p_contact_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'freelancer', jsonb_build_object(
      'business_name', w.name,
      -- Logo masqué : absent de la copie figée (ni affiché, ni lisible sans session).
      'logo_path', case when w.brand_show_logo then w.logo_path end,
      'nif', w.nif,
      'stat', w.stat,
      'tax_regime', w.tax_regime,
      'address', w.address,
      'invoice_footer', w.invoice_footer,
      'brand', jsonb_build_object(
        'show_logo', w.brand_show_logo,
        'logo_size', w.brand_logo_size,
        'logo_position', w.brand_logo_position,
        'banner_path', w.brand_banner_path,
        'primary_color', w.brand_primary_color,
        'accent_color', w.brand_accent_color,
        'font', w.brand_font
      )
    ),
    'client', jsonb_build_object('name', c.name, 'company_name', c.company_name)
  )
  from public.workspaces w
  join public.contacts c on c.workspace_id = w.id and c.id = p_contact_id
  where w.id = p_workspace_id;
$$;

-- ---------------------------------------------------------------------------
-- 4. Bannière : lisible sans session si elle figure dans un document émis ; jamais
-- supprimée tant qu'un document émis l'affiche (politique workspace_logo_delete).
-- ---------------------------------------------------------------------------
create or replace function public.is_public_logo(object_name text)
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
      and object_name in (q.snapshot #>> '{freelancer,logo_path}', q.snapshot #>> '{freelancer,brand,banner_path}')
  ) or exists (
    select 1 from public.invoices i
    where i.workspace_id = ws and i.status <> 'draft'
      and object_name in (i.snapshot #>> '{freelancer,logo_path}', i.snapshot #>> '{freelancer,brand,banner_path}')
  );
end;
$$;

revoke execute on function public.is_public_logo(text) from public, anon, authenticated;
grant execute on function public.is_public_logo(text) to anon, authenticated;
