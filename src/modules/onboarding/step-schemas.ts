import { brandingSchema } from "@/modules/branding/schema";
import { onboardingProfileSchema } from "@/modules/workspace/profile-schema";
import { DIAGNOSTIC_FIELDS } from "./diagnostic-fields";
import { diagnosticSchema } from "./diagnostic-schema";

// Étape 1 « Ton activité » : métier + diagnostic.
export const activitySchema = diagnosticSchema.extend(onboardingProfileSchema.pick({ trade: true }).shape);
export const ACTIVITY_FIELDS = ["trade", ...DIAGNOSTIC_FIELDS] as const;

// Étape 2 « Ton profil et ta marque » : profil pro (sans coordonnées de paiement, réglées
// plus tard dans Réglages) et image de marque essentielle, mêmes règles que les Réglages.
export const profileStepSchema = onboardingProfileSchema
  .pick({ name: true, trade: true, address: true, default_currency: true })
  .extend(brandingSchema.pick({ primary_color: true, accent_color: true, font: true }).shape);
export const PROFILE_STEP_FIELDS = Object.keys(profileStepSchema.shape);
