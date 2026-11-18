/* Kakao turn-by-turn HUD for MemoMind glasses.
 *
 * The phone plugin sends one compact message on NAV_CHANNEL whenever the
 * maneuver, rounded distance, speed, clock or route preview changes; this
 * plugin only draws it.
 *
 * Layout:
 *   12:11                                  [ mini route map ]
 *   In 20m (large)                         [  ^ up = heading ]
 *      <bent arrow>
 *                                              15 km/h
 *    instruction (2 lines)                   -------------
 *                                            3km     12min
 *
 * Phone -> glasses payload (integers big-endian), version 2:
 *   u8  version   = 2
 *   u8  kind      0 arrow | 1 u-turn | 2 arrive | 3 message only
 *   i16 angle     arrow heading in degrees (0 = up, +90 = right), kind 0 only
 *   then length-prefixed UTF-8 fields (u8 len, bytes), in this order:
 *       dist  (<=16)   e.g. "20m"
 *       text  (<=200)  instruction / message
 *       speed (<=8)    e.g. "15"      (empty = unknown)
 *       remain(<=8)    e.g. "3km"     (empty = unknown)
 *       eta   (<=8)    e.g. "12min"   (empty = unknown)
 *       clock (<=8)    e.g. "12:11"   (empty = hide)
 *   u8  npts (0..8), then npts x { i8 right, i8 forward } route preview,
 *       heading-up, 1 unit = 2 m, first point = current position.
 * Version 1 frames (no speed/remain/eta/clock/preview) are still accepted.
 * Glasses -> phone: { 1, 1 } when the user long-presses to exit.
 */
#include "gm_plugin_lvgl_api.h"
#include "gm_plugin_libc.h"

#define NAV_CHANNEL 0x4E56U
#define NAV_VERSION 2U
#define NAV_VERSION_V1 1U
#define MAX_DIST 16U
#define MAX_TEXT 200U
#define MAX_FIELD 8U
#define MAX_PTS 8U

enum { KIND_ARROW = 0, KIND_UTURN = 1, KIND_ARRIVE = 2, KIND_MESSAGE = 3 };

#define number gm_plugin_lvgl_style_number
#define color gm_plugin_lvgl_style_color

typedef struct {
    uint8_t kind;
    int32_t angle;
    char dist[MAX_DIST + 1U], text[MAX_TEXT + 1U];
    char spd[MAX_FIELD + 1U], rem[MAX_FIELD + 1U], eta[MAX_FIELD + 1U], clk[MAX_FIELD + 1U];
    uint32_t dl, tl, sl, rl, el, cl, np;
    int8_t pts[MAX_PTS][2];
} nav_frame_t;

static const gm_plugin_host_api_t *s_host;
static const gm_plugin_lvgl_api_t *s_ui;
static const gm_plugin_libc_extension_api_t *s_libc;

static gm_plugin_lvgl_obj_t *s_screen, *s_shaft, *s_head, *s_arrow_side, *s_arrow_hi, *s_uturn, *s_uhead, *s_ring, *s_dot,
    *s_mapbg, *s_route, *s_me, *s_sep,
    *s_dist, *s_text, *s_msg, *s_clk, *s_spd, *s_unit, *s_rem, *s_eta;
/* LVGL retains these pointers, so they must stay valid: static storage. */
static gm_plugin_lvgl_point_t s_shaft_pts[3], s_head_pts[3], s_side_pts[3], s_hi_pts[3], s_uturn_pts[9], s_uhead_pts[3],
    s_ring_pts[9], s_dot_pts[2], s_route_pts[MAX_PTS], s_me_pts[2], s_sep_pts[2];
static int32_t s_cx, s_cy, s_h;              /* arrow center, display height */
static int32_t s_mx, s_my, s_mk;             /* minimap: user position and px per 127 units */
static nav_frame_t s_f;
static gm_plugin_lvgl_obj_t *s_road_edge, *s_road_fill;
static gm_plugin_lvgl_point_t s_tile_lines[8][2];
static int32_t s_last_nav = -1;
static char s_dist_shown[MAX_DIST + 1U], s_text_shown[MAX_TEXT + 1U],
    s_spd_shown[MAX_FIELD + 1U], s_rem_shown[MAX_FIELD + 1U],
    s_eta_shown[MAX_FIELD + 1U], s_clk_shown[MAX_FIELD + 1U];

