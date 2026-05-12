import type { AccountType } from "@/types/Account";
import type { Loader } from "@/types/Loader";

export type ConnectivityState = {
  isInternetOnline: boolean;
  isBackendOnline: boolean;
};

export type ConnectivityProblem = "internet" | "backend";

export function getConnectivityProblems({
  isInternetOnline,
  isBackendOnline,
}: ConnectivityState): ConnectivityProblem[] {
  const problems: ConnectivityProblem[] = [];

  if (!isInternetOnline) problems.push("internet");
  if (!isBackendOnline) problems.push("backend");

  return problems;
}

export function canUseInternetFeature({
  isInternetOnline,
}: ConnectivityState): boolean {
  return isInternetOnline;
}

export function canUseBackendFeature({
  isInternetOnline,
  isBackendOnline,
}: ConnectivityState): boolean {
  return isInternetOnline && isBackendOnline;
}

export function loaderRequiresBackend(loader?: Loader): boolean {
  return loader === "forge" || loader === "neoforge";
}

export function canLoadLoaderData(
  loader: Loader | undefined,
  state: ConnectivityState,
): boolean {
  if (!loader) return false;
  if (!canUseInternetFeature(state)) return false;
  if (loaderRequiresBackend(loader) && !state.isBackendOnline) return false;

  return true;
}

export function canLoadSkinPreviewForProvider(
  provider: AccountType | undefined,
  state: ConnectivityState,
): boolean {
  if (!provider || provider === "plain") return false;
  if (provider === "discord") return canUseBackendFeature(state);

  return canUseInternetFeature(state);
}

export function canOpenSkinManagerForAccount(
  accountType: AccountType | undefined,
  state: ConnectivityState,
): boolean {
  if (!accountType || accountType === "plain") return false;
  if (accountType === "elyby") return canUseInternetFeature(state);

  return canUseBackendFeature(state);
}

export function getUnavailableConnectivityProblem(
  requiresBackend: boolean,
  state: ConnectivityState,
): ConnectivityProblem | null {
  if (!state.isInternetOnline) return "internet";
  if (requiresBackend && !state.isBackendOnline) return "backend";

  return null;
}
