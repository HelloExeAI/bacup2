"use client";

import * as React from "react";
import { createPortal } from "react-dom";

/**
 * Renders children on document.body so position:fixed overlays stay viewport-centered.
 * Ancestors with backdrop-filter/transform otherwise pin fixed descendants to that subtree.
 */
export function BodyPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}