/* sin(0..90 deg, 15 deg steps) * 1000 */
static const int16_t SIN15[7] = {0, 259, 500, 707, 866, 966, 1000};

static int32_t isin(int32_t deg)
{
    int32_t d = deg % 360, sign = 1, step;
    if (d < 0) d += 360;
    if (d >= 180) { d -= 180; sign = -1; }
    if (d > 90) d = 180 - d;
    step = (d + 7) / 15;                 /* nearest 15 degrees */
    if (step > 6) step = 6;
    return sign * SIN15[step];
}
static int32_t icos(int32_t deg) { return isin(deg + 90); }

/* Scale a base-unit value (designed for a 350 px tall panel) to this display. */
static int32_t sc(int32_t v) { return v * s_h / 350; }

static gm_plugin_lvgl_point_t rot(int32_t x, int32_t y, int32_t deg)
{
    gm_plugin_lvgl_point_t p;
    int32_t c = icos(deg), s = isin(deg);
    p.x = s_cx + sc((x * c - y * s) / 1000);
    p.y = s_cy + sc((x * s + y * c) / 1000);
    return p;
}
static gm_plugin_lvgl_point_t at(int32_t x, int32_t y)
{
    gm_plugin_lvgl_point_t p;
    p.x = s_cx + sc(x); p.y = s_cy + sc(y);
    return p;
}

static void style(gm_plugin_lvgl_obj_t *o, gm_plugin_lvgl_style_prop_t p, int32_t v)
{
    s_ui->style_set(o, p, number(v), GM_PLUGIN_LVGL_SELECTOR_MAIN);
}
static void style_color(gm_plugin_lvgl_obj_t *o, gm_plugin_lvgl_style_prop_t p, uint8_t v)
{
    s_ui->style_set(o, p, color(v), GM_PLUGIN_LVGL_SELECTOR_MAIN);
}
static void style_font(gm_plugin_lvgl_obj_t *o, const gm_plugin_lvgl_font_t *font)
{
    gm_plugin_lvgl_style_value_t v = {0};
    v.ptr = font;
    s_ui->style_set(o, GM_PLUGIN_LVGL_STYLE_TEXT_FONT, v, GM_PLUGIN_LVGL_SELECTOR_MAIN);
}

static gm_plugin_lvgl_obj_t *make_line(int32_t width, uint8_t shade)
{
    gm_plugin_lvgl_obj_t *l = s_ui->line_create(s_screen);
    if (l == 0) return 0;
    style_color(l, GM_PLUGIN_LVGL_STYLE_LINE_COLOR, shade);
    style(l, GM_PLUGIN_LVGL_STYLE_LINE_ROUNDED, 1);
    style(l, GM_PLUGIN_LVGL_STYLE_LINE_WIDTH, sc(width) < 2 ? 2 : sc(width));
    s_ui->obj_add_flag(l, GM_PLUGIN_LVGL_FLAG_HIDDEN);
    return l;
}
static gm_plugin_lvgl_obj_t *make_label(const gm_plugin_lvgl_font_t *font, uint8_t shade,
                                        int32_t w, int32_t h, uint8_t align)
{
    gm_plugin_lvgl_obj_t *l = s_ui->label_create(s_screen);
    if (l == 0) return 0;
    s_ui->obj_set_size(l, w, h);
    s_ui->label_set_long_mode(l, GM_PLUGIN_LVGL_LABEL_WRAP);
    style_color(l, GM_PLUGIN_LVGL_STYLE_TEXT_COLOR, shade);
    style(l, GM_PLUGIN_LVGL_STYLE_TEXT_ALIGN, align);
    if (font != 0) style_font(l, font);
    s_ui->obj_add_flag(l, GM_PLUGIN_LVGL_FLAG_HIDDEN);
    return l;
}
static void show(gm_plugin_lvgl_obj_t *o, bool on)
{
    if (o == 0) return;
    if (on) s_ui->obj_clear_flag(o, GM_PLUGIN_LVGL_FLAG_HIDDEN);
    else s_ui->obj_add_flag(o, GM_PLUGIN_LVGL_FLAG_HIDDEN);
}
static void set_text(gm_plugin_lvgl_obj_t *label, char *shown, const char *value, uint32_t len)
{
    if (label == 0) return;
    if (s_libc->strlen(shown) == len && s_libc->memcmp(shown, value, len) == 0) return;   /* avoid needless redraw */
    s_libc->memcpy(shown, value, len);
    shown[len] = '\0';
    s_ui->label_set_text(label, shown);
}

