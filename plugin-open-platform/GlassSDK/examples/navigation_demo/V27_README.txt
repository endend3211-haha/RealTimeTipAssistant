Navigation HUD V27

Connected HUD layers to LVGL widget architecture.

Flow:

HUD Layer Manager

 |
 v

LVGL HUD View

 |
 +-- Arrow Widget
 |
 +-- Distance Widget
 |
 +-- Text Widget

 |
 v

Display Driver

Purpose:
Prepare real HUD rendering layer.