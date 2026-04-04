"use client";

import * as React from "react";
import type Quill from "quill";

import { GMAIL_DEFAULT_FONT, GMAIL_QUILL_FONT_WHITELIST } from "@/modules/google/gmailQuillFonts";
import { GMAIL_DEFAULT_SIZE_PX, GMAIL_QUILL_SIZE_PX_OPTIONS } from "@/modules/google/gmailQuillSizes";

import "@/modules/google/gmailQuillFonts.css";

function normalizeHtml(h: string): string {
  return h.replace(/\s+/g, " ").trim();
}

function isEmptyBody(html: string): boolean {
  const t = html.replace(/\s/g, "");
  return !t || t === "<p><br></p>" || t === "<p></p>";
}

let quillFormatsRegistered = false;

function ensureQuillFormats(QuillCtor: typeof import("quill").default): void {
  if (quillFormatsRegistered) return;

  const Font = QuillCtor.import("formats/font") as { whitelist: string[] };
  Font.whitelist = [...GMAIL_QUILL_FONT_WHITELIST];

  const SizeStyle = QuillCtor.import("attributors/style/size") as { whitelist: string[] };
  SizeStyle.whitelist = [...GMAIL_QUILL_SIZE_PX_OPTIONS];
  QuillCtor.register({ "formats/size": SizeStyle }, true);

  quillFormatsRegistered = true;
}

export function GmailQuillEditor({
  value,
  onChange,
  modules,
  className,
}: {
  value: string;
  onChange: (html: string) => void;
  modules: Record<string, unknown>;
  className?: string;
}) {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const quillRef = React.useRef<Quill | null>(null);
  const textChangeHandlerRef = React.useRef<(() => void) | null>(null);
  const onChangeRef = React.useRef(onChange);
  const modulesRef = React.useRef(modules);
  const valueRef = React.useRef(value);
  const skipEmitRef = React.useRef(false);
  const [editorReady, setEditorReady] = React.useState(false);

  onChangeRef.current = onChange;
  modulesRef.current = modules;
  valueRef.current = value;

  React.useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;

    void (async () => {
      await import("quill/dist/quill.snow.css");
      const { default: QuillCtor } = await import("quill");
      if (cancelled) return;

      ensureQuillFormats(QuillCtor);

      host.innerHTML = "";
      const el = document.createElement("div");
      host.appendChild(el);

      const q = new QuillCtor(el, {
        theme: "snow",
        modules: modulesRef.current,
      });

      if (cancelled) {
        host.innerHTML = "";
        return;
      }

      quillRef.current = q;

      const initial = valueRef.current;
      if (initial?.trim() && !isEmptyBody(initial)) {
        q.clipboard.dangerouslyPasteHTML(initial, "silent");
      } else {
        skipEmitRef.current = true;
        q.setSelection(0, 0);
        q.format("font", GMAIL_DEFAULT_FONT);
        q.format("size", GMAIL_DEFAULT_SIZE_PX);
        skipEmitRef.current = false;
      }

      const handler = () => {
        if (skipEmitRef.current) return;
        onChangeRef.current(q.root.innerHTML);
      };
      textChangeHandlerRef.current = handler;
      q.on("text-change", handler);

      if (cancelled) {
        q.off("text-change", handler);
        textChangeHandlerRef.current = null;
        host.innerHTML = "";
        return;
      }

      setEditorReady(true);
    })();

    return () => {
      cancelled = true;
      const q = quillRef.current;
      if (q && textChangeHandlerRef.current) {
        q.off("text-change", textChangeHandlerRef.current);
      }
      textChangeHandlerRef.current = null;
      quillRef.current = null;
      host.innerHTML = "";
      setEditorReady(false);
    };
  }, []);

  React.useEffect(() => {
    const q = quillRef.current;
    if (!q || !editorReady) return;
    const cur = q.root.innerHTML;
    if (normalizeHtml(cur) === normalizeHtml(value)) return;
    skipEmitRef.current = true;
    q.clipboard.dangerouslyPasteHTML(value || "", "silent");
    skipEmitRef.current = false;
  }, [value, editorReady]);

  return <div ref={hostRef} className={className} />;
}