/* The route comes up from below the junction and bends toward `angle`;
 * the arrow head sits at the end of the bent segment. */
static void draw_arrow(int32_t angle)
{
    /* Layered prism: dark extrusion behind the body, bright face, and a narrow highlight. */
    s_side_pts[0] = rot(-12, 58, angle); s_side_pts[1] = rot(-12, -18, angle); s_side_pts[2] = rot(-42, -18, angle);
    s_shaft_pts[0] = rot(12, 58, angle); s_shaft_pts[1] = rot(12, -18, angle); s_shaft_pts[2] = rot(42, -18, angle);
    s_head_pts[0] = rot(-42, -18, angle); s_head_pts[1] = rot(0, -66, angle); s_head_pts[2] = rot(42, -18, angle);
    s_hi_pts[0] = rot(-5, 45, angle); s_hi_pts[1] = rot(-5, -15, angle); s_hi_pts[2] = rot(0, -15, angle);
    s_ui->line_set_points(s_arrow_side, s_side_pts, 3);
    s_ui->line_set_points(s_shaft, s_shaft_pts, 3);
    s_ui->line_set_points(s_head, s_head_pts, 3);
    s_ui->line_set_points(s_arrow_hi, s_hi_pts, 3);
}

/* Heading-up route preview inside the minimap box. */
static void draw_map(const nav_frame_t *f)
{
    uint32_t i;
    for (i = 0; i < f->np; ++i) {
        s_route_pts[i].x = s_mx + (int32_t)f->pts[i][0] * s_mk / 127;
        s_route_pts[i].y = s_my - (int32_t)f->pts[i][1] * s_mk / 127;
    }
    s_ui->line_set_points(s_road_edge, s_route_pts, f->np);
    s_ui->line_set_points(s_road_fill, s_route_pts, f->np);
    s_ui->line_set_points(s_route, s_route_pts, f->np);
}

static void render(const nav_frame_t *f)
{
    bool nav = f->kind != KIND_MESSAGE;
    /* Keep the map panel visible for every navigation frame, even when the
     * phone has only one preview point at a tight turn. */
    bool map = nav;
    bool route_map = nav && f->np >= 2U;
    bool block = nav && (f->sl || f->rl || f->el);

    if ((int32_t)nav != s_last_nav) {          /* the text buffer is shared by two labels */
        s_text_shown[0] = '\x01'; s_text_shown[1] = '\0';
        s_last_nav = nav;
    }
    show(s_shaft, f->kind == KIND_ARROW);  show(s_head, f->kind == KIND_ARROW);
    show(s_arrow_side, f->kind == KIND_ARROW); show(s_arrow_hi, f->kind == KIND_ARROW);
    show(s_uturn, f->kind == KIND_UTURN);  show(s_uhead, f->kind == KIND_UTURN);
    show(s_ring, f->kind == KIND_ARRIVE);  show(s_dot, f->kind == KIND_ARRIVE);
    show(s_dist, nav);  show(s_text, nav);  show(s_msg, !nav);
    show(s_mapbg, map); show(s_route, route_map); show(s_me, map);
    show(s_road_edge, route_map); show(s_road_fill, route_map);
    show(s_spd, block && f->sl); show(s_unit, block && f->sl);
    show(s_sep, block); show(s_rem, block); show(s_eta, block);
    show(s_clk, f->cl > 0U);

    if (f->kind == KIND_ARROW) draw_arrow(f->angle);
    if (route_map) draw_map(f);
    if (nav) {
        set_text(s_dist, s_dist_shown, f->dist, f->dl);
        set_text(s_text, s_text_shown, f->text, f->tl);
        set_text(s_spd, s_spd_shown, f->spd, f->sl);
        set_text(s_rem, s_rem_shown, f->rem, f->rl);
        set_text(s_eta, s_eta_shown, f->eta, f->el);
    } else {
        set_text(s_msg, s_text_shown, f->text, f->tl);
    }
    set_text(s_clk, s_clk_shown, f->clk, f->cl);
}

