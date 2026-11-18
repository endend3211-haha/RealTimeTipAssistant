Navigation HUD V26

HUD Rendering Layer Architecture.

Flow:

Navigation Data

 |
 v

HUD Layer Manager

 |
 +-- Direction Arrow Layer
 |
 +-- Distance Layer
 |
 +-- Instruction Text Layer

 |
 v

LVGL Render

Purpose:
Separate each HUD visual component.