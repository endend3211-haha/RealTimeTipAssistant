#ifndef SNES_FRAME_H
#define SNES_FRAME_H

#define SNES_WIDTH 256
#define SNES_HEIGHT 224

typedef struct
{
    unsigned char pixels[SNES_WIDTH*SNES_HEIGHT];
    unsigned int frame_id;

} SNESFrame;

#endif