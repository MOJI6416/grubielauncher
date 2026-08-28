import { useEffect, useState } from "react";
import { getApiBase, subscribeApiBase } from "@renderer/utilities/apiBase";

export function useApiBase(): string {
  const [apiBase, setApiBase] = useState(getApiBase());

  useEffect(() => subscribeApiBase(setApiBase), []);

  return apiBase;
}