static void render_message(const char *text, uint32_t len)
{
    s_f.kind = KIND_MESSAGE; s_f.angle = 0;
    s_libc->memcpy(s_f.text, text, len); s_f.text[len] = '\0'; s_f.tl = len;
    s_f.dl = s_f.sl = s_f.rl = s_f.el = s_f.cl = s_f.np = 0U;
    render(&s_f);
}

/* Reads one (u8 len, bytes) field into out. */
static bool take(const uint8_t *d, uint32_t n, uint32_t *pos, char *out, uint32_t max, uint32_t *len)
{
    uint32_t l;
    if (*pos >= n) return false;
    l = d[*pos];
    if (l > max || *pos + 1U + l > n) return false;
    s_libc->memcpy(out, d + *pos + 1U, l);
    out[l] = '\0';
    *len = l; *pos += 1U + l;
    return true;
}

static bool handle_message(const uint8_t *d, uint32_t n)
{
    uint32_t pos = 4U, i;
    if (d == 0 || n < 6U || (d[0] != NAV_VERSION && d[0] != NAV_VERSION_V1) || d[1] > KIND_MESSAGE) return false;
    s_f.kind = d[1];
    s_f.angle = (int16_t)(((uint32_t)d[2] << 8) | d[3]);
    s_f.sl = s_f.rl = s_f.el = s_f.cl = s_f.np = 0U;
    s_f.spd[0] = s_f.rem[0] = s_f.eta[0] = s_f.clk[0] = '\0';
    if (!take(d, n, &pos, s_f.dist, MAX_DIST, &s_f.dl) ||
        !take(d, n, &pos, s_f.text, MAX_TEXT, &s_f.tl)) return false;
    if (d[0] == NAV_VERSION) {
        if (!take(d, n, &pos, s_f.spd, MAX_FIELD, &s_f.sl) ||
            !take(d, n, &pos, s_f.rem, MAX_FIELD, &s_f.rl) ||
            !take(d, n, &pos, s_f.eta, MAX_FIELD, &s_f.el) ||
            !take(d, n, &pos, s_f.clk, MAX_FIELD, &s_f.cl)) return false;
        if (pos >= n) return false;
        s_f.np = d[pos++];
        if (s_f.np > MAX_PTS || pos + 2U * s_f.np != n) return false;
        for (i = 0; i < s_f.np; ++i) {
            s_f.pts[i][0] = (int8_t)d[pos + 2U * i];
            s_f.pts[i][1] = (int8_t)d[pos + 2U * i + 1U];
        }
    } else if (pos != n) {
        return false;                               /* reject malformed frames */
    }
    render(&s_f);
    return true;
}

