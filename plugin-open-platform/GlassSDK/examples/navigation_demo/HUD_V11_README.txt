Navigation HUD V11

Added:
- Arrow geometry generation
- Canvas initialization structure
- Pixel rendering preparation

Pipeline:

Navigation JSON
 -> Parser
 -> HUD Renderer
 -> Canvas Geometry
 -> LVGL Canvas

Next:
Connect concrete MemoMind LVGL draw functions.
