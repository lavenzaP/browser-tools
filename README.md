# Userscripts

Unofficial personal userscripts for Tampermonkey and Violentmonkey.

This repository is not affiliated with Reddit, Nexus Mods, Kone, or any other referenced website. The scripts do not include third-party logos, images, fonts, or copied website assets. They run in the user's own browser on pages the user can already access.

## Install

Install a userscript manager such as Tampermonkey or Violentmonkey, then open one of these raw script URLs:

| Script | Raw install URL |
| --- | --- |
| Nexus Mods Game Hider | https://raw.githubusercontent.com/lavenzaP/browser-tools/main/nexus-game-hider.user.js |
| Reddit Feed Flair Badges | https://raw.githubusercontent.com/lavenzaP/browser-tools/main/reddit-feed-flair.user.js |
| Reddit Image Viewer | https://raw.githubusercontent.com/lavenzaP/browser-tools/main/reddit-image-viewer.user.js |
| Universal Image Click Menu | https://raw.githubusercontent.com/lavenzaP/browser-tools/main/universal-image-click-menu.user.js |

The scripts include `@updateURL` and `@downloadURL` metadata, so supported userscript managers can update from this repository after installation.

## Scripts

### Nexus Mods Game Hider

`nexus-game-hider.user.js` hides Nexus Mods cards for selected games on the all-mods feed and mod lists.

- Works on `https://www.nexusmods.com/mods*` and `https://www.nexusmods.com/*/mods*`.
- Lets the user configure hidden games by display name or Nexus slug.
- Does not include Nexus Mods assets or official branding.

### Reddit Feed Flair Badges

`reddit-feed-flair.user.js` shows visible Reddit post flair badges and can hide posts whose flair matches configured words.

- Works on `www.reddit.com`, `old.reddit.com`, and `sh.reddit.com`.
- Reads flair from rendered posts when available.
- Uses Reddit's same-origin JSON response only as a fallback when the rendered card does not expose flair directly.
- Stores filter settings locally through userscript storage or `localStorage`.

### Reddit Image Viewer

`reddit-image-viewer.user.js` adds an image-first Reddit gallery and viewer overlay.

- Works on `www.reddit.com`, `old.reddit.com`, and `sh.reddit.com`.
- Scans the rendered Reddit feed for image and video posts.
- Requests Reddit's same-origin listing JSON from the current page to load more posts the user can already access.
- Does not use `GM_xmlhttpRequest`, proxies, CORS bypasses, login bypasses, paywall bypasses, or DRM/access-control bypasses.
- Does not provide image or video download features. The only download action is an optional debug JSON log for troubleshooting.
- Can hand off media to `universal-image-click-menu.user.js` when that script is also installed.

### Universal Image Click Menu

`universal-image-click-menu.user.js` adds a compact left-click image action pad and in-page viewer to large images on most websites.

- Opens a viewer with previous/next navigation, zoom, pan, and original-image open.
- Scopes gallery collection to the clicked article or content area when possible.
- Filters lazy-load placeholders and hidden or transparent images.
- Lets users hide nearby floating UI and exclude specific images or sites.
- Does not provide image download or bulk-download menu actions.
- Does not use cross-origin request bypasses or external proxy services.
- Reddit is disabled by default so Reddit-specific scripts can handle Reddit pages directly.

## Legal And Safety Notes

- These scripts are unofficial tools and are not endorsed by the websites they run on.
- No third-party copyrighted media, icons, logos, or site assets are bundled in this repository.
- Users are responsible for following each website's terms and applicable law.
- The scripts should not be modified to bypass authentication, paywalls, DRM, rate limits, or other access controls.
- If a website owner asks for a site-specific script to be removed or changed, review the request before redistributing.

## Development

Keep each userscript as a standalone `.user.js` file with its own metadata block.

When adding a new userscript:

1. Add `@license MIT`.
2. Add `@homepageURL`, `@supportURL`, `@updateURL`, and `@downloadURL`.
3. Avoid bundling third-party assets unless their license clearly allows redistribution.
4. Document any network requests, storage use, or download/export behavior in this README.
5. Run a syntax check before publishing:

```powershell
node --check .\script-name.user.js
```

## License

MIT. See `LICENSE`.
