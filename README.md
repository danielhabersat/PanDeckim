# PanDeckim

A dependency-free Pandemic and Iberia player-deck simulator built with HTML,
CSS, and JavaScript.

## Run

Open `index.html` in a browser. No install or build step is required.

The current game, including its shuffled deck and draw position, is saved in
that browser. Clearing site data or using private browsing may remove the save.

## Publish with GitHub Pages

1. Create a GitHub repository and push these project files to its `main` branch.
2. In the repository, open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, select
   `main` and `/ (root)`, then save.
4. Wait for the Pages deployment and open the published URL shown in the Pages
   settings.

The repository and its source will be public when using a public repository.
GitHub Pages serves the app over HTTPS, which is required for offline support.

## Install and use offline on Android

1. Open the published Pages URL in Chrome while online.
2. Allow the page to finish loading so the service worker can cache the app.
   The initial cache is prepared automatically on first visit.
3. In Chrome, use **Install app** if offered, or **Add to Home screen**.
4. Launch PanDeckim from its home-screen icon. After its first successful load,
   the app shell is available offline, including in airplane mode.

The saved game belongs to that browser installation on that phone; it does not
sync to other devices. Clearing the app's storage removes the saved game and
offline files, so open the site again while online to reinstall the cache.

## Files

- `index.html` contains the page structure.
- `styles.css` contains the responsive visual styles.
- `script.js` contains deck generation, game state, and browser persistence.
- `manifest.webmanifest`, the app icons, and `service-worker.js` provide install
  metadata and offline caching for the hosted app.