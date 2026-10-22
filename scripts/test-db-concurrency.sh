#!/usr/bin/env bash
# Numérotation sans trou à deux sessions réelles (complète les tests pgTAP, qui
# tournent dans une seule transaction). Supabase local démarré ; psql requis.
#   1. A émet et garde son verrou ; B émet en parallèle : B attend, puis prend le numéro suivant.
#   2. A émet puis annule (ROLLBACK) ; B émet pendant ce temps : B reprend le numéro rendu.
#   3. Les numéros obtenus se suivent sans trou.
#   4. Offre Découverte, 2 envois ce mois-ci : A envoie un devis, B une facture en même
#      temps ; B attend A puis est refusée (free_limit_reached) : jamais 4 envois.
#   5. Offre Découverte, 19 contacts : A et B en créent un en même temps ; B est refusée.
#   6. Carte fiscale non vérifiée, 2 factures émises : A et B en émettent une en même temps ;
#      B attend A puis est refusée (fiscal_verification_required) : jamais 4 factures.
# Données créées dans des workspaces dédiés, supprimés à la fin.
set -euo pipefail

DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
q() { psql "$DB_URL" -X -q -t -A -v ON_ERROR_STOP=1 "$@"; }
fail() { echo "ÉCHEC : $*" >&2; exit 1; }

