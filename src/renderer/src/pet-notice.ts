import { createElement, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { X } from "lucide-react";

type Notice = { id: number; title: string; response: string };

declare global {
  interface Window {
    petNotice: {
      onUpdate: (callback: (notices: Notice[]) => void) => () => void;
      dismiss: (id: number) => void;
      open: (id: number) => void;
    };
  }
}

function NoticeStack() {
  const [notices, setNotices] = useState<Notice[]>([]);
  useEffect(() => window.petNotice.onUpdate(setNotices), []);

  return createElement("div", { className: "notice-stack", "aria-live": "polite" },
    notices.map((notice) => createElement("div", { className: "notice", key: notice.id },
      createElement("button", {
        className: "notice-open",
        type: "button",
        title: `Open ${notice.title}`,
        "aria-label": `Open ${notice.title}`,
        onClick: () => window.petNotice.open(notice.id),
      },
        createElement("span", { className: "title", title: notice.title }, notice.title),
        createElement("span", { className: "response", title: notice.response }, notice.response),
      ),
      createElement("button", {
        className: "dismiss",
        type: "button",
        title: "Dismiss notification",
        "aria-label": `Dismiss notification from ${notice.title}`,
        onClick: () => window.petNotice.dismiss(notice.id),
      }, createElement(X, { size: 16, strokeWidth: 2 })),
    )),
  );
}

createRoot(document.getElementById("root")!).render(createElement(NoticeStack));
