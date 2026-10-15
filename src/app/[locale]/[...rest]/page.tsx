import { notFound } from "next/navigation";

// Toute adresse inconnue sous /fr ou /en : page introuvable traduite ([locale]/not-found).
export default function CatchAll() {
  notFound();
}
