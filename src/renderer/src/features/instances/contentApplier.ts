import type { ILocalProject } from "@/types/ModManager";
import { ignoreFailure } from "@renderer/utilities/ignoreFailure";

export type ApplyOutcome = "applied" | "dropped";

export interface ContentApplierState {
  mods: ILocalProject[];
  applying: boolean;
}

export interface ContentApplierOptions<O> {
  read: () => ILocalProject[];
  persist: (
    next: ILocalProject[],
    previous: ILocalProject[],
    options: O | undefined,
  ) => Promise<void>;
  onChange: (state: ContentApplierState) => void;
}

export interface ContentApplier<O> {
  apply: (next: ILocalProject[], options?: O) => Promise<ApplyOutcome>;
  reload: () => void;
  current: () => ILocalProject[];
  idle: () => Promise<void>;
  isApplying: () => boolean;
}

export function createContentApplier<O = undefined>(
  options: ContentApplierOptions<O>,
): ContentApplier<O> {
  let mods = options.read();
  let pending = 0;
  let generation = 0;
  let chain: Promise<unknown> = Promise.resolve();

  const emit = () => options.onChange({ mods, applying: pending > 0 });

  const apply = (
    next: ILocalProject[],
    applyOptions?: O,
  ): Promise<ApplyOutcome> => {
    const ticket = generation;
    pending += 1;
    mods = next;
    emit();

    const run = async (): Promise<ApplyOutcome> => {
      if (ticket !== generation) return "dropped";

      try {
        await options.persist(next, options.read(), applyOptions);
        return "applied";
      } catch (error) {
        generation += 1;
        mods = options.read();
        throw error;
      }
    };

    const result = chain.then(run).finally(() => {
      pending -= 1;
      if (pending === 0) mods = options.read();
      emit();
    });

    chain = result.catch(ignoreFailure);
    return result;
  };

  return {
    apply,
    reload: () => {
      if (pending > 0) return;
      mods = options.read();
      emit();
    },
    current: () => mods,
    idle: () => chain.then(ignoreFailure),
    isApplying: () => pending > 0,
  };
}
