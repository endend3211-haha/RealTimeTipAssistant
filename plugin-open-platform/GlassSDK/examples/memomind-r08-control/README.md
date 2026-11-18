# MemoMind R08 Control

Companion glasses plugin for `PhoneSDK/examples/memomind-r08-controller`.
Desktop Studio can run the two matching examples together. The phone plugin
sends JSON on channel `0x4D52`; this plugin maps `next`, `previous`, `select`,
and `back` to visible HUD state and replies on `0x4D53`.

This is a Studio/demo command path. The real R08 BLE reader remains a native
Android component and should inject the same JSON commands into the phone
controller.
