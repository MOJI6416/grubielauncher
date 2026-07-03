type ActiveInstallOperation = {
  controller: AbortController;
  cancel: () => void;
};

let activeOperation: ActiveInstallOperation | null = null;

export function isInstallOperationActive(): boolean {
  return activeOperation !== null;
}

export function tryBeginInstallOperation(
  cancel: () => void,
): { controller: AbortController; end: () => void } | null {
  if (activeOperation) return null;

  const controller = new AbortController();
  const operation: ActiveInstallOperation = { controller, cancel };
  activeOperation = operation;

  return {
    controller,
    end: () => {
      if (activeOperation === operation) {
        activeOperation = null;
      }
    },
  };
}

export function cancelActiveInstallOperation(): boolean {
  if (!activeOperation) return false;

  activeOperation.controller.abort();
  try {
    activeOperation.cancel();
  } catch {}

  return true;
}
