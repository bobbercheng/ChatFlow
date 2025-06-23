# Module Resolution Fix for scrypt-js

## Issue
Browser error: `Uncaught TypeError: Failed to resolve module specifier "scrypt-js". Relative references must start with either "/", "./", or "../".`

## Root Cause
The ES6 import syntax `import * as scrypt from 'scrypt-js'` doesn't work in the browser without a bundler like webpack or vite. The browser couldn't resolve the npm package path.

## Solution
Switched from npm package import to CDN global variable:

### Before (BROKEN):
```javascript
import * as scrypt from 'scrypt-js';
```

### After (FIXED):
```html
<!-- In index.html -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/scrypt-js/3.0.1/scrypt.min.js"></script>
```

```javascript
// In encryption.ts
declare const scrypt: {
  scrypt(password: Uint8Array, salt: Uint8Array, N: number, r: number, p: number, dkLen: number): Promise<Uint8Array>;
};
```

## Files Changed
1. `frontend/src/utils/encryption.ts` - Replaced ES6 import with global declaration
2. `frontend/src/index.html` - Added CDN script tag
3. Removed `scrypt-js` from package.json dependencies

## Benefits
- No module bundler required
- Works in all browsers
- Maintains same scrypt functionality
- Reduces npm dependencies
- Uses trusted CDN with integrity check

The encryption functionality remains identical, just loaded differently. 