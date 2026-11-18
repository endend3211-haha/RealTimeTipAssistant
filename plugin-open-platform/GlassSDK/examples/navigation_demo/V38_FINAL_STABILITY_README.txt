Navigation HUD V38 — Final Stability Test

This replaces the incorrectly named previous V38 Studio Preview package.

Purpose
-------
Validate runtime stability before Studio preview/release candidate work.

Included checks
---------------
1. Long runtime tick tracking
2. Event receive/process counters
3. Plugin start/stop restart tracking
4. Crash/recovery state tracking
5. Combined health status

Recommended integration points
------------------------------
Plugin start:
    stability_test_init();
    restart_test_mark_start();
    crash_recovery_reset();

When navigation event arrives:
    event_loss_monitor_on_received();

After the event is successfully applied to the HUD:
    event_loss_monitor_on_processed();

Plugin runtime loop:
    stability_test_tick();

Plugin stop:
    restart_test_mark_stop();

If a recoverable runtime fault is detected:
    crash_recovery_mark_fault();

After recovery succeeds:
    crash_recovery_mark_recovered();

Pass criteria
-------------
- No build errors
- processed event count never exceeds received event count
- restart state is clean after stop
- long runtime test remains healthy
- crash recovery returns to recovered state when exercised

Next stages
-----------
V39: Studio Preview / UI asset connection
V40: Final Release Candidate / device validation