// Champ obligatoire : astérisque visible (couleur danger), doublé d'un texte pour les
// lecteurs d'écran (« obligatoire »), à placer dans le libellé.
export function RequiredMark({ label }: { label: string }) {
  return (
    <>
      <span aria-hidden="true" className="ml-0.5 text-danger">
        *
      </span>
      <span className="sr-only"> ({label})</span>
    </>
  );
}
