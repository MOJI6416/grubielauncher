export interface SelectionAccount {
  type: string;
  nickname: string;
}

export interface SelectionState {
  signature: string | null;
  selectedKey: string | null;
}

export function instanceSelectionSignature(
  key: string,
  account?: SelectionAccount | null,
): string {
  const owner = account ? `${account.type}_${account.nickname}` : "";
  return `${owner}|${key}`;
}

const mountKeys = new WeakMap<object, string>();
let mountCounter = 0;

export function instanceMountKey(instance: object): string {
  const known = mountKeys.get(instance);
  if (known) return known;

  mountCounter += 1;
  const key = `instance-${mountCounter}`;
  mountKeys.set(instance, key);

  return key;
}

export function shouldReselectInstance(
  state: SelectionState,
  routeId: string,
  account?: SelectionAccount | null,
): boolean {
  if (state.selectedKey !== routeId) return true;

  return state.signature !== instanceSelectionSignature(routeId, account);
}
