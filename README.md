# CIPHER // 2077 Mobile Pack

Files intended to be copied into the root of `Shmeckle/CIPHER77`.

## What is included

- `cipher-2077.json` — theme v1.2. More aggressive OLED-black surfaces and
  soft-cyan raw text colours.
- `fonts/rajdhani.json` — dedicated Revenge font pack. Install this separately
  under Revenge -> Fonts; this is more reliable than relying on a theme's
  embedded font map.
- `plugins/cipher-ui/` — direct-install runtime plugin v0.1.0.

## URLs after uploading to GitHub

Theme:
https://raw.githubusercontent.com/Shmeckle/CIPHER77/main/cipher-2077.json

Font:
https://raw.githubusercontent.com/Shmeckle/CIPHER77/main/fonts/rajdhani.json

Plugin BASE URL (keep the trailing slash):
https://raw.githubusercontent.com/Shmeckle/CIPHER77/main/plugins/cipher-ui/

## Recommended order

1. Replace the existing `cipher-2077.json` with this one.
2. Revenge -> Fonts -> + -> add the Rajdhani raw URL, select it, then reload.
3. Revenge -> Plugins -> Install a plugin -> paste the plugin BASE URL.
4. Enable `CIPHER // 2077 UI` and fully reload Discord.
5. Open the plugin settings page. The runtime counters help tell us which hooks
   are actually being hit on your Discord build.

## Important limitation

Discord's current Android chat list is partly native (`DCDChat`). JavaScript can
style the DCDChat host surface, but individual message internals may not pass
through React Native's JS element tree. That is why the theme's raw colour map
and the separate font pack still matter even with the plugin installed.
