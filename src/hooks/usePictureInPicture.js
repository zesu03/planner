// Document Picture-in-Picture wrapper. Opens a small floating browser
// window that the OS keeps on top of other apps — the closest a web app
// can get to Windows Clock's "always on top" feature.
//
// Chromium-only (Chrome / Edge 111+). On Firefox / Safari `supported` is
// false and the caller can render a fallback.
//
// The consumer renders content into the returned `pipWindow.document.body`
// via createPortal. State updates in the parent React tree flow into the
// portal automatically — no manual sync needed.

import { useCallback, useEffect, useState } from "react";

export function usePictureInPicture({ width = 320, height = 380 } = {}) {
  const [pipWindow, setPipWindow] = useState(null);
  const supported = typeof window !== "undefined" && "documentPictureInPicture" in window;

  // Copy every <style> and <link rel="stylesheet"> from the main document
  // into the PiP document so CSS variables (gold, theme palette) resolve
  // identically. Same-origin sheets get their cssRules inlined; cross-origin
  // sheets fall back to re-linking the href.
  const cloneStyles = (target) => {
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        const rules = Array.from(sheet.cssRules).map((r) => r.cssText).join("\n");
        const style = target.document.createElement("style");
        style.textContent = rules;
        target.document.head.appendChild(style);
      } catch {
        if (sheet.href) {
          const link = target.document.createElement("link");
          link.rel = "stylesheet";
          link.href = sheet.href;
          target.document.head.appendChild(link);
        }
      }
    }
  };

  const open = useCallback(async () => {
    if (!supported) return null;
    if (pipWindow) {
      pipWindow.focus();
      return pipWindow;
    }
    const w = await window.documentPictureInPicture.requestWindow({ width, height });
    cloneStyles(w);
    // Mirror theme + reset body chrome so the PiP looks like a clean panel.
    w.document.documentElement.setAttribute(
      "data-theme",
      document.documentElement.getAttribute("data-theme") || "dark",
    );
    w.document.body.style.margin = "0";
    w.document.body.style.background = "var(--color-background-primary)";
    w.document.body.style.color = "var(--color-text-primary)";
    w.document.body.style.fontFamily = getComputedStyle(document.body).fontFamily;
    w.document.title = "Focus";
    w.addEventListener("pagehide", () => setPipWindow(null), { once: true });
    setPipWindow(w);
    return w;
  }, [supported, pipWindow, width, height]);

  const close = useCallback(() => {
    if (pipWindow) pipWindow.close();
  }, [pipWindow]);

  // Keep PiP theme in sync with the main document.
  useEffect(() => {
    if (!pipWindow) return;
    const apply = () => {
      pipWindow.document.documentElement.setAttribute(
        "data-theme",
        document.documentElement.getAttribute("data-theme") || "dark",
      );
    };
    const obs = new MutationObserver(apply);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, [pipWindow]);

  return { open, close, pipWindow, supported };
}
