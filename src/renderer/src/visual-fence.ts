type FencePosition = { start?: { offset?: number }; end?: { offset?: number } };

// Markdown has already identified the code block; inspect only its boundary lines.
export function isClosedVisualFence(markdown: string, position?: FencePosition): boolean {
  const start = position?.start?.offset;
  const end = position?.end?.offset;
  if (start === undefined || end === undefined || start < 0 || end > markdown.length || end <= start) return false;
  const lines = markdown.slice(start, end).split(/\r?\n/);
  if (lines.length < 3) return false;
  const opening = /^ {0,3}(`{3,}|~{3,})/.exec(lines[0])?.[1];
  const closing = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(lines.at(-1) ?? "")?.[1];
  return Boolean(opening && closing && opening[0] === closing[0] && closing.length >= opening.length);
}
