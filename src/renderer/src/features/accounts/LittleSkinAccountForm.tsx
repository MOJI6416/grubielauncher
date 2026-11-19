import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  ArrowLeft,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  LogIn,
  UserRound,
  X,
} from "lucide-react";
import type {
  ILittleSkinDeviceCode,
  ILittleSkinProfile,
  ILittleSkinSession,
} from "@/types/Auth";
import {
  LITTLESKIN_OAUTH_CLIENT_ID,
  LITTLESKIN_REGISTER_URL,
} from "@/shared/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormErrorMessage } from "@/components/ui/form-error-message";
import { ProviderIcon } from "./ProviderMark";
import { describeAuthFailure } from "./authErrors";
import type { LittleSkinSignInStep } from "./useAccountsController";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";
import { Hint } from "@renderer/components/Hint";
import { copyWithFeedback } from "@renderer/utilities/copyFeedback";
import { formatClock } from "@renderer/utilities/duration";

const api = window.api;

const OAUTH_AVAILABLE = LITTLESKIN_OAUTH_CLIENT_ID !== "";

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error ?? "");
}

function describeError(error: unknown, t: TFunction): string {
  const message = errorText(error);
  if (message.includes("littleskin_invalid_credentials")) {
    return t("accounts.littleskinForm.invalidCredentials");
  }
  if (message.includes("littleskin_no_profiles")) {
    return t("accounts.littleskinForm.noProfiles");
  }
  if (message.includes("littleskin_oauth_denied")) {
    return t("accounts.littleskinForm.oauthDenied");
  }
  if (message.includes("littleskin_oauth_expired")) {
    return t("accounts.littleskinForm.oauthExpired");
  }
  if (message.includes("littleskin_oauth_unavailable")) {
    return t("accounts.littleskinForm.oauthUnavailable");
  }

  const failure = describeAuthFailure(error, "littleskin");
  return `${t(`accounts.authError.${failure.reason}`)} ${t(`accounts.authFix.${failure.reason}`)}`;
}

function openDevicePage(device: ILittleSkinDeviceCode) {
  void api.shell
    .openExternal(device.verificationUriComplete ?? device.verificationUri)
    .catch(ignoreFailure);
}

