// ==UserScript==
// @name         Universal Image Click Menu
// @namespace    https://codex.local/universal-image-click-menu
// @version      0.5.15
// @description  Add a compact gray image action rail with viewer, original-media opening, and image/site exclusions.
// @author       lavenzaP
// @license      MIT
// @homepageURL  https://github.com/lavenzaP/browser-tools
// @supportURL   https://github.com/lavenzaP/browser-tools/issues
// @updateURL    https://raw.githubusercontent.com/lavenzaP/browser-tools/main/universal-image-click-menu.user.js
// @downloadURL  https://raw.githubusercontent.com/lavenzaP/browser-tools/main/universal-image-click-menu.user.js
// @match        http://*/*
// @match        https://*/*
// @exclude      https://kone.gg/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// ==/UserScript==

(function () {
  "use strict";

  const CONFIG = {
    minClickSize: 48,
    minDownloadSize: 96,
    menuWidth: 168,
    wheelNavigateCooldownMs: 0,
    toolbarRevealY: 74,
    dragClickTolerancePx: 6,
    preloadImagesOnViewerOpen: false,
    preloadAllLimit: 80,
    preloadAdjacentCount: 3,
    disabledHostPatterns: [
      /(^|\.)reddit\.com$/i,
    ],
    debug: false,
    debugDurationMs: 4800,
    debugStorageKey: "uicmDebug",
    ignoredImagesStorageKey: "uicmIgnoredImages",
    excludedSitesStorageKey: "uicmExcludedSites",
  };

  const STATE = {
    selectedImage: null,
    menu: null,
    viewer: null,
    galleryImages: [],
    galleryIndex: 0,
    zoom: 1,
    panX: 0,
    panY: 0,
    drag: null,
    suppressViewerClick: false,
    lastWheelAt: 0,
    preloadCache: new Map(),
    debugBox: null,
    debugTimer: 0,
    ignoredImageKeys: new Set(),
    excludedSites: [],
    settings: null,
    externalNeedMore: null,
    externalOnClose: null,
    externalNeedMorePending: false,
    externalPendingGoToIndex: null,
  };

  const STYLE_TEXT = `
    #uicm-menu,
    #uicm-viewer,
    #uicm-settings {
      box-sizing: border-box;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0;
    }

    #uicm-menu {
      position: fixed;
      z-index: 2147483647;
      width: ${CONFIG.menuWidth}px;
      padding: 5px;
      border: 1px solid rgba(229, 231, 235, 0.16);
      border-radius: 7px;
      background: #2f3033;
      color: #f3f4f6;
      box-shadow: 0 12px 30px rgba(17, 24, 39, 0.28);
    }

    #uicm-menu::before {
      content: "";
      position: absolute;
      left: 10px;
      top: -5px;
      width: 10px;
      height: 10px;
      border-left: 1px solid rgba(229, 231, 235, 0.16);
      border-top: 1px solid rgba(229, 231, 235, 0.16);
      background: #2f3033;
      transform: rotate(45deg);
    }

    #uicm-menu-title {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      min-height: 20px;
      padding: 1px 4px 5px;
      border-bottom: 1px solid rgba(229, 231, 235, 0.11);
    }

    #uicm-menu-title span {
      font-size: 11px;
      font-weight: 800;
      line-height: 1.2;
    }

    #uicm-menu-title small {
      min-width: 0;
      overflow: hidden;
      color: #c7c9cc;
      font-size: 10px;
      font-weight: 600;
      line-height: 1.2;
      text-align: right;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    #uicm-menu-actions {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 3px;
      padding-top: 5px;
    }

    #uicm-menu button {
      display: grid;
      grid-template-columns: 16px minmax(0, 1fr);
      align-items: center;
      gap: 6px;
      min-height: 32px;
      margin: 0;
      padding: 5px 7px;
      border: 1px solid rgba(229, 231, 235, 0.1);
      border-radius: 5px;
      background: #383a3e;
      color: inherit;
      font: 700 11px/1.18 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      text-align: left;
      cursor: pointer;
      transition: background 120ms ease, border-color 120ms ease, transform 120ms ease;
    }

    #uicm-menu button:hover,
    #uicm-menu button:focus-visible {
      outline: none;
      border-color: rgba(243, 244, 246, 0.3);
      background: #484b51;
      transform: translateY(-1px);
    }

    #uicm-menu button span {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .uicm-icon {
      flex: 0 0 auto;
      width: 14px;
      height: 14px;
      color: #d1d5db;
    }

    #uicm-viewer {
      position: fixed;
      inset: 0;
      z-index: 2147483646;
      background: rgba(9, 11, 17, 0.88);
      color: #f8fafc;
    }

    #uicm-viewer-toolbar {
      position: absolute;
      top: 10px;
      left: 50%;
      z-index: 1;
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
      width: max-content;
      max-width: calc(100vw - 20px);
      min-width: 0;
      min-height: 42px;
      padding: 6px 8px;
      border: 1px solid rgba(248, 250, 252, 0.14);
      border-radius: 8px;
      background: rgba(9, 11, 17, 0.84);
      box-shadow: 0 12px 34px rgba(0, 0, 0, 0.28);
      opacity: 0;
      pointer-events: none;
      transform: translate(-50%, calc(-100% - 18px));
      transition: opacity 160ms ease, transform 160ms ease;
    }

    #uicm-viewer.uicm-toolbar-visible #uicm-viewer-toolbar,
    #uicm-viewer-toolbar:focus-within {
      opacity: 1;
      pointer-events: auto;
      transform: translate(-50%, 0);
    }

    #uicm-viewer-title {
      min-width: 0;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 13px;
      color: #e5e7eb;
    }

    #uicm-viewer-counter {
      min-width: 46px;
      text-align: center;
      font-size: 12px;
      color: #d1d5db;
    }

    #uicm-viewer-corner-counter {
      position: absolute;
      right: 14px;
      bottom: 14px;
      z-index: 1;
      min-width: 46px;
      padding: 6px 9px;
      border: 1px solid rgba(229, 231, 235, 0.18);
      border-radius: 7px;
      background: rgba(47, 48, 51, 0.84);
      color: #f3f4f6;
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.24);
      font: 800 12px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      pointer-events: none;
      text-align: center;
    }

    #uicm-viewer-toolbar button {
      min-width: 36px;
      min-height: 34px;
      border: 1px solid rgba(248, 250, 252, 0.18);
      border-radius: 7px;
      background: rgba(255, 255, 255, 0.09);
      color: #f8fafc;
      font: 600 13px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      cursor: pointer;
    }

    #uicm-viewer-toolbar button:hover,
    #uicm-viewer-toolbar button:focus-visible {
      outline: none;
      background: rgba(255, 255, 255, 0.18);
    }

    #uicm-viewer-stage {
      position: absolute;
      inset: 0;
      overflow: hidden;
      cursor: grab;
      touch-action: none;
    }

    #uicm-viewer-stage:active {
      cursor: grabbing;
    }

    #uicm-viewer-image,
    #uicm-viewer-video {
      position: absolute;
      top: 50%;
      left: 50%;
      max-width: 92vw;
      max-height: 94vh;
      transform: translate(calc(-50% + var(--uicm-pan-x, 0px)), calc(-50% + var(--uicm-pan-y, 0px))) scale(var(--uicm-zoom, 1));
      transform-origin: center center;
      user-select: none;
      -webkit-user-drag: none;
      box-shadow: 0 16px 50px rgba(0, 0, 0, 0.3);
    }

    #uicm-viewer-video {
      width: min(92vw, 1280px);
      height: auto;
      background: #000;
    }

    #uicm-settings {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      display: grid;
      place-items: center;
      padding: 16px;
      background: rgba(9, 11, 17, 0.42);
      color: #111827;
    }

    #uicm-settings-panel {
      width: min(460px, calc(100vw - 32px));
      max-height: calc(100vh - 32px);
      overflow: auto;
      border: 1px solid rgba(15, 23, 42, 0.14);
      border-radius: 8px;
      background: #ffffff;
      box-shadow: 0 18px 48px rgba(15, 23, 42, 0.24);
    }

    #uicm-settings-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 16px;
      border-bottom: 1px solid rgba(15, 23, 42, 0.1);
    }

    #uicm-settings-title {
      margin: 0;
      font-size: 16px;
      line-height: 1.25;
    }

    #uicm-settings-body {
      display: grid;
      gap: 12px;
      padding: 14px 16px 16px;
    }

    #uicm-settings label {
      display: block;
      font-size: 13px;
      font-weight: 700;
    }

    .uicm-settings-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    #uicm-settings input {
      flex: 1;
      min-width: 0;
      height: 36px;
      padding: 0 10px;
      border: 1px solid rgba(15, 23, 42, 0.18);
      border-radius: 7px;
      font: 500 13px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    #uicm-settings button {
      min-height: 34px;
      border: 1px solid rgba(15, 23, 42, 0.16);
      border-radius: 7px;
      background: #f8fafc;
      color: #111827;
      font: 700 13px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      cursor: pointer;
    }

    #uicm-settings button:hover,
    #uicm-settings button:focus-visible {
      outline: none;
      background: #e0f2fe;
    }

    #uicm-settings-close {
      width: 34px;
      padding: 0;
      font-size: 18px;
    }

    .uicm-settings-row button {
      padding: 0 12px;
    }

    #uicm-settings-sites {
      display: grid;
      gap: 6px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    #uicm-settings-sites li {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-height: 36px;
      padding: 6px 8px;
      border: 1px solid rgba(15, 23, 42, 0.1);
      border-radius: 7px;
      background: #f8fafc;
      font-size: 13px;
    }

    #uicm-settings-sites span {
      min-width: 0;
      overflow-wrap: anywhere;
    }

    #uicm-settings-sites button {
      flex: 0 0 auto;
      padding: 0 10px;
    }

    #uicm-settings-empty,
    #uicm-settings-status,
    .uicm-settings-note {
      margin: 0;
      color: #475569;
      font-size: 12px;
      line-height: 1.45;
    }

    #uicm-settings-status[data-uicm-error="true"] {
      color: #b91c1c;
    }

    #uicm-debug {
      position: fixed;
      right: 12px;
      top: 12px;
      z-index: 2147483647;
      box-sizing: border-box;
      width: min(460px, calc(100vw - 24px));
      max-height: min(460px, calc(100vh - 24px));
      overflow: auto;
      padding: 10px 12px;
      border: 1px solid rgba(59, 130, 246, 0.34);
      border-radius: 8px;
      background: rgba(15, 23, 42, 0.94);
      color: #eff6ff;
      box-shadow: 0 14px 36px rgba(15, 23, 42, 0.28);
      font: 12px/1.45 ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
      white-space: pre-wrap;
      word-break: break-word;
    }

    #uicm-debug strong {
      color: #93c5fd;
      font-weight: 700;
    }
  `;

  loadStoredPreferences();
  injectStyle();
  exposePublicApi();
  document.addEventListener("click", handleDocumentClick, true);
  document.addEventListener("keydown", handleKeydown, true);
  window.addEventListener("resize", closeMenu, { passive: true });
  window.addEventListener("scroll", closeMenu, { passive: true, capture: true });

  function handleDocumentClick(event) {
    if (isDisabledHost(location.hostname)) {
      showDebug("skipped", {
        reason: "disabled-host",
        host: location.hostname,
      });
      return;
    }

    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    if (isOwnUi(event.target)) {
      return;
    }

    const image = findImageFromEvent(event);
    if (!image) {
      closeMenu();
      return;
    }

    if (isIgnoredImage(image)) {
      showDebug("skipped", {
        reason: "ignored-image",
        image: image.url,
        title: image.title,
      });
      closeMenu();
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    STATE.selectedImage = image;
    showDebug("menu", {
      reason: "menu-opened",
      source: image.source,
      image: image.url,
      title: image.title,
    });
    showMenu(event.clientX, event.clientY, image);
  }

  function handleKeydown(event) {
    if (event.altKey && event.shiftKey && event.key.toLowerCase() === "d") {
      toggleDebug();
      event.preventDefault();
      return;
    }
    if (event.altKey && event.shiftKey && event.key.toLowerCase() === "s") {
      openSettings();
      event.preventDefault();
      return;
    }

    if (STATE.viewer && event.key === "ArrowLeft") {
      showViewerImage(STATE.galleryIndex - 1);
      event.preventDefault();
      return;
    }
    if (STATE.viewer && event.key === "ArrowRight") {
      showViewerImage(STATE.galleryIndex + 1);
      event.preventDefault();
      return;
    }
    if (STATE.viewer && (event.key === "+" || event.key === "=")) {
      setZoom(STATE.zoom * 1.2);
      event.preventDefault();
      return;
    }
    if (STATE.viewer && event.key === "-") {
      setZoom(STATE.zoom / 1.2);
      event.preventDefault();
      return;
    }
    if (event.key !== "Escape") {
      return;
    }
    if (STATE.menu) {
      closeMenu();
      event.preventDefault();
    } else if (STATE.settings) {
      closeSettings();
      event.preventDefault();
    } else if (STATE.viewer) {
      closeViewer();
      event.preventDefault();
    }
  }

  function findImageFromEvent(event) {
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    const missed = [];
    for (const node of path) {
      if (!(node instanceof Element) || node === document.documentElement || node === document.body) {
        continue;
      }
      const image = resolveElementImage(node);
      if (!image) {
        missed.push(describeElement(node));
      }
      if (image && !isLargeEnough(image.element, CONFIG.minClickSize)) {
        showDebug("skipped", {
          reason: "too-small",
          source: image.source,
          image: image.url,
          tag: image.element.tagName,
        });
        return null;
      }
      if (image) {
        const nativeReason = shouldLetNativeClickProceed(path, image);
        if (nativeReason) {
          showDebug("skipped", {
            reason: nativeReason,
            source: image.source,
            image: image.url,
            link: nearestLinkHref(path),
            tag: image.element.tagName,
          });
          return null;
        }
        return image;
      }
    }
    showDebug("skipped", {
      reason: "no-image-detected",
      target: describeElement(event.target),
      path: missed.slice(0, 6).join(" > "),
    });
    return null;
  }

  function resolveElementImage(element) {
    if (element instanceof HTMLImageElement) {
      const originalUrl = linkedImageResourceForElement(element);
      const displayUrl = imageDisplayUrl(element, originalUrl);
      return displayUrl ? {
        element,
        originalUrl,
        source: originalUrl ? "linked-image" : "image",
        url: displayUrl,
        title: imageTitle(element, displayUrl),
      } : null;
    }

    if (element instanceof SVGImageElement) {
      const href = element.href && element.href.baseVal;
      const url = normalizeImageUrl(href);
      return url ? { element, source: "svg", url, title: filenameFromUrl(url) } : null;
    }

    const backgroundUrl = backgroundImageUrl(element);
    if (backgroundUrl) {
      return { element, source: "background", url: backgroundUrl, title: filenameFromUrl(backgroundUrl) };
    }

    if (element instanceof HTMLAnchorElement) {
      const href = normalizeImageUrl(element.href);
      if (isDirectImageResource(href)) {
        return { element, originalUrl: href, source: "link", url: href, title: filenameFromUrl(href) };
      }
    }

    return null;
  }

  function shouldLetNativeClickProceed(path, image) {
    const link = firstPathElement(path, (element) => element instanceof HTMLAnchorElement && element.href);
    if (link) {
      const href = normalizeImageUrl(link.href);
      if (isSameDocumentImageViewerLink(link)) {
        return "";
      }
      if (isArcaArticleImageLink(link, image)) {
        return "";
      }
      if (!link.hasAttribute("download") && !sameImageUrl(href, image.url) && !isDirectImageResource(href)) {
        return "navigational-link";
      }
      return "";
    }

    const interactive = firstPathElement(path, (element) => {
      return Boolean(element.closest?.("button, [role='button'], [role='link'], [onclick], [data-href], [data-url]"));
    });
    if (interactive) {
      if (shouldAllowImageDespiteInteractiveAncestor(image)) {
        return "";
      }
      return "interactive-ancestor";
    }

    if (image.source === "background") {
      const style = window.getComputedStyle(image.element);
      return style.cursor === "pointer" ? "clickable-background" : "";
    }

    return "";
  }

  function shouldAllowImageDespiteInteractiveAncestor(image) {
    if (!image?.element) {
      return false;
    }

    if (isDirectImageResource(image.url) || isDirectImageResource(imageResourceUrl(image))) {
      return true;
    }

    if (image.element instanceof HTMLImageElement) {
      return image.element.complete && image.element.naturalWidth >= CONFIG.minClickSize && image.element.naturalHeight >= CONFIG.minClickSize;
    }

    return false;
  }

  function firstPathElement(path, predicate) {
    for (const node of path) {
      if (!(node instanceof Element) || node === document.documentElement || node === document.body) {
        continue;
      }
      if (predicate(node)) {
        return node;
      }
    }
    return null;
  }

  function nearestLinkHref(path) {
    const link = firstPathElement(path, (element) => element instanceof HTMLAnchorElement && element.href);
    return link ? link.href : "";
  }

  function linkedImageResourceForElement(element) {
    const link = element.closest?.("a[href]");
    if (!link) {
      return "";
    }

    const href = normalizeImageUrl(link.href);
    return isDirectImageResource(href) ? href : "";
  }

  function imageDisplayUrl(image, fallbackUrl) {
    const candidates = [
      image.currentSrc,
      image.src,
      bestSrcsetUrl(image.srcset),
      bestSrcsetUrl(image.getAttribute("data-srcset") || ""),
      image.getAttribute("data-src"),
      image.getAttribute("data-original"),
      image.getAttribute("data-original-src"),
      image.getAttribute("data-lazy-src"),
      image.getAttribute("data-url"),
      image.getAttribute("data-full"),
      image.getAttribute("data-full-src"),
      image.getAttribute("data-image"),
      image.getAttribute("data-image-url"),
      image.getAttribute("data-file"),
      image.getAttribute("data-cfsrc"),
      image.getAttribute("data-echo"),
      image.getAttribute("data-ks-lazyload"),
      fallbackUrl,
    ];

    for (const candidate of candidates) {
      const url = normalizeImageUrl(candidate);
      if (url && isUsableDisplayImageUrl(url, image)) {
        return url;
      }
    }

    return "";
  }

  function isSameDocumentImageViewerLink(link) {
    try {
      const url = new URL(link.href, document.baseURI);
      return url.origin === location.origin && url.pathname === location.pathname && /^#image[_-]?\d+/i.test(url.hash);
    } catch (_error) {
      return false;
    }
  }

  function isArcaArticleImageLink(link, image) {
    if (!/(\.|^)arca\.live$/i.test(location.hostname) || !/^\/b\/[^/]+\/\d+/i.test(location.pathname)) {
      return false;
    }

    try {
      const href = new URL(link.href, document.baseURI);
      if (href.origin === location.origin && href.pathname === location.pathname && /^#image[_-]?\d+/i.test(href.hash)) {
        return true;
      }
      if (href.origin === location.origin && href.pathname === location.pathname && href.search === location.search) {
        return true;
      }
      return isDirectImageResource(href.href) || sameImageUrl(href.href, image.url) || isNamuImageCdnUrl(href.href);
    } catch (_error) {
      return false;
    }
  }

  function showDebug(status, details, force = false) {
    if (!force && !isDebugEnabled()) {
      return;
    }

    const lines = [`UICM: ${status}`];
    Object.keys(details).forEach((key) => {
      const value = details[key];
      if (value !== undefined && value !== null && value !== "") {
        lines.push(`${key}: ${String(value)}`);
      }
    });

    if (!STATE.debugBox || !STATE.debugBox.isConnected) {
      STATE.debugBox = document.createElement("div");
      STATE.debugBox.id = "uicm-debug";
      STATE.debugBox.addEventListener("click", () => {
        STATE.debugBox?.remove();
      });
      document.documentElement.append(STATE.debugBox);
    }

    STATE.debugBox.innerHTML = `<strong>Universal Image Click Menu</strong>\n${escapeHtml(lines.join("\n"))}`;
    window.clearTimeout(STATE.debugTimer);
    STATE.debugTimer = window.setTimeout(() => {
      if (STATE.debugBox) {
        STATE.debugBox.remove();
      }
    }, CONFIG.debugDurationMs);
  }

  function isDebugEnabled() {
    return CONFIG.debug || getStoredDebugFlag();
  }

  function getStoredDebugFlag() {
    try {
      return window.localStorage.getItem(CONFIG.debugStorageKey) === "1";
    } catch (_error) {
      return false;
    }
  }

  function toggleDebug() {
    const enabled = !getStoredDebugFlag();
    try {
      window.localStorage.setItem(CONFIG.debugStorageKey, enabled ? "1" : "0");
    } catch (_error) {
      CONFIG.debug = enabled;
    }

    showDebug("debug", {
      enabled,
      hint: "Alt+Shift+D toggles this overlay",
    }, true);
  }

  function loadStoredPreferences() {
    STATE.ignoredImageKeys = new Set(readStoredArray(CONFIG.ignoredImagesStorageKey).filter(Boolean));
    STATE.excludedSites = uniqueSites(readStoredArray(CONFIG.excludedSitesStorageKey));
  }

  function saveIgnoredImages() {
    writeStoredArray(CONFIG.ignoredImagesStorageKey, Array.from(STATE.ignoredImageKeys));
  }

  function saveExcludedSites() {
    writeStoredArray(CONFIG.excludedSitesStorageKey, STATE.excludedSites);
  }

  function readStoredArray(key) {
    const value = getStoredValue(key, "[]");
    if (Array.isArray(value)) {
      return value.map(String);
    }
    if (typeof value !== "string") {
      return [];
    }

    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch (_error) {
      return [];
    }
  }

  function writeStoredArray(key, values) {
    setStoredValue(key, JSON.stringify(values));
  }

  function getStoredValue(key, fallback) {
    try {
      if (typeof GM_getValue === "function") {
        return GM_getValue(key, fallback);
      }
    } catch (_error) {
      // Fall through to localStorage.
    }

    try {
      const value = window.localStorage.getItem(key);
      return value === null ? fallback : value;
    } catch (_error) {
      return fallback;
    }
  }

  function setStoredValue(key, value) {
    try {
      if (typeof GM_setValue === "function") {
        GM_setValue(key, value);
        return;
      }
    } catch (_error) {
      // Fall through to localStorage.
    }

    try {
      window.localStorage.setItem(key, value);
    } catch (_error) {
      // Storage can be blocked on some pages.
    }
  }

  function showMenu(clientX, clientY, image) {
    closeMenu();

    const menu = document.createElement("div");
    menu.id = "uicm-menu";
    menu.setAttribute("role", "menu");
    const title = document.createElement("div");
    title.id = "uicm-menu-title";
    title.innerHTML = `<span>이미지 도구</span><small>${escapeHtml(menuSubtitle(image))}</small>`;

    const actions = document.createElement("div");
    actions.id = "uicm-menu-actions";
    actions.append(
      menuButton("open", "뷰어 열기", openViewer),
      menuButton("original", "원본 열기", openSelectedOriginal),
      menuButton("ignore", "이 사진 제외", ignoreSelectedImage),
      menuButton("settings", "설정", openSettings),
    );
    menu.append(title, actions);

    document.documentElement.append(menu);
    STATE.menu = menu;

    const left = Math.min(clientX, window.innerWidth - CONFIG.menuWidth - 10);
    const top = Math.min(clientY, window.innerHeight - menu.offsetHeight - 10);
    menu.style.left = `${Math.max(10, left)}px`;
    menu.style.top = `${Math.max(10, top)}px`;
  }

  function menuButton(iconName, label, action) {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "menuitem");
    button.setAttribute("data-uicm-menu-action", iconName);
    button.innerHTML = `${iconSvg(iconName)}<span>${escapeHtml(label)}</span>`;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeMenu();
      action();
    });
    return button;
  }

  function menuSubtitle(image) {
    const value = image?.title || filenameFromUrl(imageResourceUrl(image)) || "선택됨";
    return String(value).trim().slice(0, 48) || "선택됨";
  }

  function openSelectedOriginal() {
    if (!STATE.selectedImage) {
      return;
    }

    const url = imageResourceUrl(STATE.selectedImage);
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  function ignoreSelectedImage() {
    if (!STATE.selectedImage) {
      return;
    }

    const keys = imageIgnoreKeys(STATE.selectedImage);
    if (!keys.length) {
      return;
    }

    keys.forEach((key) => STATE.ignoredImageKeys.add(key));
    saveIgnoredImages();
    showDebug("ignored", {
      reason: "image-added",
      image: STATE.selectedImage.url,
    }, true);
  }

  function openSettings() {
    closeMenu();
    closeSettings();

    const settings = document.createElement("div");
    settings.id = "uicm-settings";
    settings.setAttribute("role", "dialog");
    settings.setAttribute("aria-modal", "true");
    settings.setAttribute("aria-labelledby", "uicm-settings-title");
    settings.innerHTML = `
      <section id="uicm-settings-panel">
        <header id="uicm-settings-header">
          <h2 id="uicm-settings-title">UICM 설정</h2>
          <button id="uicm-settings-close" type="button" data-uicm-settings-action="close" title="닫기">×</button>
        </header>
        <div id="uicm-settings-body">
          <label for="uicm-settings-site-input">제외할 사이트</label>
          <div class="uicm-settings-row">
            <input id="uicm-settings-site-input" type="text" autocomplete="off" placeholder="추가 또는 검색: example.com">
            <button type="button" data-uicm-settings-action="add-site">추가</button>
          </div>
          <div class="uicm-settings-row">
            <button type="button" data-uicm-settings-action="add-current-site">현재 사이트 추가</button>
            <button type="button" data-uicm-settings-action="remove-current-site">현재 사이트 해제</button>
            <button type="button" data-uicm-settings-action="clear-images">사진 제외 초기화</button>
          </div>
          <p class="uicm-settings-note" id="uicm-settings-images-note"></p>
          <ul id="uicm-settings-sites"></ul>
          <p id="uicm-settings-empty" hidden>제외한 사이트가 없습니다.</p>
          <p id="uicm-settings-status"></p>
        </div>
      </section>
    `;

    settings.addEventListener("click", handleSettingsClick);
    settings.querySelector("#uicm-settings-site-input")?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addSiteFromSettingsInput();
      }
    });
    settings.querySelector("#uicm-settings-site-input")?.addEventListener("input", renderSettings);

    document.documentElement.append(settings);
    STATE.settings = settings;
    renderSettings();
    settings.querySelector("#uicm-settings-site-input")?.focus();
  }

  function closeSettings() {
    if (STATE.settings) {
      STATE.settings.remove();
      STATE.settings = null;
    }
  }

  function handleSettingsClick(event) {
    if (event.target === STATE.settings) {
      closeSettings();
      return;
    }

    const actionElement = event.target instanceof Element ? event.target.closest("[data-uicm-settings-action]") : null;
    if (!actionElement) {
      return;
    }

    event.preventDefault();
    const action = actionElement.getAttribute("data-uicm-settings-action");
    if (action === "close") {
      closeSettings();
    } else if (action === "add-site") {
      addSiteFromSettingsInput();
    } else if (action === "add-current-site") {
      addExcludedSite(location.hostname);
    } else if (action === "remove-current-site") {
      removeExcludedSite(location.hostname);
    } else if (action === "remove-site") {
      removeExcludedSite(actionElement.getAttribute("data-site"));
    } else if (action === "clear-images") {
      STATE.ignoredImageKeys.clear();
      saveIgnoredImages();
      renderSettings();
      setSettingsStatus("사진 제외 목록을 비웠습니다.");
    }
  }

  function addSiteFromSettingsInput() {
    const input = STATE.settings?.querySelector("#uicm-settings-site-input");
    if (!(input instanceof HTMLInputElement)) {
      return;
    }

    if (addExcludedSite(input.value)) {
      input.value = "";
    }
  }

  function addExcludedSite(value) {
    const site = normalizeSitePattern(value);
    if (!site) {
      setSettingsStatus("사이트는 example.com 형식으로 입력해 주세요.", true);
      return "";
    }

    if (!STATE.excludedSites.includes(site)) {
      STATE.excludedSites.push(site);
      STATE.excludedSites.sort();
      saveExcludedSites();
      renderSettings();
    }
    setSettingsStatus(`${site} 제외 목록에 추가했습니다. 이 사이트에서는 Alt+Shift+S로 다시 열 수 있습니다.`);
    return site;
  }

  function removeExcludedSite(value) {
    const site = normalizeSitePattern(value);
    const nextSites = STATE.excludedSites.filter((entry) => entry !== site);
    if (nextSites.length === STATE.excludedSites.length) {
      setSettingsStatus(`${site || value} 항목이 없습니다.`, true);
      return;
    }

    STATE.excludedSites = nextSites;
    saveExcludedSites();
    renderSettings();
    setSettingsStatus(`${site} 제외를 해제했습니다.`);
  }

  function renderSettings() {
    if (!STATE.settings) {
      return;
    }

    const list = STATE.settings.querySelector("#uicm-settings-sites");
    const empty = STATE.settings.querySelector("#uicm-settings-empty");
    const imageNote = STATE.settings.querySelector("#uicm-settings-images-note");
    const clearImages = STATE.settings.querySelector('[data-uicm-settings-action="clear-images"]');
    const query = STATE.settings.querySelector("#uicm-settings-site-input")?.value.trim().toLowerCase() || "";
    // ponytail: substring search is enough; add fuzzy search only if this list gets genuinely painful again.
    const visibleSites = query ? STATE.excludedSites.filter((site) => site.includes(query)) : STATE.excludedSites;

    if (imageNote) {
      imageNote.textContent = `사진 제외 ${STATE.ignoredImageKeys.size}개`;
    }
    if (clearImages instanceof HTMLButtonElement) {
      clearImages.disabled = STATE.ignoredImageKeys.size === 0;
    }
    if (!list || !empty) {
      return;
    }

    list.textContent = "";
    empty.textContent = STATE.excludedSites.length > 0 ? "검색 결과가 없습니다." : "제외한 사이트가 없습니다.";
    empty.hidden = visibleSites.length > 0;
    visibleSites.forEach((site) => {
      const item = document.createElement("li");
      item.innerHTML = `<span>${escapeHtml(site)}</span><button type="button" data-uicm-settings-action="remove-site" data-site="${escapeHtml(site)}">제거</button>`;
      list.append(item);
    });
  }

  function setSettingsStatus(message, isError = false) {
    const status = STATE.settings?.querySelector("#uicm-settings-status");
    if (!status) {
      return;
    }

    status.textContent = message;
    status.setAttribute("data-uicm-error", isError ? "true" : "false");
  }

  function openViewer() {
    if (!STATE.selectedImage) {
      return;
    }

    closeViewer();
    prepareViewerGallery();
    createViewer();
  }

  function openExternalViewer(images, startIndex = 0, options = {}) {
    const galleryImages = normalizeExternalImages(images);
    if (!galleryImages.length) {
      return false;
    }

    closeViewer();
    STATE.galleryImages = galleryImages;
    STATE.galleryIndex = clampIndex(startIndex, galleryImages.length);
    STATE.selectedImage = STATE.galleryImages[STATE.galleryIndex];
    STATE.externalNeedMore = typeof options.onNeedMore === "function" ? options.onNeedMore : null;
    STATE.externalOnClose = typeof options.onClose === "function" ? options.onClose : null;
    STATE.externalNeedMorePending = false;
    STATE.preloadCache.clear();
    createViewer();
    return true;
  }

  function createViewer() {
    STATE.zoom = 1;
    STATE.panX = 0;
    STATE.panY = 0;

    const viewer = document.createElement("div");
    viewer.id = "uicm-viewer";
    viewer.innerHTML = `
      <div id="uicm-viewer-toolbar">
        <div id="uicm-viewer-title"></div>
        <button type="button" data-uicm-action="prev" title="이전">prev</button>
        <div id="uicm-viewer-counter"></div>
        <button type="button" data-uicm-action="next" title="다음">next</button>
        <button type="button" data-uicm-action="zoom-out" title="축소">-</button>
        <button type="button" data-uicm-action="reset" title="초기화">1:1</button>
        <button type="button" data-uicm-action="zoom-in" title="확대">+</button>
        <button type="button" data-uicm-action="open" title="원본 열기">원본</button>
        <button type="button" data-uicm-action="close" title="닫기">닫기</button>
      </div>
      <div id="uicm-viewer-stage">
        <img id="uicm-viewer-image" alt="">
        <video id="uicm-viewer-video" controls playsinline preload="metadata" hidden></video>
      </div>
      <div id="uicm-viewer-corner-counter"></div>
    `;

    const stage = viewer.querySelector("#uicm-viewer-stage");

    viewer.addEventListener("click", handleViewerClick);
    stage.addEventListener("wheel", handleViewerWheel, { passive: false });
    stage.addEventListener("pointerdown", handleViewerPointerDown);
    stage.addEventListener("pointermove", handleViewerPointerMove);
    stage.addEventListener("pointerup", handleViewerPointerUp);
    stage.addEventListener("pointercancel", handleViewerPointerUp);
    viewer.addEventListener("pointermove", handleToolbarReveal);
    viewer.addEventListener("pointerleave", hideToolbar);

    document.documentElement.append(viewer);
    STATE.viewer = viewer;
    showViewerImage(STATE.galleryIndex);
    preloadViewerImages();
    revealToolbarTemporarily();
  }

  function handleViewerClick(event) {
    const action = event.target instanceof Element ? event.target.closest("[data-uicm-action]")?.getAttribute("data-uicm-action") : null;
    if (STATE.suppressViewerClick) {
      event.preventDefault();
      STATE.suppressViewerClick = false;
      return;
    }

    if (!action) {
      handleViewerSurfaceClick(event);
      return;
    }

    event.preventDefault();
    if (action === "close") {
      closeViewer();
    } else if (action === "prev") {
      showViewerImage(STATE.galleryIndex - 1);
    } else if (action === "next") {
      showViewerImage(STATE.galleryIndex + 1);
    } else if (action === "open" && STATE.selectedImage) {
      window.open(imageResourceUrl(STATE.selectedImage), "_blank", "noopener,noreferrer");
    } else if (action === "zoom-in") {
      setZoom(STATE.zoom * 1.2);
    } else if (action === "zoom-out") {
      setZoom(STATE.zoom / 1.2);
    } else if (action === "reset") {
      STATE.zoom = 1;
      STATE.panX = 0;
      STATE.panY = 0;
      updateViewerTransform();
    }
  }

  function handleViewerSurfaceClick(event) {
    if (!(event.target instanceof Element)) {
      return;
    }

    if (event.target.closest("#uicm-viewer-toolbar")) {
      return;
    }

    const media = activeViewerMediaElement();
    if (media?.id === "uicm-viewer-video" && isViewerImageClick(event, media)) {
      return;
    }

    if (isViewerImageClick(event, media)) {
      event.preventDefault();
      const clickUrl = imageClickOpenUrl(STATE.selectedImage);
      if (clickUrl) {
        window.open(clickUrl, "_blank", "noopener,noreferrer");
        return;
      }

      if (STATE.galleryImages.length < 2) {
        return;
      }

      const rect = media.getBoundingClientRect();
      const midpoint = rect.left + rect.width / 2;
      showViewerImage(STATE.galleryIndex + (event.clientX < midpoint ? -1 : 1));
      return;
    }

    event.preventDefault();
    closeViewer();
  }

  function isViewerImageClick(event, image) {
    if (!image) {
      return false;
    }

    if (event.target === image) {
      return true;
    }

    if (typeof event.composedPath === "function" && event.composedPath().includes(image)) {
      return true;
    }

    const rect = image.getBoundingClientRect();
    return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
  }

  function activeViewerMediaElement() {
    if (!STATE.viewer) {
      return null;
    }

    const video = STATE.viewer.querySelector("#uicm-viewer-video");
    if (video && !video.hidden) {
      return video;
    }

    return STATE.viewer.querySelector("#uicm-viewer-image");
  }

  function prepareViewerGallery() {
    const selectedKey = canonicalImageKey(STATE.selectedImage);
    const images = collectGalleryImages(STATE.selectedImage);
    const selectedFromPage = images.find((image) => canonicalImageKey(image) === selectedKey);
    STATE.galleryImages = selectedFromPage ? images : [STATE.selectedImage, ...images.filter((image) => canonicalImageKey(image) !== selectedKey)];
    STATE.galleryIndex = Math.max(0, STATE.galleryImages.findIndex((image) => canonicalImageKey(image) === selectedKey));
    STATE.preloadCache.clear();
    showDebug("gallery", {
      count: STATE.galleryImages.length,
      selected: STATE.galleryIndex + 1,
      images: STATE.galleryImages.map((image, index) => `${index + 1}. ${image.url}`).join("\n"),
    });
  }

  function showViewerImage(index) {
    if (!STATE.viewer || STATE.galleryImages.length === 0) {
      return;
    }

    const total = STATE.galleryImages.length;
    if (index >= total && STATE.externalNeedMore) {
      requestExternalImages(total, { goToIndex: total });
      return;
    }

    STATE.galleryIndex = (index + total) % total;
    STATE.selectedImage = STATE.galleryImages[STATE.galleryIndex];
    STATE.zoom = 1;
    STATE.panX = 0;
    STATE.panY = 0;

    const title = STATE.viewer.querySelector("#uicm-viewer-title");
    const counter = STATE.viewer.querySelector("#uicm-viewer-counter");
    const cornerCounter = STATE.viewer.querySelector("#uicm-viewer-corner-counter");
    const image = STATE.viewer.querySelector("#uicm-viewer-image");
    const video = STATE.viewer.querySelector("#uicm-viewer-video");
    const prev = STATE.viewer.querySelector('[data-uicm-action="prev"]');
    const next = STATE.viewer.querySelector('[data-uicm-action="next"]');

    title.textContent = STATE.selectedImage.title || STATE.selectedImage.url;
    counter.textContent = `${STATE.galleryIndex + 1} / ${total}`;
    cornerCounter.textContent = `${STATE.galleryIndex + 1}/${total}`;
    setViewerMediaSource(image, video, STATE.selectedImage);
    image.alt = STATE.selectedImage.title || "";
    prev.disabled = total < 2;
    next.disabled = total < 2;
    updateViewerTransform();
    preloadAdjacentImages();
    if (STATE.externalNeedMore && STATE.galleryIndex >= Math.max(0, STATE.galleryImages.length - 3)) {
      requestExternalImages(STATE.galleryImages.length);
    }
  }

  async function requestExternalImages(startLength, options = {}) {
    if (Number.isInteger(options.goToIndex)) {
      STATE.externalPendingGoToIndex = options.goToIndex;
    }

    if (!STATE.externalNeedMore || STATE.externalNeedMorePending) {
      return;
    }

    STATE.externalNeedMorePending = true;
    try {
      const moreImages = await STATE.externalNeedMore({
        index: STATE.galleryIndex,
        total: STATE.galleryImages.length,
      });
      const normalized = normalizeExternalImages(moreImages);
      if (normalized.length) {
        const existingKeys = new Set(STATE.galleryImages.map(canonicalImageKey));
        const appended = normalized.filter((image) => !existingKeys.has(canonicalImageKey(image)));
        STATE.galleryImages.push(...appended);
        const pendingGoToIndex = STATE.externalPendingGoToIndex;
        STATE.externalPendingGoToIndex = null;
        if (STATE.viewer && Number.isInteger(pendingGoToIndex) && STATE.galleryImages.length > pendingGoToIndex) {
          showViewerImage(pendingGoToIndex);
        } else if (STATE.viewer) {
          showViewerImage(STATE.galleryIndex);
        }
      } else {
        STATE.externalPendingGoToIndex = null;
      }
    } catch (_error) {
      STATE.externalPendingGoToIndex = null;
      // External pagination is best-effort; keep the current viewer usable.
    } finally {
      STATE.externalNeedMorePending = false;
    }
  }

  function setViewerMediaSource(imageElement, videoElement, image) {
    if (isVideoItem(image)) {
      imageElement.hidden = true;
      imageElement.removeAttribute("src");
      videoElement.hidden = false;
      const poster = cleanExternalUrl(image.poster);
      if (poster) {
        videoElement.poster = poster;
      } else {
        videoElement.removeAttribute("poster");
      }
      videoElement.src = videoResourceUrl(image);
      videoElement.load();
      return;
    }

    videoElement.pause();
    videoElement.hidden = true;
    videoElement.removeAttribute("src");
    videoElement.removeAttribute("poster");
    const cached = STATE.preloadCache.get(image.url);
    if (cached?.loaded && !cached.failed && cached.element.naturalWidth > 0) {
      imageElement.src = cached.element.src;
      imageElement.hidden = false;
      return;
    }
    imageElement.src = image.url;
    imageElement.hidden = false;
  }

  function preloadViewerImages() {
    if (!CONFIG.preloadImagesOnViewerOpen) {
      preloadAdjacentImages();
      return;
    }

    orderedGalleryImages()
      .slice(0, CONFIG.preloadAllLimit)
      .forEach((image, index) => preloadImage(image, index < 2 ? "eager" : "auto"));
  }

  function preloadAdjacentImages() {
    if (!STATE.galleryImages.length) {
      return;
    }

    for (let offset = -CONFIG.preloadAdjacentCount; offset <= CONFIG.preloadAdjacentCount; offset += 1) {
      if (offset === 0) {
        continue;
      }
      const index = (STATE.galleryIndex + offset + STATE.galleryImages.length) % STATE.galleryImages.length;
      preloadImage(STATE.galleryImages[index], "eager");
    }
  }

  function orderedGalleryImages() {
    if (!STATE.galleryImages.length) {
      return [];
    }

    return [
      ...STATE.galleryImages.slice(STATE.galleryIndex),
      ...STATE.galleryImages.slice(0, STATE.galleryIndex),
    ];
  }

  function preloadImage(image, priority) {
    if (!image?.url || isVideoItem(image) || STATE.preloadCache.has(image.url)) {
      return;
    }

    const preload = new Image();
    preload.decoding = "async";
    preload.loading = "eager";
    if ("fetchPriority" in preload) {
      preload.fetchPriority = priority === "eager" ? "high" : "low";
    }

    const record = { element: preload, loaded: false, failed: false };
    preload.onload = () => {
      record.loaded = true;
    };
    preload.onerror = () => {
      record.failed = true;
    };
    STATE.preloadCache.set(image.url, record);
    preload.src = image.url;
  }

  function handleViewerWheel(event) {
    event.preventDefault();
    if (STATE.galleryImages.length < 2) {
      return;
    }

    const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if (Math.abs(delta) < 4) {
      return;
    }

    const now = Date.now();
    if (now - STATE.lastWheelAt < CONFIG.wheelNavigateCooldownMs) {
      return;
    }

    STATE.lastWheelAt = now;
    showViewerImage(STATE.galleryIndex + (delta > 0 ? 1 : -1));
  }

  function handleToolbarReveal(event) {
    if (!STATE.viewer) {
      return;
    }

    if (event.clientY <= CONFIG.toolbarRevealY || event.target.closest?.("#uicm-viewer-toolbar")) {
      STATE.viewer.classList.add("uicm-toolbar-visible");
    } else {
      STATE.viewer.classList.remove("uicm-toolbar-visible");
    }
  }

  function hideToolbar() {
    if (STATE.viewer) {
      STATE.viewer.classList.remove("uicm-toolbar-visible");
    }
  }

  function revealToolbarTemporarily() {
    if (!STATE.viewer) {
      return;
    }
    STATE.viewer.classList.add("uicm-toolbar-visible");
    window.setTimeout(() => {
      if (STATE.viewer) {
        STATE.viewer.classList.remove("uicm-toolbar-visible");
      }
    }, 1200);
  }

  function handleViewerPointerDown(event) {
    if (!(event.currentTarget instanceof Element)) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    STATE.drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      panX: STATE.panX,
      panY: STATE.panY,
      moved: false,
    };
  }

  function handleViewerPointerMove(event) {
    if (!STATE.drag || STATE.drag.pointerId !== event.pointerId) {
      return;
    }
    const dx = event.clientX - STATE.drag.startX;
    const dy = event.clientY - STATE.drag.startY;
    if (Math.hypot(dx, dy) > CONFIG.dragClickTolerancePx) {
      STATE.drag.moved = true;
    }
    STATE.panX = STATE.drag.panX + dx;
    STATE.panY = STATE.drag.panY + dy;
    updateViewerTransform();
  }

  function handleViewerPointerUp(event) {
    if (STATE.drag && STATE.drag.pointerId === event.pointerId) {
      if (STATE.drag.moved) {
        STATE.suppressViewerClick = true;
        window.setTimeout(() => {
          STATE.suppressViewerClick = false;
        }, 0);
      }
      STATE.drag = null;
    }
  }

  function setZoom(value) {
    STATE.zoom = Math.min(8, Math.max(0.2, value));
    updateViewerTransform();
  }

  function updateViewerTransform() {
    const media = activeViewerMediaElement();
    if (!media) {
      return;
    }
    media.style.setProperty("--uicm-zoom", String(STATE.zoom));
    media.style.setProperty("--uicm-pan-x", `${STATE.panX}px`);
    media.style.setProperty("--uicm-pan-y", `${STATE.panY}px`);
  }

  function closeViewer() {
    if (STATE.viewer) {
      const onClose = STATE.externalOnClose;
      STATE.viewer.remove();
      STATE.viewer = null;
      STATE.drag = null;
      STATE.externalNeedMore = null;
      STATE.externalOnClose = null;
      STATE.externalNeedMorePending = false;
      STATE.externalPendingGoToIndex = null;
      STATE.preloadCache.clear();
      if (onClose) {
        onClose();
      }
    }
  }

  function closeMenu() {
    if (STATE.menu) {
      STATE.menu.remove();
      STATE.menu = null;
    }
  }

  function collectGalleryImages(selectedImage) {
    const arcaImages = collectArcaArticleImages(selectedImage);
    if (arcaImages.length > 0) {
      return arcaImages;
    }

    const scope = findGalleryScope(selectedImage);
    const seen = new Set();
    const images = [];

    scope.root.querySelectorAll("img, a[href]").forEach((element) => {
      if (!isElementInGalleryScope(element, scope)) {
        return;
      }
      if (element instanceof HTMLImageElement && isIgnorableGalleryImageElement(element)) {
        return;
      }
      const image = resolveElementImage(element);
      if (!image || isPlaceholderImageUrl(image.url) || isPlaceholderImageUrl(imageResourceUrl(image))) {
        return;
      }
      if (element instanceof HTMLImageElement && !isLargeEnough(element, CONFIG.minDownloadSize)) {
        return;
      }
      const key = canonicalImageKey(image);
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      images.push(image);
    });

    return images;
  }

  function collectArcaArticleImages(selectedImage) {
    if (!/(\.|^)arca\.live$/i.test(location.hostname) || !/^\/b\/[^/]+\/\d+/i.test(location.pathname)) {
      return [];
    }

    const root = selectedImage?.element?.closest?.(".article-content") || document.querySelector(".article-content");
    if (!root) {
      return [];
    }

    const seen = new Set();
    return Array.from(root.querySelectorAll("img:not(.arca-emoticon):not(.twemoji)"))
      .map((image) => resolveArcaArticleImage(image))
      .filter((image) => {
        if (!image) {
          return false;
        }
        const key = canonicalImageKey(image);
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
  }

  function resolveArcaArticleImage(image) {
    if (!(image instanceof HTMLImageElement)) {
      return null;
    }

    if (image.style.width === "0px" || image.style.height === "0px") {
      return null;
    }

    if (image.classList.contains("arca-emoticon") || image.classList.contains("twemoji")) {
      return null;
    }

    const url = normalizeImageUrl(image.currentSrc || image.src);
    if (!url || isPlaceholderImageUrl(url) || isIgnorableGalleryImageElement(image)) {
      return null;
    }

    return {
      element: image,
      originalUrl: arcaOriginalImageUrl(url),
      source: "arca-article-image",
      url,
      title: imageTitle(image, url),
    };
  }

  function arcaOriginalImageUrl(url) {
    try {
      const original = new URL(url, document.baseURI);
      original.searchParams.set("type", "orig");
      return original.href;
    } catch (_error) {
      return url;
    }
  }

  function findGalleryScope(selectedImage) {
    const element = selectedImage?.element;
    const articleRoot = element && findClosestContentRoot(element);
    if (articleRoot) {
      return { root: articleRoot, boundary: null };
    }

    const mainRoot = element?.closest?.("main, article, [role='main']") || document.querySelector("main, article, [role='main']") || document.body;
    return { root: mainRoot, boundary: findCommentBoundary(mainRoot, element) };
  }

  function findClosestContentRoot(element) {
    const selectors = [
      "[data-article-content]",
      "[data-post-content]",
      ".article-content",
      ".article-body",
      ".article-view",
      ".article-entry",
      ".board-article-content",
      ".post-content",
      ".entry-content",
      ".view-content",
      ".read-content",
      ".fr-view",
      ".markdown-body",
      ".prose",
    ];

    for (const selector of selectors) {
      const root = element.closest?.(selector);
      if (root && !isLikelyCommentContainer(root)) {
        return root;
      }
    }

    return null;
  }

  function findCommentBoundary(root, selectedElement) {
    const boundarySelectors = [
      "[id*='comment' i]",
      "[class*='comment' i]",
      "[id*='reply' i]",
      "[class*='reply' i]",
      "[aria-label*='댓글']",
      "[aria-label*='comment' i]",
      "h1",
      "h2",
      "h3",
      "h4",
      "[role='heading']",
    ];

    const candidates = Array.from(root.querySelectorAll(boundarySelectors.join(",")));
    return candidates.find((candidate) => {
      if (selectedElement && !isAfter(candidate, selectedElement)) {
        return false;
      }
      const text = (candidate.textContent || candidate.getAttribute("aria-label") || "").trim();
      return /댓글|코멘트|comment|reply/i.test(text) || isLikelyCommentContainer(candidate);
    }) || null;
  }

  function isElementInGalleryScope(element, scope) {
    if (!scope.root.contains(element)) {
      return false;
    }
    if (scope.boundary && !isBefore(element, scope.boundary)) {
      return false;
    }
    if (element.closest?.("[id*='comment' i], [class*='comment' i], [id*='reply' i], [class*='reply' i]")) {
      return false;
    }
    return !isLikelyCommentContainer(element.closest?.("[id], [class], [role]") || element);
  }

  function isLikelyCommentContainer(element) {
    if (!(element instanceof Element)) {
      return false;
    }
    const marker = [
      element.id,
      String(element.className || ""),
      element.getAttribute("role"),
      element.getAttribute("aria-label"),
    ].join(" ");
    return /\b(comment|comments|reply|replies|cmt)\b/i.test(marker) || /댓글|대댓글/.test(marker);
  }

  function isBefore(first, second) {
    return Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
  }

  function isAfter(first, second) {
    return Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_PRECEDING);
  }

  function imageResourceUrl(image) {
    return isVideoItem(image) ? videoResourceUrl(image) : image?.originalUrl || image?.url || "";
  }

  function isVideoItem(image) {
    return image?.type === "video" || Boolean(image?.videoUrl);
  }

  function videoResourceUrl(image) {
    return cleanExternalUrl(image?.videoUrl || image?.originalUrl || image?.url);
  }

  function imageClickOpenUrl(image) {
    return cleanExternalUrl(image?.clickUrl || image?.postUrl || image?.pageUrl || image?.permalink || "");
  }

  function isLargeEnough(element, minSize) {
    const rect = element.getBoundingClientRect();
    if (rect.width >= minSize && rect.height >= minSize) {
      return true;
    }
    if (element instanceof HTMLImageElement) {
      return element.naturalWidth >= minSize && element.naturalHeight >= minSize;
    }
    return false;
  }

  function isIgnorableGalleryImageElement(image) {
    const rect = image.getBoundingClientRect();
    const style = window.getComputedStyle(image);
    return (
      rect.width <= 1 ||
      rect.height <= 1 ||
      style.display === "none" ||
      style.visibility === "hidden" ||
      Number(style.opacity) === 0 ||
      image.getAttribute("aria-hidden") === "true" ||
      Boolean(image.closest?.("[aria-hidden='true'], template, noscript"))
    );
  }

  function backgroundImageUrl(element) {
    const value = window.getComputedStyle(element).backgroundImage;
    if (!value || value === "none") {
      return "";
    }
    const match = value.match(/url\((['"]?)(.*?)\1\)/);
    return normalizeImageUrl(match && match[2]);
  }

  function bestSrcsetUrl(srcset) {
    if (!srcset) {
      return "";
    }
    return srcset
      .split(",")
      .map((part) => {
        const pieces = part.trim().split(/\s+/);
        const url = pieces[0] || "";
        const width = Number((pieces[1] || "").replace(/w$/, "")) || 0;
        return { url, width };
      })
      .sort((a, b) => b.width - a.width)[0]?.url || "";
  }

  function normalizeImageUrl(url) {
    if (!url) {
      return "";
    }
    try {
      return new URL(url, document.baseURI).href;
    } catch (_error) {
      return "";
    }
  }

  function sameImageUrl(first, second) {
    const firstUrl = normalizeImageUrl(first);
    const secondUrl = normalizeImageUrl(second);
    return Boolean(firstUrl && secondUrl && firstUrl === secondUrl);
  }

  function canonicalImageKey(image) {
    const resourceUrl = imageResourceUrl(image);
    return normalizeArcaCdnImageKey(resourceUrl) || normalizeArcaCdnImageKey(image?.url) || resourceUrl || image?.url || "";
  }

  function imageIgnoreKeys(image) {
    const keys = [
      canonicalImageKey(image),
      normalizeImageUrl(image?.url),
      normalizeImageUrl(imageResourceUrl(image)),
      normalizeArcaCdnImageKey(image?.url),
      normalizeArcaCdnImageKey(imageResourceUrl(image)),
    ].filter(Boolean);
    return Array.from(new Set(keys));
  }

  function isIgnoredImage(image) {
    return imageIgnoreKeys(image).some((key) => STATE.ignoredImageKeys.has(key));
  }

  function normalizeArcaCdnImageKey(url) {
    if (!url) {
      return "";
    }

    try {
      const parsed = new URL(url, document.baseURI);
      if (!isKnownImageCdnHost(parsed.hostname)) {
        return "";
      }
      const pathname = parsed.pathname.replace(/^\/+/, "");
      const normalizedHost = parsed.hostname.replace(/^ac-[po]\d*\./i, "ac.");
      return `${normalizedHost}/${pathname}`.toLowerCase();
    } catch (_error) {
      return "";
    }
  }

  function isDirectImageResource(url) {
    return looksLikeImageUrl(url) || isNamuImageCdnUrl(url) || (/^data:image\//i.test(url || "") && !isPlaceholderImageUrl(url));
  }

  function isUsableDisplayImageUrl(url, image) {
    if (!url || isPlaceholderImageUrl(url)) {
      return false;
    }

    if (isDirectImageResource(url) || /^(blob:|filesystem:)/i.test(url)) {
      return true;
    }

    if (image instanceof HTMLImageElement) {
      const loaded = image.complete && image.naturalWidth > 1 && image.naturalHeight > 1;
      const visible = isLargeEnough(image, CONFIG.minClickSize) && !isIgnorableGalleryImageElement(image);
      if (loaded || visible) {
        return /^https?:\/\//i.test(url);
      }
    }

    return false;
  }

  function isPlaceholderImageUrl(url) {
    if (!url) {
      return true;
    }

    if (/^data:image\/(?:gif|png|svg\+xml);/i.test(url)) {
      return !/data:image\/svg\+xml/i.test(url) || /width=['"]?1['"]?|height=['"]?1['"]?|transparent|placeholder/i.test(decodeURIComponent(url.slice(0, 300)));
    }

    try {
      const parsed = new URL(url, document.baseURI);
      const text = `${parsed.pathname} ${parsed.search}`.toLowerCase();
      return /(?:blank|spacer|transparent|placeholder|loading|lazy|pixel|1x1)\.(?:gif|png|webp|svg)/i.test(text);
    } catch (_error) {
      return false;
    }
  }

  function isNamuImageCdnUrl(url) {
    try {
      const parsed = new URL(url, document.baseURI);
      return isKnownImageCdnHost(parsed.hostname) && looksLikeImageUrl(parsed.pathname);
    } catch (_error) {
      return false;
    }
  }

  function isKnownImageCdnHost(hostname) {
    return /(^|\.)namu\.la$/i.test(hostname) || /(^|\.)arca\.live$/i.test(hostname);
  }

  function normalizeExternalImages(images) {
    const seen = new Set();
    const output = [];

    for (const image of Array.isArray(images) ? images : []) {
      const type = image?.type === "video" || image?.kind === "video" || image?.mediaType === "video" ? "video" : "image";
      const videoUrl = type === "video" ? cleanExternalUrl(image.videoUrl || image.originalUrl || image.url || image.src) : "";
      const url = type === "video"
        ? cleanExternalUrl(image.poster || image.thumb || image.thumbnail || image.url || videoUrl)
        : cleanExternalUrl(image?.url || image?.src);
      if (!url && !videoUrl) {
        continue;
      }

      const normalized = {
        element: image.element instanceof Element ? image.element : null,
        type,
        videoUrl,
        poster: type === "video" && url !== videoUrl ? url : "",
        originalUrl: type === "video" ? videoUrl : cleanExternalUrl(image.originalUrl) || url,
        postUrl: cleanExternalUrl(image.postUrl || image.permalink || image.pageUrl || image.clickUrl),
        clickUrl: cleanExternalUrl(image.clickUrl || image.postUrl || image.permalink || image.pageUrl),
        source: image.source || "external",
        url: url || videoUrl,
        title: String(image.title || image.alt || filenameFromUrl(videoUrl || url)).trim(),
      };
      const key = canonicalImageKey(normalized);
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      output.push(normalized);
    }

    return output;
  }

  function cleanExternalUrl(value) {
    if (!value) {
      return "";
    }

    try {
      const url = new URL(String(value), document.baseURI);
      return /^https?:$/i.test(url.protocol) ? url.href : "";
    } catch (_error) {
      return "";
    }
  }

  function clampIndex(index, total) {
    const value = Number(index);
    if (!Number.isFinite(value) || total < 1) {
      return 0;
    }

    return Math.max(0, Math.min(total - 1, Math.trunc(value)));
  }

  function isDisabledHost(hostname) {
    return CONFIG.disabledHostPatterns.some((pattern) => pattern.test(hostname)) || STATE.excludedSites.some((site) => sitePatternMatchesHostname(site, hostname));
  }

  function sitePatternMatchesHostname(pattern, hostname) {
    const site = normalizeSitePattern(pattern);
    const host = normalizeSitePattern(hostname);
    if (!site || !host) {
      return false;
    }
    return host === site || host.endsWith(`.${site}`);
  }

  function normalizeSitePattern(value) {
    let text = String(value || "").trim().toLowerCase();
    if (!text) {
      return "";
    }

    try {
      const urlText = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
      text = new URL(urlText).hostname;
    } catch (_error) {
      text = text
        .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
        .replace(/^\/\//, "")
        .split(/[/?#]/)[0];
    }

    if (text.startsWith("[") && text.includes("]")) {
      text = text.slice(1, text.indexOf("]"));
    } else {
      text = text.replace(/:\d+$/, "");
    }

    text = text.replace(/^\*\./, "").replace(/^\.+|\.+$/g, "");
    if (!text || text === "*" || /[\s*]/.test(text)) {
      return "";
    }

    return /^[a-z0-9.-]+$/.test(text) || text.includes(":") ? text : "";
  }

  function uniqueSites(values) {
    const seen = new Set();
    const output = [];
    values.forEach((value) => {
      const site = normalizeSitePattern(value);
      if (!site || seen.has(site)) {
        return;
      }
      seen.add(site);
      output.push(site);
    });
    return output.sort();
  }

  function looksLikeImageUrl(url) {
    return /\.(avif|bmp|gif|jpe?g|png|svg|webp)(?:[?#].*)?$/i.test(url || "");
  }

  function imageTitle(image, url) {
    return image.alt || image.title || image.getAttribute("aria-label") || filenameFromUrl(url);
  }

  function filenameFromUrl(url) {
    try {
      const parsed = new URL(url, document.baseURI);
      const pathname = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || "image");
      return pathname.includes(".") ? pathname : `${pathname}.jpg`;
    } catch (_error) {
      return "image.jpg";
    }
  }

  function injectStyle() {
    const style = document.createElement("style");
    style.textContent = STYLE_TEXT;
    document.documentElement.append(style);
  }

  function exposePublicApi() {
    const api = {
      openViewer(input, startIndex = 0, options = {}) {
        if (Array.isArray(input)) {
          return openExternalViewer(input, startIndex, options);
        }

        const request = input && typeof input === "object" ? input : {};
        return openExternalViewer(request.images, request.index || 0, request);
      },
      closeViewer,
      isOpen() {
        return Boolean(STATE.viewer);
      },
    };

    window.UniversalImageClickMenu = Object.assign(window.UniversalImageClickMenu || {}, api);

    const targetWindow = pageWindow();
    if (targetWindow !== window) {
      targetWindow.UniversalImageClickMenu = Object.assign(targetWindow.UniversalImageClickMenu || {}, api);
    }

    dispatchReadyEvent(targetWindow, api);
  }

  function pageWindow() {
    try {
      if (typeof unsafeWindow !== "undefined" && unsafeWindow) {
        return unsafeWindow;
      }
    } catch (_error) {
      // Use the userscript window when unsafeWindow is unavailable.
    }
    return window;
  }

  function dispatchReadyEvent(targetWindow, api) {
    try {
      targetWindow.dispatchEvent(new targetWindow.CustomEvent("uicm:ready", { detail: { api } }));
      return;
    } catch (_error) {
      // Fall back to the sandbox window for userscript managers without unsafeWindow.
    }
    window.dispatchEvent(new CustomEvent("uicm:ready", { detail: { api } }));
  }

  function isOwnUi(target) {
    return target instanceof Element && Boolean(target.closest("#uicm-menu, #uicm-viewer, #uicm-settings"));
  }

  function describeElement(target) {
    if (!(target instanceof Element)) {
      return String(target?.nodeName || target || "");
    }

    const parts = [target.tagName.toLowerCase()];
    if (target.id) {
      parts.push(`#${target.id}`);
    }
    const classes = String(target.className || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 3);
    classes.forEach((className) => parts.push(`.${className}`));
    return parts.join("");
  }

  function iconSvg(name) {
    const paths = {
      open: '<path d="M5 5h6v2H8.41l4.3 4.29-1.42 1.42L7 8.41V11H5V5Z"></path><path d="M4 3h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm0 2v9h9V5H4Z"></path>',
      original: '<path d="M4 3h4v2H5v6h6V8h2v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"></path><path d="M10 2h4v4h-2V5.41L8.71 8.7 7.3 7.29 10.59 4H10V2Z"></path>',
      ignore: '<path d="M3 3h10v10H3V3Zm2 2v6h6V5H5Z"></path><path d="M2.8 1.4 14.6 13.2l-1.4 1.4L1.4 2.8l1.4-1.4Z"></path>',
      settings: '<path d="M7 1h2l.4 1.7c.4.1.8.3 1.1.5l1.5-.9 1 1.7-1.3 1.1c.1.4.1.8.1 1.2l1.3 1.1-1 1.7-1.5-.9c-.4.2-.7.4-1.1.5L9 15H7l-.4-1.7c-.4-.1-.8-.3-1.1-.5l-1.5.9-1-1.7 1.3-1.1c-.1-.4-.1-.8-.1-1.2L2.9 8.6l1-1.7 1.5.9c.4-.2.7-.4 1.1-.5L7 1Zm1 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z"></path>',
    };
    return `<svg class="uicm-icon" viewBox="0 0 16 16" aria-hidden="true">${paths[name] || paths.open}</svg>`;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
})();
