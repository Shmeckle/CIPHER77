# CIPHER // 2077 — CHOOMBA v0.2

This pass is aimed at matching the desktop Cyberpunk 2077 Discord theme rather
than merely recolouring stock Discord.

## Upload

Copy these into the root of `Shmeckle/CIPHER77`:

- `cipher-2077.json` — replace the existing root theme.
- `rajdhani.json` — safe to replace the existing root font pack (unchanged).
- `direct/cipher-ui/manifest.json`
- `direct/cipher-ui/index.js`

Do not replace your Revenge Next source/build folders unless you want to; this
direct plugin lives separately so the two packaging formats stop fighting each
other.

## URLs after pushing

Theme:
https://raw.githubusercontent.com/Shmeckle/CIPHER77/main/cipher-2077.json

Font:
https://raw.githubusercontent.com/Shmeckle/CIPHER77/main/rajdhani.json

Direct plugin (paste this folder URL into "Install a plugin"):
https://raw.githubusercontent.com/Shmeckle/CIPHER77/main/direct/cipher-ui/

## Design changes

Theme v1.3 adds a much larger set of current Discord semantic/raw tokens:
- additional surface, modal, overlay and input tokens
- current icon/text/channel tokens
- current redesign button/input/border tokens
- BRAND_NEW and full primary/raw ramps
- red HUD borders, yellow active states, cyan neutral typography

Plugin v0.2 adds four complementary layers:
- sweep already-loaded Metro styles
- patch newly-created StyleSheets
- patch JSX/createElement props
- patch native property payloads

It also adds 5px cyberpunk corners, red header dividers, red avatar/panel
outlines where detectable, yellow selected-row accents and yellow date
separators. Neutral colours are altered; genuine role/user colours are left
alone.

After installing/updating both theme and plugin, fully reload Discord.
