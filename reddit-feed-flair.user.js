// ==UserScript==
// @name         Reddit Feed Flair Badges
// @namespace    https://codex.local/reddit-feed-flair
// @version      0.2.3
// @description  Show visible Reddit post flair badges and optionally hide posts whose flair matches configured words.
// @author       lavenzaP
// @license      MIT
// @homepageURL  https://github.com/lavenzaP/browser-tools
// @supportURL   https://github.com/lavenzaP/browser-tools/issues
// @updateURL    https://raw.githubusercontent.com/lavenzaP/browser-tools/main/reddit-feed-flair.user.js
// @downloadURL  https://raw.githubusercontent.com/lavenzaP/browser-tools/main/reddit-feed-flair.user.js
// @match        https://www.reddit.com/*
// @match        https://old.reddit.com/*
// @match        https://sh.reddit.com/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(function () {
  "use strict";

  const CONFIG = {
    showUnflaired: true,
    unflairedText: "No flair",
    lookupBatchSize: 25,
    lookupDelayMs: 120,
    scanThrottleMs: 250,
    filterButtonText: "Flair filters",
  };

  const STYLE_ID = "rff-style";
  const STYLE_TEXT = `
      .rff-flair-row {
        display: block;
        box-sizing: border-box;
        margin: 4px 0 6px;
        padding: 0;
        line-height: 1;
        pointer-events: none;
      }

      .rff-flair-badge {
        --rff-bg: #eef2f7;
        --rff-fg: #1f2328;
        display: inline-flex;
        align-items: center;
        max-width: min(42rem, 80vw);
        min-height: 20px;
        box-sizing: border-box;
        padding: 2px 8px;
        border: 1px solid rgba(31, 35, 40, 0.12);
        border-radius: 999px;
        background: var(--rff-bg);
        color: var(--rff-fg);
        font: 600 12px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        letter-spacing: 0;
        vertical-align: middle;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .rff-flair-badge[data-rff-kind="none"] {
        --rff-bg: transparent;
        --rff-fg: #6a737d;
        border-style: dashed;
        font-weight: 500;
      }

      .rff-flair-badge[data-rff-kind="error"] {
        --rff-bg: #fff4e5;
        --rff-fg: #8a4b00;
      }

      #rff-filter-toggle {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 2147483647;
        min-height: 34px;
        box-sizing: border-box;
        padding: 6px 10px;
        border: 1px solid rgba(31, 35, 40, 0.2);
        border-radius: 8px;
        background: #ffffff;
        color: #1f2328;
        font: 700 12px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        letter-spacing: 0;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
        cursor: pointer;
      }

      #rff-filter-panel {
        position: fixed;
        right: 16px;
        bottom: 58px;
        z-index: 2147483647;
        width: min(320px, calc(100vw - 32px));
        box-sizing: border-box;
        padding: 12px;
        border: 1px solid rgba(31, 35, 40, 0.14);
        border-radius: 8px;
        background: #ffffff;
        color: #1f2328;
        box-shadow: 0 14px 42px rgba(0, 0, 0, 0.18);
        font: 13px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        letter-spacing: 0;
      }

      #rff-filter-panel[hidden] {
        display: none !important;
      }

      #rff-filter-panel h2 {
        margin: 0 0 10px;
        color: #1f2328;
        font: 700 14px/1.25 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        letter-spacing: 0;
      }

      #rff-filter-form {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 8px;
        margin: 0 0 10px;
      }

      #rff-filter-form input {
        min-width: 0;
        min-height: 32px;
        box-sizing: border-box;
        padding: 5px 8px;
        border: 1px solid rgba(31, 35, 40, 0.22);
        border-radius: 6px;
        background: #ffffff;
        color: #1f2328;
        font: 13px/1.25 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      #rff-filter-form button,
      .rff-filter-chip {
        min-height: 32px;
        box-sizing: border-box;
        border: 1px solid rgba(31, 35, 40, 0.18);
        border-radius: 6px;
        background: #eef2f7;
        color: #1f2328;
        font: 700 12px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        letter-spacing: 0;
        cursor: pointer;
      }

      #rff-filter-form button {
        padding: 5px 10px;
      }

      #rff-filter-list {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .rff-filter-chip {
        padding: 5px 8px;
      }

      .rff-filter-empty,
      .rff-filter-note {
        margin: 0;
        color: #6a737d;
        font: 12px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      .rff-filter-note {
        margin-top: 10px;
      }
    `;
  const PROCESSED_ATTR = "data-rff-processed";
  const BADGE_ATTR = "data-rff-badge-for";
  const CACHE_KEY = "rff-flair-cache-v1";
  const FILTER_KEY = "rff-hidden-flair-terms-v1";
  const MAX_CACHE_ITEMS = 500;

  const flairCache = loadCache();
  let hiddenFlairTerms = loadHiddenFlairTerms();
  const pendingIds = new Set();
  const waitersById = new Map();
  let lookupTimer = 0;
  let scanTimer = 0;
  let filterPanel = null;
  let filterList = null;
  let filterInput = null;

  injectStyles();
  createFilterUi();
  publishHiddenFlairTerms();
  scan();
  scheduleFilterReapply();

  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  window.addEventListener("pageshow", () => {
    hiddenFlairTerms = loadHiddenFlairTerms();
    publishHiddenFlairTerms();
    renderFilterList();
    scan();
    scheduleFilterReapply();
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      hiddenFlairTerms = loadHiddenFlairTerms();
      publishHiddenFlairTerms();
      scan();
      scheduleFilterReapply();
    }
  });

  function scheduleScan() {
    if (scanTimer) {
      return;
    }

    scanTimer = window.setTimeout(() => {
      scanTimer = 0;
      scan();
    }, CONFIG.scanThrottleMs);
  }

  function scan() {
    findPosts(document).forEach(processPost);
  }

  function findPosts(root) {
    const selectors = [
      "shreddit-post",
      ".thing.link[data-fullname^='t3_']",
      "article[id^='t3_']",
      "[data-testid='post-container']",
      "[data-adclicklocation='title']",
    ];

    return uniqueElements(
      selectors.flatMap((selector) => Array.from(root.querySelectorAll(selector)).map(toPostContainer)),
    )
      .filter(isLikelyPost)
      .filter((post) => !post.closest("[data-rff-ignore]"));
  }

  function toPostContainer(element) {
    return (
      element.closest("shreddit-post") ||
      element.closest(".thing.link[data-fullname^='t3_']") ||
      element.closest("[data-testid='post-container']") ||
      element.closest("article") ||
      element
    );
  }

  function processPost(post) {
    if (post.getAttribute(PROCESSED_ATTR) === "1") {
      refreshPostFilter(post);
      return;
    }

    post.setAttribute(PROCESSED_ATTR, "1");

    const directFlair = readFlairFromPost(post);
    if (isCommentsPage() && directFlair.text && hasNativeFlair(post)) {
      return;
    }

    if (directFlair.text && nativeFlairIsAlreadyUnderTitle(post)) {
      applyFlairFilter(post, directFlair);
      return;
    }

    if (directFlair.text) {
      setBadge(post, directFlair);
      return;
    }

    const postId = getPostId(post);
    if (postId && flairCache.has(postId)) {
      setBadge(post, flairCache.get(postId));
      return;
    }

    const permalink = getPermalink(post);
    if (postId) {
      queueByIdLookup(postId, post);
      return;
    }

    if (permalink) {
      lookupByPermalink(permalink, post);
      return;
    }

    setBadge(post, noFlair());
  }

  function readFlairFromPost(post) {
    const attributeNames = [
      "link-flair-text",
      "post-flair-text",
      "flair-text",
      "data-link-flair-text",
      "data-flair-text",
    ];

    for (const name of attributeNames) {
      const value = cleanText(post.getAttribute(name));
      if (value) {
        return {
          text: value,
          backgroundColor: post.getAttribute("link-flair-background-color") || "",
          textColor: post.getAttribute("link-flair-text-color") || "",
        };
      }
    }

    const roots = [post];
    if (post.shadowRoot) {
      roots.push(post.shadowRoot);
    }

    for (const root of roots) {
      const visible = readVisibleFlair(root);
      if (visible.text) {
        return visible;
      }
    }

    return emptyFlair();
  }

  function readVisibleFlair(root) {
    const selectors = [
      "[data-testid='post-flair']",
      "[data-test-id='post-flair']",
      "[slot='post-flair']",
      "shreddit-post-flair",
      ".linkflairlabel",
      "a[href*='f=flair_name']",
      "a[href*='flair_name%3A']",
    ];

    for (const selector of selectors) {
      const node = root.querySelector(selector);
      const text = cleanText(node && (node.getAttribute("title") || node.textContent));
      if (text) {
        return {
          text,
          backgroundColor: readCssColor(node, "background-color"),
          textColor: readCssColor(node, "color"),
        };
      }
    }

    return emptyFlair();
  }

  function hasNativeFlair(post) {
    const roots = [post];
    if (post.shadowRoot) {
      roots.push(post.shadowRoot);
    }

    return roots.some((root) => Boolean(findNativeFlairElement(root)));
  }

  function nativeFlairIsAlreadyUnderTitle(post) {
    const placement = findTitlePlacement(post);
    if (!placement?.target) {
      return false;
    }

    const nativeFlair = findNativeFlairElement(placement.root);
    if (!nativeFlair) {
      return false;
    }

    let sibling = placement.target.nextElementSibling;
    for (let distance = 0; sibling && distance < 4; distance += 1) {
      if (sibling === nativeFlair || sibling.contains(nativeFlair)) {
        return true;
      }

      sibling = sibling.nextElementSibling;
    }

    return false;
  }

  function findNativeFlairElement(root) {
    const selectors = [
      "[data-testid='post-flair']:not(.rff-flair-badge)",
      "[data-test-id='post-flair']:not(.rff-flair-badge)",
      "[slot='post-flair']:not(.rff-flair-badge)",
      "shreddit-post-flair",
      ".linkflairlabel:not(.rff-flair-badge)",
      "a[href*='f=flair_name']:not(.rff-flair-badge)",
      "a[href*='flair_name%3A']:not(.rff-flair-badge)",
    ];

    for (const selector of selectors) {
      const node = root.querySelector(selector);
      if (node && cleanText(node.textContent || node.getAttribute("title"))) {
        return node;
      }
    }

    return null;
  }

  function queueByIdLookup(postId, post) {
    if (!waitersById.has(postId)) {
      waitersById.set(postId, new Set());
    }

    waitersById.get(postId).add(post);
    pendingIds.add(postId);

    if (lookupTimer) {
      return;
    }

    lookupTimer = window.setTimeout(flushIdLookups, CONFIG.lookupDelayMs);
  }

  async function flushIdLookups() {
    lookupTimer = 0;

    const ids = Array.from(pendingIds).slice(0, CONFIG.lookupBatchSize);
    ids.forEach((id) => pendingIds.delete(id));

    if (!ids.length) {
      return;
    }

    try {
      const url = new URL(`/by_id/${ids.join(",")}.json`, window.location.origin);
      url.searchParams.set("raw_json", "1");

      const response = await fetch(url.href, {
        credentials: "include",
        headers: { accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`Reddit returned ${response.status}`);
      }

      const payload = await response.json();
      const results = new Map();

      for (const child of payload?.data?.children || []) {
        const data = child && child.data;
        if (data && data.name) {
          results.set(data.name, flairFromListingData(data));
        }
      }

      for (const id of ids) {
        resolveIdLookup(id, results.get(id) || noFlair());
      }

      saveCache();
    } catch (error) {
      for (const id of ids) {
        resolveIdLookup(id, errorFlair());
      }
    } finally {
      if (pendingIds.size && !lookupTimer) {
        lookupTimer = window.setTimeout(flushIdLookups, CONFIG.lookupDelayMs);
      }
    }
  }

  async function lookupByPermalink(permalink, post) {
    try {
      const url = permalinkJsonUrl(permalink);
      if (!url) {
        setBadge(post, noFlair());
        return;
      }

      const response = await fetch(url.href, {
        credentials: "include",
        headers: { accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`Reddit returned ${response.status}`);
      }

      const payload = await response.json();
      const data = payload?.[0]?.data?.children?.[0]?.data;
      const flair = data ? flairFromListingData(data) : noFlair();

      if (data?.name) {
        flairCache.set(data.name, flair);
        saveCache();
      }

      setBadge(post, flair);
    } catch (error) {
      setBadge(post, errorFlair());
    }
  }

  function resolveIdLookup(postId, flair) {
    flairCache.set(postId, flair);

    const waiters = waitersById.get(postId) || new Set();
    waitersById.delete(postId);

    for (const post of waiters) {
      setBadge(post, flair);
    }
  }

  function flairFromListingData(data) {
    const richText = Array.isArray(data.link_flair_richtext)
      ? data.link_flair_richtext.map((part) => part.t || part.a || "").join("")
      : "";

    const text = cleanText(data.link_flair_text || richText);
    if (!text) {
      return noFlair();
    }

    return {
      text,
      backgroundColor: data.link_flair_background_color || "",
      textColor: data.link_flair_text_color || "",
    };
  }

  function setBadge(post, flair) {
    const normalized = flair && flair.text ? flair : noFlair();

    if (!CONFIG.showUnflaired && normalized.kind === "none") {
      applyFlairFilter(post, normalized);
      return;
    }

    const badge = ensureBadge(post);
    badge.textContent = normalized.text;
    badge.title = normalized.kind === "none" ? "This post has no post flair." : `Post flair: ${normalized.text}`;
    badge.dataset.rffKind = normalized.kind || "flair";

    const backgroundColor = normalized.backgroundColor || "";
    const textColor = normalized.textColor || "";

    badge.style.removeProperty("--rff-bg");
    badge.style.removeProperty("--rff-fg");

    if (isUsableColor(backgroundColor)) {
      badge.style.setProperty("--rff-bg", backgroundColor);
    }

    if (textColor === "light") {
      badge.style.setProperty("--rff-fg", "#ffffff");
    } else if (textColor === "dark") {
      badge.style.setProperty("--rff-fg", "#1f2328");
    } else if (isUsableColor(textColor)) {
      badge.style.setProperty("--rff-fg", textColor);
    }

    applyFlairFilter(post, normalized);
  }

  function applyFlairFilter(post, flair) {
    if (isCommentsPage()) {
      return;
    }

    const flairText = cleanText(flair?.text || "");
    if (flairText) {
      post.setAttribute("data-rff-flair-text", flairText);
    }

    const matchedTerm = findMatchingHiddenTerm(flairText);
    if (!matchedTerm) {
      post.removeAttribute("data-rff-hidden-by-flair");
      post.style.removeProperty("display");
      return;
    }

    post.setAttribute("data-rff-hidden-by-flair", matchedTerm);
    post.style.setProperty("display", "none", "important");
  }

  function findMatchingHiddenTerm(flairText) {
    const normalizedFlair = normalizeFilterTerm(flairText);
    if (!normalizedFlair) {
      return "";
    }

    return hiddenFlairTerms.find((term) => normalizedFlair.includes(term)) || "";
  }

  function createFilterUi() {
    if (document.getElementById("rff-filter-toggle")) {
      return;
    }

    const toggle = document.createElement("button");
    toggle.id = "rff-filter-toggle";
    toggle.type = "button";
    toggle.textContent = CONFIG.filterButtonText;
    toggle.addEventListener("click", () => {
      filterPanel.hidden = !filterPanel.hidden;
      toggle.setAttribute("aria-expanded", String(!filterPanel.hidden));
    });

    filterPanel = document.createElement("section");
    filterPanel.id = "rff-filter-panel";
    filterPanel.hidden = true;
    filterPanel.setAttribute("aria-label", "Reddit flair filters");

    const title = document.createElement("h2");
    title.textContent = "Hide flair words";

    const form = document.createElement("form");
    form.id = "rff-filter-form";

    filterInput = document.createElement("input");
    filterInput.type = "text";
    filterInput.placeholder = "Question, Meme, Spoiler";
    filterInput.setAttribute("aria-label", "Flair word to hide");
    filterInput.autocomplete = "off";

    const addButton = document.createElement("button");
    addButton.type = "submit";
    addButton.textContent = "Add";

    form.append(filterInput, addButton);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      addHiddenFlairTerm(filterInput.value);
      filterInput.value = "";
      filterInput.focus();
    });

    filterList = document.createElement("div");
    filterList.id = "rff-filter-list";

    const note = document.createElement("p");
    note.className = "rff-filter-note";
    note.textContent = "Matches are case-insensitive and can be partial words.";

    filterPanel.append(title, form, filterList, note);
    document.documentElement.append(toggle, filterPanel);
    renderFilterList();
  }

  function renderFilterList() {
    if (!filterList) {
      return;
    }

    filterList.replaceChildren();

    if (!hiddenFlairTerms.length) {
      const empty = document.createElement("p");
      empty.className = "rff-filter-empty";
      empty.textContent = "No hidden flair words yet.";
      filterList.appendChild(empty);
      return;
    }

    for (const term of hiddenFlairTerms) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "rff-filter-chip";
      item.textContent = `${term} x`;
      item.title = `Remove ${term}`;
      item.addEventListener("click", () => removeHiddenFlairTerm(term));
      filterList.appendChild(item);
    }
  }

  function addHiddenFlairTerm(value) {
    const term = normalizeFilterTerm(value);
    if (!term || hiddenFlairTerms.includes(term)) {
      return;
    }

    hiddenFlairTerms = [...hiddenFlairTerms, term].sort();
    saveHiddenFlairTerms();
    renderFilterList();
    refreshFlairFilters();
  }

  function removeHiddenFlairTerm(term) {
    hiddenFlairTerms = hiddenFlairTerms.filter((candidate) => candidate !== term);
    saveHiddenFlairTerms();
    renderFilterList();
    refreshFlairFilters();
  }

  function refreshFlairFilters() {
    for (const post of findPosts(document)) {
      refreshPostFilter(post);
    }
  }

  function refreshPostFilter(post) {
    const cachedFlairText = post.getAttribute("data-rff-flair-text");
    if (cachedFlairText) {
      applyFlairFilter(post, { text: cachedFlairText });
      return;
    }

    const directFlair = readFlairFromPost(post);
    if (directFlair.text) {
      applyFlairFilter(post, directFlair);
      return;
    }

    const postId = getPostId(post);
    if (postId && flairCache.has(postId)) {
      setBadge(post, flairCache.get(postId));
    }
  }

  function scheduleFilterReapply() {
    [300, 1200, 3000].forEach((delay) => {
      window.setTimeout(() => {
        scan();
        refreshFlairFilters();
      }, delay);
    });
  }

  function ensureBadge(post) {
    const key = getPostKey(post);
    let badge = findExistingBadge(post, key);
    let row = badge && badge.closest(".rff-flair-row");

    if (!badge) {
      badge = document.createElement("span");
      badge.className = "rff-flair-badge";
      if (key) {
        badge.setAttribute(BADGE_ATTR, key);
      }
    }

    if (!row) {
      row = document.createElement("div");
      row.className = "rff-flair-row";
      row.setAttribute("data-rff-ignore", "1");
      row.appendChild(badge);
    }

    if (post.matches("shreddit-post")) {
      row.setAttribute("slot", "post-flair");
    } else {
      row.removeAttribute("slot");
    }

    const placement = findTitlePlacement(post);
    if (placement?.target?.parentElement) {
      if (placement.root instanceof ShadowRoot) {
        injectStyles(placement.root);
      }

      placement.target.insertAdjacentElement("afterend", row);
      return badge;
    }

    post.insertAdjacentElement("afterbegin", row);
    return badge;
  }

  function findTitlePlacement(post) {
    const titleText = getExpectedTitle(post);
    const roots = [post];
    if (post.shadowRoot) {
      roots.unshift(post.shadowRoot);
    }

    const selectors = [
      "[slot='title']",
      "[data-testid='post-title']",
      "a[data-click-id='title']",
      "a[id^='post-title']",
      "[id^='post-title']",
      "faceplate-tracker[noun='title'] a",
      "faceplate-tracker[source='post_title'] a",
      "h1",
      "h2",
      "h3",
      ".title a.title",
      ".title",
    ];

    for (const root of roots) {
      for (const selector of selectors) {
        const target = root.querySelector(selector);
        if (target && isTitleElement(target, titleText)) {
          return { root, target };
        }
      }
    }

    if (titleText) {
      const textMatch = findElementByExactText(roots, titleText);
      if (textMatch) {
        return textMatch;
      }
    }

    return null;
  }

  function findExistingBadge(post, key) {
    const selectors = key
      ? [`.rff-flair-badge[${BADGE_ATTR}="${cssEscape(key)}"]`, `[${BADGE_ATTR}="${cssEscape(key)}"]`]
      : [".rff-flair-badge"];

    const roots = [document, post];
    if (post.shadowRoot) {
      roots.push(post.shadowRoot);
    }

    for (const root of roots) {
      for (const selector of selectors) {
        const badge = root.querySelector(selector);
        if (badge) {
          return badge;
        }
      }
    }

    return null;
  }

  function getExpectedTitle(post) {
    const attributeNames = ["post-title", "data-title", "data-post-title", "aria-label", "title"];
    for (const attributeName of attributeNames) {
      const value = cleanText(post.getAttribute(attributeName));
      if (value) {
        return value;
      }
    }

    const lightTitle = post.querySelector("[slot='title'], [data-testid='post-title'], h1, h2, h3, .title");
    return cleanText(lightTitle && lightTitle.textContent);
  }

  function isTitleElement(element, expectedTitle) {
    const text = cleanText(element.textContent || element.getAttribute("aria-label"));
    if (!text) {
      return false;
    }

    if (!expectedTitle) {
      return text.length >= 8 && !looksLikeBodyExcerpt(text);
    }

    return text === expectedTitle || text.startsWith(expectedTitle) || expectedTitle.startsWith(text);
  }

  function findElementByExactText(roots, expectedTitle) {
    for (const root of roots) {
      const candidates = Array.from(root.querySelectorAll("a, h1, h2, h3, [slot='title'], [id^='post-title']"));
      const target = candidates.find((candidate) => cleanText(candidate.textContent) === expectedTitle);
      if (target) {
        return { root, target };
      }
    }

    return null;
  }

  function looksLikeBodyExcerpt(text) {
    return text.length > 180 || /[.!?]\s+\S/.test(text);
  }

  function isCommentsPage() {
    return /\/comments\/[a-z0-9]+/i.test(window.location.pathname);
  }

  function getPostId(post) {
    const values = [
      post.getAttribute("data-fullname"),
      post.getAttribute("fullname"),
      post.getAttribute("thingid"),
      post.getAttribute("post-id"),
      post.id,
    ];

    for (const value of values) {
      const id = normalizePostId(value);
      if (id) {
        return id;
      }
    }

    const permalink = getPermalink(post);
    const match = permalink && permalink.match(/\/comments\/([a-z0-9]+)\b/i);
    return match ? `t3_${match[1]}` : "";
  }

  function normalizePostId(value) {
    const text = cleanText(value);
    if (!text) {
      return "";
    }

    const full = text.match(/\bt3_[a-z0-9]+\b/i);
    if (full) {
      return full[0].toLowerCase();
    }

    if (/^[a-z0-9]{5,10}$/i.test(text)) {
      return `t3_${text.toLowerCase()}`;
    }

    return "";
  }

  function getPermalink(post) {
    const attributes = ["permalink", "data-permalink", "content-href"];
    for (const attribute of attributes) {
      const value = post.getAttribute(attribute);
      if (value) {
        return value;
      }
    }

    const roots = [post];
    if (post.shadowRoot) {
      roots.push(post.shadowRoot);
    }

    for (const root of roots) {
      const link = root.querySelector("a[href*='/comments/']");
      if (link && link.href) {
        return link.href;
      }
    }

    return "";
  }

  function permalinkJsonUrl(permalink) {
    try {
      const url = new URL(permalink, window.location.origin);
      const path = url.pathname.replace(/\/$/, "");
      if (!/\/comments\/[a-z0-9]+/i.test(path)) {
        return null;
      }

      url.pathname = `${path}.json`;
      url.search = "";
      url.searchParams.set("raw_json", "1");
      return url;
    } catch (error) {
      return null;
    }
  }

  function getPostKey(post) {
    return getPostId(post) || getPermalink(post) || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function isLikelyPost(post) {
    if (!(post instanceof Element)) {
      return false;
    }

    if (post.matches(".promotedlink, [data-promoted='true']")) {
      return true;
    }

    return Boolean(getPostId(post) || getPermalink(post) || readFlairFromPost(post).text);
  }

  function emptyFlair() {
    return { text: "", backgroundColor: "", textColor: "", kind: "empty" };
  }

  function noFlair() {
    return {
      text: CONFIG.unflairedText,
      backgroundColor: "",
      textColor: "",
      kind: "none",
    };
  }

  function errorFlair() {
    return {
      text: "Flair unavailable",
      backgroundColor: "",
      textColor: "",
      kind: "error",
    };
  }

  function injectStyles(root = document) {
    const styleRoot = root instanceof ShadowRoot ? root : document.head;
    if (styleRoot.getElementById?.(STYLE_ID) || styleRoot.querySelector?.(`#${STYLE_ID}`)) {
      return;
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = STYLE_TEXT;
    styleRoot.appendChild(style);
  }

  function loadCache() {
    try {
      const raw = window.sessionStorage.getItem(CACHE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return new Map(Array.isArray(parsed) ? parsed : []);
    } catch (error) {
      return new Map();
    }
  }

  function saveCache() {
    try {
      const entries = Array.from(flairCache.entries()).slice(-MAX_CACHE_ITEMS);
      window.sessionStorage.setItem(CACHE_KEY, JSON.stringify(entries));
    } catch (error) {
      // Ignore storage failures; the script still works without a cache.
    }
  }

  function loadHiddenFlairTerms() {
    try {
      const raw = readPersistentValue(FILTER_KEY, "[]");
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }

      return uniqueStrings(parsed.map(normalizeFilterTerm)).sort();
    } catch (error) {
      return [];
    }
  }

  function saveHiddenFlairTerms() {
    writePersistentValue(FILTER_KEY, JSON.stringify(hiddenFlairTerms));
    publishHiddenFlairTerms();
  }

  function publishHiddenFlairTerms() {
    const terms = [...hiddenFlairTerms];
    try {
      document.documentElement.setAttribute("data-rff-hidden-flair-terms", JSON.stringify(terms));
    } catch (error) {
      // Attribute publishing is a bridge for companion userscripts; filtering still works without it.
    }

    try {
      window.dispatchEvent(new CustomEvent("rff:hidden-flair-terms-changed", { detail: { terms } }));
    } catch (error) {
      // Some userscript sandboxes can block CustomEvent details across worlds.
    }
  }

  function readPersistentValue(key, fallback) {
    try {
      if (typeof GM_getValue === "function") {
        return GM_getValue(key, fallback);
      }
    } catch (error) {
      // Fall back to localStorage below.
    }

    try {
      return window.localStorage.getItem(key) || fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writePersistentValue(key, value) {
    try {
      if (typeof GM_setValue === "function") {
        GM_setValue(key, value);
        return;
      }
    } catch (error) {
      // Fall back to localStorage below.
    }

    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      // Ignore storage failures; filters will last until the page reloads.
    }
  }

  function normalizeFilterTerm(value) {
    return cleanText(value).toLowerCase();
  }

  function uniqueElements(elements) {
    return Array.from(new Set(elements));
  }

  function uniqueStrings(strings) {
    return Array.from(new Set(strings.filter(Boolean)));
  }

  function cleanText(value) {
    return (value || "").replace(/\s+/g, " ").trim();
  }

  function readCssColor(node, property) {
    if (!node || !(node instanceof Element)) {
      return "";
    }

    const value = window.getComputedStyle(node).getPropertyValue(property);
    return value && value !== "rgba(0, 0, 0, 0)" ? value : "";
  }

  function isUsableColor(value) {
    return /^(#[0-9a-f]{3,8}|rgb\(|rgba\(|hsl\(|hsla\()/i.test(value || "");
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(value);
    }

    return String(value).replace(/["\\]/g, "\\$&");
  }
})();
