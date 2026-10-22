# Uninstrumented scene checkpoint

This run was opened to recheck an earlier HUD-only visual report. The loaded scene and hash audit now show the full house and character; the older HUD-only classification was caused by the black map area surrounding the room.

Use the window titled `FreeJ2ME-Plus - SCN-0004 HUD diagnosis baseline`. Follow the same Ronin save/load route. If the map/background disappears while the HUD remains, pause and report; do not press more keys until paired X11/frontbuffer/state capture is taken. If the house renders, pause in the loaded scene and report that instead. This run uses the original game/emulator JARs from an isolated fixture copy, with no agent, input injection, or game-state writes.
