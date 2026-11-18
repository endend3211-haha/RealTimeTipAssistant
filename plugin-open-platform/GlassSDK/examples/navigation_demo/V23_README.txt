Navigation HUD V23

Added SDK abstraction layer.

Flow:

SDK Event
 |
 v
SDK Event Adapter
 |
 v
Navigation Event Model
 |
 v
Event Queue
 |
 v
HUD Update


Purpose:
- isolate SDK changes
- prepare async event handling
