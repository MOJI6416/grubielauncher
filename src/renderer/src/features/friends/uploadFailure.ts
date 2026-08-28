export function uploadFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const status = Number(/^upload_failed_(\d{3})$/.exec(message)?.[1]);
  if (Number.isFinite(status)) return { message, status };
  if (message === "upload_failed") return { message, code: "ERR_NETWORK" };
  return error;
}
