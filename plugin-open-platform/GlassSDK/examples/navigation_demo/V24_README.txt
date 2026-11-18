Navigation HUD V24

Connected Event Queue to HUD Update Loop.

Flow:

SDK Event
 |
 v
Event Queue Push
 |
 v
HUD Update Tick
 |
 v
Event Queue Pop
 |
 v
HUD Manager Update
 |
 v
LVGL Refresh

Purpose:
Separate event receiving and rendering timing.