static gm_plugin_result_t nav_start(void *context)
{
    gm_plugin_display_info_t display;
    gm_plugin_lvgl_obj_t *root = s_ui->root_get();
    int32_t w, i, bw, bh, bx, by, rx, rw;
    (void)context;
    if (root == 0 || s_host->display_get_info(&display) != GM_PLUGIN_OK ||
        display.width < 200U || display.height < 120U) return GM_PLUGIN_ENOTSUP;
    w = display.width; s_h = display.height;
    s_cx = w * 50 / 100;  s_cy = s_h * 56 / 100;                 /* large centered arrow */
    bw = w * 32 / 100;  bh = sc(150);  bx = w - bw - sc(12);  by = sc(34);   /* translucent map: right */
    s_mx = bx + bw / 2;  s_my = by + bh * 88 / 100;
    s_mk = bh * 80 / 100;  if (s_mk > bw / 2 - 6) s_mk = bw / 2 - 6;
    rx = w * 66 / 100;  rw = w - rx - sc(12);                    /* speed block: bottom right */

    s_ui->obj_clean(root);
    s_screen = s_ui->obj_create(root);
    if (s_screen == 0) return GM_PLUGIN_ENOMEM;
    s_ui->obj_set_size(s_screen, w, s_h);
    s_ui->obj_align(s_screen, GM_PLUGIN_LVGL_ALIGN_CENTER, 0, 0);
    style_color(s_screen, GM_PLUGIN_LVGL_STYLE_BG_COLOR, 0x00);
    style(s_screen, GM_PLUGIN_LVGL_STYLE_BG_OPA, 255);
    style(s_screen, GM_PLUGIN_LVGL_STYLE_BORDER_WIDTH, 0);
    style(s_screen, GM_PLUGIN_LVGL_STYLE_RADIUS, 0);
    style(s_screen, GM_PLUGIN_LVGL_STYLE_PAD_TOP, 0);    style(s_screen, GM_PLUGIN_LVGL_STYLE_PAD_BOTTOM, 0);
    style(s_screen, GM_PLUGIN_LVGL_STYLE_PAD_LEFT, 0);   style(s_screen, GM_PLUGIN_LVGL_STYLE_PAD_RIGHT, 0);
    s_ui->obj_clear_flag(s_screen, GM_PLUGIN_LVGL_FLAG_SCROLLABLE);

    /* Minimap background first so the route and user dot draw on top of it. */
    s_mapbg = s_ui->obj_create(s_screen);
    if (s_mapbg != 0) {
        s_ui->obj_set_size(s_mapbg, bw, bh);
        s_ui->obj_set_pos(s_mapbg, bx, by);
        style_color(s_mapbg, GM_PLUGIN_LVGL_STYLE_BG_COLOR, 0x1C);
        style(s_mapbg, GM_PLUGIN_LVGL_STYLE_BG_OPA, 255);
        style(s_mapbg, GM_PLUGIN_LVGL_STYLE_BORDER_WIDTH, 0);
        style(s_mapbg, GM_PLUGIN_LVGL_STYLE_RADIUS, sc(6));
        style(s_mapbg, GM_PLUGIN_LVGL_STYLE_PAD_TOP, 0);    style(s_mapbg, GM_PLUGIN_LVGL_STYLE_PAD_BOTTOM, 0);
        style(s_mapbg, GM_PLUGIN_LVGL_STYLE_PAD_LEFT, 0);   style(s_mapbg, GM_PLUGIN_LVGL_STYLE_PAD_RIGHT, 0);
        s_ui->obj_clear_flag(s_mapbg, GM_PLUGIN_LVGL_FLAG_SCROLLABLE);
        s_ui->obj_add_flag(s_mapbg, GM_PLUGIN_LVGL_FLAG_HIDDEN);
    }
    /* Synthetic street tiles: blocks separated by crossing neighborhood roads.
     * These local coordinates are clipped by the map panel and do not need
     * internet tiles or a new phone/glasses message format. */
    if (s_mapbg != 0) {
        for (i = 0; i < 8; ++i) {
            gm_plugin_lvgl_obj_t *street = s_ui->line_create(s_mapbg);
            if (street == 0) continue;
            if (i < 4) {
                s_tile_lines[i][0].x = bw * (i + 1) / 5;
                s_tile_lines[i][0].y = 0;
                s_tile_lines[i][1].x = s_tile_lines[i][0].x;
                s_tile_lines[i][1].y = bh;
            } else {
                s_tile_lines[i][0].x = 0;
                s_tile_lines[i][0].y = bh * (i - 3) / 5;
                s_tile_lines[i][1].x = bw;
                s_tile_lines[i][1].y = s_tile_lines[i][0].y;
            }
            style_color(street, GM_PLUGIN_LVGL_STYLE_LINE_COLOR, 0x48);
            style(street, GM_PLUGIN_LVGL_STYLE_LINE_WIDTH, sc(7) < 3 ? 3 : sc(7));
            s_ui->line_set_points(street, s_tile_lines[i], 2);
        }
    }
    s_road_edge = make_line(17, 0xA0);
    s_road_fill = make_line(12, 0x38);
    s_route = make_line(4, 0xFF);   s_me = make_line(14, 0xFF);
    s_sep = make_line(2, 0x70);
    s_arrow_side = make_line(24, 0x55); s_shaft = make_line(24, 0xFF); s_head = make_line(24, 0xFF); s_arrow_hi = make_line(7, 0xD8);
    s_uturn = make_line(20, 0xFF);  s_uhead = make_line(20, 0xFF);
    s_ring = make_line(14, 0xFF);   s_dot = make_line(30, 0xFF);

    /* Fixed shapes (u-turn, arrive ring/dot, user dot, separator) are computed once. */
    {   static const int8_t U[9][2] = {{32,60},{32,-10},{28,-26},{16,-38},{0,-42},{-16,-38},{-28,-26},{-32,-10},{-32,28}};
        static const int8_t H[3][2] = {{-54,14},{-32,56},{-10,14}};
        static const int8_t R[9][2] = {{46,0},{33,33},{0,46},{-33,33},{-46,0},{-33,-33},{0,-46},{33,-33},{46,0}};
        for (i = 0; i < 9; ++i) { s_uturn_pts[i] = at(U[i][0], U[i][1]); s_ring_pts[i] = at(R[i][0], R[i][1]); }
        for (i = 0; i < 3; ++i) s_uhead_pts[i] = at(H[i][0], H[i][1]);
        s_dot_pts[0] = at(0, 0); s_dot_pts[1] = at(0, 1);
        s_me_pts[0].x = s_mx; s_me_pts[0].y = s_my; s_me_pts[1].x = s_mx; s_me_pts[1].y = s_my + 1;
        s_sep_pts[0].x = rx; s_sep_pts[0].y = sc(268); s_sep_pts[1].x = rx + rw; s_sep_pts[1].y = sc(268);
    }
    if (s_uturn) s_ui->line_set_points(s_uturn, s_uturn_pts, 9);
    if (s_uhead) s_ui->line_set_points(s_uhead, s_uhead_pts, 3);
    if (s_ring)  s_ui->line_set_points(s_ring, s_ring_pts, 9);
    if (s_dot)   s_ui->line_set_points(s_dot, s_dot_pts, 2);
    if (s_me)    s_ui->line_set_points(s_me, s_me_pts, 2);
    if (s_sep)   s_ui->line_set_points(s_sep, s_sep_pts, 2);

    s_clk  = make_label(s_ui->font_default, 0xC0, w / 4, sc(30), GM_PLUGIN_LVGL_TEXT_ALIGN_LEFT);
    s_dist = make_label(s_ui->font_large, 0xFF, w * 55 / 100 - sc(10), sc(60), GM_PLUGIN_LVGL_TEXT_ALIGN_LEFT);
    s_text = make_label(s_ui->font_default, 0xC0, w * 46 / 100, sc(80), GM_PLUGIN_LVGL_TEXT_ALIGN_CENTER);
    s_spd  = make_label(s_ui->font_large, 0xFF, rw * 55 / 100, sc(60), GM_PLUGIN_LVGL_TEXT_ALIGN_CENTER);
    s_unit = make_label(s_ui->font_default, 0xC0, rw * 40 / 100, sc(30), GM_PLUGIN_LVGL_TEXT_ALIGN_LEFT);
    s_rem  = make_label(s_ui->font_default, 0xC0, rw / 2, sc(34), GM_PLUGIN_LVGL_TEXT_ALIGN_CENTER);
    s_eta  = make_label(s_ui->font_default, 0xC0, rw / 2, sc(34), GM_PLUGIN_LVGL_TEXT_ALIGN_CENTER);
    s_msg  = make_label(s_ui->font_large, 0xFF, w - 60, sc(200), GM_PLUGIN_LVGL_TEXT_ALIGN_CENTER);
    if (s_clk == 0 || s_dist == 0 || s_text == 0 || s_spd == 0 || s_unit == 0 ||
        s_rem == 0 || s_eta == 0 || s_msg == 0) {
        s_ui->obj_clean(root); s_screen = 0; return GM_PLUGIN_ENOMEM;
    }
    s_ui->obj_set_pos(s_clk, sc(12), sc(8));
    s_ui->obj_set_pos(s_dist, s_cx - w * 22 / 100, sc(42));
    s_ui->obj_set_pos(s_text, s_cx - w * 22 / 100, sc(18));
    s_ui->obj_set_pos(s_spd, rx, sc(202));
    s_ui->obj_set_pos(s_unit, rx + rw * 58 / 100, sc(228));
    s_ui->obj_set_pos(s_rem, rx, sc(286));
    s_ui->obj_set_pos(s_eta, rx + rw / 2, sc(286));
    s_ui->obj_set_pos(s_msg, 30, s_h / 2 - sc(50));
    s_ui->label_set_text(s_unit, "km/h");

    s_dist_shown[0] = s_text_shown[0] = s_spd_shown[0] = s_rem_shown[0] = s_eta_shown[0] = s_clk_shown[0] = '\0';
    s_last_nav = -1;
    render_message("연결 대기 중...", (uint32_t)(sizeof("연결 대기 중...") - 1U));
    return GM_PLUGIN_OK;
}

