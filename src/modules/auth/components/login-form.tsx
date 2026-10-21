"use client";

import { useActionState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { login, type LoginState } from "../actions";

// Fonctionne aussi avant le chargement du JavaScript (action serveur), utile sur une
// connexion lente. nextField : champ caché du retour après connexion, lu à la requête.
export function LoginForm({ locale, nextField }: { locale: string; nextField?: ReactNode }) {
  const t = useTranslations("Auth");
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, { step: "email", email: "" });
  const onCode = state.step === "code";
  const emailError = !onCode && state.error ? t(`errors.${state.error}`) : undefined;
  const codeError = onCode && state.error ? t(`errors.${state.error}`) : undefined;

  return (
    <form action={formAction} noValidate className="flex flex-1 flex-col gap-6">
      <input type="hidden" name="locale" value={locale} />
      {nextField}

      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-lagoon">{onCode ? t("codeTitle") : t("title")}</h1>
        <p className="text-base text-ink-muted" aria-live="polite">
          {onCode ? t("codeIntro", { email: state.email }) : t("intro")}
        </p>
      </div>

      {onCode ? (
        <>
          <input type="hidden" name="email" value={state.email} />
          <Field id="code" label={t("codeLabel")} error={codeError}>
            {(control) => (
              <Input
                {...control}
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={10}
                autoFocus
                className="text-center text-2xl font-semibold tracking-[0.3em]"
              />
            )}
          </Field>
          {state.notice === "resent" && !state.error && <Alert tone="success">{t("resent")}</Alert>}
        </>
      ) : (
        <Field id="email" label={t("emailLabel")} error={emailError}>
          {(control) => (
            <Input
              {...control}
              key={state.email}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              required
              defaultValue={state.email}
            />
          )}
        </Field>
      )}

      <div className="mt-auto flex flex-col gap-2 pt-4">
        <SubmitButton name="intent" value={onCode ? "verify" : "send"} pending={pending} block>
          {onCode ? t("verify") : t("sendCode")}
        </SubmitButton>
        {onCode && (
          <div className="flex flex-wrap justify-between gap-2">
            <Button type="submit" name="intent" value="resend" variant="ghost" disabled={pending}>
              {t("resend")}
            </Button>
            <Button type="submit" name="intent" value="change" variant="ghost" disabled={pending}>
              {t("changeEmail")}
            </Button>
          </div>
        )}
      </div>
    </form>
  );
}
