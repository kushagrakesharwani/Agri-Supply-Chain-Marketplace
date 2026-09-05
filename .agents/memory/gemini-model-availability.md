---
name: Gemini model availability
description: Direct Gemini API model IDs can change independently of the application SDK.
---

When calling Gemini directly with a user-managed API key, do not assume a previously documented model ID remains available for new keys. A provider 404 may explicitly name the replacement model; use that current model and re-run a real image request before treating the integration as broken.

**Why:** The configured Gemini key rejected the initially documented vision model and returned a provider-directed replacement, while the request format and key were otherwise valid.

**How to apply:** Keep the model ID in one small helper, surface provider failures clearly, and verify the full image-to-JSON path after any model change.