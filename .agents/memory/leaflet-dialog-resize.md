---
name: Leaflet map inside an animated dialog
description: How to render a react-leaflet map inside a shadcn/Radix Dialog without gray/blank tiles
---

# Leaflet in an animated Dialog/modal

A react-leaflet `MapContainer` that mounts inside an animated overlay (shadcn/Radix
`Dialog`, sheets, accordions, resizable panels) renders **gray/blank tiles** because
Leaflet measures the container size before the open animation finishes, so it never
requests the right tiles.

**The fix (both needed):**
1. **Mount-guard** the inner `MapContainer` with `{open && <MapContainer .../>}` so it
   only mounts after the dialog is open and tears down cleanly on close.
2. Add a child helper that calls `map.invalidateSize()` on a few delays after mount —
   `[80, 250, 600]ms` covers the open animation. Clear the timers in the effect cleanup.

**Why:** a single `invalidateSize()` on mount fires too early (mid-animation). Staggered
calls catch the final layout. Mount-guarding also avoids a hidden zero-size map.

**How to apply:** any time a Leaflet map lives inside something that animates open or
changes size after the map mounts. In this repo see `ProjectMap.tsx` (`InvalidateSize`
helper + the `{expanded && ...}` guard in the expand dialog).
