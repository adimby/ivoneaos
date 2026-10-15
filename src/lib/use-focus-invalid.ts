import { useEffect, type RefObject } from "react";

// Après une réponse du serveur avec des erreurs : focus sur le premier champ invalide
// visible, centré à l'écran avec son message (jamais sous la barre d'action collante).
export function useFocusFirstInvalid(form: RefObject<HTMLElement | null>, state: { fieldErrors?: object }) {
  useEffect(() => {
    if (!state.fieldErrors || Object.keys(state.fieldErrors).length === 0) return;
    const field = [...(form.current?.querySelectorAll<HTMLElement>('[aria-invalid="true"]') ?? [])].find(
      (element) => !element.closest("[hidden]"),
    );
    if (!field) return;
    field.focus({ preventScroll: true });
    (field.closest("[data-field]") ?? field).scrollIntoView({ block: "center" });
  }, [form, state]);
}
