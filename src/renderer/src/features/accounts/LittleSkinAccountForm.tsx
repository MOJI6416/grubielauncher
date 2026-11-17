import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  ArrowLeft,
  ExternalLink,
  Loader2,
  LogIn,
  UserRound,
  X,
} from "lucide-react";
import type { ILittleSkinProfile, ILittleSkinSession } from "@/types/Auth";
import { LITTLESKIN_REGISTER_URL } from "@/shared/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormErrorMessage } from "@/components/ui/form-error-message";
import { ProviderIcon } from "./ProviderMark";
import { describeAuthFailure } from "./authErrors";
import type { LittleSkinSignInStep } from "./useAccountsController";

const api = window.api;

function describeError(error: unknown, t: TFunction): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (message.includes("littleskin_invalid_credentials")) {
    return t("accounts.littleskinForm.invalidCredentials");
  }
  if (message.includes("littleskin_no_profiles")) {
    return t("accounts.littleskinForm.noProfiles");
  }

  const failure = describeAuthFailure(error, "littleskin");
  return `${t(`accounts.authError.${failure.reason}`)} ${t(`accounts.authFix.${failure.reason}`)}`;
}

export function LittleSkinAccountForm({
  initialLogin = "",
  onCancel,
  onSignIn,
  onChooseProfile,
  onDone,
}: {
  initialLogin?: string;
  onCancel: () => void;
  onSignIn: (login: string, password: string) => Promise<LittleSkinSignInStep>;
  onChooseProfile: (
    session: ILittleSkinSession,
    profile: ILittleSkinProfile,
  ) => Promise<boolean>;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [login, setLogin] = useState(initialLogin);
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<{
    session: ILittleSkinSession;
    profiles: ILittleSkinProfile[];
  } | null>(null);

  const canSubmit = login.trim() !== "" && password !== "" && pending === null;

  const submit = async () => {
    if (!canSubmit) return;
    setPending("credentials");
    setError(null);
    try {
      const step = await onSignIn(login.trim(), password);
      if (step.status === "chooseProfile") {
        setChoice({ session: step.session, profiles: step.profiles });
        return;
      }
      if (step.saved) onDone();
    } catch (failure) {
      setError(describeError(failure, t));
    } finally {
      setPending(null);
    }
  };

  const choose = async (profile: ILittleSkinProfile) => {
    if (!choice || pending !== null) return;
    setPending(profile.id);
    setError(null);
    try {
      if (await onChooseProfile(choice.session, profile)) onDone();
    } catch (failure) {
      setError(describeError(failure, t));
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-5 overflow-y-auto px-10">
      <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl border border-border bg-surface-3 text-foreground">
        <ProviderIcon type="littleskin" size={28} />
      </span>

      <div className="grid max-w-md gap-2 text-center">
        <h2 className="text-lg font-semibold">
          {t(
            choice
              ? "accounts.littleskinForm.chooseTitle"
              : "accounts.littleskinForm.title",
          )}
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t(
            choice
              ? "accounts.littleskinForm.chooseHint"
              : "accounts.littleskinForm.hint",
          )}
        </p>
      </div>

      {choice ? (
        <div className="grid w-full max-w-sm gap-1.5">
          <div className="grid max-h-56 gap-1 overflow-y-auto">
            {choice.profiles.map((profile) => (
              <button
                key={profile.id}
                type="button"
                disabled={pending !== null}
                onClick={() => void choose(profile)}
                className="flex min-w-0 items-center gap-2.5 rounded-lg border border-border bg-surface-2 px-3 py-2 text-left text-sm transition-colors hover:border-input hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pending === profile.id ? (
                  <Loader2 className="size-4 shrink-0 animate-spin text-faint" />
                ) : (
                  <UserRound className="size-4 shrink-0 text-faint" />
                )}
                <span className="truncate font-medium">{profile.name}</span>
              </button>
            ))}
          </div>
          <FormErrorMessage show={error !== null} id="littleskin-error">
            {error}
          </FormErrorMessage>
        </div>
      ) : (
        <div className="grid w-full max-w-sm gap-3">
          <div className="grid gap-2">
            <Label htmlFor="littleskin-login">
              {t("accounts.littleskinForm.login")}
            </Label>
            <Input
              id="littleskin-login"
              autoFocus={initialLogin === ""}
              autoComplete="username"
              spellCheck={false}
              maxLength={256}
              value={login}
              onChange={(event) => setLogin(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void submit();
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="littleskin-password">
              {t("accounts.littleskinForm.password")}
            </Label>
            <Input
              id="littleskin-password"
              type="password"
              autoFocus={initialLogin !== ""}
              autoComplete="current-password"
              maxLength={1024}
              value={password}
              aria-invalid={error !== null}
              aria-describedby={error !== null ? "littleskin-error" : undefined}
              onChange={(event) => setPassword(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void submit();
              }}
            />
            <FormErrorMessage show={error !== null} id="littleskin-error">
              {error}
            </FormErrorMessage>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        {choice ? (
          <Button
            variant="ghost"
            disabled={pending !== null}
            onClick={() => {
              setChoice(null);
              setError(null);
            }}
          >
            <ArrowLeft className="size-4" />
            {t("accounts.littleskinForm.back")}
          </Button>
        ) : (
          <>
            <Button disabled={!canSubmit} onClick={() => void submit()}>
              {pending === "credentials" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <LogIn className="size-4" />
              )}
              {t("accounts.littleskinForm.submit")}
            </Button>
            <Button variant="ghost" onClick={onCancel}>
              <X className="size-4" />
              {t("common.cancel")}
            </Button>
          </>
        )}
      </div>

      {!choice && (
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0 text-xs text-muted-foreground"
          onClick={() =>
            void api.shell
              .openExternal(LITTLESKIN_REGISTER_URL)
              .catch(() => undefined)
          }
        >
          <ExternalLink className="size-3.5" />
          {t("accounts.littleskinForm.register")}
        </Button>
      )}
    </div>
  );
}