static bool nav_event(void *context, const gm_plugin_event_t *event)
{
    (void)context;
    if (event == 0) return false;
    if (event->type == GM_PLUGIN_EVENT_BT_MESSAGE && event->data.bt.channel == NAV_CHANNEL)
        return handle_message(event->data.bt.data, event->data.bt.length);
    if (event->type == GM_PLUGIN_EVENT_BUTTON && event->data.button.action == GM_PLUGIN_BUTTON_ACTION_LONG) {
        static const uint8_t exit_msg[2] = {1U, 1U};   /* tell the phone we are leaving (phone checks {1,1}) */
        s_host->bt_send(NAV_CHANNEL, exit_msg, sizeof(exit_msg));
        if (s_host->app_exit != 0) s_host->app_exit();
        return true;
    }
    if (event->type == GM_PLUGIN_EVENT_CONNECTION && !event->data.connection.connected)
        render_message("폰 연결 끊김", 18U);
    return false;
}

static void nav_stop(void *context)
{
    gm_plugin_lvgl_obj_t *root = s_ui->root_get();
    (void)context;
    s_screen = s_shaft = s_head = s_arrow_side = s_arrow_hi = s_uturn = s_uhead = s_ring = s_dot = 0;
    s_mapbg = s_route = s_me = s_sep = 0;
    s_road_edge = s_road_fill = 0;
    s_dist = s_text = s_msg = s_clk = s_spd = s_unit = s_rem = s_eta = 0;
    if (root != 0) s_ui->obj_clean(root);
}