export function LittleSkinAccountForm({
  initialLogin = "",
  onCancel,
  onSignIn,
  onChooseProfile,
  onStartOAuth,
  onFinishOAuth,
  onCancelOAuth,
  onDone,
}: {
  initialLogin?: string;
  onCancel: () => void;
  onSignIn: (login: string, password: string) => Promise<LittleSkinSignInStep>;
  onChooseProfile: (
    session: ILittleSkinSession,
    profile: ILittleSkinProfile,
  ) => Promise<boolean>;
  onStartOAuth: () => Promise<ILittleSkinDeviceCode>;
  onFinishOAuth: () => Promise<boolean>;
  onCancelOAuth: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"oauth" | "password">(
    OAUTH_AVAILABLE ? "oauth" : "password",
  );
  const [login, setLogin] = useState(initialLogin);
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [credentialsRefused, setCredentialsRefused] = useState(false);
  const [choice, setChoice] = useState<{
    session: ILittleSkinSession;
    profiles: ILittleSkinProfile[];
  } | null>(null);
  const [device, setDevice] = useState<
    (ILittleSkinDeviceCode & { startedAt: number }) | null
  >(null);
  const [now, setNow] = useState(() => Date.now());
  const flowRef = useRef(0);

  useEffect(() => {
    if (!device) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [device]);

  useEffect(() => () => onCancelOAuth(), [onCancelOAuth]);

  const canSubmit = login.trim() !== "" && password !== "" && pending === null;

  const submit = async () => {
    if (!canSubmit) return;
    setPending("credentials");
    setError(null);
    setCredentialsRefused(false);
    try {
      const step = await onSignIn(login.trim(), password);
      if (step.status === "chooseProfile") {
        setChoice({ session: step.session, profiles: step.profiles });
        return;
      }
      if (step.saved) onDone();
    } catch (failure) {
      setCredentialsRefused(true);
      setError(describeError(failure, t));
    } finally {
      setPending(null);
    }
  };

  const showOAuthFailure = (failure: unknown) => {
    if (errorText(failure).includes("littleskin_oauth_unavailable")) {
      setMode("password");
    }
    setError(describeError(failure, t));
  };

  const startOAuth = async () => {
    if (pending !== null) return;
    const flow = ++flowRef.current;
    setPending("oauth");
    setError(null);
    try {
      const started = await onStartOAuth();
      if (flowRef.current !== flow) return;
      setDevice({ ...started, startedAt: Date.now() });
      setNow(Date.now());
      openDevicePage(started);
    } catch (failure) {
      if (flowRef.current !== flow) return;
      setPending(null);
      showOAuthFailure(failure);
      return;
    }

    try {
      const saved = await onFinishOAuth();
      if (flowRef.current === flow && saved) onDone();
    } catch (failure) {
      if (
        flowRef.current === flow &&
        !errorText(failure).includes("littleskin_oauth_cancelled")
      ) {
        showOAuthFailure(failure);
      }
    } finally {
      if (flowRef.current === flow) {
        setDevice(null);
        setPending(null);
      }
    }
  };

  const stopOAuth = () => {
    flowRef.current++;
    onCancelOAuth();
    setDevice(null);
    setPending(null);
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

  const switchMode = (next: "oauth" | "password") => {
    setMode(next);
    setError(null);
    setCredentialsRefused(false);
  };

  const title = choice
    ? "accounts.littleskinForm.chooseTitle"
    : device
      ? "accounts.littleskinForm.oauthWaitingTitle"
      : "accounts.littleskinForm.title";
  const hint = choice
    ? "accounts.littleskinForm.chooseHint"
    : device
      ? "accounts.littleskinForm.oauthWaitingHint"
      : mode === "oauth"
        ? "accounts.littleskinForm.oauthHint"
        : "accounts.littleskinForm.hint";

  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-5 overflow-y-auto px-10">
      <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl border border-border bg-surface-3 text-foreground">
        <ProviderIcon type="littleskin" size={28} />
      </span>

      <div className="grid max-w-md gap-2 text-center">
        <h2 className="text-lg font-semibold">{t(title)}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t(hint)}
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
                <Hint content={profile.name} variant="text" truncatedOnly>
                  <span className="truncate font-medium">{profile.name}</span>
                </Hint>
              </button>
            ))}
          </div>
          <FormErrorMessage show={error !== null} id="littleskin-error">
            {error}
          </FormErrorMessage>
        </div>
      ) : device ? (
        <div className="grid justify-items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="rounded-lg border border-border bg-surface-2 px-4 py-2 font-mono text-2xl font-semibold tracking-[0.2em]">
              {device.userCode}
            </span>
            <Hint content={t("accounts.littleskinForm.copyCode")}>
              <Button
                variant="secondary"
                size="icon"
                aria-label={t("accounts.littleskinForm.copyCode")}
                onClick={() => void copyWithFeedback(device.userCode)}
              >
                <Copy className="size-4" />
              </Button>
            </Hint>
          </div>
          <p className="flex items-center gap-1.5 font-mono text-xs tabular-nums text-faint">
            <Loader2 className="size-3.5 animate-spin" />
            {t("accounts.oauthTimeLeft", {
              time: formatClock(
                device.startedAt + device.expiresIn * 1000 - now,
              ),
            })}
          </p>
        </div>
      ) : mode === "password" ? (
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
              aria-invalid={credentialsRefused}
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
      ) : (
        <FormErrorMessage show={error !== null} id="littleskin-error">
          {error}
        </FormErrorMessage>
      )}

      <div className="flex flex-wrap items-center justify-center gap-2">
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
        ) : device ? (
          <>
            <Button variant="secondary" onClick={() => openDevicePage(device)}>
              <ExternalLink className="size-4" />
              {t("accounts.auth.reopen")}
            </Button>
            <Button variant="ghost" onClick={stopOAuth}>
              <X className="size-4" />
              {t("common.cancel")}
            </Button>
          </>
        ) : (
          <>
            {mode === "oauth" ? (
              <Button
                disabled={pending !== null}
                onClick={() => void startOAuth()}
              >
                {pending === "oauth" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <LogIn className="size-4" />
                )}
                {t("accounts.littleskinForm.oauthSubmit")}
              </Button>
            ) : (
              <Button disabled={!canSubmit} onClick={() => void submit()}>
                {pending === "credentials" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <LogIn className="size-4" />
                )}
                {t("accounts.littleskinForm.submit")}
              </Button>
            )}
            <Button variant="ghost" onClick={onCancel}>
              <X className="size-4" />
              {t("common.cancel")}
            </Button>
          </>
        )}
      </div>

      {!choice && !device && (
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          {OAUTH_AVAILABLE && (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs text-muted-foreground"
              disabled={pending !== null}
              onClick={() =>
                switchMode(mode === "oauth" ? "password" : "oauth")
              }
            >
              {mode === "oauth" ? (
                <KeyRound className="size-3.5" />
              ) : (
                <LogIn className="size-3.5" />
              )}
              {t(
                mode === "oauth"
                  ? "accounts.littleskinForm.usePassword"
                  : "accounts.littleskinForm.useOAuth",
              )}
            </Button>
          )}
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs text-muted-foreground"
            onClick={() =>
              void api.shell
                .openExternal(LITTLESKIN_REGISTER_URL)
                .catch(ignoreFailure)
            }
          >
            <ExternalLink className="size-3.5" />
            {t("accounts.littleskinForm.register")}
          </Button>
        </div>
      )}
    </div>
  );
}
