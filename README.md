# Updating Our Gandi IDE Extension via jsDelivr

## Steps to push an update

1. **Compile the TypeScript**
   ```bash
   tsc
   ```

2. **Push to GitHub**
   ```bash
   git add .
   git commit -m "update"
   git push
   ```

3. **Purge the jsDelivr cache** (open this in the browser)
   ```
   https://purge.jsdelivr.net/gh/GMM-rgb/OUR_REPO@main/build/main.js
   ```

4. **Load the extension in Gandi** using the normal URL
   ```
   https://cdn.jsdelivr.net/gh/GMM-rgb/OUR_REPO@main/build/main.js
   ```

5. **Install via the ?gext= URL**
   ```
   https://www.ccw.site/gandi?gext=https://cdn.jsdelivr.net/gh/GMM-rgb/OUR_REPO@main/build/main.js
   ```

## Notes
- Always purge the cache BEFORE trying to reinstall the extension
- If it still won't update, use a specific commit hash instead of `@main`:
  ```
  https://cdn.jsdelivr.net/gh/GMM-rgb/OUR_REPO@COMMITHASH/build/main.js
  ```
- We can find our commit hash on GitHub next to our latest commit