gm_plugin_result_t gm_plugin_entry(const gm_plugin_host_api_t *host, gm_plugin_descriptor_t *plugin)
{
    const gm_plugin_capabilities_t required = GM_PLUGIN_CAP_BLUETOOTH | GM_PLUGIN_CAP_BUTTON;
    if (host == 0 || plugin == 0 || host->bt_send == 0 || host->log == 0 || host->display_get_info == 0 ||
        host->graphics.lvgl == 0 ||
        !GM_PLUGIN_VERSION_COMPATIBLE(host->abi_version, GM_PLUGIN_ABI_MIN_VERSION) ||
        host->struct_size < GM_PLUGIN_HOST_API_MIN_SIZE ||
        plugin->struct_size < GM_PLUGIN_DESCRIPTOR_MIN_SIZE ||
        (host->capabilities & required) != required) return GM_PLUGIN_ENOTSUP;
    s_host = host;
    s_ui = host->graphics.lvgl;
    if (gm_plugin_libc_get(host, &s_libc) != GM_PLUGIN_OK) return GM_PLUGIN_ENOTSUP;
    if (s_ui->struct_size < GM_PLUGIN_LVGL_API_MIN_SIZE ||
        !GM_PLUGIN_VERSION_COMPATIBLE(s_ui->api_version, GM_PLUGIN_LVGL_API_MIN_VERSION)) return GM_PLUGIN_EVERSION;
    plugin->abi_version = GM_PLUGIN_ABI_MIN_VERSION;
    plugin->on_start = nav_start;
    plugin->on_event = nav_event;
    plugin->on_stop = nav_stop;
    return GM_PLUGIN_OK;
}

