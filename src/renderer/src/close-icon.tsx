import { X } from "lucide-react";

export function CloseIcon({ size = 13, strokeWidth = 2, viewBox }: { size?: number; strokeWidth?: number; viewBox?: string }) {
  return <X size={size} strokeWidth={strokeWidth} viewBox={viewBox} aria-hidden="true" />;
}
