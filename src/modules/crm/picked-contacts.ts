import { z } from "zod";
import { normalizePhone } from "./phone";
import { contactSchema } from "./schemas";

// Contacts choisis dans le carnet du téléphone (Contact Picker API).
export type PickedContact = { name?: string[]; tel?: string[]; email?: string[] };

// Bornes de l'envoi : 200 contacts, 5 valeurs de 320 caractères au plus par champ.
const values = z.array(z.string().max(320)).max(5).optional();
export const pickedSchema = z.array(z.object({ name: values, tel: values, email: values })).max(200);

const email = z.email();

// Premier téléphone valide et premier e-mail valide (une validation par valeur, jamais
// par combinaison) ; nom à défaut : l'e-mail ou le numéro. null : rien pour joindre.
export function toContact(entry: PickedContact) {
  const tel = entry.tel?.find((value) => normalizePhone(value) !== null) ?? "";
  const mail = entry.email?.map((value) => value.trim()).find((value) => email.safeParse(value).success) ?? "";
  const name = entry.name?.find((n) => n.trim()) || mail || tel;
  const parsed = contactSchema.safeParse({ name, kind: "person", company_name: "", phone: tel, email: mail, country: "MG", tags: "" });
  return parsed.success ? parsed.data : null;
}
