import { Markdown } from "@renderer/utilities/markdown";

export const ProjectBody = ({
  body,
  baseUrl,
  onLink,
}: {
  body: string;
  baseUrl?: string;
  onLink?: (href: string) => Promise<boolean>;
}) => <Markdown body={body} baseUrl={baseUrl} onLink={onLink} />;
