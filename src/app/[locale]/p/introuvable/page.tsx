import { notFound } from "next/navigation";

// Cible du proxy pour un jeton inconnu ou un brouillon : page 404 statique (../not-found),
// servie avec le statut 404.
export default function UnknownDocument() {
  notFound();
}
