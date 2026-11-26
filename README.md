# Aura

A Mac browser for designers that remembers what you save by how it looks. Built on Electron (Chromium), in the Faceplate v3.4 design language.

## Run it

**Installed app.** Download `Aura-mac-arm64.zip` (Apple silicon) or `Aura-mac-x64.zip` (Intel) from Releases, unzip, and drag Aura.app to Applications. The app isn't notarised yet, so the first time, right-click Aura.app and choose Open. If macOS still refuses, open System Settings, Privacy & Security, and click Open Anyway, or run `xattr -cr /Applications/Aura.app` once in Terminal.

**From source.**

```sh
npm install
npm start          # run it
npm run dist:mac   # build dist/Aura-*.dmg and .zip on a Mac
```

## What's in v0

- **Tabs down the side**: pins, folders and Today, with drag to reorder, pin (⌘D) or move into folders. Pins and folder tabs sleep when closed; Today tabs close.
- **Spaces** (⌃1 to ⌃4): each is a separate browser profile with its own logins, cookies, tabs and theme tint. Create one with ⌘⇧N or the + at the bottom of the sidebar; right-click a Space to edit or delete it.
- **Three sidebar modes**: always show (⌘⇧1), collapse to numbered icons (⌘⇧2), hide (⌘⇧3, point at the left edge to bring it back). ⌘⇧L hides the toolbar.
- **Command bar** (⌘K): addresses, search, open tabs, saves described in words, history and commands. ⌘L edits the address.
- **Save** (⌘S): screenshot plus the page's colours, type and values, kept in the Library on this Mac. ⌘⇧S saves the look, ⌥⌘T a typeface (click any text), ⌥⌘C a colour (eyedropper), ⌘⇧A an area (drag).
- **Page palette and This page panel** (⌘I): five colours read from the page next to the address, and a panel that pushes the page aside with colours, faces, radius, measure and motion. Click a colour to copy it; Copy as CSS gives custom properties.
- **Library** (⌘⇧O): find saves by describing them ("light, blue accent, Helvetica"), with detail, notes, Copy as CSS and Export PNG.
- **Daily** is the new tab: the 26 November snapshot of typefaces, Sites of the Day, identities, Dribbble and palettes.
- **Everyday browser**: back and forward, reload, find in page (⌘F, ⌘G), zoom, history (⌘Y), downloads (⌥⌘L), reopen closed tab (⌘⇧T), print, developer tools, sign-in popups, full-screen video.
- **Passwords**: Aura offers to save a password when you sign in on an https site and fills it next time. Encrypted with a key in the macOS Keychain. Import a CSV from 1Password, Chrome or Safari in Settings.
- **Settings** (⌘,): default browser, search engine, chrome theme (dark, light, match macOS), Spaces, passwords, unpacked Chrome extensions, privacy.

## Known limits

- Daily shows a fixed snapshot; live refresh is next.
- Chrome Web Store installs aren't supported. Unpacked extensions load, but Electron supports only part of the extension API, so password-manager extensions such as 1Password may not fill. 1Password's Universal Autofill (⌘\\) works.
- The app isn't signed with a Developer ID or notarised yet.

## Layout

```
src/main/      main process: window, tabs, Spaces, saves, history, downloads, passwords, menus
src/preload/   bridges for the chrome and for tabs
src/shell/     the chrome: sidebar, toolbar, command bar, panels
src/pages/     aura:// pages: Daily, Library, History, Downloads, Settings, error
assets/fonts/  Geist and Geist Mono (SIL OFL)
```

Data lives in `~/Library/Application Support/Aura`.
