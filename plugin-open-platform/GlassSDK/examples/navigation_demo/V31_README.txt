Navigation HUD V31

SDK integration validation layer.

Purpose:
Prepare replacement of mock events with real Glass SDK APIs.

Flow:

Glass SDK API
 |
 v
SDK Bridge
 |
 v
Event Mapper
 |
 v
Navigation View Model
 |
 v
HUD Runtime

Note:
Actual callback signatures and event fields
must follow the installed Glass SDK headers.