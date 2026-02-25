# Fetching The TurboWarp Types

#### Assuming there is a `/nnm4w/` directory on the System:
```bash
git clone https://github.com/Gandi-IDE/gandi-types C:/nvm4w/nodejs/node_modules/@turbowarp/types
```
OR; get it from my Google Drive
https://drive.google.com/drive/folders/1tTJZWrGZKd9IV7b1WJq1b7YCwTCitvz5?usp=drive_link
---
# Linking TurboWarp Types
#### *`MacOS / darwin`* Machine
```bash
ln -s "../@turbowarp/types/types" turbowarp-types
```
#### *`Win32`* Machine
```cmd
mklink /D turbowarp-types "C:/nvm4w/nodejs/node_modules/@turbowarp/types/types"
```
```powershell
New-Item -ItemType SymbolicLink -Path "turbowarp-types" -Target "C:/nvm4w/nodejs/node_modules/@turbowarp/types/types"
```
- As an **Administrator**:
```powershell
Start-Process cmd -ArgumentList '/c mklink /D D:\Matterer\turbowarp-types C:\nvm4w\nodejs\node_modules\@turbowarp\types\types' -Verb RunAs
```
---
# Updating The Gandi IDE Extension via jsDelivr
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
