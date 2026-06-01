// ==UserScript==
// @name         Nexus Mods Game Hider
// @namespace    local.nexusmods.game-hider
// @version      1.1.0
// @description  Hide Nexus Mods cards for selected games on the all-mods feed and mod lists.
// @author       lavenzaP
// @license      MIT
// @homepageURL  https://github.com/lavenzaP/browser-tools
// @supportURL   https://github.com/lavenzaP/browser-tools/issues
// @updateURL    https://raw.githubusercontent.com/lavenzaP/browser-tools/main/nexus-game-hider.user.js
// @downloadURL  https://raw.githubusercontent.com/lavenzaP/browser-tools/main/nexus-game-hider.user.js
// @match        https://www.nexusmods.com/mods*
// @match        https://www.nexusmods.com/*/mods*
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  // You can edit this list directly, use the userscript menu command, or use
  // the floating "NX Hide" button that appears on Nexus Mods pages.
  // Both display names and Nexus slugs work, for example:
  // ["Skyrim Special Edition", "cyberpunk2077", "Stardew Valley"]
  const DEFAULT_BLOCKED_GAMES = [];

  const STORAGE_KEY = "nexus-game-hider.blocked-games";
  const HIDDEN_CLASS = "nxgh-hidden-mod-card";
  const ROOT_SELECTORS = [
    '[data-e2eid="mod-tile"]',
    '[data-e2eid="mod-tile-teaser"]',
    "article",
    "li",
    '[role="listitem"]',
    'div[class*="mod-tile" i]',
    'div[class*="tile" i]',
    'div[class*="card" i]',
  ];

  const style = document.createElement("style");
  style.textContent = `
    .${HIDDEN_CLASS} {
      display: none !important;
    }

    .nxgh-panel {
      position: fixed;
      right: 16px;
      bottom: 16px;
      z-index: 2147483647;
      color: #f5f7fb;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 13px;
    }

    .nxgh-toggle,
    .nxgh-panel button {
      border: 1px solid #445063;
      background: #1d2530;
      color: #f5f7fb;
      cursor: pointer;
      font: inherit;
    }

    .nxgh-toggle {
      min-width: 78px;
      min-height: 36px;
      padding: 0 12px;
      border-radius: 6px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.32);
    }

    .nxgh-dialog {
      width: min(360px, calc(100vw - 32px));
      margin-bottom: 8px;
      padding: 12px;
      border: 1px solid #3a4658;
      border-radius: 8px;
      background: #111820;
      box-shadow: 0 12px 36px rgba(0, 0, 0, 0.45);
    }

    .nxgh-dialog[hidden] {
      display: none !important;
    }

    .nxgh-title {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 8px;
      font-weight: 700;
    }

    .nxgh-close {
      width: 28px;
      height: 28px;
      padding: 0;
      border-radius: 5px;
      line-height: 1;
    }

    .nxgh-dialog textarea {
      box-sizing: border-box;
      width: 100%;
      min-height: 96px;
      padding: 8px;
      border: 1px solid #3a4658;
      border-radius: 6px;
      background: #0b1118;
      color: #f5f7fb;
      font: 13px/1.35 Consolas, "Courier New", monospace;
      resize: vertical;
    }

    .nxgh-actions {
      display: flex;
      gap: 8px;
      margin-top: 8px;
    }

    .nxgh-actions button {
      min-height: 32px;
      padding: 0 10px;
      border-radius: 5px;
    }

    .nxgh-actions .nxgh-save {
      border-color: #3f7f63;
      background: #1f5f45;
    }

    .nxgh-status {
      min-height: 18px;
      margin-top: 8px;
      color: #aeb8c8;
    }
  `;
  document.documentElement.appendChild(style);

  let blockedGames = loadBlockedGames();
  let scanTimer = 0;

  registerMenuCommands();
  createSettingsUi();
  scheduleScan();

  new MutationObserver(scheduleScan).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  function registerMenuCommands() {
    if (typeof GM_registerMenuCommand !== "function") {
      return;
    }

    GM_registerMenuCommand("Set hidden Nexus games", () => {
      const current = getStoredRawList().join(", ");
      const next = window.prompt(
        "Hide these Nexus games. Use display names or slugs, separated by commas.",
        current
      );

      if (next === null) {
        return;
      }

      const games = splitList(next);
      saveBlockedGames(games);
    });

    GM_registerMenuCommand("Clear hidden Nexus games", () => {
      saveBlockedGames([]);
    });
  }

  function createSettingsUi() {
    const panel = document.createElement("div");
    panel.className = "nxgh-panel";
    panel.innerHTML = `
      <div class="nxgh-dialog" hidden>
        <div class="nxgh-title">
          <span>Nexus hidden games</span>
          <button class="nxgh-close" type="button" aria-label="Close">x</button>
        </div>
        <textarea spellcheck="false" placeholder="Skyrim Special Edition, cyberpunk2077"></textarea>
        <div class="nxgh-actions">
          <button class="nxgh-save" type="button">Save</button>
          <button class="nxgh-clear" type="button">Clear</button>
        </div>
        <div class="nxgh-status" aria-live="polite"></div>
      </div>
      <button class="nxgh-toggle" type="button">NX Hide</button>
    `;

    const root = document.body || document.documentElement;
    root.appendChild(panel);

    const dialog = panel.querySelector(".nxgh-dialog");
    const textarea = panel.querySelector("textarea");
    const toggle = panel.querySelector(".nxgh-toggle");
    const close = panel.querySelector(".nxgh-close");
    const save = panel.querySelector(".nxgh-save");
    const clear = panel.querySelector(".nxgh-clear");
    const status = panel.querySelector(".nxgh-status");

    toggle.addEventListener("click", () => {
      const willOpen = dialog.hidden;
      dialog.hidden = !willOpen;

      if (willOpen) {
        textarea.value = getStoredRawList().join(", ");
        status.textContent = `${blockedGames.length} games hidden`;
        textarea.focus();
      }
    });

    close.addEventListener("click", () => {
      dialog.hidden = true;
    });

    save.addEventListener("click", () => {
      const games = splitList(textarea.value);
      saveBlockedGames(games);
      textarea.value = games.join(", ");
      status.textContent = `Saved ${games.length} hidden games`;
    });

    clear.addEventListener("click", () => {
      saveBlockedGames([]);
      textarea.value = "";
      status.textContent = "Cleared";
    });

    textarea.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        dialog.hidden = true;
      }
    });
  }

  function saveBlockedGames(games) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(games));
    blockedGames = games.map(normalize).filter(Boolean);
    scanNow();
  }

  function scheduleScan() {
    window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(scanNow, 120);
  }

  function scanNow() {
    document.querySelectorAll(`.${HIDDEN_CLASS}`).forEach((card) => {
      card.classList.remove(HIDDEN_CLASS);
      card.removeAttribute("data-nxgh-hidden-game");
    });

    if (blockedGames.length === 0) {
      return;
    }

    document.querySelectorAll('a[href*="/games/"]').forEach((link) => {
      const game = gameFromLink(link);

      if (!game || !isBlockedGame(game)) {
        return;
      }

      const card = findModCard(link);

      if (!card) {
        return;
      }

      card.classList.add(HIDDEN_CLASS);
      card.setAttribute("data-nxgh-hidden-game", game.name || game.slug);
    });
  }

  function loadBlockedGames() {
    return getStoredRawList().map(normalize).filter(Boolean);
  }

  function getStoredRawList() {
    const stored = localStorage.getItem(STORAGE_KEY);

    if (!stored) {
      return DEFAULT_BLOCKED_GAMES;
    }

    try {
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
    } catch {
      return splitList(stored);
    }
  }

  function splitList(value) {
    return String(value)
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function isBlockedGame(game) {
    const normalizedSlug = normalize(game.slug);
    const normalizedName = normalize(game.name);
    return blockedGames.some((blocked) => {
      return blocked === normalizedSlug || blocked === normalizedName;
    });
  }

  function gameFromLink(link) {
    let url;

    try {
      url = new URL(link.href, location.href);
    } catch {
      return null;
    }

    if (url.hostname !== "www.nexusmods.com") {
      return null;
    }

    const parts = url.pathname.split("/").filter(Boolean);

    if (parts[0] !== "games" || !parts[1]) {
      return null;
    }

    return {
      slug: parts[1],
      name: link.textContent.trim(),
    };
  }

  function findModCard(start) {
    for (const selector of ROOT_SELECTORS) {
      const candidate = start.closest(selector);

      if (candidate && isLikelyModCard(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  function isLikelyModCard(node) {
    if (
      node === document.body ||
      node === document.documentElement ||
      node.closest("footer, header, nav")
    ) {
      return false;
    }

    return Array.from(node.querySelectorAll('a[href*="/mods/"]')).some((link) => {
      try {
        const url = new URL(link.href, location.href);
        const parts = url.pathname.split("/").filter(Boolean);
        return parts.length >= 3 && parts[1] === "mods" && /^\d+$/.test(parts[2]);
      } catch {
        return false;
      }
    });
  }

  function normalize(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "");
  }
})();
