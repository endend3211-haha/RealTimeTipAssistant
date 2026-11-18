Navigation HUD V19

Added navigation demo test runner.

Purpose:
Validate full HUD pipeline without Kakao API.

Flow:

Demo JSON
 -> Parser
 -> Direction Mapper
 -> Distance Converter
 -> Callback
 -> HUD Manager
 -> Glass Display

