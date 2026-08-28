import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Hint } from "@renderer/components/Hint";
import { agentBlockReason } from "@renderer/navigation/access";
import { accountAtom } from "@renderer/stores/atoms";
import { askAgent } from "./openAgent";

export function AskAgentButton({
  prompt,
  variant = "outline",
  className,
}: {
  prompt: string;
  variant?: "outline" | "ghost";
  className?: string;
}) {
  const account = useAtomValue(accountAtom);
  const { t } = useTranslation();

  if (agentBlockReason(account?.type)) return null;

  const label = t("agent.ask");

  return (
    <Hint content={label}>
      <Button
        type="button"
        size="icon-sm"
        variant={variant}
        className={className}
        aria-label={label}
        onClick={() => askAgent(prompt)}
      >
        <Sparkles />
      </Button>
    </Hint>
  );
}
