---
name: Browser test runtime
description: Native dependencies required for local Playwright Chromium runs in this Nix environment.
---

Playwright Chromium runs only after the workspace has the browser's native Nix libraries installed, including GLib, GBM, ALSA, graphics, X11, and related text/rendering libraries.

**Why:** The downloaded Playwright browser does not bundle these shared libraries; without them, tests fail before the first page opens.

**How to apply:** When browser tests fail during `browserType.launch` with a missing `.so` file, install the matching Nix package before investigating application code.