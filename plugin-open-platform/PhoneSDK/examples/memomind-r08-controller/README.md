# MemoMind R08 controller bridge

This example defines the phone-side command bridge for an R08 ring. The R08
BLE/GATT reader (native Android/Wear code) should translate ring events into the
four commands in `r08-command.js`; this Web Plugin forwards those commands to a
paired glasses plugin through the public PhoneSDK application-messaging API.

The public PhoneSDK does not expose arbitrary BLE scanning. Keep the R08 BLE
reader in the companion app (`MemoMindPhoneReceiver`) and use this plugin only
for the MemoMind application link.

## Command flow

`next`, `previous`, `select`, and `back` are sent on channel `0x4D52`.
Commands are JSON UTF-8 payloads with a monotonically increasing request id.

| R08 input | command |
|---|---|
| forward/next swipe | `next` |
| backward/previous swipe | `previous` |
| single tap | `select` |
| double tap | `back` |

The companion app can call `window.dispatchEvent(new CustomEvent('r08-command',
{detail: {command: 'next'}}))` while this plugin is open, or reuse the codec
from a native host implementation.
