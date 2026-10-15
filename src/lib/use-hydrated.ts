import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

// false au rendu serveur et pendant l'hydratation, true ensuite (JavaScript chargé).
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
