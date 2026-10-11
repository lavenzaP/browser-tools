const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");

const source = readFileSync(join(__dirname, "../reddit-image-viewer.user.js"), "utf8");

function setup({ href = "https://www.reddit.com/r/pics/", settings = {} } = {}) {
  const storage = new Map(Object.entries(settings));
  const requests = [];
  const clearedTimers = [];
  const context = {
    URL,
    URLSearchParams,
    document: { documentElement: { getAttribute: () => null }, querySelectorAll: () => [] },
    window: {
      location: new URL(href),
      localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
      clearTimeout: id => clearedTimers.push(id),
      setTimeout: () => 1,
    },
    fetch: url => new Promise((resolve, reject) => requests.push({ url: new URL(url), resolve, reject })),
  };
  assert.equal((source.match(/^  init\(\);$/gm) || []).length, 1);
  runInNewContext(source.replace(/^  init\(\);$/m, `
    renderApp = renderSoon = renderLauncher = () => {};
    globalThis.riv = {
      STATE, listingUrl, resetListingStateIfChanged, ensureMoreFeed,
      onRootChange, setFeedSort, flushJsonLookups, scan, renderTimeRangeControl,
    };
  `), context);
  const riv = context.riv;
  riv.resetListingStateIfChanged();
  return { ...riv, context, storage, requests, clearedTimers };
}

function respond(request, after = null, children = []) {
  request.resolve({
    ok: true,
    headers: { get: () => "application/json" },
    json: async () => ({ data: { after, children } }),
  });
}

function changePeriod(riv, value) {
  riv.onRootChange({ target: { closest: () => ({ value, getAttribute: () => "time-range" }) } });
}

test("all six periods reach subreddit, home, search and JSON listings", () => {
  for (const href of [
    "https://www.reddit.com/r/pics/hot/?t=year&after=old&count=100",
    "https://old.reddit.com/",
    "https://sh.reddit.com/r/pics/search/?q=lake&restrict_sr=on",
    "https://www.reddit.com/r/pics/top.json",
  ]) {
    const riv = setup({ href, settings: { "riv:sort": "top" } });
    for (const period of ["hour", "day", "week", "month", "year", "all"]) {
      changePeriod(riv, period);
      const url = riv.requests.at(-1).url;
      assert.equal(url.searchParams.get("t"), period);
      assert.equal(url.searchParams.has("after"), false);
      assert.equal(url.searchParams.has("count"), false);
      assert.equal(url.origin, new URL(href).origin);
      if (url.pathname.includes("search")) {
        assert.equal(url.searchParams.get("sort"), "top");
        assert.equal(url.searchParams.get("q"), "lake");
        assert.equal(url.searchParams.get("restrict_sr"), "on");
      } else {
        assert.match(url.pathname, /\/top\.json$/);
      }
      assert.equal(riv.storage.get("riv:timeRange"), period);
    }
  }
});

test("saved period, URL fallback, invalid storage and conditional control", () => {
  assert.equal(setup().STATE.timeRange, "day");
  assert.equal(setup({ href: "https://www.reddit.com/top/?t=year" }).STATE.timeRange, "year");
  assert.equal(setup({ settings: { "riv:timeRange": "invalid" } }).STATE.timeRange, "day");
  const riv = setup({ settings: { "riv:sort": "top", "riv:timeRange": "week" } });
  assert.equal(riv.STATE.timeRange, "week");
  assert.equal((riv.renderTimeRangeControl().match(/<option /g) || []).length, 6);
  assert.match(riv.renderTimeRangeControl(), /value="week" selected/);
  for (const sort of ["hot", "new", "rising", "best"]) {
    riv.setFeedSort(sort);
    assert.equal(riv.requests.at(-1).url.searchParams.has("t"), false);
    assert.equal(riv.renderTimeRangeControl(), "");
  }
  riv.setFeedSort("top");
  assert.equal(riv.requests.at(-1).url.searchParams.get("t"), "week");
  const comments = setup({ href: "https://www.reddit.com/r/pics/comments/abc/title/", settings: { "riv:sort": "top" } });
  assert.equal(comments.listingUrl(), null);
  assert.equal(comments.renderTimeRangeControl(), "");
});

test("pagination keeps the period and changing it clears posts, selection and cursor", async () => {
  const riv = setup({ settings: { "riv:sort": "top", "riv:timeRange": "month" } });
  const firstPage = riv.ensureMoreFeed("test");
  respond(riv.requests[0], "t3_next", [{ data: { name: "t3_first", url: "https://i.redd.it/test.jpg" } }]);
  await firstPage;
  const nextPage = riv.ensureMoreFeed("test");
  assert.equal(riv.requests[1].url.searchParams.get("t"), "month");
  assert.equal(riv.requests[1].url.searchParams.get("after"), "t3_next");
  respond(riv.requests[1]);
  await nextPage;
  riv.STATE.selectedKey = "t3_first";
  riv.STATE.feedScrollTop = 500;
  riv.STATE.feedScrollLeft = 1000;
  changePeriod(riv, "hour");
  assert.equal(riv.STATE.posts.length, 0);
  assert.equal(riv.STATE.postsByKey.size, 0);
  assert.equal(riv.STATE.selectedKey, "");
  assert.equal(riv.STATE.feedPagesFetched, 0);
  assert.equal(riv.STATE.feedScrollTop, 0);
  assert.equal(riv.STATE.feedScrollLeft, 0);
  assert.equal(riv.requests.at(-1).url.searchParams.has("after"), false);
});

test("Top scans cannot import posts from the underlying feed", () => {
  const riv = setup({ settings: { "riv:sort": "top" } });
  riv.context.document.querySelectorAll = () => assert.fail("Top must not scan the page's different feed");
  riv.scan();
  assert.equal(riv.STATE.posts.length, 0);
  assert.equal(riv.requests.length, 1);
});

test("old listing responses and errors cannot alter the newly selected period", async () => {
  for (const fail of [false, true]) {
    const riv = setup({ settings: { "riv:sort": "top" } });
    const pending = riv.ensureMoreFeed("test");
    changePeriod(riv, "year");
    if (fail) riv.requests[0].reject(new Error("Old request failed"));
    else respond(riv.requests[0], "t3_old", [{ data: { name: "t3_old", url: "https://i.redd.it/old.jpg" } }]);
    await pending;
    assert.equal(riv.STATE.posts.length, 0);
    assert.equal(riv.STATE.feedAfter, "");
    assert.equal(riv.STATE.feedError, "");
    assert.equal(riv.STATE.feedLoading, true);
    assert.equal(riv.STATE.feedSeenAfters.has("__first__"), true);
  }
});

test("pending DOM metadata cannot reinsert posts after switching to Top", async () => {
  const riv = setup();
  riv.STATE.pendingJsonIds.add("t3_old");
  const pending = riv.flushJsonLookups();
  riv.STATE.jsonTimer = 42;
  riv.setFeedSort("top");
  assert.ok(riv.clearedTimers.includes(42));
  respond(riv.requests[0], null, [{ data: { name: "t3_old", url: "https://i.redd.it/old.jpg" } }]);
  await pending;
  assert.equal(riv.STATE.posts.length, 0);
  assert.equal(riv.STATE.lookedUpJsonIds.size, 0);
});