# Carte fiscale vérifiée : seuls la numérotation (1-3) et les limites de l'offre (4-5) jouent.
ws=$(q -c "insert into public.workspaces (name, nif, stat, tax_regime, plan, fiscal_status)
           values ('Test concurrence', '1234567890', '12345112026000001', 'tva', 'lancement', 'verified') returning id")
free_ws=$(q -c "insert into public.workspaces (name, nif, stat, tax_regime, fiscal_status)
                values ('Test concurrence Découverte', '1234567890', '12345112026000001', 'tva', 'verified') returning id")
# Carte non vérifiée, offre Lancement : seul le plafond de 3 factures joue (6).
fiscal_ws=$(q -c "insert into public.workspaces (name, nif, stat, tax_regime, plan)
                  values ('Test concurrence carte fiscale', '1234567890', '12345112026000001', 'tva', 'lancement') returning id")
cleanup() { q -c "delete from public.workspaces where id in ('$ws', '$free_ws', '$fiscal_ws')" >/dev/null || true; }
trap cleanup EXIT

contact=$(q -c "insert into public.contacts (workspace_id, name, phone)
                values ('$ws', 'Client', '+261340000000') returning id")
# new_invoice / new_quote [workspace] [contact] : brouillon avec une ligne.
new_invoice() {
  local w="${1:-$ws}" c="${2:-$contact}" id
  id=$(q -c "insert into public.invoices (workspace_id, contact_id) values ('$w', '$c') returning id")
  q -c "insert into public.document_lines (workspace_id, invoice_id, description, unit_price)
        values ('$w', '$id', 'Prestation', 1000)" >/dev/null
  echo "$id"
}
new_quote() {
  local w="$1" c="$2" id
  id=$(q -c "insert into public.quotes (workspace_id, contact_id) values ('$w', '$c') returning id")
  q -c "insert into public.document_lines (workspace_id, quote_id, description, unit_price)
        values ('$w', '$id', 'Prestation', 1000)" >/dev/null
  echo "$id"
}
year=$(q -c "select extract(year from now() at time zone 'Indian/Antananarivo')::int")
number_of() { q -c "select number from public.invoices where id = '$1'"; }

# Exécute $2 dans une session nommée $1 qui garde ses verrous 3 s puis fait $3 (commit|rollback).
run_and_hold() {
  PGAPPNAME="$1" q -c "begin; $2; select pg_sleep(3); $3;" >/dev/null
}
issue_and_hold() {
  run_and_hold "$2" "update public.invoices set status = 'sent' where id = '$1'" "$3"
}
# Attend que la session $1 tienne le verrou (elle dort dans pg_sleep).
wait_holding() {
  for _ in $(seq 1 100); do
    [ "$(q -c "select count(*) from pg_stat_activity where application_name = '$1' and wait_event = 'PgSleep'")" = 1 ] && return
    sleep 0.1
  done
  fail "la session $1 n'a pas pris le verrou"
}
# Émet $1 et affiche la durée d'attente en millisecondes.
timed_issue() {
  local start end
  start=$(date +%s%3N)
  q -c "update public.invoices set status = 'sent' where id = '$1'" >/dev/null
  end=$(date +%s%3N)
  echo $((end - start))
}

# --- 1. Deux émissions simultanées -------------------------------------------
a1=$(new_invoice); b1=$(new_invoice)
issue_and_hold "$a1" numbering-a commit &
pid=$!
wait_holding numbering-a
waited=$(timed_issue "$b1")
wait "$pid"
[ "$waited" -ge 1000 ] || fail "B n'a pas attendu le verrou de A (${waited} ms)"
[ "$(number_of "$a1")" = "F-$year-0001" ] || fail "A : $(number_of "$a1")"
[ "$(number_of "$b1")" = "F-$year-0002" ] || fail "B : $(number_of "$b1")"
echo "ok 1 - émissions simultanées : B attend ${waited} ms puis reçoit F-$year-0002"

# --- 2. Émission annulée pendant qu'une autre attend -------------------------
a2=$(new_invoice); b2=$(new_invoice)
issue_and_hold "$a2" numbering-a rollback &
pid=$!
wait_holding numbering-a
waited=$(timed_issue "$b2")
wait "$pid"
[ "$waited" -ge 1000 ] || fail "B n'a pas attendu le verrou de A (${waited} ms)"
[ -z "$(number_of "$a2")" ] || fail "A annulée garde un numéro : $(number_of "$a2")"
[ "$(number_of "$b2")" = "F-$year-0003" ] || fail "B : $(number_of "$b2")"
q -c "update public.invoices set status = 'sent' where id = '$a2'" >/dev/null
[ "$(number_of "$a2")" = "F-$year-0004" ] || fail "A réémise : $(number_of "$a2")"
echo "ok 2 - émission annulée : numéro rendu, B reçoit F-$year-0003, puis A F-$year-0004"

numbers=$(q -c "select string_agg(number, ' ' order by number) from public.invoices where workspace_id = '$ws'")
[ "$numbers" = "F-$year-0001 F-$year-0002 F-$year-0003 F-$year-0004" ] || fail "numéros : $numbers"
echo "ok 3 - numéros contigus : $numbers"

# --- 4. Limite Découverte : devis et facture envoyés en même temps -------------
free_contact=$(q -c "insert into public.contacts (workspace_id, name, phone)
                     values ('$free_ws', 'Client', '+261340000000') returning id")
for _ in 1 2; do
  q -c "update public.invoices set status = 'sent' where id = '$(new_invoice "$free_ws" "$free_contact")'" >/dev/null
done
qa=$(new_quote "$free_ws" "$free_contact"); ib=$(new_invoice "$free_ws" "$free_contact")
run_and_hold limit-a "update public.quotes set status = 'sent' where id = '$qa'" commit &
pid=$!
wait_holding limit-a
start=$(date +%s%3N)
err=$(q -c "update public.invoices set status = 'sent' where id = '$ib'" 2>&1 || true)
waited=$(( $(date +%s%3N) - start ))
wait "$pid"
[ "$waited" -ge 1000 ] || fail "B n'a pas attendu le verrou du workspace (${waited} ms)"
[[ "$err" == *free_limit_reached* ]] || fail "4e envoi du mois accepté : ${err:-aucune erreur}"
sent=$(q -c "select (select count(*) from public.quotes where workspace_id = '$free_ws' and sent_at is not null)
                  + (select count(*) from public.invoices where workspace_id = '$free_ws' and sent_at is not null)")
[ "$sent" = 3 ] || fail "envois : $sent"
echo "ok 4 - limite Découverte : B attend ${waited} ms puis free_limit_reached, 3 envois au total"

# --- 5. Limite Découverte : deux contacts créés en même temps ----------------
q -c "insert into public.contacts (workspace_id, name, phone)
      select '$free_ws', 'Client ' || n, '+26134' || lpad(n::text, 7, '0') from generate_series(2, 19) n" >/dev/null
run_and_hold contact-a "insert into public.contacts (workspace_id, name, phone) values ('$free_ws', 'A', '+261340000020')" commit &
pid=$!
wait_holding contact-a
err=$(q -c "insert into public.contacts (workspace_id, name, phone) values ('$free_ws', 'B', '+261340000021')" 2>&1 || true)
wait "$pid"
[[ "$err" == *contact_limit_reached* ]] || fail "21e contact accepté : ${err:-aucune erreur}"
active=$(q -c "select count(*) from public.contacts where workspace_id = '$free_ws' and archived_at is null")
[ "$active" = 20 ] || fail "contacts actifs : $active"
echo "ok 5 - limite Découverte : deux créations simultanées, B refusée, 20 contacts actifs"

# --- 6. Carte fiscale non vérifiée : deux factures émises en même temps ---------
fiscal_contact=$(q -c "insert into public.contacts (workspace_id, name, phone)
                       values ('$fiscal_ws', 'Client', '+261340000000') returning id")
for _ in 1 2; do
  q -c "update public.invoices set status = 'sent' where id = '$(new_invoice "$fiscal_ws" "$fiscal_contact")'" >/dev/null
done
ia=$(new_invoice "$fiscal_ws" "$fiscal_contact"); ib=$(new_invoice "$fiscal_ws" "$fiscal_contact")
issue_and_hold "$ia" fiscal-a commit &
pid=$!
wait_holding fiscal-a
start=$(date +%s%3N)
err=$(q -c "update public.invoices set status = 'sent' where id = '$ib'" 2>&1 || true)
waited=$(( $(date +%s%3N) - start ))
wait "$pid"
[ "$waited" -ge 1000 ] || fail "B n'a pas attendu le verrou du workspace (${waited} ms)"
[[ "$err" == *fiscal_verification_required* ]] || fail "4e facture sans carte vérifiée acceptée : ${err:-aucune erreur}"
issued=$(q -c "select count(*) from public.invoices where workspace_id = '$fiscal_ws' and sent_at is not null")
[ "$issued" = 3 ] || fail "factures émises : $issued"
echo "ok 6 - carte non vérifiée : B attend ${waited} ms puis fiscal_verification_required, 3 factures au total"
