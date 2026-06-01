// ==UserScript==
// @name         Reddit Image Viewer
// @namespace    https://codex.local/reddit-image-viewer
// @version      0.1.11
// @description  Add a mockup-inspired image-first Reddit gallery and viewer overlay.
// @author       lavenzaP
// @license      MIT
// @homepageURL  https://github.com/lavenzaP/browser-tools
// @supportURL   https://github.com/lavenzaP/browser-tools/issues
// @updateURL    https://raw.githubusercontent.com/lavenzaP/browser-tools/main/reddit-image-viewer.user.js
// @downloadURL  https://raw.githubusercontent.com/lavenzaP/browser-tools/main/reddit-image-viewer.user.js
// @match        https://www.reddit.com/*
// @match        https://sh.reddit.com/*
// @match        https://old.reddit.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const SCRIPT_VERSION = "0.1.11";

  const CONFIG = {
    maxPosts: 500,
    maxImagesPerPost: 24,
    minImageSize: 96,
    scanThrottleMs: 400,
    jsonBatchSize: 28,
    jsonDelayMs: 120,
    listingPageLimit: 50,
    feedBottomThresholdPx: 900,
    horizontalWheelCooldownMs: 420,
    slideDurationMs: 10000,
    storagePrefix: "riv:",
    debugExportPostLimit: 220,
  };

  const STATE = {
    host: null,
    root: null,
    launchButton: null,
    app: null,
    slideshow: null,
    posts: [],
    postsByKey: new Map(),
    elementKeys: new WeakMap(),
    nextDomKey: 1,
    pendingJsonIds: new Set(),
    lookedUpJsonIds: new Set(),
    jsonTimer: 0,
    scanTimer: 0,
    feedSourceKey: "",
    feedAfter: "",
    feedLoading: false,
    feedExhausted: false,
    feedError: "",
    feedPagesFetched: 0,
    feedSeenAfters: new Set(),
    selectedKey: "",
    selectedImageIndex: 0,
    appOpen: false,
    slideshowOpen: false,
    feedScrollTop: 0,
    feedScrollLeft: 0,
    resetFeedScrollOnNextRender: false,
    filter: "",
    sort: normalizeSort(readSetting("sort", "best")),
    activeSubreddit: "",
    hiddenFlairTerms: readRffHiddenFlairTerms(),
    playing: false,
    loop: readSetting("loop", "1") === "1",
    shuffle: false,
    speed: Number(readSetting("speed", "1")) || 1,
    fitMode: readSetting("fit", "contain"),
    currentSlideIndex: 0,
    slideStartedAt: 0,
    slideElapsedMs: 0,
    progressTimer: 0,
    searchRenderTimer: 0,
    renderQueued: false,
    lastHorizontalWheelAt: 0,
    lastFocusedElement: null,
    detailWidth: clamp(Number(readSetting("detailWidth", "520")), 320, 900),
    detailPreviewVh: clamp(Number(readSetting("detailPreviewVh", "52")), 28, 78),
    gridMinWidth: clamp(Number(readSetting("gridMinWidth", "210")), 160, 360),
    detailFit: readSetting("detailFit", "contain") === "cover" ? "cover" : "contain",
    feedLayout: normalizeFeedLayout(readSetting("feedLayout", "horizontal")),
    uiSettingsOpen: false,
    debugStatus: "",
  };

  const SVG = {
    bell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
    bookmark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg>',
    chevronDown: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    comment: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg>',
    external: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3h7v7"/><path d="m10 14 11-11"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg>',
    flame: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 14.5a3.5 3.5 0 1 0 7 0c0-2.5-2.5-3.6-2.5-6.5-2.5 1.5-5 3.5-4.5 6.5z"/><path d="M12 22c4 0 7-3 7-7 0-5-4-7-5-12-4 3-9 7-9 12 0 4 3 7 7 7z"/></svg>',
    fullscreen: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5M21 8V3h-5M16 21h5v-5M3 16v5h5"/></svg>',
    grid: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/></svg>',
    history: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 3v6h6"/><path d="M12 7v6l4 2"/></svg>',
    home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11 12 3l9 8"/><path d="M5 10v11h14V10"/><path d="M9 21v-6h6v6"/></svg>',
    image: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4z"/><path d="m4 15 4-4 4 4 3-3 5 5"/><path d="M15 9h.01"/></svg>',
    loop: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/></svg>',
    more: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12h.01M19 12h.01M5 12h.01"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m13 17 5-5-5-5"/><path d="M6 18V6"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 12 7-12 7z"/></svg>',
    prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m11 17-5-5 5-5"/><path d="M18 18V6"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 21-4.35-4.35"/><circle cx="11" cy="11" r="7"/></svg>',
    settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"/><path d="M19.4 15a1.7 1.7 0 0 0 .35 1.88l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 1.55V21a2 2 0 0 1-4 0v-.05a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.88.35l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 0 1 0-4h.05A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.35-1.88l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 0 1 4 0v.05A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.88-.35l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 0 1 0 4h-.05A1.7 1.7 0 0 0 19.4 15z"/></svg>',
    share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="M16 6 12 2 8 6"/><path d="M12 2v14"/></svg>',
    shuffle: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 3h5v5"/><path d="m4 20 17-17"/><path d="M21 16v5h-5"/><path d="m15 15 6 6"/><path d="m4 4 5 5"/></svg>',
    star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z"/></svg>',
    top: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
    trending: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 17 6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>',
    up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 4 8 12H4z"/></svg>',
    user: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="8" r="4"/></svg>',
  };

  function init() {
    createUiRoot();
    renderLauncher();
    resetListingStateIfChanged();
    scan();
    ensureMoreFeed("init");

    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-rff-hidden-flair-terms"],
    });

    window.addEventListener("popstate", scheduleScan);
    window.addEventListener("focus", scheduleScan);
    window.addEventListener("rff:hidden-flair-terms-changed", onRffHiddenFlairTermsChanged);
    window.setInterval(scheduleScan, 5000);
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("wheel", onRootWheel, { passive: false, capture: true });
  }

  function createUiRoot() {
    if (document.getElementById("riv-host")) {
      return;
    }

    const host = document.createElement("div");
    host.id = "riv-host";
    host.setAttribute("data-rff-ignore", "1");
    injectPageStyle();
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${STYLE_TEXT}</style><button class="riv-launch" type="button" data-riv-action="open-app" aria-label="Open Reddit image viewer"></button><section class="riv-app" hidden></section><section class="riv-slideshow" hidden></section>`;
    (document.body || document.documentElement).appendChild(host);

    STATE.host = host;
    STATE.root = root;
    STATE.launchButton = root.querySelector(".riv-launch");
    STATE.app = root.querySelector(".riv-app");
    STATE.slideshow = root.querySelector(".riv-slideshow");
    syncRffPresence();
    exposeDebugApi();

    root.addEventListener("click", onRootClick);
    root.addEventListener("input", onRootInput);
    root.addEventListener("change", onRootChange);
    root.addEventListener("scroll", onRootScroll, true);
    root.addEventListener("wheel", onRootWheel, { passive: false });
  }

  function scheduleScan() {
    if (STATE.scanTimer) {
      return;
    }

    STATE.scanTimer = window.setTimeout(() => {
      STATE.scanTimer = 0;
      scan();
    }, CONFIG.scanThrottleMs);
  }

  function scan() {
    const sourceChanged = resetListingStateIfChanged();
    const filterChanged = syncRffHiddenFlairTerms();
    let changed = false;
    const posts = findPosts(document);

    posts.slice(0, CONFIG.maxPosts).forEach((postElement) => {
      if (upsertPostFromElement(postElement)) {
        changed = true;
      }
    });

    if (!STATE.selectedKey && STATE.posts.length) {
      STATE.selectedKey = STATE.posts[0].key;
      changed = true;
    }

    if (changed || filterChanged) {
      sortPostsInPlace();
      renderSoon();
    } else {
      renderLauncher();
    }

    if (sourceChanged || (!STATE.feedPagesFetched && !STATE.feedLoading && !STATE.feedExhausted)) {
      ensureMoreFeed(sourceChanged ? "source-change" : "scan");
    }
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
    ).filter(isLikelyPostElement);
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

  function isLikelyPostElement(element) {
    if (!(element instanceof Element)) {
      return false;
    }

    if (element.closest("#riv-host")) {
      return false;
    }

    return Boolean(getPostId(element) || getPermalink(element) || extractDomImages(element).length);
  }

  function upsertPostFromElement(postElement) {
    const postId = getPostId(postElement);
    const permalink = getPermalink(postElement);
    const domImages = extractDomImages(postElement);
    if (!postId && !permalink && !domImages.length) {
      return false;
    }

    const key = postId || permalink || getDomOnlyKey(postElement);
    const existing = STATE.postsByKey.get(key);
    const nextPost = existing || {
      key,
      id: postId,
      title: "",
      subreddit: "",
      author: "",
      permalink: "",
      score: "",
      comments: "",
      text: "",
      flairText: "",
      createdUtc: 0,
      images: [],
      firstSeen: Date.now(),
      jsonLoaded: false,
    };

    const before = postSignature(nextPost);
    nextPost.id = nextPost.id || postId;
    nextPost.permalink = nextPost.permalink || permalink;
    nextPost.title = cleanText(nextPost.title || readTitle(postElement));
    nextPost.subreddit = cleanSubreddit(nextPost.subreddit || readSubreddit(postElement));
    nextPost.author = cleanText(nextPost.author || readAuthor(postElement));
    nextPost.score = cleanText(nextPost.score || readScore(postElement));
    nextPost.comments = cleanText(nextPost.comments || readCommentCount(postElement));
    nextPost.flairText = cleanText(readFlairText(postElement) || nextPost.flairText);
    nextPost.images = mergeImages(nextPost.images, domImages).slice(0, CONFIG.maxImagesPerPost);

    if (!existing) {
      STATE.postsByKey.set(key, nextPost);
      STATE.posts.push(nextPost);
    }

    if (postId && !STATE.lookedUpJsonIds.has(postId)) {
      queueJsonLookup(postId);
    }

    return before !== postSignature(nextPost) || !existing;
  }

  function queueJsonLookup(postId) {
    STATE.pendingJsonIds.add(postId);
    if (STATE.jsonTimer) {
      return;
    }

    STATE.jsonTimer = window.setTimeout(flushJsonLookups, CONFIG.jsonDelayMs);
  }

  async function flushJsonLookups() {
    STATE.jsonTimer = 0;
    const ids = Array.from(STATE.pendingJsonIds).slice(0, CONFIG.jsonBatchSize);
    ids.forEach((id) => {
      STATE.pendingJsonIds.delete(id);
      STATE.lookedUpJsonIds.add(id);
    });

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

      const contentType = response.headers.get("content-type") || "";
      if (!/\bjson\b/i.test(contentType)) {
        throw new Error(`Reddit returned ${contentType || "a non-JSON response"}`);
      }

      const payload = await response.json();
      let changed = false;
      for (const child of payload?.data?.children || []) {
        const data = child?.data;
        if (data && upsertPostFromJson(data)) {
          changed = true;
        }
      }

      if (STATE.pendingJsonIds.size) {
        queueJsonLookup(Array.from(STATE.pendingJsonIds)[0]);
      }

      if (changed) {
        sortPostsInPlace();
        renderSoon();
      }
    } catch (error) {
      ids.forEach((id) => STATE.lookedUpJsonIds.delete(id));
    }
  }

  function resetListingStateIfChanged(force = false) {
    const sourceKey = listingSourceKey();
    if (!force && sourceKey === "no-listing" && STATE.posts.length) {
      return false;
    }

    if (!force && STATE.feedSourceKey === sourceKey) {
      return false;
    }

    STATE.feedSourceKey = sourceKey;
    STATE.feedAfter = "";
    STATE.feedLoading = false;
    STATE.feedExhausted = false;
    STATE.feedError = "";
    STATE.feedPagesFetched = 0;
    STATE.feedSeenAfters = new Set();
    STATE.pendingJsonIds.clear();
    STATE.lookedUpJsonIds.clear();
    STATE.posts = [];
    STATE.postsByKey.clear();
    STATE.selectedKey = "";
    STATE.selectedImageIndex = 0;
    STATE.activeSubreddit = "";
    resetFeedScrollOnNextRender();
    return true;
  }

  function listingSourceKey() {
    const url = listingUrl();
    if (!url) {
      return "no-listing";
    }

    url.searchParams.delete("after");
    url.searchParams.delete("count");
    return `${url.origin}${url.pathname}?${url.searchParams.toString()}`;
  }

  function listingUrl() {
    if (/\/comments\/[a-z0-9]+/i.test(window.location.pathname)) {
      return null;
    }

    const url = new URL(window.location.href);
    const trimmedPath = url.pathname.replace(/\/+$/, "");
    if (/\/search$/i.test(trimmedPath) && !url.searchParams.get("q")) {
      return null;
    }

    if (/\/search$/i.test(trimmedPath)) {
      const searchSort = STATE.sort === "best" ? "relevance" : STATE.sort;
      url.searchParams.set("sort", searchSort);
      url.pathname = `${trimmedPath}.json`;
    } else if (trimmedPath.endsWith(".json")) {
      url.pathname = trimmedPath;
    } else {
      const sortSegments = new Set(["best", "hot", "new", "top", "rising", "controversial"]);
      const pathParts = trimmedPath.split("/").filter(Boolean);
      const lastPart = (pathParts[pathParts.length - 1] || "").toLowerCase();
      if (sortSegments.has(lastPart)) {
        pathParts.pop();
      }

      if (STATE.sort && STATE.sort !== "best") {
        pathParts.push(STATE.sort);
      }

      url.pathname = pathParts.length ? `/${pathParts.join("/")}.json` : "/.json";
    }

    url.searchParams.delete("before");
    url.searchParams.delete("after");
    url.searchParams.delete("count");
    url.searchParams.set("raw_json", "1");
    url.searchParams.set("limit", String(CONFIG.listingPageLimit));
    return url;
  }

  async function ensureMoreFeed(reason) {
    resetListingStateIfChanged();
    if (STATE.feedLoading || STATE.feedExhausted) {
      return false;
    }

    const url = listingUrl();
    if (!url) {
      return false;
    }

    const sourceKey = STATE.feedSourceKey;
    const afterKey = STATE.feedAfter || "__first__";
    if (STATE.feedSeenAfters.has(afterKey)) {
      STATE.feedExhausted = true;
      renderSoon();
      return false;
    }

    STATE.feedSeenAfters.add(afterKey);
    if (STATE.feedAfter) {
      url.searchParams.set("after", STATE.feedAfter);
      url.searchParams.set("count", String(STATE.feedPagesFetched * CONFIG.listingPageLimit));
    }

    STATE.feedLoading = true;
    STATE.feedError = "";
    renderSoon();

    try {
      const response = await fetch(url.href, {
        credentials: "include",
        headers: { accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`Reddit returned ${response.status}`);
      }

      const contentType = response.headers.get("content-type") || "";
      if (!/\bjson\b/i.test(contentType)) {
        throw new Error(`Reddit returned ${contentType || "a non-JSON response"}`);
      }

      const payload = await response.json();
      if (sourceKey !== STATE.feedSourceKey) {
        return false;
      }

      const children = Array.isArray(payload?.data?.children) ? payload.data.children : [];
      let changed = false;
      for (const child of children) {
        const data = child?.data;
        if (data && upsertPostFromJson(data)) {
          changed = true;
        }
      }

      STATE.feedAfter = cleanText(payload?.data?.after || "");
      STATE.feedPagesFetched += 1;
      STATE.feedExhausted = !STATE.feedAfter || !children.length;
      sortPostsInPlace();
      renderSoon();
      return changed;
    } catch (error) {
      STATE.feedError = error?.message || String(error);
      STATE.feedSeenAfters.delete(afterKey);
      return false;
    } finally {
      if (sourceKey === STATE.feedSourceKey) {
        STATE.feedLoading = false;
        renderSoon();
      }
    }
  }

  function upsertPostFromJson(data) {
    const key = normalizePostId(data.name || data.id);
    if (!key) {
      return false;
    }

    const existing = STATE.postsByKey.get(key);
    const nextPost = existing || {
      key,
      id: key,
      title: "",
      subreddit: "",
      author: "",
      permalink: "",
      score: "",
      comments: "",
      text: "",
      flairText: "",
      createdUtc: 0,
      images: [],
      firstSeen: Date.now(),
      jsonLoaded: false,
    };

    const before = postSignature(nextPost);
    const jsonImages = extractImagesFromRedditData(data);
    if (!existing && !jsonImages.length) {
      return false;
    }

    nextPost.id = key;
    nextPost.title = cleanText(data.title || nextPost.title);
    nextPost.subreddit = cleanSubreddit(data.subreddit_name_prefixed || data.subreddit || nextPost.subreddit);
    nextPost.author = cleanText(data.author || nextPost.author);
    nextPost.permalink = absoluteUrl(data.permalink || nextPost.permalink);
    nextPost.score = formatCount(data.score) || nextPost.score;
    nextPost.comments = formatCount(data.num_comments) || nextPost.comments;
    nextPost.text = cleanText(data.selftext || nextPost.text);
    nextPost.flairText = cleanText(flairTextFromRedditData(data) || nextPost.flairText);
    nextPost.createdUtc = Number(data.created_utc || nextPost.createdUtc || 0);
    nextPost.images = mergeImages(jsonImages, nextPost.images).slice(0, CONFIG.maxImagesPerPost);
    nextPost.jsonLoaded = true;

    if (!existing) {
      STATE.postsByKey.set(key, nextPost);
      STATE.posts.push(nextPost);
    }

    return before !== postSignature(nextPost) || !existing;
  }

  function extractImagesFromRedditData(data) {
    const images = [];

    const galleryItems = Array.isArray(data.gallery_data?.items) ? data.gallery_data.items : [];
    const mediaMetadata = data.media_metadata && typeof data.media_metadata === "object" ? data.media_metadata : null;
    if (galleryItems.length && mediaMetadata) {
      galleryItems.forEach((item, index) => {
        const mediaId = item.media_id;
        const metadata = mediaMetadata[mediaId];
        const image = imageFromMediaMetadata(metadata, item.caption || "", index);
        if (image) {
          images.push(image);
        }
      });
      return uniqueImages(images);
    }

    const previewImage = imageFromPreview(data.preview, data.title);
    const video = videoFromRedditData(data, previewImage);
    if (video) {
      images.push(video);
    }

    const directUrl = cleanUrl(data.url_overridden_by_dest || data.url);
    if (!images.length && isImageLikeUrl(directUrl)) {
      images.push({
        type: "image",
        url: directUrl,
        thumb: previewImage?.thumb || directUrl,
        alt: cleanText(data.title),
        width: Number(data.preview?.images?.[0]?.source?.width || 0),
        height: Number(data.preview?.images?.[0]?.source?.height || 0),
      });
    }

    if (!images.length && previewImage) {
      images.push(previewImage);
    }

    const oembedThumb = cleanUrl(data.secure_media?.oembed?.thumbnail_url || data.media?.oembed?.thumbnail_url);
    if (!images.length && isImageLikeUrl(oembedThumb)) {
      images.push({ url: oembedThumb, thumb: oembedThumb, alt: cleanText(data.title), width: 0, height: 0 });
    }

    if (!images.length && Array.isArray(data.crosspost_parent_list)) {
      data.crosspost_parent_list.forEach((crosspost) => {
        images.push(...extractImagesFromRedditData(crosspost));
      });
    }

    return uniqueImages(images);
  }

  function flairTextFromRedditData(data) {
    const richText = Array.isArray(data.link_flair_richtext)
      ? data.link_flair_richtext.map((part) => part.t || part.a || "").join("")
      : "";

    return cleanText(data.link_flair_text || richText);
  }

  function videoFromRedditData(data, previewImage) {
    const video = data.secure_media?.reddit_video || data.media?.reddit_video || data.preview?.reddit_video_preview;
    if (!video) {
      return null;
    }

    const fallbackUrl = cleanUrl(video.fallback_url);
    const scrubberUrl = cleanUrl(video.scrubber_media_url);
    const hlsUrl = cleanUrl(video.hls_url);
    const dashUrl = cleanUrl(video.dash_url);
    const videoUrl = [fallbackUrl, scrubberUrl, hlsUrl, dashUrl].find(isVideoLikeUrl) || "";
    if (!videoUrl) {
      return null;
    }

    const thumbnail = cleanUrl(data.thumbnail);
    const poster = [previewImage?.url, previewImage?.thumb, thumbnail].find((url) => isImageLikeUrl(url)) || "";
    return {
      type: "video",
      url: videoUrl,
      videoUrl,
      fallbackUrl,
      scrubberUrl,
      hlsUrl,
      dashUrl,
      poster,
      thumb: poster,
      alt: cleanText(data.title),
      width: Number(video.width || previewImage?.width || 0),
      height: Number(video.height || previewImage?.height || 0),
      duration: Number(video.duration || 0),
      isGif: Boolean(video.is_gif),
    };
  }

  function imageFromMediaMetadata(metadata, alt, index) {
    if (!metadata || metadata.status === "failed") {
      return null;
    }

    const source = metadata.s || {};
    const previews = Array.isArray(metadata.p) ? metadata.p : [];
    const url = cleanUrl(source.u || source.gif);
    if (!isImageLikeUrl(url)) {
      return null;
    }

    const thumbSource = previews.length ? previews[previews.length - 1] : source;
    const thumb = cleanUrl(thumbSource.u || thumbSource.gif || url);
    return {
      type: "image",
      url,
      thumb: isImageLikeUrl(thumb) ? thumb : url,
      alt: cleanText(alt) || `Gallery image ${index + 1}`,
      width: Number(source.x || 0),
      height: Number(source.y || 0),
    };
  }

  function imageFromPreview(preview, alt) {
    const previewImage = preview?.images?.[0];
    if (!previewImage) {
      return null;
    }

    const variants = previewImage.variants || {};
    const source = variants.gif?.source || previewImage.source;
    const url = cleanUrl(source?.url);
    if (!isImageLikeUrl(url)) {
      return null;
    }

    const resolutions = Array.isArray(previewImage.resolutions) ? previewImage.resolutions : [];
    const thumbCandidate = resolutions.length ? resolutions[resolutions.length - 1] : source;
    const thumb = cleanUrl(thumbCandidate?.url || url);
    return {
      type: "image",
      url,
      thumb: isImageLikeUrl(thumb) ? thumb : url,
      alt: cleanText(alt),
      width: Number(source?.width || 0),
      height: Number(source?.height || 0),
    };
  }

  function extractDomImages(postElement) {
    const roots = getDeepRoots(postElement);
    const images = [];

    roots.forEach((root) => {
      root.querySelectorAll?.("img, source[srcset]").forEach((node) => {
        if (!(node instanceof Element) || isRedundantPictureSource(node) || shouldIgnoreMediaNode(node)) {
          return;
        }

        const urls = [];
        const srcset = node.getAttribute("srcset");
        const parentPicture = node.closest("picture");
        if (node instanceof HTMLImageElement) {
          const link = node.closest("a[href]");
          if (link) {
            urls.push(link.href);
          }
          urls.push(node.getAttribute("data-lazy-src"), node.getAttribute("data-src"));
          urls.push(bestSrcFromSrcset(node.getAttribute("srcset")));
          urls.push(node.currentSrc, node.src);
        }

        urls.push(bestSrcFromSrcset(srcset));
        if (parentPicture) {
          parentPicture.querySelectorAll("source[srcset]").forEach((source) => {
            urls.push(bestSrcFromSrcset(source.getAttribute("srcset")));
          });
        }

        const url = bestDomImageUrl(urls, node);
        if (!url) {
          return;
        }

        const img = node instanceof HTMLImageElement ? node : parentPicture?.querySelector("img");
        images.push({
          url,
          thumb: cleanUrl(img?.currentSrc || img?.src || url),
          alt: cleanText(img?.alt || img?.getAttribute("aria-label") || ""),
          width: Number(img?.naturalWidth || img?.width || 0),
          height: Number(img?.naturalHeight || img?.height || 0),
          debugSource: node.tagName?.toLowerCase() || "",
          debugCandidates: domImageDebugCandidates(urls, node),
        });
      });
    });

    return uniqueImages(images);
  }

  function isRedundantPictureSource(node) {
    return node.tagName?.toLowerCase() === "source" && Boolean(node.closest("picture")?.querySelector("img"));
  }

  function bestDomImageUrl(urls, node) {
    return urls
      .map(cleanUrl)
      .filter((url) => isAcceptableDomImage(url, node))
      .map((url, index) => ({ url, index, score: domImageUrlScore(url) }))
      .sort((left, right) => right.score - left.score || left.index - right.index)[0]?.url || "";
  }

  function domImageDebugCandidates(urls, node) {
    return urls
      .map(cleanUrl)
      .filter(Boolean)
      .map((url, index) => ({
        index,
        url,
        key: canonicalImageKey({ url }),
        score: domImageUrlScore(url),
        acceptable: isAcceptableDomImage(url, node),
      }))
      .filter((item, index, items) => items.findIndex((candidate) => candidate.url === item.url) === index)
      .sort((left, right) => right.score - left.score || left.index - right.index)
      .slice(0, 18);
  }

  function domImageUrlScore(url) {
    try {
      const parsed = new URL(url, window.location.href);
      const host = parsed.hostname.toLowerCase();
      const path = parsed.pathname.toLowerCase();
      let score = 0;

      if (/(^|\.)i\.redd\.it$|(^|\.)i\.imgur\.com$|(^|\.)reddituploads\.com$/i.test(host)) {
        score += 90;
      } else if (/(^|\.)redditmedia\.com$/i.test(host)) {
        score += 60;
      } else if (/(^|\.)preview\.redd\.it$|(^|\.)external-preview\.redd\.it$/i.test(host)) {
        score += 25;
      } else if (/(^|\.)imgur\.com$/i.test(host)) {
        score += 20;
      }

      if (/\.(jpg|jpeg|png|webp|gif|avif)$/i.test(path)) {
        score += 20;
      }

      if (parsed.searchParams.has("crop")) {
        score -= 40;
      }

      if (parsed.searchParams.has("width") || parsed.searchParams.has("height")) {
        score -= 12;
      }

      return score;
    } catch (error) {
      return 0;
    }
  }

  function getDeepRoots(element) {
    const roots = [element];
    const stack = [element];
    while (stack.length) {
      const current = stack.pop();
      if (!current?.querySelectorAll) {
        continue;
      }

      current.querySelectorAll("*").forEach((child) => {
        if (child.shadowRoot) {
          roots.push(child.shadowRoot);
          stack.push(child.shadowRoot);
        }
      });
    }

    if (element.shadowRoot) {
      roots.push(element.shadowRoot);
    }

    return uniqueElements(roots);
  }

  function shouldIgnoreMediaNode(node) {
    const text = [
      node.getAttribute("alt"),
      node.getAttribute("aria-label"),
      node.getAttribute("class"),
      node.getAttribute("id"),
      node.closest("[class]")?.getAttribute("class"),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (/\b(avatar|snoovatar|emoji|emote|award|badge|icon|logo|profile|flair)\b/.test(text)) {
      return true;
    }

    const link = node.closest("a[href]");
    if (link && /\/user\/|\/u\//i.test(link.getAttribute("href") || "")) {
      return true;
    }

    return false;
  }

  function isAcceptableDomImage(url, node) {
    if (!isImageLikeUrl(url)) {
      return false;
    }

    if (isUtilityImageUrl(url)) {
      return false;
    }

    if (isStrongMediaHost(url)) {
      return true;
    }

    const rect = node.getBoundingClientRect();
    const width = Math.max(rect.width, Number(node.getAttribute("width")) || 0);
    const height = Math.max(rect.height, Number(node.getAttribute("height")) || 0);
    return width >= CONFIG.minImageSize && height >= CONFIG.minImageSize;
  }

  function isStrongMediaHost(url) {
    try {
      const host = new URL(url, window.location.href).hostname.toLowerCase();
      return /(^|\.)i\.redd\.it$|(^|\.)preview\.redd\.it$|(^|\.)redditmedia\.com$|(^|\.)imgur\.com$|(^|\.)reddituploads\.com$/i.test(host);
    } catch (error) {
      return false;
    }
  }

  function isUtilityImageUrl(url) {
    try {
      const parsed = new URL(url, window.location.href);
      const full = `${parsed.hostname}${parsed.pathname}`.toLowerCase();
      return /redditstatic\.com|styles\.redditmedia\.com|emoji|avatar|snoovatar|award|badge|icon|logo|profile/.test(full);
    } catch (error) {
      return true;
    }
  }

  function isImageLikeUrl(url) {
    if (!url || !/^https?:\/\//i.test(url)) {
      return false;
    }

    try {
      const parsed = new URL(url, window.location.href);
      const path = parsed.pathname.toLowerCase();
      const host = parsed.hostname.toLowerCase();
      if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(path)) {
        return false;
      }

      if (/\.(jpg|jpeg|png|webp|gif|avif)(\?|$)/i.test(path)) {
        return true;
      }

      return /(^|\.)i\.redd\.it$|(^|\.)preview\.redd\.it$|(^|\.)external-preview\.redd\.it$|(^|\.)redditmedia\.com$|(^|\.)reddituploads\.com$|(^|\.)i\.imgur\.com$/i.test(host);
    } catch (error) {
      return false;
    }
  }

  function isVideoLikeUrl(url) {
    if (!url || !/^https?:\/\//i.test(url)) {
      return false;
    }

    try {
      const parsed = new URL(url, window.location.href);
      const path = parsed.pathname.toLowerCase();
      const host = parsed.hostname.toLowerCase();
      if (/\.(mp4|webm|mov|m4v|m3u8|mpd)(\?|$)/i.test(path)) {
        return true;
      }

      return /(^|\.)v\.redd\.it$/i.test(host);
    } catch (error) {
      return false;
    }
  }

  function bestSrcFromSrcset(srcset) {
    if (!srcset) {
      return "";
    }

    return srcset
      .split(",")
      .map((part) => {
        const pieces = part.trim().split(/\s+/);
        const url = pieces[0] || "";
        const descriptor = pieces[1] || "";
        const score = descriptor.endsWith("w") ? Number.parseInt(descriptor, 10) : descriptor.endsWith("x") ? Number.parseFloat(descriptor) * 1000 : 0;
        return { url, score: Number.isFinite(score) ? score : 0 };
      })
      .filter((item) => item.url)
      .sort((a, b) => b.score - a.score)[0]?.url || "";
  }

  function renderSoon() {
    if (STATE.renderQueued) {
      return;
    }

    STATE.renderQueued = true;
    window.requestAnimationFrame(() => {
      STATE.renderQueued = false;
      renderLauncher();
      if (STATE.appOpen) {
        renderApp();
      }

      if (STATE.slideshowOpen) {
        renderSlideshow();
      }
    });
  }

  function renderLauncher() {
    if (!STATE.launchButton) {
      return;
    }

    syncRffPresence();
    const imageCount = getAllSlides().length;
    STATE.launchButton.innerHTML = `${icon("image")}<span>Viewer</span><strong>${imageCount}</strong>`;
    STATE.launchButton.hidden = STATE.appOpen || STATE.slideshowOpen;
    STATE.launchButton.disabled = !imageCount;
    STATE.launchButton.title = imageCount ? "Open Reddit image viewer" : "Scanning Reddit images";
  }

  function syncRffPresence() {
    if (!STATE.host) {
      return;
    }

    STATE.host.classList.toggle("riv-has-rff-toggle", Boolean(document.getElementById("rff-filter-toggle")));
  }

  function getFeedElement() {
    return STATE.app?.querySelector(".riv-feed") || null;
  }

  function rememberFeedScroll() {
    const feed = getFeedElement();
    if (feed) {
      STATE.feedScrollTop = feed.scrollTop;
      STATE.feedScrollLeft = feed.scrollLeft;
    }
  }

  function resetFeedScrollOnNextRender() {
    STATE.feedScrollTop = 0;
    STATE.feedScrollLeft = 0;
    STATE.resetFeedScrollOnNextRender = true;
  }

  function restoreFeedScroll(scrollTop = STATE.feedScrollTop, scrollLeft = STATE.feedScrollLeft) {
    window.requestAnimationFrame(() => {
      const feed = getFeedElement();
      if (!feed) {
        return;
      }

      const maxScrollTop = Math.max(0, feed.scrollHeight - feed.clientHeight);
      const maxScrollLeft = Math.max(0, feed.scrollWidth - feed.clientWidth);
      feed.scrollTop = clamp(scrollTop, 0, maxScrollTop);
      feed.scrollLeft = clamp(scrollLeft, 0, maxScrollLeft);
      STATE.feedScrollTop = feed.scrollTop;
      STATE.feedScrollLeft = feed.scrollLeft;
    });
  }

  function applyUiSettings() {
    if (!STATE.app) {
      return;
    }

    STATE.app.style.setProperty("--riv-detail-width", `${STATE.detailWidth}px`);
    STATE.app.style.setProperty("--riv-detail-preview-height", `${STATE.detailPreviewVh}vh`);
    STATE.app.style.setProperty("--riv-grid-min-width", `${STATE.gridMinWidth}px`);
    STATE.app.style.setProperty("--riv-detail-fit", STATE.detailFit);
  }

  function updateUiSettingOutputs() {
    const values = {
      detailWidth: `${STATE.detailWidth}px`,
      detailPreviewVh: `${STATE.detailPreviewVh}vh`,
      gridMinWidth: `${STATE.gridMinWidth}px`,
    };

    Object.entries(values).forEach(([name, value]) => {
      const output = STATE.app?.querySelector(`[data-riv-output="${name}"]`);
      if (output) {
        output.textContent = value;
      }
    });
  }

  function syncRffHiddenFlairTerms() {
    return setHiddenFlairTerms(readRffHiddenFlairTerms());
  }

  function setHiddenFlairTerms(terms) {
    const nextTerms = normalizeHiddenFlairTerms(terms);
    if (arraysEqual(STATE.hiddenFlairTerms, nextTerms)) {
      return false;
    }

    STATE.hiddenFlairTerms = nextTerms;
    return true;
  }

  function renderApp() {
    const existingFeed = getFeedElement();
    const previousScrollTop = existingFeed ? existingFeed.scrollTop : STATE.feedScrollTop;
    const previousScrollLeft = existingFeed ? existingFeed.scrollLeft : STATE.feedScrollLeft;
    const shouldRestoreScroll = Boolean(existingFeed) && !STATE.resetFeedScrollOnNextRender;
    const visiblePosts = getVisiblePosts();
    const selectedPost = getSelectedPost(visiblePosts);
    if (selectedPost) {
      STATE.selectedKey = selectedPost.key;
      STATE.selectedImageIndex = clamp(STATE.selectedImageIndex, 0, Math.max(0, selectedPost.images.length - 1));
    }

    STATE.app.hidden = false;
    STATE.app.setAttribute("aria-hidden", "false");
    STATE.app.classList.toggle("riv-ui-settings-open", STATE.uiSettingsOpen);
    STATE.app.classList.toggle("riv-layout-horizontal", STATE.feedLayout === "horizontal");
    applyUiSettings();
    STATE.app.innerHTML = `
      <aside class="riv-sidebar">
        ${renderBrand()}
        <nav class="riv-section" aria-label="Navigation">
          <div class="riv-section-title">Navigation</div>
          ${renderNavButton("home", "Home", true)}
          ${renderNavButton("grid", "Popular", false)}
          ${renderNavButton("bookmark", "Saved", false)}
          ${renderNavButton("history", "History", false)}
        </nav>
        <nav class="riv-section" aria-label="Filters">
          <div class="riv-section-title">Filters</div>
          ${renderFilterButton("flame", "Hot", STATE.sort === "hot", "hot")}
          ${renderFilterButton("settings", "New", STATE.sort === "new", "new")}
          ${renderFilterButton("top", "Top", STATE.sort === "top", "top")}
          ${renderFilterButton("trending", "Rising", STATE.sort === "rising", "rising")}
        </nav>
        <section class="riv-section riv-subs">
          <div class="riv-section-title riv-with-caret">Subreddits ${icon("chevronDown")}</div>
          ${renderSubredditList()}
        </section>
        <section class="riv-section riv-sort">
          <div class="riv-section-title">Sort by</div>
          <select class="riv-select" data-riv-control="sort" aria-label="Sort image posts">
            ${renderSortOption("best", "Best")}
            ${renderSortOption("hot", "Hot")}
            ${renderSortOption("new", "New")}
            ${renderSortOption("top", "Top")}
            ${renderSortOption("rising", "Rising")}
          </select>
        </section>
      </aside>
      <header class="riv-topbar">
        <div class="riv-crumb">Feed <span>/</span> Images</div>
        <label class="riv-search">
          ${icon("search")}
          <input type="search" data-riv-control="search" value="${escapeAttr(STATE.filter)}" placeholder="Search Reddit Images" aria-label="Search Reddit images">
        </label>
        <div class="riv-top-actions">
          <button class="riv-icon-button ${STATE.uiSettingsOpen ? "is-active" : ""}" type="button" aria-label="Display settings" data-riv-action="toggle-ui-settings">${icon("settings")}</button>
          <button class="riv-icon-button" type="button" aria-label="Refresh images" data-riv-action="refresh">${icon("refresh")}</button>
          <button class="riv-icon-button riv-notification" type="button" aria-label="Notifications">${icon("bell")}<span>3</span></button>
          <button class="riv-user-menu" type="button" aria-label="User menu">${icon("user")} ${icon("chevronDown")}</button>
          <button class="riv-icon-button" type="button" aria-label="Close viewer" data-riv-action="close-app">${icon("close")}</button>
        </div>
      </header>
      <main class="riv-feed ${STATE.feedLayout === "horizontal" ? "riv-feed-horizontal" : ""}" aria-label="Reddit image feed">
        ${visiblePosts.length ? renderFeedPosts(visiblePosts, selectedPost) : renderEmptyState()}
        ${STATE.feedLayout === "horizontal" && visiblePosts.length ? "" : renderFeedStatus()}
      </main>
      <aside class="riv-details" aria-label="Selected post details">
        ${selectedPost ? renderDetails(selectedPost) : renderEmptyDetails()}
      </aside>
      <button class="riv-slideshow-fab" type="button" data-riv-action="start-viewer" ${getAllSlides().length ? "" : "disabled"}>${icon("image")}<span>Viewer</span></button>
      ${STATE.uiSettingsOpen ? renderUiSettingsPanel() : ""}
    `;
    applyUiSettings();
    updateUiSettingOutputs();

    if (shouldRestoreScroll) {
      restoreFeedScroll(previousScrollTop, previousScrollLeft);
    } else {
      STATE.resetFeedScrollOnNextRender = false;
      restoreFeedScroll(STATE.feedScrollTop, STATE.feedScrollLeft);
    }
  }

  function renderBrand(modeText = "") {
    return `
      <div class="riv-brand">
        <span class="riv-reddit-mark" aria-hidden="true"><span></span></span>
        <strong>reddit</strong>
        ${modeText ? `<span class="riv-brand-divider"></span><em>${escapeHtml(modeText)}</em>` : ""}
      </div>
    `;
  }

  function renderNavButton(iconName, label, active) {
    return `<button class="riv-side-button ${active ? "is-active" : ""}" type="button">${icon(iconName)}<span>${escapeHtml(label)}</span></button>`;
  }

  function renderFilterButton(iconName, label, active, sort) {
    return `<button class="riv-side-button ${active ? "is-active" : ""}" type="button" data-riv-action="set-sort" data-sort="${escapeAttr(sort)}">${icon(iconName)}<span>${escapeHtml(label)}</span></button>`;
  }

  function renderSubredditList() {
    const counts = new Map();
    STATE.posts.forEach((post) => {
      if (post.subreddit && post.images.length) {
        counts.set(post.subreddit, (counts.get(post.subreddit) || 0) + 1);
      }
    });

    const subreddits = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 9);

    if (!subreddits.length) {
      return `<p class="riv-muted">Scanning feed...</p>`;
    }

    return subreddits
      .map(([subreddit]) => {
        const active = STATE.activeSubreddit === subreddit;
        return `
          <button class="riv-sub-button ${active ? "is-active" : ""}" type="button" data-riv-action="toggle-subreddit" data-subreddit="${escapeAttr(subreddit)}">
            <span class="riv-sub-avatar">${escapeHtml(subredditInitial(subreddit))}</span>
            <span>${escapeHtml(subreddit)}</span>
            <strong>${escapeHtml(String(counts.get(subreddit) || 0))}</strong>
          </button>
        `;
      })
      .join("");
  }

  function renderFeedStatus() {
    if (STATE.feedLoading) {
      return `<div class="riv-feed-status">${icon("refresh")}<span>Loading more image posts...</span></div>`;
    }

    if (STATE.feedError) {
      return `
        <div class="riv-feed-status is-error">
          <span>${escapeHtml(STATE.feedError)}</span>
          <button type="button" data-riv-action="load-more-feed">${icon("refresh")}Retry</button>
        </div>
      `;
    }

    if (STATE.feedExhausted) {
      return `<div class="riv-feed-status"><span>No more posts found for this feed.</span></div>`;
    }

    return `<button class="riv-load-more" type="button" data-riv-action="load-more-feed">${icon("refresh")}Load more</button>`;
  }

  function renderSortOption(value, label) {
    return `<option value="${escapeAttr(value)}" ${STATE.sort === value ? "selected" : ""}>${escapeHtml(label)}</option>`;
  }

  function renderUiSettingsPanel() {
    return `
      <section class="riv-ui-settings-panel" aria-label="Display settings">
        <label>
          <span>Feed layout</span>
          <select data-riv-control="feed-layout" aria-label="Feed layout">
            <option value="horizontal" ${STATE.feedLayout === "horizontal" ? "selected" : ""}>Horizontal</option>
            <option value="grid" ${STATE.feedLayout === "grid" ? "selected" : ""}>Grid</option>
          </select>
        </label>
        <label>
          <span>Post size</span>
          <input type="range" min="160" max="360" step="10" value="${STATE.gridMinWidth}" data-riv-control="grid-min-width">
          <output data-riv-output="gridMinWidth">${STATE.gridMinWidth}px</output>
        </label>
        <label>
          <span>Detail width</span>
          <input type="range" min="320" max="900" step="20" value="${STATE.detailWidth}" data-riv-control="detail-width">
          <output data-riv-output="detailWidth">${STATE.detailWidth}px</output>
        </label>
        <label>
          <span>Preview height</span>
          <input type="range" min="28" max="78" step="2" value="${STATE.detailPreviewVh}" data-riv-control="detail-preview-vh">
          <output data-riv-output="detailPreviewVh">${STATE.detailPreviewVh}vh</output>
        </label>
        <label>
          <span>Image fit</span>
          <select data-riv-control="detail-fit" aria-label="Detail image fit">
            <option value="contain" ${STATE.detailFit === "contain" ? "selected" : ""}>Contain</option>
            <option value="cover" ${STATE.detailFit === "cover" ? "selected" : ""}>Cover</option>
          </select>
        </label>
        <div class="riv-debug-tools">
          <span>Debug log</span>
          <button type="button" data-riv-action="copy-debug-log">Copy</button>
          <button type="button" data-riv-action="download-debug-log">Download</button>
          <output>${escapeHtml(STATE.debugStatus)}</output>
        </div>
      </section>
    `;
  }

  function renderFeedPosts(posts, selectedPost) {
    return STATE.feedLayout === "horizontal" ? renderHorizontalFeed(posts, selectedPost) : renderGrid(posts, selectedPost);
  }

  function renderGrid(posts, selectedPost) {
    return `
      <div class="riv-grid">
        ${posts.map((post) => renderGridCard(post, selectedPost?.key === post.key)).join("")}
      </div>
    `;
  }

  function renderHorizontalFeed(posts, selectedPost) {
    const slides = getAllSlides();
    const activeIndex = Math.max(0, findSlideIndex(STATE.selectedKey, STATE.selectedImageIndex));
    return `
      <button class="riv-horizontal-nav riv-horizontal-prev" type="button" data-riv-action="horizontal-prev" aria-label="Previous image">${icon("prev")}</button>
      <button class="riv-horizontal-nav riv-horizontal-next" type="button" data-riv-action="horizontal-next" aria-label="Next image">${icon("next")}</button>
      <div class="riv-horizontal-strip">
        ${slides.map((slide, index) => renderHorizontalSlide(slide, index, index === activeIndex, slides.length)).join("")}
        <div class="riv-horizontal-status">${renderFeedStatus()}</div>
      </div>
      ${renderHorizontalRail(slides, activeIndex)}
    `;
  }

  function renderHorizontalSlide(slide, index, active, total) {
    const post = slide.post;
    const image = slide.image;
    const imageCount = post.images.length;
    return `
      <article class="riv-horizontal-card ${active ? "is-selected" : ""}" data-key="${escapeAttr(post.key)}" data-image-index="${slide.imageIndex}" data-slide-index="${index}">
        ${renderHorizontalMedia(image, post, index, slide.imageIndex)}
        <div class="riv-horizontal-overlay">
          <div class="riv-detail-sub">
            <span class="riv-sub-avatar">${escapeHtml(subredditInitial(post.subreddit))}</span>
            <strong>${escapeHtml(post.subreddit || "r/reddit")}</strong>
            <span class="riv-horizontal-count">${imageCount > 1 ? `${slide.imageIndex + 1}/${imageCount}` : `${index + 1}/${total}`}</span>
          </div>
          <h2>${escapeHtml(post.title || "Untitled image post")}</h2>
          <div class="riv-card-meta">
            <span class="riv-score">${icon("up")}${escapeHtml(post.score || "-")}</span>
            <span>${icon("comment")}${escapeHtml(post.comments || "-")}</span>
          </div>
        </div>
      </article>
    `;
  }

  function renderHorizontalMedia(media, post, slideIndex, mediaIndex) {
    const label = escapeAttr(`${post.title || "Reddit media"} media ${mediaIndex + 1}`);
    if (isVideoMedia(media)) {
      return `
        <div class="riv-horizontal-media riv-horizontal-video" aria-label="${label}">
          <video src="${escapeAttr(mediaVideoUrl(media))}" poster="${escapeAttr(mediaPosterUrl(media))}" controls playsinline preload="metadata"></video>
        </div>
      `;
    }

    return `
      <button class="riv-horizontal-media" type="button" data-riv-action="horizontal-go" data-index="${slideIndex}" aria-label="Select ${label}">
        <img src="${escapeAttr(media.url)}" alt="${escapeAttr(media.alt || post.title || "Reddit image")}" loading="lazy">
      </button>
    `;
  }

  function renderDetailMedia(media, post) {
    if (isVideoMedia(media)) {
      return `<video src="${escapeAttr(mediaVideoUrl(media))}" poster="${escapeAttr(mediaPosterUrl(media))}" controls playsinline preload="metadata"></video>`;
    }

    return `<img src="${escapeAttr(media.url)}" alt="${escapeAttr(media.alt || post.title || "Selected Reddit image")}">`;
  }

  function renderMediaThumb(media, alt = "") {
    const thumb = mediaThumbUrl(media);
    if (thumb) {
      return `<img src="${escapeAttr(thumb)}" alt="${escapeAttr(alt)}" loading="lazy">`;
    }

    return `<span class="riv-video-thumb">${icon("play")}</span>`;
  }

  function renderHorizontalRail(slides, activeIndex) {
    if (!slides.length) {
      return "";
    }

    return `
      <div class="riv-horizontal-rail" aria-label="Horizontal feed thumbnails">
        ${slides.map((slide, index) => `
          <button class="${index === activeIndex ? "is-active" : ""}" type="button" data-riv-action="horizontal-go" data-index="${index}" aria-label="Go to image ${index + 1}">
            ${renderMediaThumb(slide.image)}
          </button>
        `).join("")}
      </div>
    `;
  }

  function renderGridCard(post, active) {
    const firstImage = post.images[0];
    const imageCount = post.images.length;
    const video = isVideoMedia(firstImage);
    return `
      <article class="riv-card ${active ? "is-selected" : ""}" data-key="${escapeAttr(post.key)}">
        <button class="riv-card-media" type="button" data-riv-action="select-post" data-key="${escapeAttr(post.key)}" aria-label="Select ${escapeAttr(post.title || "image post")}">
          ${renderMediaThumb(firstImage, firstImage.alt || post.title || "Reddit media")}
          <span class="riv-pill riv-card-sub">${escapeHtml(post.subreddit || "r/reddit")}</span>
          ${video ? `<span class="riv-pill riv-image-count">${icon("play")} video</span>` : imageCount > 1 ? `<span class="riv-pill riv-image-count">${imageCount} images</span>` : ""}
        </button>
        <div class="riv-card-meta">
          <span class="riv-score">${icon("up")}${escapeHtml(post.score || "-")}</span>
          <span>${icon("comment")}${escapeHtml(post.comments || "-")}</span>
        </div>
      </article>
    `;
  }

  function renderDetails(post) {
    const image = post.images[STATE.selectedImageIndex] || post.images[0];
    return `
      <div class="riv-detail-preview">
        <button class="riv-detail-close" type="button" data-riv-action="close-app" aria-label="Close viewer">${icon("close")}</button>
        ${renderDetailMedia(image, post)}
      </div>
      <div class="riv-detail-body">
        <div class="riv-detail-sub">
          <span class="riv-sub-avatar">${escapeHtml(subredditInitial(post.subreddit))}</span>
          <strong>${escapeHtml(post.subreddit || "r/reddit")}</strong>
        </div>
        <p class="riv-muted">Posted by ${escapeHtml(post.author ? `u/${post.author}` : "a redditor")}${post.createdUtc ? ` - ${escapeHtml(relativeTime(post.createdUtc))}` : ""}</p>
        <h2>${escapeHtml(post.title || "Untitled image post")}</h2>
        ${post.text ? `<p class="riv-detail-text">${escapeHtml(post.text)}</p>` : ""}
        ${post.images.length > 1 ? renderDetailThumbs(post) : ""}
        <div class="riv-action-row">
          <button class="riv-vote" type="button">${icon("up")}<span>${escapeHtml(post.score || "-")}</span></button>
          <button class="riv-round" type="button" aria-label="Downvote">${icon("chevronDown")}</button>
          <button class="riv-round" type="button" data-riv-action="open-post" data-key="${escapeAttr(post.key)}" aria-label="Open comments">${icon("comment")}<span>${escapeHtml(post.comments || "-")}</span></button>
          <button class="riv-round" type="button" data-riv-action="open-image" aria-label="Open image">${icon("external")}</button>
          <button class="riv-round" type="button" aria-label="More actions">${icon("more")}</button>
        </div>
        <div class="riv-awards">
          <div class="riv-section-title">Top awards</div>
          <span>1</span><span>1</span><span>2</span><span>3</span><span>1</span>
        </div>
        <div class="riv-comments">
          <div class="riv-section-title">Comments (${escapeHtml(post.comments || "0")})</div>
          <div class="riv-comment-input">${icon("user")}<span>Add a comment...</span></div>
        </div>
      </div>
    `;
  }

  function renderDetailThumbs(post) {
    return `
      <div class="riv-detail-thumbs" aria-label="Post image thumbnails">
        ${post.images
          .map(
            (image, index) => `
              <button class="${index === STATE.selectedImageIndex ? "is-active" : ""}" type="button" data-riv-action="select-detail-image" data-index="${index}" aria-label="Show image ${index + 1}">
                ${renderMediaThumb(image)}
              </button>
            `,
          )
          .join("")}
      </div>
    `;
  }

  function renderEmptyState() {
    return `
      <div class="riv-empty">
        ${icon("image")}
        <h2>No image posts found yet</h2>
        <p>The viewer is loading Reddit image posts from this feed. Press refresh if Reddit returns an empty or blocked listing.</p>
        <button type="button" data-riv-action="refresh">${icon("refresh")}Refresh</button>
      </div>
    `;
  }

  function renderEmptyDetails() {
    return `
      <div class="riv-empty riv-empty-details">
        ${icon("image")}
        <h2>Select an image</h2>
        <p>Image details will appear here.</p>
      </div>
    `;
  }

  function renderSlideshow() {
    const slides = getAllSlides();
    if (!slides.length) {
      closeSlideshow();
      return;
    }

    STATE.currentSlideIndex = clamp(STATE.currentSlideIndex, 0, slides.length - 1);
    const slide = slides[STATE.currentSlideIndex];
    const post = slide.post;
    const image = slide.image;

    STATE.slideshow.hidden = false;
    STATE.slideshow.setAttribute("aria-hidden", "false");
    STATE.slideshow.innerHTML = `
      <div class="riv-show-frame" role="dialog" aria-modal="true" aria-label="Reddit viewer" tabindex="-1">
        <header class="riv-show-top">
          ${renderBrand("Viewer Mode")}
          <div class="riv-show-title">
            <strong>${escapeHtml(post.title || "Untitled image post")}</strong>
            <span>${escapeHtml(post.subreddit || "r/reddit")}</span>
          </div>
          <div class="riv-show-actions">
            <button class="riv-icon-button" type="button" data-riv-action="close-slideshow" aria-label="Exit viewer">${icon("close")}</button>
            <button class="riv-icon-button" type="button" data-riv-action="toggle-settings" aria-label="Viewer settings">${icon("settings")}</button>
            <button class="riv-icon-button" type="button" data-riv-action="toggle-fullscreen" aria-label="Toggle fullscreen">${icon("fullscreen")}</button>
          </div>
        </header>
        <main class="riv-show-stage">
          <div class="riv-counter">Image ${STATE.currentSlideIndex + 1} of ${slides.length}</div>
          <div class="riv-show-metrics">
            <span>${icon("up")}${escapeHtml(post.score || "-")}</span>
            <span>${icon("comment")}${escapeHtml(post.comments || "-")}</span>
          </div>
          <button class="riv-show-nav riv-prev" type="button" data-riv-action="prev-slide" aria-label="Previous image">${icon("prev")}</button>
          <img class="riv-show-image riv-fit-${escapeAttr(STATE.fitMode)}" src="${escapeAttr(image.url)}" alt="${escapeAttr(image.alt || post.title || "Reddit image")}">
          <button class="riv-show-nav riv-next" type="button" data-riv-action="next-slide" aria-label="Next image">${icon("next")}</button>
          <div class="riv-settings-panel" hidden>
            <label>Fit
              <select data-riv-control="fit">
                <option value="contain" ${STATE.fitMode === "contain" ? "selected" : ""}>Contain</option>
                <option value="cover" ${STATE.fitMode === "cover" ? "selected" : ""}>Cover</option>
              </select>
            </label>
            <button type="button" data-riv-action="open-post" data-key="${escapeAttr(post.key)}">${icon("external")}Open post</button>
          </div>
        </main>
        <footer class="riv-show-bottom">
          <div class="riv-filmstrip" aria-label="Viewer thumbnails">
            ${slides.map((item, index) => renderFilmstripItem(item, index)).join("")}
          </div>
          <button class="riv-progress" type="button" data-riv-action="restart-slide" aria-label="Restart slide timer">
            <span class="riv-progress-fill"></span>
          </button>
          <div class="riv-playback">
            <button class="riv-control" type="button" data-riv-action="prev-slide" aria-label="Previous image">${icon("prev")}</button>
            <button class="riv-main-control" type="button" data-riv-action="toggle-play" aria-label="${STATE.playing ? "Pause" : "Play"} viewer">${icon(STATE.playing ? "pause" : "play")}</button>
            <button class="riv-control" type="button" data-riv-action="next-slide" aria-label="Next image">${icon("next")}</button>
            <button class="riv-control ${STATE.shuffle ? "is-active" : ""}" type="button" data-riv-action="toggle-shuffle" aria-label="Toggle shuffle">${icon("shuffle")}</button>
            <span class="riv-time">0:00 / 0:10</span>
            <button class="riv-speed" type="button" data-riv-action="cycle-speed">${escapeHtml(formatSpeed(STATE.speed))} ${icon("chevronDown")}</button>
            <button class="riv-control ${STATE.loop ? "is-active" : ""}" type="button" data-riv-action="toggle-loop" aria-label="Toggle loop">${icon("loop")}</button>
          </div>
        </footer>
      </div>
    `;

    scrollActiveThumbIntoView();
    restartProgressLoop();
    updateProgressUi();
  }

  function renderFilmstripItem(slide, index) {
    return `
      <button class="${index === STATE.currentSlideIndex ? "is-active" : ""}" type="button" data-riv-action="go-slide" data-index="${index}" aria-label="Go to image ${index + 1}">
        <img src="${escapeAttr(slide.image.thumb || slide.image.url)}" alt="">
      </button>
    `;
  }

  function openApp() {
    STATE.lastFocusedElement = document.activeElement;
    STATE.appOpen = true;
    document.documentElement.classList.add("riv-page-locked");
    ensureMoreFeed("open-app");
    renderApp();
    renderLauncher();
    window.setTimeout(() => {
      if (STATE.feedLayout !== "horizontal") {
        STATE.root.querySelector("[data-riv-control='search']")?.focus();
      }
    }, 0);
  }

  function closeApp() {
    STATE.appOpen = false;
    STATE.app.hidden = true;
    STATE.app.setAttribute("aria-hidden", "true");
    if (!STATE.slideshowOpen) {
      document.documentElement.classList.remove("riv-page-locked");
    }

    renderLauncher();
    restoreFocus();
  }

  function startSlideshow() {
    const slides = getAllSlides();
    if (!slides.length) {
      return;
    }

    const selectedIndex = findSlideIndex(STATE.selectedKey, STATE.selectedImageIndex);
    STATE.currentSlideIndex = selectedIndex >= 0 ? selectedIndex : 0;
    STATE.slideElapsedMs = 0;
    STATE.slideStartedAt = performance.now();
    STATE.playing = true;
    STATE.slideshowOpen = true;
    document.documentElement.classList.add("riv-page-locked");
    renderLauncher();
    renderSlideshow();
    window.setTimeout(() => {
      STATE.root.querySelector(".riv-show-frame")?.focus();
    }, 0);
  }

  function closeSlideshow() {
    STATE.slideshowOpen = false;
    STATE.playing = false;
    stopProgressLoop();
    STATE.slideshow.hidden = true;
    STATE.slideshow.setAttribute("aria-hidden", "true");
    if (!STATE.appOpen) {
      document.documentElement.classList.remove("riv-page-locked");
    }

    renderLauncher();
    renderApp();
  }

  function selectPost(key) {
    const post = STATE.postsByKey.get(key);
    if (!post) {
      return;
    }

    STATE.selectedKey = key;
    STATE.selectedImageIndex = 0;
    rememberFeedScroll();
    renderApp();
  }

  function setSelectedImage(index) {
    const post = STATE.postsByKey.get(STATE.selectedKey);
    if (!post) {
      return;
    }

    STATE.selectedImageIndex = clamp(index, 0, post.images.length - 1);
    rememberFeedScroll();
    renderApp();
  }

  async function startViewer() {
    await ensureMoreFeed("viewer-open");
    const slides = getAllSlides();
    if (!slides.length) {
      return;
    }

    const selectedIndex = findSlideIndex(STATE.selectedKey, STATE.selectedImageIndex);
    const startIndex = selectedIndex >= 0 ? selectedIndex : 0;
    if (openUniversalViewer(slides, startIndex)) {
      closeApp();
      return;
    }

    STATE.feedError = "Universal Image Click Menu is not available. Enable universal-image-click-menu.user.js to open the fullscreen viewer.";
    renderApp();
  }

  function openUniversalViewer(slides, startIndex) {
    const api = window.UniversalImageClickMenu;
    if (!api || typeof api.openViewer !== "function") {
      return false;
    }

    document.documentElement.classList.add("riv-universal-viewer-open");
    const opened = api.openViewer(slides.map(toUniversalImage), startIndex, {
      onNeedMore: loadMoreViewerImages,
      onClose: () => document.documentElement.classList.remove("riv-universal-viewer-open"),
    });
    if (!opened) {
      document.documentElement.classList.remove("riv-universal-viewer-open");
      return false;
    }

    return true;
  }

  async function loadMoreViewerImages() {
    const beforeKeys = new Set(getAllSlides().map(slideKey));
    await ensureMoreFeed("viewer-near-end");
    return getAllSlides()
      .filter((slide) => !beforeKeys.has(slideKey(slide)))
      .map(toUniversalImage);
  }

  function toUniversalImage(slide) {
    const titleParts = [slide.post.title, slide.post.subreddit].filter(Boolean);
    const video = isVideoMedia(slide.image);
    const videoUrl = video ? mediaVideoUrl(slide.image) : "";
    const poster = video ? mediaPosterUrl(slide.image) : "";
    return {
      type: video ? "video" : "image",
      url: video ? poster || videoUrl : slide.image.url,
      videoUrl,
      poster,
      originalUrl: video ? videoUrl : slide.image.url,
      postUrl: slide.post.permalink || "",
      clickUrl: slide.post.permalink || "",
      title: titleParts.join(" - ") || slide.image.alt || "Reddit media",
      alt: slide.image.alt || slide.post.title || "",
      source: "reddit-image-viewer",
    };
  }

  function goToSlide(index) {
    const slides = getAllSlides();
    if (!slides.length) {
      return;
    }

    STATE.currentSlideIndex = clamp(index, 0, slides.length - 1);
    const slide = slides[STATE.currentSlideIndex];
    STATE.selectedKey = slide.post.key;
    STATE.selectedImageIndex = slide.imageIndex;
    resetSlideTimer();
    renderSlideshow();
  }

  function nextSlide(auto = false) {
    const slides = getAllSlides();
    if (!slides.length) {
      return;
    }

    let nextIndex = STATE.shuffle ? randomNextSlideIndex(slides.length) : STATE.currentSlideIndex + 1;
    if (nextIndex >= slides.length) {
      if (!STATE.feedExhausted) {
        ensureMoreFeed("internal-viewer-end").then(() => {
          const updatedSlides = getAllSlides();
          if (updatedSlides.length > slides.length) {
            goToSlide(slides.length);
          } else if (STATE.loop) {
            goToSlide(0);
          } else {
            pauseSlideshow();
          }
        });
        return;
      }

      if (!STATE.loop) {
        nextIndex = slides.length - 1;
        pauseSlideshow();
      } else {
        nextIndex = 0;
      }
    }

    goToSlide(nextIndex);
    if (auto && !STATE.playing) {
      updateProgressUi();
    }
  }

  function previousSlide() {
    const slides = getAllSlides();
    if (!slides.length) {
      return;
    }

    let nextIndex = STATE.currentSlideIndex - 1;
    if (nextIndex < 0) {
      nextIndex = STATE.loop ? slides.length - 1 : 0;
    }

    goToSlide(nextIndex);
  }

  function togglePlay() {
    if (STATE.playing) {
      pauseSlideshow();
    } else {
      playSlideshow();
    }
  }

  function playSlideshow() {
    STATE.playing = true;
    STATE.slideStartedAt = performance.now();
    restartProgressLoop();
    renderSlideshow();
  }

  function pauseSlideshow() {
    if (STATE.playing) {
      STATE.slideElapsedMs = currentSlideElapsedMs();
    }

    STATE.playing = false;
    stopProgressLoop();
    renderSlideshow();
  }

  function resetSlideTimer() {
    STATE.slideElapsedMs = 0;
    STATE.slideStartedAt = performance.now();
  }

  function restartProgressLoop() {
    stopProgressLoop();
    if (!STATE.slideshowOpen || !STATE.playing) {
      return;
    }

    STATE.progressTimer = window.setInterval(() => {
      updateProgressUi();
      if (currentSlideElapsedMs() >= CONFIG.slideDurationMs) {
        nextSlide(true);
      }
    }, 100);
  }

  function stopProgressLoop() {
    if (STATE.progressTimer) {
      window.clearInterval(STATE.progressTimer);
      STATE.progressTimer = 0;
    }
  }

  function updateProgressUi() {
    if (!STATE.slideshowOpen) {
      return;
    }

    const elapsed = clamp(currentSlideElapsedMs(), 0, CONFIG.slideDurationMs);
    const percent = (elapsed / CONFIG.slideDurationMs) * 100;
    const fill = STATE.root.querySelector(".riv-progress-fill");
    const time = STATE.root.querySelector(".riv-time");
    if (fill) {
      fill.style.width = `${percent}%`;
    }

    if (time) {
      time.textContent = `${formatTime(elapsed)} / ${formatTime(CONFIG.slideDurationMs)}`;
    }
  }

  function currentSlideElapsedMs() {
    if (!STATE.playing) {
      return STATE.slideElapsedMs;
    }

    return STATE.slideElapsedMs + (performance.now() - STATE.slideStartedAt) * STATE.speed;
  }

  function randomNextSlideIndex(length) {
    if (length <= 1) {
      return 0;
    }

    let next = Math.floor(Math.random() * length);
    if (next === STATE.currentSlideIndex) {
      next = (next + 1) % length;
    }

    return next;
  }

  function cycleSpeed() {
    const speeds = [0.5, 1, 1.5, 2, 3];
    const currentIndex = speeds.indexOf(STATE.speed);
    STATE.speed = speeds[(currentIndex + 1) % speeds.length] || 1;
    writeSetting("speed", String(STATE.speed));
    resetSlideTimer();
    renderSlideshow();
  }

  function toggleLoop() {
    STATE.loop = !STATE.loop;
    writeSetting("loop", STATE.loop ? "1" : "0");
    renderSlideshow();
  }

  function toggleShuffle() {
    STATE.shuffle = !STATE.shuffle;
    renderSlideshow();
  }

  function setFeedSort(sort) {
    const nextSort = normalizeSort(sort);
    STATE.sort = nextSort;
    writeSetting("sort", STATE.sort);
    resetListingStateIfChanged(true);
    renderApp();
    ensureMoreFeed("sort-change");
  }

  function toggleSettingsPanel() {
    const panel = STATE.root.querySelector(".riv-settings-panel");
    if (panel) {
      panel.hidden = !panel.hidden;
    }
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await STATE.host.requestFullscreen();
      }
    } catch (error) {
      // Fullscreen can be blocked by the browser or userscript manager.
    }
  }

  function openSelectedPost() {
    const post = STATE.postsByKey.get(STATE.selectedKey);
    if (post?.permalink) {
      window.open(post.permalink, "_blank", "noopener,noreferrer");
    }
  }

  function openSelectedImage() {
    const post = STATE.postsByKey.get(STATE.selectedKey);
    const image = post?.images?.[STATE.selectedImageIndex] || post?.images?.[0];
    const url = isVideoMedia(image) ? mediaVideoUrl(image) : image?.url;
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  function exposeDebugApi() {
    try {
      window.RedditImageViewerDebug = {
        version: SCRIPT_VERSION,
        exportLog: buildDebugLog,
        copyLog: copyDebugLog,
        downloadLog: downloadDebugLog,
      };
    } catch (error) {
      // Some page contexts may block assigning globals.
    }
  }

  function buildDebugLog() {
    const visiblePosts = getVisiblePosts();
    const slides = getAllSlides();
    const selectedPost = STATE.postsByKey.get(STATE.selectedKey) || null;
    const listing = listingUrl();
    return {
      script: "reddit-image-viewer",
      version: SCRIPT_VERSION,
      exportedAt: new Date().toISOString(),
      pageUrl: window.location.href,
      listingUrl: listing ? listing.href : "",
      state: {
        appOpen: STATE.appOpen,
        feedLayout: STATE.feedLayout,
        sort: STATE.sort,
        filter: STATE.filter,
        activeSubreddit: STATE.activeSubreddit,
        selectedKey: STATE.selectedKey,
        selectedImageIndex: STATE.selectedImageIndex,
        feedSourceKey: STATE.feedSourceKey,
        feedPagesFetched: STATE.feedPagesFetched,
        feedAfter: STATE.feedAfter,
        feedLoading: STATE.feedLoading,
        feedExhausted: STATE.feedExhausted,
        feedError: STATE.feedError,
        hiddenFlairTerms: STATE.hiddenFlairTerms,
      },
      counts: {
        posts: STATE.posts.length,
        visiblePosts: visiblePosts.length,
        slides: slides.length,
      },
      selectedPost: selectedPost ? postDebugRecord(selectedPost, STATE.posts.indexOf(selectedPost)) : null,
      duplicatePostGroups: duplicatePostGroups(visiblePosts),
      duplicateImageGroups: duplicateImageGroups(slides),
      slides: slides.map((slide, index) => slideDebugRecord(slide, index)).slice(0, CONFIG.debugExportPostLimit * CONFIG.maxImagesPerPost),
      posts: STATE.posts
        .filter((post) => post.images.length)
        .slice(0, CONFIG.debugExportPostLimit)
        .map((post, index) => postDebugRecord(post, index)),
    };
  }

  function postDebugRecord(post, index) {
    return {
      index,
      key: post.key,
      id: post.id,
      title: post.title,
      subreddit: post.subreddit,
      author: post.author,
      permalink: post.permalink,
      flairText: post.flairText,
      createdUtc: post.createdUtc,
      jsonLoaded: post.jsonLoaded,
      identityKeys: postIdentityKeys(post),
      images: post.images.map((image, imageIndex) => imageDebugRecord(image, imageIndex)),
    };
  }

  function slideDebugRecord(slide, index) {
    return {
      index,
      postKey: slide.post.key,
      postTitle: slide.post.title,
      subreddit: slide.post.subreddit,
      imageIndex: slide.imageIndex,
      slideKeys: slideIdentityKeys(slide),
      image: imageDebugRecord(slide.image, slide.imageIndex),
    };
  }

  function imageDebugRecord(image, index) {
    return {
      index,
      type: image.type || "image",
      url: image.url,
      thumb: image.thumb,
      videoUrl: image.videoUrl || "",
      fallbackUrl: image.fallbackUrl || "",
      hlsUrl: image.hlsUrl || "",
      dashUrl: image.dashUrl || "",
      poster: image.poster || "",
      width: image.width,
      height: image.height,
      duration: image.duration || 0,
      alt: image.alt,
      source: image.debugSource || "",
      keys: imageIdentityKeys(image),
      candidates: Array.isArray(image.debugCandidates) ? image.debugCandidates : [],
    };
  }

  function duplicatePostGroups(posts) {
    const groups = new Map();
    posts.forEach((post, index) => {
      postIdentityKeys(post).forEach((key) => {
        if (!groups.has(key)) {
          groups.set(key, []);
        }

        groups.get(key).push({ index, key: post.key, title: post.title, permalink: post.permalink });
      });
    });

    return Array.from(groups.entries())
      .filter(([, items]) => items.length > 1)
      .map(([key, items]) => ({ key, items }));
  }

  function duplicateImageGroups(slides) {
    const groups = new Map();
    slides.forEach((slide, index) => {
      imageIdentityKeys(slide.image).forEach((key) => {
        if (!groups.has(key)) {
          groups.set(key, []);
        }

        groups.get(key).push({
          slideIndex: index,
          postKey: slide.post.key,
          postTitle: slide.post.title,
          imageIndex: slide.imageIndex,
          url: slide.image.url,
          thumb: slide.image.thumb,
          source: slide.image.debugSource || "",
        });
      });
    });

    return Array.from(groups.entries())
      .filter(([, items]) => items.length > 1)
      .map(([key, items]) => ({ key, items }));
  }

  async function copyDebugLog() {
    const text = JSON.stringify(buildDebugLog(), null, 2);
    try {
      await writeClipboardText(text);
      setDebugStatus(`Copied ${formatByteCount(text.length)}`);
    } catch (error) {
      downloadTextFile(text, debugLogFilename());
      setDebugStatus("Downloaded");
    }
  }

  function downloadDebugLog() {
    const text = JSON.stringify(buildDebugLog(), null, 2);
    downloadTextFile(text, debugLogFilename());
    setDebugStatus(`Downloaded ${formatByteCount(text.length)}`);
  }

  async function writeClipboardText(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) {
      throw new Error("Clipboard copy failed");
    }
  }

  function downloadTextFile(text, filename) {
    const blob = new Blob([text], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function debugLogFilename() {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    return `reddit-image-viewer-debug-${stamp}.json`;
  }

  function formatByteCount(length) {
    return length >= 1024 ? `${Math.round(length / 1024)} KB` : `${length} B`;
  }

  function setDebugStatus(status) {
    STATE.debugStatus = status;
    if (STATE.appOpen && STATE.uiSettingsOpen) {
      renderApp();
    }
  }

  function onRffHiddenFlairTermsChanged(event) {
    const detailTerms = Array.isArray(event?.detail?.terms) ? event.detail.terms : null;
    const nextTerms = detailTerms ? normalizeHiddenFlairTerms(detailTerms) : readRffHiddenFlairTerms();
    if (!setHiddenFlairTerms(nextTerms)) {
      return;
    }

    if (STATE.appOpen) {
      renderApp();
    }

    renderLauncher();
  }

  function onRootClick(event) {
    const actionTarget = event.target.closest("[data-riv-action]");
    if (!actionTarget) {
      return;
    }

    const action = actionTarget.getAttribute("data-riv-action");
    switch (action) {
      case "open-app":
        openApp();
        break;
      case "close-app":
        closeApp();
        break;
      case "refresh":
        resetListingStateIfChanged(true);
        scan();
        ensureMoreFeed("manual-refresh");
        break;
      case "select-post":
        selectPost(actionTarget.getAttribute("data-key"));
        break;
      case "select-detail-image":
        setSelectedImage(Number(actionTarget.getAttribute("data-index")));
        break;
      case "set-sort":
        setFeedSort(actionTarget.getAttribute("data-sort") || "best");
        break;
      case "toggle-subreddit": {
        const subreddit = actionTarget.getAttribute("data-subreddit") || "";
        STATE.activeSubreddit = STATE.activeSubreddit === subreddit ? "" : subreddit;
        resetFeedScrollOnNextRender();
        renderApp();
        break;
      }
      case "load-more-feed":
        ensureMoreFeed("manual-load-more");
        break;
      case "start-viewer":
        startViewer();
        break;
      case "start-slideshow":
        startViewer();
        break;
      case "horizontal-prev":
        navigateHorizontal(-1);
        break;
      case "horizontal-next":
        navigateHorizontal(1);
        break;
      case "horizontal-go":
        goToHorizontalSlide(Number(actionTarget.getAttribute("data-index")));
        break;
      case "close-slideshow":
        closeSlideshow();
        break;
      case "go-slide":
        goToSlide(Number(actionTarget.getAttribute("data-index")));
        break;
      case "prev-slide":
        previousSlide();
        break;
      case "next-slide":
        nextSlide();
        break;
      case "toggle-play":
        togglePlay();
        break;
      case "cycle-speed":
        cycleSpeed();
        break;
      case "toggle-loop":
        toggleLoop();
        break;
      case "toggle-shuffle":
        toggleShuffle();
        break;
      case "toggle-ui-settings":
        STATE.uiSettingsOpen = !STATE.uiSettingsOpen;
        renderApp();
        break;
      case "restart-slide":
        resetSlideTimer();
        updateProgressUi();
        break;
      case "toggle-settings":
        toggleSettingsPanel();
        break;
      case "toggle-fullscreen":
        toggleFullscreen();
        break;
      case "open-post":
        openSelectedPost();
        break;
      case "open-image":
        openSelectedImage();
        break;
      case "copy-debug-log":
        copyDebugLog();
        break;
      case "download-debug-log":
        downloadDebugLog();
        break;
      default:
        break;
    }
  }

  function onRootInput(event) {
    const control = event.target.closest("[data-riv-control]");
    if (!control) {
      return;
    }

    const name = control.getAttribute("data-riv-control");
    if (name === "search") {
      STATE.filter = control.value || "";
      window.clearTimeout(STATE.searchRenderTimer);
      STATE.searchRenderTimer = window.setTimeout(() => {
        STATE.searchRenderTimer = 0;
        resetFeedScrollOnNextRender();
        renderApp();
        const search = STATE.root.querySelector("[data-riv-control='search']");
        if (search) {
          search.focus();
          search.setSelectionRange(search.value.length, search.value.length);
        }
      }, 120);
      return;
    }

    if (name === "detail-width") {
      STATE.detailWidth = clamp(Number(control.value), 320, 900);
      writeSetting("detailWidth", String(STATE.detailWidth));
      applyUiSettings();
      updateUiSettingOutputs();
      return;
    }

    if (name === "detail-preview-vh") {
      STATE.detailPreviewVh = clamp(Number(control.value), 28, 78);
      writeSetting("detailPreviewVh", String(STATE.detailPreviewVh));
      applyUiSettings();
      updateUiSettingOutputs();
      return;
    }

    if (name === "grid-min-width") {
      STATE.gridMinWidth = clamp(Number(control.value), 160, 360);
      writeSetting("gridMinWidth", String(STATE.gridMinWidth));
      applyUiSettings();
      updateUiSettingOutputs();
    }
  }

  function onRootChange(event) {
    const control = event.target.closest("[data-riv-control]");
    if (!control) {
      return;
    }

    const name = control.getAttribute("data-riv-control");
    if (name === "sort") {
      setFeedSort(control.value || "best");
      return;
    }

    if (name === "fit") {
      STATE.fitMode = control.value === "cover" ? "cover" : "contain";
      writeSetting("fit", STATE.fitMode);
      renderSlideshow();
      return;
    }

    if (name === "detail-fit") {
      STATE.detailFit = control.value === "cover" ? "cover" : "contain";
      writeSetting("detailFit", STATE.detailFit);
      applyUiSettings();
      return;
    }

    if (name === "feed-layout") {
      STATE.feedLayout = normalizeFeedLayout(control.value);
      writeSetting("feedLayout", STATE.feedLayout);
      resetFeedScrollOnNextRender();
      renderApp();
    }
  }

  function onRootScroll(event) {
    const target = event.target;
    if (!(target instanceof Element) || !target.classList.contains("riv-feed")) {
      return;
    }

    STATE.feedScrollTop = target.scrollTop;
    STATE.feedScrollLeft = target.scrollLeft;
    if (STATE.feedLayout === "horizontal") {
      syncHorizontalSelection(target);
    }

    const remaining = STATE.feedLayout === "horizontal"
      ? target.scrollWidth - target.scrollLeft - target.clientWidth
      : target.scrollHeight - target.scrollTop - target.clientHeight;
    if (remaining <= CONFIG.feedBottomThresholdPx) {
      ensureMoreFeed("feed-scroll");
    }
  }

  function onRootWheel(event) {
    if (!STATE.appOpen || STATE.slideshowOpen || STATE.feedLayout !== "horizontal") {
      return;
    }

    if (event.rivHorizontalWheelHandled || event.ctrlKey || event.metaKey || !eventIsInsideViewer(event)) {
      return;
    }

    const target = getEventTarget(event);
    if (isTypingTarget(target)) {
      return;
    }

    const feed = getFeedElement();
    if (!feed) {
      return;
    }

    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (Math.abs(delta) < 4) {
      return;
    }

    event.rivHorizontalWheelHandled = true;
    event.preventDefault();
    event.stopPropagation();
    const now = performance.now();
    if (now - STATE.lastHorizontalWheelAt < CONFIG.horizontalWheelCooldownMs) {
      return;
    }

    STATE.lastHorizontalWheelAt = now;
    navigateHorizontal(delta > 0 ? 1 : -1);
  }

  function syncHorizontalSelection(feed) {
    const cards = Array.from(feed.querySelectorAll(".riv-horizontal-card[data-key][data-slide-index]"));
    if (!cards.length) {
      return;
    }

    const feedRect = feed.getBoundingClientRect();
    const centerX = feedRect.left + feedRect.width / 2;
    let closestCard = cards[0];
    let closestDistance = Number.POSITIVE_INFINITY;
    cards.forEach((card) => {
      const rect = card.getBoundingClientRect();
      const distance = Math.abs(rect.left + rect.width / 2 - centerX);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestCard = card;
      }
    });

    const key = closestCard.getAttribute("data-key") || "";
    const imageIndex = Number(closestCard.getAttribute("data-image-index") || "0");
    if (!key || (key === STATE.selectedKey && imageIndex === STATE.selectedImageIndex)) {
      return;
    }

    STATE.selectedKey = key;
    STATE.selectedImageIndex = imageIndex;
    cards.forEach((card) => card.classList.toggle("is-selected", card === closestCard));
    syncHorizontalRail(Number(closestCard.getAttribute("data-slide-index") || 0));
  }

  function syncHorizontalRail(activeIndex) {
    const rail = STATE.app?.querySelector(".riv-horizontal-rail");
    if (!rail) {
      return;
    }

    let activeButton = null;
    rail.querySelectorAll("button[data-index]").forEach((button) => {
      const active = Number(button.getAttribute("data-index")) === activeIndex;
      button.classList.toggle("is-active", active);
      if (active) {
        activeButton = button;
      }
    });

    if (activeButton) {
      const left = activeButton.offsetLeft - rail.clientWidth / 2 + activeButton.clientWidth / 2;
      rail.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
    }
  }

  async function navigateHorizontal(direction) {
    const slides = getAllSlides();
    if (!slides.length) {
      return;
    }

    const currentIndex = Math.max(0, findSlideIndex(STATE.selectedKey, STATE.selectedImageIndex));
    const nextIndex = currentIndex + (direction < 0 ? -1 : 1);
    if (nextIndex < 0) {
      goToHorizontalSlide(0);
      return;
    }

    if (nextIndex >= slides.length) {
      if (!STATE.feedExhausted) {
        await ensureMoreFeed("horizontal-next");
        const updatedSlides = getAllSlides();
        if (updatedSlides.length > slides.length) {
          renderApp();
          goToHorizontalSlide(slides.length);
        }
      }
      return;
    }

    goToHorizontalSlide(nextIndex);
  }

  function goToHorizontalSlide(index) {
    const slides = getAllSlides();
    if (!slides.length) {
      return;
    }

    const nextIndex = clamp(index, 0, slides.length - 1);
    const slide = slides[nextIndex];
    STATE.selectedKey = slide.post.key;
    STATE.selectedImageIndex = slide.imageIndex;
    const feed = getFeedElement();
    const card = feed?.querySelector(`.riv-horizontal-card[data-slide-index="${nextIndex}"]`);
    if (card) {
      const left = Math.max(0, card.offsetLeft);
      feed.scrollTo({ left, top: 0, behavior: "smooth" });
      STATE.feedScrollLeft = left;
      feed.querySelectorAll(".riv-horizontal-card.is-selected").forEach((node) => node.classList.remove("is-selected"));
      card.classList.add("is-selected");
      syncHorizontalRail(nextIndex);
    }
  }

  function onKeyDown(event) {
    const target = getEventTarget(event);
    const typing = isTypingTarget(target);
    const interactive = isInteractiveTarget(target);
    if (!STATE.appOpen && !STATE.slideshowOpen) {
      if (!interactive && event.altKey && event.key.toLowerCase() === "i") {
        event.preventDefault();
        openApp();
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      if (STATE.slideshowOpen) {
        closeSlideshow();
      } else {
        closeApp();
      }
      return;
    }

    if (!STATE.slideshowOpen) {
      if (event.key === "Tab" && STATE.appOpen) {
        trapFocus(event);
      }
      if (STATE.appOpen && STATE.feedLayout === "horizontal" && !typing && !interactive) {
        if (event.key === "ArrowRight" || event.key === "PageDown") {
          event.preventDefault();
          navigateHorizontal(1);
        } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
          event.preventDefault();
          navigateHorizontal(-1);
        } else if (event.key === "Home") {
          event.preventDefault();
          goToHorizontalSlide(0);
        } else if (event.key === "End") {
          event.preventDefault();
          goToHorizontalSlide(Math.max(0, getAllSlides().length - 1));
        }
      }
      return;
    }

    if (event.key === "Tab") {
      trapFocus(event);
      return;
    }

    if (typing || interactive) {
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      nextSlide();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      previousSlide();
    } else if (event.key === " ") {
      event.preventDefault();
      togglePlay();
    } else if (event.key.toLowerCase() === "f") {
      event.preventDefault();
      toggleFullscreen();
    } else if (event.key.toLowerCase() === "l") {
      event.preventDefault();
      toggleLoop();
    } else if (event.key === "Home") {
      event.preventDefault();
      goToSlide(0);
    } else if (event.key === "End") {
      event.preventDefault();
      goToSlide(Math.max(0, getAllSlides().length - 1));
    }
  }

  function getEventTarget(event) {
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    return path[0] || event.target;
  }

  function eventIsInsideViewer(event) {
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    return path.includes(STATE.host) || path.includes(STATE.root) || path.includes(STATE.app);
  }

  function isTypingTarget(target) {
    const element = target instanceof Element ? target : target?.parentElement;
    return Boolean(element?.closest?.("input, textarea, select, [contenteditable='true']"));
  }

  function isInteractiveTarget(target) {
    const element = target instanceof Element ? target : target?.parentElement;
    return Boolean(element?.closest?.("button, a[href], input, textarea, select, [role='button'], [contenteditable='true']"));
  }

  function trapFocus(event) {
    const scope = STATE.slideshowOpen ? STATE.slideshow : STATE.app;
    const focusables = Array.from(
      scope.querySelectorAll("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])"),
    ).filter((node) => node.offsetParent !== null || node === STATE.root.activeElement);
    if (!focusables.length) {
      return;
    }

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = STATE.root.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function getVisiblePosts() {
    const filter = STATE.filter.trim().toLowerCase();
    const seenPosts = new Set();
    return STATE.posts.filter((post) => {
      if (!post.images.length) {
        return false;
      }

      if (isHiddenByRffFilter(post.flairText)) {
        return false;
      }

      if (STATE.activeSubreddit && post.subreddit !== STATE.activeSubreddit) {
        return false;
      }

      if (!filter) {
        return rememberVisiblePost(post, seenPosts);
      }

      if (![post.title, post.subreddit, post.author, post.text, post.flairText].some((value) => String(value || "").toLowerCase().includes(filter))) {
        return false;
      }

      return rememberVisiblePost(post, seenPosts);
    });
  }

  function rememberVisiblePost(post, seenPosts) {
    const keys = postIdentityKeys(post);
    if (keys.some((key) => seenPosts.has(key))) {
      return false;
    }

    keys.forEach((key) => seenPosts.add(key));
    return true;
  }

  function postIdentityKeys(post) {
    const keys = [];
    const id = normalizePostId(post.id || post.key);
    if (id) {
      keys.push(`id:${id}`);
    }

    const permalink = cleanText(post.permalink).replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
    if (permalink) {
      keys.push(`permalink:${permalink}`);
    }

    const imageKey = imageIdentityKeys(post.images[0] || {})[0] || "";
    const title = normalizeFilterTerm(post.title);
    const subreddit = normalizeFilterTerm(post.subreddit);
    if (imageKey && (title || subreddit)) {
      keys.push(`image-title:${subreddit}:${title}:${imageKey}`);
    }

    if (!keys.length) {
      keys.push(`key:${post.key}`);
    }

    return Array.from(new Set(keys));
  }

  function isHiddenByRffFilter(flairText) {
    const normalizedFlair = normalizeFilterTerm(flairText);
    return Boolean(normalizedFlair && STATE.hiddenFlairTerms.some((term) => normalizedFlair.includes(term)));
  }

  function getSelectedPost(visiblePosts = getVisiblePosts()) {
    return visiblePosts.find((post) => post.key === STATE.selectedKey) || visiblePosts[0] || null;
  }

  function getAllSlides() {
    const seen = new Set();
    const slides = [];
    for (const post of getVisiblePosts()) {
      post.images.forEach((image, imageIndex) => {
        const slide = { post, image, imageIndex };
        const keys = slideIdentityKeys(slide);
        if (keys.some((key) => seen.has(key))) {
          return;
        }

        keys.forEach((key) => seen.add(key));
        slides.push(slide);
      });
    }

    return slides;
  }

  function slideKey(slide) {
    return slideIdentityKeys(slide)[0] || `${slide.post.key}:image-${slide.imageIndex}`;
  }

  function slideIdentityKeys(slide) {
    const imageKeys = imageIdentityKeys(slide.image);
    if (!imageKeys.length) {
      return [`${slide.post.key}:image-${slide.imageIndex}`];
    }

    return imageKeys.map((key) => `${slide.post.key}:${key}`);
  }

  function findSlideIndex(postKey, imageIndex) {
    return getAllSlides().findIndex((slide) => slide.post.key === postKey && slide.imageIndex === imageIndex);
  }

  function sortPostsInPlace() {
    STATE.posts.sort((a, b) => {
      if (STATE.sort === "new") {
        return (b.createdUtc || b.firstSeen / 1000) - (a.createdUtc || a.firstSeen / 1000);
      }

      if (STATE.sort === "top") {
        return scoreNumber(b.score) - scoreNumber(a.score);
      }

      if (STATE.sort === "rising") {
        return b.images.length - a.images.length || b.firstSeen - a.firstSeen;
      }

      return scoreNumber(b.score) - scoreNumber(a.score) || b.firstSeen - a.firstSeen;
    });
  }

  function scrollActiveThumbIntoView() {
    window.setTimeout(() => {
      STATE.root.querySelector(".riv-filmstrip .is-active")?.scrollIntoView({ block: "nearest", inline: "center" });
    }, 0);
  }

  function restoreFocus() {
    try {
      if (STATE.lastFocusedElement && typeof STATE.lastFocusedElement.focus === "function") {
        STATE.lastFocusedElement.focus();
      }
    } catch (error) {
      // Ignore focus restore failures across page navigations.
    }
  }

  function getDomOnlyKey(element) {
    if (!STATE.elementKeys.has(element)) {
      STATE.elementKeys.set(element, `dom-${STATE.nextDomKey++}`);
    }

    return STATE.elementKeys.get(element);
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
    return match ? `t3_${match[1].toLowerCase()}` : "";
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

    if (/^[a-z0-9]{5,12}$/i.test(text)) {
      return `t3_${text.toLowerCase()}`;
    }

    return "";
  }

  function getPermalink(post) {
    const attributes = ["permalink", "data-permalink", "content-href"];
    for (const attribute of attributes) {
      const value = post.getAttribute(attribute);
      if (value) {
        return absoluteUrl(value);
      }
    }

    for (const root of getElementRoots(post)) {
      const link = root.querySelector?.("a[href*='/comments/']");
      if (link?.href) {
        return absoluteUrl(link.href);
      }
    }

    return "";
  }

  function readTitle(post) {
    const attributes = ["post-title", "data-title", "data-post-title", "aria-label", "title"];
    for (const attribute of attributes) {
      const value = cleanText(post.getAttribute(attribute));
      if (value && !/^(promoted|advertisement)$/i.test(value)) {
        return value;
      }
    }

    for (const root of getElementRoots(post)) {
      const node = root.querySelector?.("[slot='title'], [data-testid='post-title'], a[data-click-id='title'], a[id^='post-title'], h1, h2, h3, .title a.title, .title");
      const text = cleanText(node?.textContent || node?.getAttribute("aria-label"));
      if (text && text.length < 240) {
        return text;
      }
    }

    return "";
  }

  function readSubreddit(post) {
    const attributes = ["subreddit-prefixed-name", "subreddit-name", "data-subreddit", "subreddit"];
    for (const attribute of attributes) {
      const value = cleanSubreddit(post.getAttribute(attribute));
      if (value) {
        return value;
      }
    }

    for (const root of getElementRoots(post)) {
      const link = root.querySelector?.("a[href^='/r/'], a[href*='reddit.com/r/']");
      const fromHref = subredditFromText(link?.getAttribute("href") || "");
      const fromText = subredditFromText(link?.textContent || "");
      if (fromText || fromHref) {
        return fromText || fromHref;
      }

      const text = subredditFromText(root.textContent || "");
      if (text) {
        return text;
      }
    }

    return "";
  }

  function readAuthor(post) {
    const attributes = ["author", "data-author", "post-author"];
    for (const attribute of attributes) {
      const value = cleanText(post.getAttribute(attribute));
      if (value) {
        return stripUserPrefix(value);
      }
    }

    for (const root of getElementRoots(post)) {
      const link = root.querySelector?.("a[href*='/user/'], a[href*='/u/']");
      const author = cleanText(link?.textContent || link?.getAttribute("href"));
      if (author) {
        return stripUserPrefix(author);
      }
    }

    return "";
  }

  function readScore(post) {
    const attributes = ["score", "data-score", "upvote-count", "vote-count"];
    for (const attribute of attributes) {
      const value = cleanText(post.getAttribute(attribute));
      if (value) {
        return formatCount(value);
      }
    }

    const text = cleanText(post.textContent || "");
    const match = text.match(/(\d+(?:\.\d+)?\s*[kKmM]?)\s*(?:upvotes|points|pts)?/);
    return match ? match[1] : "";
  }

  function readCommentCount(post) {
    const attributes = ["comment-count", "comments-count", "data-comments-count", "num-comments"];
    for (const attribute of attributes) {
      const value = cleanText(post.getAttribute(attribute));
      if (value) {
        return formatCount(value);
      }
    }

    const text = cleanText(post.textContent || "");
    const match = text.match(/(\d+(?:\.\d+)?\s*[kKmM]?)\s*(?:comments|comment)/i);
    return match ? match[1] : "";
  }

  function readFlairText(post) {
    const attributes = [
      "data-rff-flair-text",
      "link-flair-text",
      "post-flair-text",
      "flair-text",
      "data-link-flair-text",
      "data-flair-text",
    ];

    for (const attribute of attributes) {
      const value = cleanText(post.getAttribute(attribute));
      if (value) {
        return value;
      }
    }

    for (const root of getElementRoots(post)) {
      const node = root.querySelector?.(
        ".rff-flair-badge:not([data-rff-kind='none']):not([data-rff-kind='error']), [data-testid='post-flair'], [data-test-id='post-flair'], [slot='post-flair'], shreddit-post-flair, .linkflairlabel, a[href*='f=flair_name'], a[href*='flair_name%3A']",
      );
      const text = cleanText(node?.textContent || node?.getAttribute("aria-label") || node?.getAttribute("title")).replace(/^post flair:\s*/i, "");
      if (text) {
        return text;
      }
    }

    return "";
  }

  function getElementRoots(element) {
    const roots = [element];
    if (element.shadowRoot) {
      roots.unshift(element.shadowRoot);
    }

    return roots;
  }

  function mergeImages(primary, secondary) {
    return uniqueImages([...(primary || []), ...(secondary || [])]);
  }

  function uniqueImages(images) {
    const seen = new Set();
    const output = [];
    for (const image of images) {
      const url = cleanUrl(image?.url);
      if (!url) {
        continue;
      }

      const thumb = cleanUrl(image.thumb) || url;
      const keys = imageIdentityKeys({ ...image, url, thumb });
      if (!keys.length || keys.some((key) => seen.has(key))) {
        continue;
      }

      keys.forEach((key) => seen.add(key));
      output.push({
        type: image.type === "video" ? "video" : "image",
        url,
        thumb,
        videoUrl: cleanUrl(image.videoUrl),
        fallbackUrl: cleanUrl(image.fallbackUrl),
        scrubberUrl: cleanUrl(image.scrubberUrl),
        hlsUrl: cleanUrl(image.hlsUrl),
        dashUrl: cleanUrl(image.dashUrl),
        poster: cleanUrl(image.poster),
        alt: cleanText(image.alt),
        width: Number(image.width || 0),
        height: Number(image.height || 0),
        duration: Number(image.duration || 0),
        isGif: Boolean(image.isGif),
        debugSource: cleanText(image.debugSource),
        debugCandidates: Array.isArray(image.debugCandidates) ? image.debugCandidates.slice(0, 18) : [],
      });
    }

    return output;
  }

  function imageIdentityKeys(image) {
    const keys = [];
    const urlKey = canonicalImageKey(image);
    if (urlKey) {
      keys.push(urlKey);
    }

    const thumb = cleanUrl(image?.thumb);
    if (thumb) {
      const thumbKey = canonicalImageKey({ url: thumb });
      if (thumbKey) {
        keys.push(thumbKey);
      }
    }

    return Array.from(new Set(keys));
  }

  function isVideoMedia(media) {
    return media?.type === "video" || isVideoLikeUrl(media?.videoUrl || media?.url);
  }

  function mediaVideoUrl(media) {
    return cleanUrl(media?.videoUrl || media?.fallbackUrl || media?.url);
  }

  function mediaPosterUrl(media) {
    return [media?.poster, media?.thumb].map(cleanUrl).find(isImageLikeUrl) || "";
  }

  function mediaThumbUrl(media) {
    if (isVideoMedia(media)) {
      return mediaPosterUrl(media);
    }

    return [media?.thumb, media?.url].map(cleanUrl).find(isImageLikeUrl) || "";
  }

  function canonicalImageKey(image) {
    const url = cleanUrl(image?.videoUrl || image?.url);
    if (!url) {
      return "";
    }

    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase().replace(/^external-preview\./, "preview.");
      const pathParts = parsed.pathname.split("/").filter(Boolean);
      const basename = decodeURIComponent(pathParts[pathParts.length - 1] || parsed.pathname).toLowerCase();
      if (/(^|\.)redd\.it$|(^|\.)redditmedia\.com$/i.test(host) && basename) {
        return `reddit:${redditMediaIdFromBasename(basename)}`;
      }

      if (/(^|\.)imgur\.com$/i.test(host) && basename) {
        return `imgur:${basename.replace(/\.(jpg|jpeg|png|webp|gif|avif)$/i, "")}`;
      }

      const normalized = new URL(url);
      ["width", "height", "crop", "auto", "format", "s", "fit", "fm", "q"].forEach((param) => normalized.searchParams.delete(param));
      return normalized.href;
    } catch (error) {
      return url;
    }
  }

  function redditMediaIdFromBasename(basename) {
    const clean = String(basename || "").toLowerCase().replace(/\.(jpg|jpeg|png|webp|gif|avif)$/i, "");
    const versioned = clean.match(/(?:^|-)v\d+-([a-z0-9]+)$/i);
    return versioned ? versioned[1] : clean;
  }

  function uniqueElements(items) {
    return Array.from(new Set(items.filter(Boolean)));
  }

  function cleanUrl(value) {
    const text = htmlDecode(cleanText(value));
    if (!text) {
      return "";
    }

    try {
      const url = new URL(text, window.location.href);
      if (!/^https?:$/i.test(url.protocol)) {
        return "";
      }

      return url.href;
    } catch (error) {
      return "";
    }
  }

  function absoluteUrl(value) {
    if (!value) {
      return "";
    }

    try {
      return new URL(value, window.location.origin).href;
    } catch (error) {
      return "";
    }
  }

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function cleanSubreddit(value) {
    const text = cleanText(value);
    if (!text) {
      return "";
    }

    return subredditFromText(text) || (text.startsWith("r/") ? text : `r/${text.replace(/^\/?r\//i, "")}`);
  }

  function subredditFromText(text) {
    const match = String(text || "").match(/(?:^|[\s/])r\/([A-Za-z0-9_]{2,30})\b/);
    return match ? `r/${match[1]}` : "";
  }

  function stripUserPrefix(value) {
    return cleanText(value).replace(/^\/?u(?:ser)?\//i, "");
  }

  function htmlDecode(value) {
    return String(value || "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }

  function postSignature(post) {
    return JSON.stringify({
      title: post.title,
      subreddit: post.subreddit,
      author: post.author,
      score: post.score,
      comments: post.comments,
      text: post.text,
      flairText: post.flairText,
      images: post.images.map((image) => image.url),
    });
  }

  function scoreNumber(value) {
    const text = String(value || "").toLowerCase().replace(/,/g, "").trim();
    const match = text.match(/(-?\d+(?:\.\d+)?)([km])?/);
    if (!match) {
      return 0;
    }

    const base = Number(match[1]);
    if (!Number.isFinite(base)) {
      return 0;
    }

    if (match[2] === "m") {
      return base * 1000000;
    }

    if (match[2] === "k") {
      return base * 1000;
    }

    return base;
  }

  function formatCount(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return cleanText(value);
    }

    if (Math.abs(number) >= 1000000) {
      return `${trimDecimal(number / 1000000)}m`;
    }

    if (Math.abs(number) >= 1000) {
      return `${trimDecimal(number / 1000)}k`;
    }

    return String(number);
  }

  function trimDecimal(number) {
    return number.toFixed(number >= 10 ? 0 : 1).replace(/\.0$/, "");
  }

  function relativeTime(createdUtc) {
    const seconds = Math.max(0, Math.floor(Date.now() / 1000 - createdUtc));
    if (seconds < 60) {
      return "just now";
    }

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      return `${minutes}m ago`;
    }

    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return `${hours}h ago`;
    }

    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  function formatTime(ms) {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, "0")}`;
  }

  function formatSpeed(speed) {
    return `${Number(speed).toString().replace(/\.0$/, "")}x`;
  }

  function normalizeSort(sort) {
    return ["best", "hot", "new", "top", "rising"].includes(sort) ? sort : "best";
  }

  function normalizeFeedLayout(layout) {
    return layout === "grid" ? "grid" : "horizontal";
  }

  function subredditInitial(subreddit) {
    const clean = String(subreddit || "r").replace(/^r\//, "");
    return (clean[0] || "r").toUpperCase();
  }

  function clamp(value, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return min;
    }

    return Math.min(max, Math.max(min, number));
  }

  function icon(name) {
    return `<span class="riv-icon">${SVG[name] || ""}</span>`;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  function readSetting(key, fallback) {
    try {
      return window.localStorage.getItem(`${CONFIG.storagePrefix}${key}`) || fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeSetting(key, value) {
    try {
      window.localStorage.setItem(`${CONFIG.storagePrefix}${key}`, value);
    } catch (error) {
      // Storage can be unavailable in hardened browser contexts.
    }
  }

  function readRffHiddenFlairTerms() {
    const attributeValue = document.documentElement.getAttribute("data-rff-hidden-flair-terms");
    if (attributeValue !== null) {
      return parseRffHiddenTerms(attributeValue);
    }

    return parseRffHiddenTerms(readPlainStorage("rff-hidden-flair-terms-v1", "[]"));
  }

  function parseRffHiddenTerms(raw) {
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw);
      return normalizeHiddenFlairTerms(Array.isArray(parsed) ? parsed : []);
    } catch (error) {
      return [];
    }
  }

  function readPlainStorage(key, fallback) {
    try {
      return window.localStorage.getItem(key) || fallback;
    } catch (error) {
      return fallback;
    }
  }

  function normalizeHiddenFlairTerms(terms) {
    return Array.from(new Set((terms || []).map(normalizeFilterTerm).filter(Boolean))).sort();
  }

  function normalizeFilterTerm(value) {
    return cleanText(value).toLowerCase();
  }

  function arraysEqual(left, right) {
    if (left.length !== right.length) {
      return false;
    }

    return left.every((value, index) => value === right[index]);
  }

  function injectPageStyle() {
    if (document.getElementById("riv-page-style")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "riv-page-style";
    style.textContent = `
      html.riv-page-locked,
      html.riv-page-locked body {
        overflow: hidden !important;
      }

      html.riv-page-locked #rff-filter-toggle,
      html.riv-page-locked #rff-filter-panel,
      html.riv-universal-viewer-open #rff-filter-toggle,
      html.riv-universal-viewer-open #rff-filter-panel {
        display: none !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  const STYLE_TEXT = `
    :host,
    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }

    :host {
      color-scheme: dark;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0;
    }

    button,
    input,
    select {
      font: inherit;
      letter-spacing: 0;
    }

    .riv-launch,
    .riv-app,
    .riv-slideshow {
      position: fixed;
      z-index: 2147483645;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0;
    }

    .riv-launch {
      right: 22px;
      bottom: 72px;
      display: inline-flex;
      align-items: center;
      gap: 10px;
      min-height: 48px;
      padding: 0 16px;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 8px;
      background: linear-gradient(180deg, #ff5b1a, #e63d00);
      color: #fff;
      box-shadow: 0 18px 48px rgba(0, 0, 0, 0.38), 0 0 24px rgba(255, 69, 0, 0.24);
      cursor: pointer;
    }

    :host(.riv-has-rff-toggle) .riv-launch {
      bottom: 72px;
    }

    .riv-launch:disabled {
      opacity: 0.68;
      cursor: wait;
    }

    .riv-launch span {
      font-weight: 800;
    }

    .riv-launch strong {
      min-width: 26px;
      padding: 3px 7px;
      border-radius: 999px;
      background: rgba(0, 0, 0, 0.26);
      font-size: 12px;
      text-align: center;
    }

    .riv-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      flex: 0 0 auto;
    }

    .riv-icon svg {
      width: 100%;
      height: 100%;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .riv-app {
      inset: 10px;
      display: grid;
      grid-template-columns: 240px minmax(360px, 1fr) var(--riv-detail-width, 520px);
      grid-template-rows: 72px minmax(0, 1fr);
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 8px;
      background: #0d0d0f;
      color: #f4f4f5;
      box-shadow: 0 30px 90px rgba(0, 0, 0, 0.6);
    }

    .riv-app.riv-layout-horizontal {
      inset: 0;
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: minmax(0, 1fr);
      border-radius: 0;
      background: #000;
    }

    .riv-app.riv-layout-horizontal .riv-sidebar,
    .riv-app.riv-layout-horizontal .riv-details {
      display: none;
    }

    .riv-app.riv-layout-horizontal .riv-topbar {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      z-index: 12;
      grid-column: auto;
      height: 64px;
      padding-inline: 18px;
      border-bottom-color: rgba(255, 255, 255, 0.08);
      background: rgba(8, 8, 10, 0.92);
      opacity: 0;
      transform: translateY(-18px);
      transition: opacity 160ms ease, transform 160ms ease;
      backdrop-filter: blur(12px);
    }

    .riv-app.riv-layout-horizontal .riv-topbar:hover,
    .riv-app.riv-layout-horizontal .riv-topbar:focus-within {
      opacity: 1;
      transform: translateY(0);
    }

    .riv-app[hidden],
    .riv-slideshow[hidden],
    .riv-launch[hidden] {
      display: none !important;
    }

    .riv-sidebar {
      grid-row: 1 / span 2;
      min-width: 0;
      overflow: auto;
      border-right: 1px solid rgba(255, 255, 255, 0.12);
      background: linear-gradient(180deg, #121214, #0e0e10);
    }

    .riv-brand {
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 72px;
      padding: 0 24px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.12);
      color: #ff4500;
    }

    .riv-reddit-mark {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: #ff4500;
      box-shadow: inset 0 -3px 0 rgba(0, 0, 0, 0.16);
    }

    .riv-reddit-mark::before,
    .riv-reddit-mark::after {
      content: "";
      position: absolute;
      top: 13px;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #ff4500;
      box-shadow: 0 0 0 3px #fff;
    }

    .riv-reddit-mark::before {
      left: 9px;
    }

    .riv-reddit-mark::after {
      right: 9px;
    }

    .riv-reddit-mark span {
      position: absolute;
      bottom: 8px;
      width: 16px;
      height: 8px;
      border: 3px solid #fff;
      border-top: 0;
      border-radius: 0 0 16px 16px;
    }

    .riv-brand strong {
      color: #ff4500;
      font-size: 28px;
      line-height: 1;
      font-weight: 900;
    }

    .riv-brand em {
      color: #d7d7dd;
      font-style: normal;
      font-weight: 600;
      white-space: nowrap;
    }

    .riv-brand-divider {
      width: 1px;
      height: 26px;
      background: rgba(255, 255, 255, 0.28);
      margin: 0 4px;
    }

    .riv-section {
      padding: 14px 22px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .riv-section-title {
      margin: 0 0 9px;
      color: #90909a;
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
    }

    .riv-with-caret {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .riv-side-button,
    .riv-sub-button {
      display: flex;
      align-items: center;
      width: 100%;
      min-height: 38px;
      gap: 12px;
      margin: 0 0 4px;
      padding: 8px 10px;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: #f2f2f4;
      text-align: left;
      cursor: pointer;
    }

    .riv-side-button:hover,
    .riv-side-button:focus-visible,
    .riv-sub-button:hover,
    .riv-sub-button:focus-visible {
      outline: none;
      background: rgba(255, 255, 255, 0.08);
    }

    .riv-side-button.is-active,
    .riv-sub-button.is-active {
      background: rgba(255, 255, 255, 0.1);
      color: #ff5b1a;
    }

    .riv-sub-button {
      padding-inline: 8px;
      color: #e6e6ea;
    }

    .riv-sub-button .riv-icon {
      width: 16px;
      height: 16px;
      margin-left: auto;
      color: #8a8a92;
    }

    .riv-sub-button strong {
      margin-left: auto;
      color: #a8a8b0;
      font-size: 12px;
    }

    .riv-sub-avatar {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      flex: 0 0 28px;
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 50%;
      background: linear-gradient(135deg, #315c77, #a4773b);
      color: #fff;
      font-size: 12px;
      font-weight: 900;
    }

    .riv-muted {
      color: #a1a1aa;
    }

    .riv-select {
      width: 92px;
      min-height: 36px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 8px;
      background: #121214;
      color: #fff;
      padding: 6px 10px;
    }

    .riv-topbar {
      grid-column: 2 / span 2;
      display: grid;
      grid-template-columns: 190px minmax(260px, 560px) 1fr;
      align-items: center;
      gap: 18px;
      min-width: 0;
      padding: 0 18px 0 28px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.12);
      background: rgba(14, 14, 16, 0.96);
    }

    .riv-crumb {
      color: #f1f1f2;
      font-weight: 700;
    }

    .riv-crumb span {
      margin: 0 7px;
      color: #878791;
    }

    .riv-search {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
      height: 44px;
      padding: 0 14px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      background: #171719;
      color: #a8a8b0;
    }

    .riv-search input {
      width: 100%;
      min-width: 0;
      border: 0;
      outline: 0;
      background: transparent;
      color: #f7f7f8;
    }

    .riv-top-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 10px;
      min-width: 0;
    }

    .riv-icon-button,
    .riv-user-menu,
    .riv-round,
    .riv-control,
    .riv-speed {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 38px;
      min-height: 38px;
      gap: 8px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.06);
      color: #fff;
      cursor: pointer;
    }

    .riv-icon-button:hover,
    .riv-user-menu:hover,
    .riv-round:hover,
    .riv-control:hover,
    .riv-speed:hover,
    .riv-icon-button.is-active,
    .riv-icon-button:focus-visible,
    .riv-user-menu:focus-visible,
    .riv-round:focus-visible,
    .riv-control:focus-visible,
    .riv-speed:focus-visible {
      outline: none;
      border-color: rgba(255, 69, 0, 0.66);
      background: rgba(255, 69, 0, 0.14);
    }

    .riv-notification {
      position: relative;
    }

    .riv-notification span {
      position: absolute;
      top: -5px;
      right: -4px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #ff4500;
      color: #fff;
      font-size: 11px;
      font-weight: 900;
    }

    .riv-user-menu {
      padding: 0 10px;
    }

    .riv-user-menu .riv-icon:first-child {
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.12);
    }

    .riv-feed {
      min-width: 0;
      min-height: 0;
      overflow: auto;
      padding: 12px;
      background: #09090a;
    }

    .riv-feed-horizontal {
      position: relative;
      grid-column: 1;
      grid-row: 1;
      overflow-x: auto;
      overflow-y: hidden;
      padding: 0;
      background: #000;
      scroll-snap-type: x mandatory;
      scroll-behavior: smooth;
      overscroll-behavior-x: contain;
      scrollbar-width: none;
    }

    .riv-feed-horizontal::-webkit-scrollbar {
      display: none;
    }

    .riv-feed-status,
    .riv-load-more {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      min-height: 44px;
      margin: 14px 0 68px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 8px;
      background: #141416;
      color: #d7d7dd;
      font-weight: 800;
    }

    .riv-load-more {
      cursor: pointer;
    }

    .riv-feed-status.is-error {
      justify-content: space-between;
      padding: 0 12px;
      color: #ffd2c2;
      background: rgba(255, 69, 0, 0.12);
    }

    .riv-feed-status button {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 32px;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 7px;
      background: rgba(255, 255, 255, 0.08);
      color: #fff;
      cursor: pointer;
    }

    .riv-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(var(--riv-grid-min-width, 210px), 1fr));
      gap: 10px;
      align-items: start;
    }

    .riv-card {
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 8px;
      background: #141416;
    }

    .riv-card.is-selected {
      border-color: rgba(255, 69, 0, 0.72);
      box-shadow: 0 0 0 1px rgba(255, 69, 0, 0.42);
    }

    .riv-horizontal-strip {
      display: flex;
      height: 100%;
      min-width: 0;
    }

    .riv-horizontal-card,
    .riv-horizontal-status {
      position: relative;
      flex: 0 0 100%;
      width: 100%;
      height: 100%;
      min-width: 0;
      scroll-snap-align: start;
      scroll-snap-stop: always;
      background: #000;
    }

    .riv-horizontal-media {
      display: grid;
      place-items: center;
      width: 100%;
      height: 100%;
      margin: 0;
      min-width: 0;
      min-height: 0;
      padding: 16px;
      border: 0;
      background: #000;
      cursor: grab;
      line-height: 0;
    }

    .riv-horizontal-media:active {
      cursor: grabbing;
    }

    .riv-horizontal-media img,
    .riv-horizontal-media video {
      display: block;
      width: auto;
      height: auto;
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      object-position: center;
      background: #000;
    }

    .riv-horizontal-media video {
      width: auto;
      height: auto;
      min-width: min(720px, 92vw);
      outline: none;
    }

    .riv-horizontal-overlay {
      position: absolute;
      left: 24px;
      bottom: 22px;
      z-index: 2;
      max-width: min(720px, calc(100% - 48px));
      padding: 14px 16px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 8px;
      background: rgba(8, 8, 10, 0.7);
      color: #fff;
      opacity: 0;
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.38);
      transition: opacity 160ms ease, transform 160ms ease;
      transform: translateY(10px);
      backdrop-filter: blur(14px);
    }

    .riv-horizontal-overlay:hover,
    .riv-horizontal-overlay:focus-within {
      opacity: 1;
      transform: translateY(0);
    }

    .riv-horizontal-overlay h2 {
      margin: 10px 0 6px;
      max-width: 100%;
      overflow: hidden;
      color: #fff;
      font-size: 20px;
      line-height: 1.18;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .riv-horizontal-overlay .riv-card-meta {
      min-height: auto;
      padding: 0;
      gap: 14px;
      color: #e5e5ea;
    }

    .riv-horizontal-count {
      margin-left: auto;
      padding: 3px 8px;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 999px;
      color: #d7d7dd;
      font-size: 12px;
      font-weight: 800;
    }

    .riv-horizontal-status {
      display: grid;
      place-items: center;
      padding: 24px;
    }

    .riv-horizontal-status .riv-feed-status,
    .riv-horizontal-status .riv-load-more {
      max-width: 420px;
      margin: 0;
    }

    .riv-horizontal-nav {
      position: fixed;
      z-index: 8;
      top: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 96px;
      height: 50vh;
      border: 0;
      background: transparent;
      color: #fff;
      cursor: pointer;
      opacity: 0;
      transform: translateY(-50%);
      transition: opacity 160ms ease;
    }

    .riv-horizontal-nav:hover,
    .riv-horizontal-nav:focus-visible {
      opacity: 1;
      outline: none;
    }

    .riv-horizontal-nav .riv-icon {
      width: 58px;
      height: 58px;
      padding: 12px;
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 50%;
      background: rgba(9, 9, 11, 0.68);
      box-shadow: 0 0 26px rgba(255, 69, 0, 0.22);
      backdrop-filter: blur(12px);
    }

    .riv-horizontal-prev {
      left: 0;
    }

    .riv-horizontal-next {
      right: 0;
    }

    .riv-horizontal-rail {
      position: fixed;
      left: 50%;
      bottom: 20px;
      z-index: 7;
      display: flex;
      gap: 8px;
      max-width: min(760px, calc(100vw - 210px));
      overflow-x: auto;
      overflow-y: hidden;
      padding: 8px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 8px;
      background: rgba(8, 8, 10, 0.68);
      opacity: 0;
      transform: translate(-50%, 10px);
      transition: opacity 160ms ease, transform 160ms ease;
      backdrop-filter: blur(14px);
      scrollbar-width: none;
    }

    .riv-horizontal-rail::-webkit-scrollbar {
      display: none;
    }

    .riv-horizontal-rail:hover,
    .riv-horizontal-rail:focus-within {
      opacity: 1;
      transform: translate(-50%, 0);
    }

    .riv-horizontal-rail button {
      width: 72px;
      height: 48px;
      flex: 0 0 72px;
      overflow: hidden;
      padding: 0;
      border: 2px solid transparent;
      border-radius: 7px;
      background: #050506;
      cursor: pointer;
    }

    .riv-horizontal-rail button.is-active {
      border-color: #ff4500;
    }

    .riv-horizontal-rail img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .riv-card-media {
      position: relative;
      display: block;
      width: 100%;
      aspect-ratio: 1.32 / 1;
      margin: 0;
      padding: 0;
      overflow: hidden;
      border: 0;
      background: #050506;
      cursor: pointer;
    }

    .riv-card-media img,
    .riv-card-media video,
    .riv-detail-preview img,
    .riv-detail-preview video,
    .riv-show-image,
    .riv-filmstrip img,
    .riv-detail-thumbs img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .riv-card-media:hover img,
    .riv-card-media:focus-visible img {
      transform: scale(1.025);
    }

    .riv-card-media img {
      transition: transform 180ms ease;
    }

    .riv-pill {
      position: absolute;
      display: inline-flex;
      align-items: center;
      max-width: calc(100% - 20px);
      min-height: 24px;
      padding: 3px 8px;
      border: 1px solid rgba(255, 255, 255, 0.22);
      border-radius: 7px;
      background: rgba(8, 8, 10, 0.72);
      color: #fff;
      font-size: 12px;
      font-weight: 800;
      backdrop-filter: blur(10px);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .riv-card-sub {
      left: 8px;
      bottom: 8px;
    }

    .riv-image-count {
      right: 8px;
      top: 8px;
    }

    .riv-card-meta {
      display: flex;
      align-items: center;
      gap: 18px;
      min-height: 38px;
      padding: 0 12px;
      color: #c8c8ce;
      font-size: 13px;
    }

    .riv-card-meta span,
    .riv-show-metrics span {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .riv-score {
      color: #ff5b1a;
    }

    .riv-details {
      min-width: 0;
      min-height: 0;
      overflow: auto;
      border-left: 1px solid rgba(255, 255, 255, 0.12);
      background: #111113;
    }

    .riv-detail-preview {
      position: relative;
      height: min(var(--riv-detail-preview-height, 52vh), calc(100vh - 220px));
      min-height: 220px;
      background: #050506;
    }

    .riv-detail-preview img {
      object-fit: var(--riv-detail-fit, contain);
    }

    .riv-detail-preview video {
      object-fit: contain;
      background: #050506;
    }

    .riv-video-thumb {
      display: grid;
      place-items: center;
      width: 100%;
      height: 100%;
      background: #050506;
      color: #fff;
    }

    .riv-video-thumb .riv-icon {
      width: 34px;
      height: 34px;
      padding: 8px;
      border-radius: 50%;
      background: rgba(255, 69, 0, 0.88);
    }

    .riv-detail-close {
      position: absolute;
      top: 14px;
      right: 14px;
      z-index: 1;
      width: 38px;
      height: 38px;
      border: 0;
      background: transparent;
      color: #fff;
      cursor: pointer;
    }

    .riv-detail-close .riv-icon {
      width: 30px;
      height: 30px;
    }

    .riv-detail-body {
      padding: 18px;
    }

    .riv-detail-sub {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 7px;
      color: #f7f7f8;
      font-weight: 800;
    }

    .riv-detail-body h2 {
      margin: 12px 0 10px;
      color: #fff;
      font-size: 22px;
      line-height: 1.18;
    }

    .riv-detail-text {
      margin: 0 0 14px;
      color: #bebec6;
      line-height: 1.45;
    }

    .riv-detail-thumbs {
      display: flex;
      gap: 8px;
      overflow: auto;
      padding: 4px 0 14px;
    }

    .riv-detail-thumbs button {
      width: 72px;
      height: 54px;
      flex: 0 0 72px;
      overflow: hidden;
      padding: 0;
      border: 2px solid transparent;
      border-radius: 7px;
      background: #050506;
      cursor: pointer;
    }

    .riv-detail-thumbs button.is-active {
      border-color: #ff4500;
    }

    .riv-action-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 0;
      border-top: 1px solid rgba(255, 255, 255, 0.12);
      border-bottom: 1px solid rgba(255, 255, 255, 0.12);
    }

    .riv-vote {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-height: 44px;
      padding: 0 14px;
      border: 0;
      border-radius: 999px;
      background: #ff4500;
      color: #fff;
      font-weight: 900;
    }

    .riv-awards,
    .riv-comments {
      padding: 14px 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .riv-awards span {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      margin-right: 8px;
      border-radius: 50%;
      background: linear-gradient(135deg, #f7c948, #ef8f35);
      color: #1a1307;
      font-size: 12px;
      font-weight: 900;
    }

    .riv-comment-input {
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 44px;
      padding: 0 12px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 999px;
      color: #777780;
      background: #151517;
    }

    .riv-slideshow-fab {
      position: absolute;
      right: 28px;
      bottom: 22px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      min-width: 164px;
      min-height: 56px;
      border: 0;
      border-radius: 8px;
      background: linear-gradient(180deg, #ff5b1a, #e63d00);
      color: #fff;
      box-shadow: 0 18px 46px rgba(0, 0, 0, 0.42), 0 0 26px rgba(255, 69, 0, 0.24);
      cursor: pointer;
      font-weight: 900;
    }

    .riv-slideshow-fab:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }

    .riv-app.riv-layout-horizontal .riv-slideshow-fab {
      right: 18px;
      bottom: 18px;
      width: 52px;
      min-width: 52px;
      min-height: 52px;
      border-radius: 50%;
      padding: 0;
    }

    .riv-app.riv-layout-horizontal .riv-slideshow-fab span {
      display: none;
    }

    .riv-ui-settings-panel {
      position: absolute;
      right: 22px;
      top: 82px;
      z-index: 6;
      width: min(360px, calc(100vw - 44px));
      padding: 14px;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 8px;
      background: rgba(18, 18, 20, 0.98);
      color: #f7f7f8;
      box-shadow: 0 18px 46px rgba(0, 0, 0, 0.46);
    }

    .riv-ui-settings-panel label {
      display: grid;
      grid-template-columns: 112px minmax(0, 1fr) 56px;
      align-items: center;
      gap: 10px;
      min-height: 38px;
      color: #e7e7eb;
      font-size: 13px;
      font-weight: 800;
    }

    .riv-ui-settings-panel input[type="range"] {
      width: 100%;
      accent-color: #ff4500;
    }

    .riv-ui-settings-panel output {
      color: #bdbdc6;
      font-size: 12px;
      text-align: right;
    }

    .riv-ui-settings-panel select {
      grid-column: 2 / span 2;
      min-height: 34px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 7px;
      background: #101012;
      color: #fff;
      padding: 6px 8px;
    }

    .riv-debug-tools {
      display: grid;
      grid-template-columns: 112px 1fr 1fr;
      align-items: center;
      gap: 10px;
      margin-top: 10px;
      padding-top: 12px;
      border-top: 1px solid rgba(255, 255, 255, 0.12);
      color: #e7e7eb;
      font-size: 13px;
      font-weight: 800;
    }

    .riv-debug-tools button {
      min-height: 34px;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 7px;
      background: rgba(255, 255, 255, 0.08);
      color: #fff;
      cursor: pointer;
      font-weight: 800;
    }

    .riv-debug-tools button:hover,
    .riv-debug-tools button:focus-visible {
      border-color: rgba(255, 69, 0, 0.72);
      outline: none;
    }

    .riv-debug-tools output {
      grid-column: 2 / span 2;
      min-height: 16px;
      color: #bdbdc6;
      font-size: 12px;
      font-weight: 700;
      text-align: left;
    }

    .riv-empty {
      display: grid;
      place-items: center;
      align-content: center;
      min-height: 100%;
      padding: 28px;
      color: #a5a5ad;
      text-align: center;
    }

    .riv-empty .riv-icon {
      width: 48px;
      height: 48px;
      color: #ff5b1a;
    }

    .riv-empty h2 {
      margin: 12px 0 8px;
      color: #fff;
    }

    .riv-empty p {
      max-width: 440px;
      margin: 0 0 16px;
      line-height: 1.45;
    }

    .riv-empty button {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-height: 40px;
      padding: 0 14px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 8px;
      background: #ff4500;
      color: #fff;
      font-weight: 800;
      cursor: pointer;
    }

    .riv-empty-details {
      min-height: 420px;
    }

    .riv-slideshow {
      inset: 0;
      overflow: hidden;
      background: #000;
      color: #fff;
    }

    .riv-show-frame {
      position: absolute;
      inset: 22px max(20px, 7vw);
      display: grid;
      grid-template-rows: 72px minmax(0, 1fr) 218px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 8px;
      background: #050506;
      box-shadow: 0 30px 90px rgba(0, 0, 0, 0.7);
    }

    .riv-show-top {
      display: grid;
      grid-template-columns: 360px minmax(0, 1fr) 190px;
      align-items: center;
      min-width: 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.12);
      background: linear-gradient(180deg, rgba(20, 20, 22, 0.96), rgba(12, 12, 14, 0.92));
    }

    .riv-show-top .riv-brand {
      min-height: 72px;
      border-bottom: 0;
      padding-inline: 28px;
    }

    .riv-show-top .riv-brand strong {
      font-size: 24px;
    }

    .riv-show-title {
      min-width: 0;
      text-align: center;
    }

    .riv-show-title strong,
    .riv-show-title span {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .riv-show-title strong {
      color: #fff;
      font-size: 18px;
    }

    .riv-show-title span {
      margin-top: 2px;
      color: #a9a9b2;
    }

    .riv-show-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      padding-right: 24px;
    }

    .riv-show-stage {
      position: relative;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
      background: #050506;
    }

    .riv-show-image {
      width: 100%;
      height: 100%;
      background: #050506;
    }

    .riv-fit-contain {
      object-fit: contain;
    }

    .riv-fit-cover {
      object-fit: cover;
    }

    .riv-counter,
    .riv-show-metrics {
      position: absolute;
      z-index: 2;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 999px;
      background: rgba(8, 8, 10, 0.74);
      color: #fff;
      backdrop-filter: blur(14px);
    }

    .riv-counter {
      left: 20px;
      top: 20px;
      padding: 10px 16px;
      font-weight: 800;
    }

    .riv-show-metrics {
      right: 28px;
      top: 22px;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 14px;
      font-weight: 800;
    }

    .riv-show-metrics span:first-child {
      color: #ff5b1a;
    }

    .riv-show-nav {
      position: absolute;
      z-index: 2;
      top: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 58px;
      height: 58px;
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 50%;
      background: rgba(9, 9, 11, 0.62);
      color: #fff;
      box-shadow: 0 0 24px rgba(255, 69, 0, 0.22);
      cursor: pointer;
      transform: translateY(-50%);
    }

    .riv-show-nav:hover,
    .riv-show-nav:focus-visible {
      outline: none;
      border-color: rgba(255, 69, 0, 0.76);
      background: rgba(255, 69, 0, 0.18);
    }

    .riv-show-nav .riv-icon {
      width: 32px;
      height: 32px;
    }

    .riv-prev {
      left: 18px;
    }

    .riv-next {
      right: 18px;
    }

    .riv-settings-panel {
      position: absolute;
      z-index: 4;
      right: 24px;
      top: 76px;
      width: 220px;
      padding: 12px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 8px;
      background: rgba(18, 18, 20, 0.96);
      box-shadow: 0 18px 42px rgba(0, 0, 0, 0.45);
    }

    .riv-settings-panel label,
    .riv-settings-panel button {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      min-height: 36px;
      gap: 10px;
      color: #fff;
    }

    .riv-settings-panel select,
    .riv-settings-panel button {
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 7px;
      background: #101012;
      color: #fff;
      padding: 6px 8px;
    }

    .riv-settings-panel button {
      justify-content: center;
      margin-top: 10px;
      cursor: pointer;
    }

    .riv-show-bottom {
      display: grid;
      grid-template-rows: 84px 18px 1fr;
      min-width: 0;
      min-height: 0;
      padding: 14px 22px 16px;
      border-top: 1px solid rgba(255, 255, 255, 0.12);
      background: rgba(5, 5, 6, 0.98);
    }

    .riv-filmstrip {
      display: flex;
      gap: 8px;
      min-width: 0;
      overflow-x: auto;
      overflow-y: hidden;
      padding: 4px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.04);
    }

    .riv-filmstrip button {
      width: 116px;
      height: 66px;
      flex: 0 0 116px;
      overflow: hidden;
      padding: 0;
      border: 2px solid transparent;
      border-radius: 7px;
      background: #111;
      cursor: pointer;
    }

    .riv-filmstrip button.is-active {
      border-color: #ff4500;
      box-shadow: 0 0 0 1px rgba(255, 69, 0, 0.35);
    }

    .riv-progress {
      position: relative;
      width: 100%;
      height: 6px;
      align-self: center;
      overflow: hidden;
      padding: 0;
      border: 0;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.1);
      cursor: pointer;
    }

    .riv-progress-fill {
      position: absolute;
      left: 0;
      top: 0;
      width: 0;
      height: 100%;
      border-radius: inherit;
      background: #ff4500;
      box-shadow: 0 0 16px rgba(255, 69, 0, 0.5);
    }

    .riv-playback {
      display: grid;
      grid-template-columns: 56px 68px 56px 56px minmax(110px, 1fr) 88px 56px;
      align-items: center;
      justify-content: center;
      gap: 14px;
      max-width: 760px;
      width: 100%;
      margin: 0 auto;
    }

    .riv-control,
    .riv-speed {
      border-radius: 8px;
    }

    .riv-control.is-active,
    .riv-speed.is-active {
      border-color: rgba(255, 69, 0, 0.64);
      background: rgba(255, 69, 0, 0.16);
    }

    .riv-main-control {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 62px;
      height: 62px;
      border: 2px solid rgba(255, 255, 255, 0.86);
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.08);
      color: #fff;
      cursor: pointer;
    }

    .riv-main-control:hover,
    .riv-main-control:focus-visible {
      outline: none;
      border-color: #ff4500;
      background: rgba(255, 69, 0, 0.18);
    }

    .riv-main-control .riv-icon {
      width: 30px;
      height: 30px;
    }

    .riv-time {
      justify-self: end;
      color: #e9e9ec;
      font-size: 17px;
      white-space: nowrap;
    }

    .riv-speed {
      min-width: 86px;
      font-weight: 800;
    }

    @media (max-width: 1280px) {
      .riv-app {
        grid-template-columns: 76px minmax(300px, 1fr) minmax(320px, min(var(--riv-detail-width, 520px), 48vw));
      }

      .riv-sidebar .riv-brand {
        justify-content: center;
        padding-inline: 0;
      }

      .riv-sidebar .riv-brand strong,
      .riv-sidebar .riv-section-title,
      .riv-sidebar .riv-side-button span,
      .riv-sidebar .riv-sub-button span,
      .riv-sidebar .riv-sub-button .riv-icon,
      .riv-sidebar .riv-sort {
        display: none;
      }

      .riv-section {
        padding-inline: 12px;
      }

      .riv-side-button,
      .riv-sub-button {
        justify-content: center;
      }

      .riv-show-frame {
        inset-inline: 24px;
      }

      .riv-show-top {
        grid-template-columns: 250px minmax(0, 1fr) 170px;
      }

      .riv-show-top .riv-brand em,
      .riv-show-top .riv-brand-divider {
        display: none;
      }
    }

    @media (max-width: 980px) {
      .riv-app {
        inset: 0;
        grid-template-columns: 1fr;
        grid-template-rows: 68px minmax(0, 1fr);
        border-radius: 0;
      }

      .riv-app.riv-layout-horizontal {
        grid-template-rows: minmax(0, 1fr);
      }

      .riv-sidebar,
      .riv-details {
        display: none;
      }

      .riv-topbar {
        grid-column: 1;
        grid-template-columns: 1fr auto;
        padding-inline: 12px;
      }

      .riv-crumb,
      .riv-top-actions .riv-notification,
      .riv-user-menu {
        display: none;
      }

      .riv-feed {
        padding-bottom: 82px;
      }

      .riv-app.riv-layout-horizontal .riv-feed {
        padding: 0;
      }

      .riv-ui-settings-panel {
        right: 12px;
        top: 76px;
      }

      .riv-ui-settings-panel label {
        grid-template-columns: 96px minmax(0, 1fr) 50px;
      }

      .riv-horizontal-overlay {
        left: 12px;
        right: 12px;
        bottom: 14px;
        max-width: none;
        padding: 12px;
      }

      .riv-horizontal-overlay h2 {
        font-size: 16px;
      }

      .riv-horizontal-nav {
        width: 72px;
      }

      .riv-horizontal-rail {
        max-width: calc(100vw - 110px);
        bottom: 14px;
      }

      .riv-slideshow-fab {
        right: 16px;
        bottom: 16px;
      }

      .riv-show-frame {
        inset: 0;
        grid-template-rows: 64px minmax(0, 1fr) 184px;
        border-radius: 0;
      }

      .riv-show-top {
        grid-template-columns: 92px minmax(0, 1fr) 150px;
      }

      .riv-show-top .riv-brand {
        padding-inline: 12px;
      }

      .riv-show-top .riv-brand strong,
      .riv-show-top .riv-brand em,
      .riv-show-top .riv-brand-divider {
        display: none;
      }

      .riv-show-title strong {
        font-size: 14px;
      }

      .riv-counter {
        left: 12px;
        top: 12px;
        padding: 8px 12px;
        font-size: 12px;
      }

      .riv-show-metrics {
        right: 12px;
        top: 12px;
        font-size: 12px;
      }

      .riv-show-nav {
        width: 46px;
        height: 46px;
      }

      .riv-filmstrip button {
        width: 86px;
        flex-basis: 86px;
      }

      .riv-playback {
        grid-template-columns: 42px 56px 42px 42px 1fr 70px 42px;
        gap: 8px;
      }

      .riv-time {
        font-size: 13px;
      }
    }

    @media (max-width: 620px) {
      .riv-grid {
        grid-template-columns: 1fr 1fr;
      }

      .riv-card-meta {
        gap: 10px;
        font-size: 12px;
      }

      .riv-show-bottom {
        grid-template-rows: 72px 16px 1fr;
        padding-inline: 12px;
      }

      .riv-playback {
        grid-template-columns: 42px 54px 42px 42px 62px 42px;
      }

      .riv-playback .riv-time {
        display: none;
      }
    }
  `;

  init();
})();
