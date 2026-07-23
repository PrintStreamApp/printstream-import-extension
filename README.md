# PrintStream Remote Import Helper

This is a minimal Chrome extension for the `remote-imports` plugin.

What it does:

- Injects a `Print to PrintStream` button on `makerworld.com` and `printables.com`.
- Detects downloadable `.gcode.3mf`, `.gcode`, `.3mf`, `.stl`, and archive links in provider pages, including all file buttons on Printables.
- Adds small PrintStream actions near detected download links.
- Uploads the selected provider file to PrintStream through the user's normal browser-accessible download path.
- Falls back to `/workspaces/<workspace-slug>/import?url=<current-page-url>&candidate=<file-url>` when PrintStream needs login, bridge selection, or manual handoff.

Guardrails:

- It only uses links present in the user's normal browser session.
- It does not bypass paywalls, private-file access, login requirements, anti-bot controls, or provider restrictions.

Load it as an unpacked extension:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose `Load unpacked`.
4. Select this directory.
5. Open the extension options page, set your PrintStream base URL and workspace slug, and approve the requested permission for that origin.
