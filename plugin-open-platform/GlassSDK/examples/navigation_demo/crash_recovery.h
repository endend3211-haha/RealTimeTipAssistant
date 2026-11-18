#ifndef CRASH_RECOVERY_H
#define CRASH_RECOVERY_H

void crash_recovery_reset(void);
void crash_recovery_mark_fault(void);
void crash_recovery_mark_recovered(void);
int crash_recovery_is_recovered(void);

#endif