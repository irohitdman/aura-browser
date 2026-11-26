# Aura

A Mac browser for designers that remembers what you save by how it looks. Built on Electron (Chromium), in the Faceplate v3.4 design language.

## Run it

**Installed app.** Download `Aura-0.2.0-mac-arm64.zip` (Apple silicon Macs), unzip it and drag Aura.app to Applications. This build isn't signed with a Developer ID yet, so macOS will say it's damaged until you sign it for your own Mac. Run this once in Terminal:

```sh
xattr -cr /Applications/Aura.app && codesign --force --deep --sign - /Applications/Aura.app
```

Then open Aura normally. A build made on your own Mac with `npm run dist:mac` doesn't need this.

**From source.**

```sh
npm install
npm start          # run it
npm run dist:mac   # build dist/Aura-*.dmg and .zip on a Mac
```

## What's in v0.2

- **First run**: Aura brings your bookmarks over from Chrome, Arc, Brave, Edge, Vivaldi, Opera, Chromium or Dia (or a bookmarks .html file from Safari or Firefox). It looks at 10, 20 or 30 of those sites in a private window that keeps nothing, asks what you like about each, and turns the answers into a taste palette (colours, typefaces, feel and the sites you love) saved to your Library. Run it again from Settings › Your taste.
- **Tabs down the side**: pins, folders and Today, with drag to reorder, pin (⌘D) or move into folders. The top of the sidebar carries the Aura mark and the current Space.
- **Spaces** (⌃1 to ⌃4): separate profiles with their own logins, cookies, tabs, theme tint and extensions. New Space (⌘⇧N) opens a centred panel.
- **Toolbar, always there**: address, page palette, Inspect, Ask, Save, extensions, downloads and Library.
- **Split view** (⌘⇧\\ or right-click a tab › Open in split view): two pages side by side; swap or close from the toolbar.
- **Inspect** (⌘I): type, colours, scale, values, and the page's SVGs and images in the right pane. Click to copy; save any of it to the Library.
- **Ask Aura**, Aura Farming (⌘J): summarise a page, pull out takeaways, describe its design, turn tables into CSV, or ask anything about it. Select text on any page for Explain, Summarise and Translate. Needs an Anthropic API key in Settings › Aura Farming; it's stored encrypted in the macOS Keychain. Uses Claude Opus 5.5 by default.
- **Extensions from the Chrome Web Store**: open an extension's store page and press Add to Aura in the toolbar. Aura shows what it will be able to do and which Spaces get it. Manage them in Settings › Extensions.
- **Command bar** (⌘K): addresses, search, open tabs, matches on the current page, saves described in words, history, commands and Ask.
- **Daily** is the new tab, refreshed every few hours from Awwwards, FWA, One Page Love, Codrops, CodePen picks and Google Fonts. Websites show their homepage, typefaces are set in the face itself, palettes show swatches, and Interactions collects motion and interaction pieces. If the sources can't be reached it shows the last copy it fetched.
- **Save** (⌘S) and **Library** (⌘⇧O): screenshot plus colours, type and values, found later by describing them.
- **Everyday browser**: history, downloads, find in page, zoom, reopen closed tab, passwords (encrypted with the Keychain), print, developer tools, full-screen video.

## Known limits

- Electron supports only part of the Chrome extension API, so some extensions (password managers in particular) may not fully work. 1Password's Universal Autofill (⌘\\) works.
- Ask Aura needs your own Anthropic API key.
- Safari bookmarks need exporting first (File › Export Browsing Data), because reading them directly needs Full Disk Access.
- The app isn't signed with a Developer ID or notarised yet.

## Layout

```
src/main/      main process: window, tabs, Spaces, saves, history, downloads, passwords, menus
src/preload/   bridges for the chrome and for tabs
src/shell/     the chrome: sidebar, toolbar, command bar, panels
src/pages/     aura:// pages: Welcome, Daily, Library, History, Downloads, Settings, error
assets/fonts/  Geist and Geist Mono (SIL OFL)
```

Data lives in `~/Library/Application Support/Aura`.
