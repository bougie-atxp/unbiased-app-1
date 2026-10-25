import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export function AnnotationCommentEditor({ value, onChange, onConfirm, onCancel, onHeightChange, children }: {
  value: string;
  onChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  onHeightChange: (height: number) => void;
  children: ReactNode;
}) {
  const field = useRef<HTMLTextAreaElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const [multiline, setMultiline] = useState(false);
  const [fade, setFade] = useState(false);

  useLayoutEffect(() => {
    const textarea = field.current!;
    const resize = () => {
      textarea.style.height = "0px";
      const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight);
      const height = Math.min(textarea.scrollHeight, lineHeight * 7);
      textarea.style.height = `${height}px`;
      setMultiline(height > lineHeight);
      setFade(textarea.scrollHeight > textarea.clientHeight + textarea.scrollTop + 1);
    };
    resize();
    let width = textarea.clientWidth;
    const observer = new ResizeObserver(() => {
      if (textarea.clientWidth !== width) {
        width = textarea.clientWidth;
        resize();
      }
    });
    observer.observe(textarea);
    return () => observer.disconnect();
  }, [value]);

  useLayoutEffect(() => {
    const observer = new ResizeObserver(() => onHeightChange(root.current!.offsetHeight));
    observer.observe(root.current!);
    return () => observer.disconnect();
  }, [onHeightChange]);

  return <div ref={root} className="annotation-comment-editor" data-multiline={multiline}>
    <div className="annotation-comment-field" data-fade={fade}>
      <textarea
        ref={field}
        autoFocus
        rows={1}
        aria-label="Annotation comment"
        placeholder="Add an optional comment…"
        value={value}
        onChange={e => onChange(e.target.value)}
        onScroll={e => {
          const el = e.currentTarget;
          setFade(el.scrollHeight > el.clientHeight + el.scrollTop + 1);
        }}
        onKeyDown={e => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            onConfirm();
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
          }
        }}
      />
    </div>
    {children}
  </div>;
}
