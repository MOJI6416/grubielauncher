import { Markdown } from "@renderer/utilities/markdown";

export const ProjectBody = ({
  body,
  baseUrl,
}: {
  body: string;
  baseUrl?: string;
}) => <Markdown body={body} baseUrl={baseUrl} />;
