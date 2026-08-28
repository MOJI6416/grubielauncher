import { FailureInfo } from "./errors";

export const IPC_FAILURE_KEY = "__grubieIpcFailure";
export const IPC_FAILURE_TOKEN_CHANNEL = "ipc:failureToken";

export interface IpcFailurePayload {
  channel: string;
  notify: boolean;
  failure: FailureInfo;
  message: string;
}

export interface IpcFailureEnvelope<T> {
  [IPC_FAILURE_KEY]: IpcFailurePayload & { token?: string };
  value: T;
}

export function wrapIpcFailure<T>(
  token: string,
  payload: IpcFailurePayload,
  value: T,
): IpcFailureEnvelope<T> {
  return { [IPC_FAILURE_KEY]: { ...payload, token }, value };
}

export function readIpcFailureEnvelope(
  result: unknown,
  token?: string,
): IpcFailureEnvelope<unknown> | null {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return null;
  }

  const envelope = result as Partial<IpcFailureEnvelope<unknown>>;
  const payload = envelope[IPC_FAILURE_KEY];
  if (!payload || typeof payload !== "object") return null;
  if (typeof payload.channel !== "string") return null;
  if (token && payload.token !== token) return null;

  return envelope as IpcFailureEnvelope<unknown>;
}
