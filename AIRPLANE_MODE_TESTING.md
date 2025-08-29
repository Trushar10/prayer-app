# Airplane Mode Testing Guide

## Prerequisites

1. Build the app: `npm run build`
2. Start production server: `npm start`
3. Open http://localhost:3000 in a regular browser (not VS Code browser)

## Testing Steps

### Step 1: Cache Content First

1. Open the app while ONLINE
2. Click the download/install button (💾) in the header
3. Wait for content download to complete
4. The service worker should cache all assets and content

### Step 2: Test Offline Functionality

1. Enable airplane mode on your device/browser
2. OR disconnect from WiFi
3. OR use browser dev tools -> Network -> "Offline" checkbox

### Step 3: Verify Functionality

-   [ ] App loads without "no internet" message
-   [ ] Theme toggle button (🌙/☀️) works correctly
-   [ ] Can switch between light/dark themes
-   [ ] Prayer content is accessible
-   [ ] Navigation between different prayers works
-   [ ] All cached content displays properly

### Troubleshooting

If it still doesn't work:

1. Check browser dev tools console for errors
2. Verify service worker is registered: Application tab > Service Workers
3. Check cached content: Application tab > Storage > Cache Storage
4. Clear all caches and try again: Application tab > Storage > "Clear storage"

### Expected Caches

-   essential-cache-v2
-   pages-cache-v2
-   prayers-api-cache
-   static-resources
-   next-static-cache
