import { useMemo, useRef } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChatLink } from "./chat-link";

const REMARK_PLUGINS = [remarkGfm];

export function UserMessageMarkdown({
  text,
  onOpenLink,
}: {
  text: string;
  onOpenLink?: (url: string) => void;
}) {
  const openLinkRef = useRef(onOpenLink);
  openLinkRef.current = onOpenLink;
  const components = useMemo(() => ({
    a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
      <ChatLink href={href} onOpen={url => openLinkRef.current?.(url)}>{children}</ChatLink>
    ),
    table: ({ children }: { children?: React.ReactNode }) => (
      <div className="u-user-markdown-table"><table>{children}</table></div>
    ),
  }), []);

  return (
    <div className="u-user-markdown">
      <Markdown remarkPlugins={REMARK_PLUGINS} components={components}>{text}</Markdown>
    </div>
  );
}
