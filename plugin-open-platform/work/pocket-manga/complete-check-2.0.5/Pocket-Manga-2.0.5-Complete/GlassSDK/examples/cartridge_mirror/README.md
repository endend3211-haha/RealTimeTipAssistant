# Pocket Framebuffer Mirror

Bitmap-only display/input receiver for `PhoneSDK/examples/cartridge-library`.
The wrapper reuses `../web_bridge/plugin.c`, preserving SDK packet validation,
LZ4 decoding, atomic frame acknowledgements, and input classification. It ignores
layout/text/line commands and contains no decks, projection, artwork, fonts,
selection state, or animation logic. All rendering runs on the phone. Its loop
only handles input classification and frame timeout bookkeeping.

Build from repository root:

```powershell
python GlassSDK/build.py build --example cartridge_mirror
```

Import the workspace into Studio and select **Pocket Framebuffer Mirror** with
**Pocket — Cartridge Library**, or import the `.gmp` and `.mmpkg` packages.
See the phone README for synchronization, performance budgets, and tests.
