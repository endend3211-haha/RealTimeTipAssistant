
#ifndef HUD_MANAGER_H
#define HUD_MANAGER_H

typedef struct
{
    int distance;
    int direction;
    const char *instruction;

} navigation_hud_data_t;


void hud_manager_init(void);

void hud_manager_update(
    navigation_hud_data_t *data
);

#endif

void hud_manager_update_navigation(int direction, int distance, const char *instruction);
