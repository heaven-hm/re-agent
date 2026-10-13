/* pixelmac v1: independent macOS SDL2 port of Pixeltetris v1.0.0
 * (mvlassis/pixeltetris, MIT). No original source consulted.
 * Recovered via REA: window "Pixeltetris" 640x360 logical, SDL+IMG+TTF init
 * order, exact input map (arrows/X/C/P/space/enter/esc), 10-wide board,
 * "Game Over!" + Resolution strings, shipped PNG/TTF assets.
 * UNVERIFIED: piece colors/RNG, gravity curve, scoring table, sound.
 */
#include <SDL2/SDL.h>
#include <SDL2/SDL_image.h>
#include <SDL2/SDL_ttf.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#define LW 640
#define LH 360
#define BW 10
#define BH 20
#define CELL 16
#define FX 232
#define FY 20

static SDL_Window *win;
static SDL_Renderer *ren;
static TTF_Font *font, *font_sm;
static int board[BH][BW];
static int score, level, lines, over, paused, in_menu, in_opts, scale_idx;
static const int scales[] = {1, 2, 3};

/* guideline pieces; colors unverified */
static const int SHAPES[7][4][4][4] = {
    /* filled at runtime from SRS-ish base rotations below */
    {{{0}}},
};
static const int BASE[7][4][2] = {{0}};
static int bag[7], bag_n, px, py, prot, ptype, hold, hold_used, ghost_y;
static int next_q[3];

static const int PCOL[7][3] = {
    {0,255,255},{0,0,255},{255,165,0},{255,255,0},{0,255,0},{128,0,128},{255,0,0},
};
/* SRS spawn orientations as 4x4 bitmaps, 4 rotations; J L S Z T I O */
static const char *P[7][4] = {
    /* I */ { "...." "XXXX" "...." "....", "..X." "..X." "..X." "..X.",
              "...." "...." "XXXX" "....", ".X.." ".X.." ".X.." ".X.." },
    /* J */ { "X..." "XXX." "...." "....", ".XX." ".X.." ".X.." "....",
              "...." ".XXX" "...X" "....", ".X.." ".X.." ".XX." "...." },
    /* L */ { "...X" ".XXX" "...." "....", ".X.." ".X.." ".XX." "....",
              "...." "XXX." "X..." "....", ".XX." ".X.." ".X.." "...." },
    /* O */ { ".XX." ".XX." "...." "....", ".XX." ".XX." "...." "....",
              ".XX." ".XX." "...." "....", ".XX." ".XX." "...." "...." },
    /* S */ { ".XX." "XX.." "...." "....", ".X.." ".XX." "..X." "....",
              "...." ".XX." "XX.." "....", ".X.." ".XX." "..X." "...." },
    /* T */ { ".X.." "XXX." "...." "....", ".X.." ".XX." ".X.." "....",
              "...." "XXX." ".X.." "....", ".X.." ".XX." ".X.." "...." },
    /* Z */ { "XX.." ".XX." "...." "....", "..X." ".XX." ".X.." "....",
              "...." "XX.." ".XX." "....", ".X.." ".XX." "..X." "...." },
};
static const int ORDER[7] = {5, 1, 2, 3, 6, 4, 0}; /* display order guess */

static int cell_at(int t, int r, int x, int y) {
    if (x < 0 || x > 3 || y < 0 || y > 3) return 0;
    return P[t][r][y * 4 + x] == 'X';
}
static int collide(int t, int r, int ox, int oy) {
    for (int y = 0; y < 4; y++)
        for (int x = 0; x < 4; x++) {
            if (!cell_at(t, r, x, y)) continue;
            int bx = ox + x - 1, by = oy + y;
            if (bx < 0 || bx >= BW || by >= BH) return 1;
            if (by >= 0 && board[by][bx]) return 1;
        }
    return 0;
}
static void refill(void) {
    for (int i = 0; i < 7; i++) bag[i] = i;
    for (int i = 6; i > 0; i--) { int j = rand() % (i + 1), t = bag[i]; bag[i] = bag[j]; bag[j] = t; }
    bag_n = 0;
}
static int draw_piece(void) {
    if (bag_n >= 7) refill();
    return bag[bag_n++];
}
static void spawn(void) {
    ptype = draw_piece(); prot = 0; px = 4; py = 0; hold_used = 0;
    if (collide(ptype, prot, px, py)) over = 1;
}
static void lock_piece(void) {
    for (int y = 0; y < 4; y++)
        for (int x = 0; x < 4; x++) {
            if (!cell_at(ptype, prot, x, y)) continue;
            int bx = px + x - 1, by = py + y;
            if (by >= 0 && by < BH && bx >= 0 && bx < BW) board[by][bx] = ptype + 1;
        }
    int cleared = 0;
    for (int y = BH - 1; y >= 0; y--) {
        int full = 1;
        for (int x = 0; x < BW; x++) if (!board[y][x]) { full = 0; break; }
        if (full) {
            cleared++;
            for (int yy = y; yy > 0; yy--) memcpy(board[yy], board[yy - 1], sizeof(board[yy]));
            memset(board[0], 0, sizeof(board[0]));
            y++;
        }
    }
    static const int PTS[5] = {0, 100, 300, 500, 800};
    if (cleared > 4) cleared = 4;
    score += PTS[cleared] * (level + 1);
    lines += cleared;
    level = lines / 10;
    spawn();
}
static int gravity_ms(void) {
    int ms = 800 - level * 70;
    return ms < 50 ? 50 : ms;
}
static void reset_game(void) {
    memset(board, 0, sizeof(board));
    score = 0; level = 0; lines = 0; over = 0; paused = 0;
    hold = -1; refill(); spawn();
}

static SDL_Texture *img(const char *name) {
    char p[256];
    snprintf(p, sizeof(p), "assets/%s", name);
    SDL_Surface *s = IMG_Load(p);
    if (!s) { fprintf(stderr, "img %s: %s\n", name, IMG_GetError()); return 0; }
    SDL_Texture *t = SDL_CreateTextureFromSurface(ren, s);
    SDL_FreeSurface(s);
    return t;
}
static void text(int x, int y, const char *s, TTF_Font *f) {
    SDL_Color c = {255, 255, 255, 255};
    SDL_Surface *su = TTF_RenderText_Solid(f, s, c);
    if (!su) return;
    SDL_Texture *t = SDL_CreateTextureFromSurface(ren, su);
    SDL_Rect r = {x, y, su->w, su->h};
    SDL_RenderCopy(ren, t, 0, &r);
    SDL_DestroyTexture(t);
    SDL_FreeSurface(su);
}
static void draw_block(int bx, int by, int color, int alpha) {
    if (by < 0) return;
    SDL_Rect r = {FX + bx * CELL, FY + by * CELL, CELL - 1, CELL - 1};
    SDL_SetRenderDrawBlendMode(ren, SDL_BLENDMODE_BLEND);
    SDL_SetRenderDrawColor(ren, PCOL[color][0], PCOL[color][1], PCOL[color][2], alpha);
    SDL_RenderFillRect(ren, &r);
}

/* recovered action ids: 0 none 1 quit/back 2 left 3 up 4 down 5 right
 * 6 confirm 7 space 8 X 9 C/ctrl 10 P */
static int poll_action(void) {
    SDL_Event e;
    if (!SDL_PollEvent(&e)) return 0;
    if (e.type == SDL_QUIT) return 1;
    if (e.type != SDL_KEYDOWN) return 0;
    SDL_Keycode k = e.key.keysym.sym;
    if (k == SDLK_RIGHT) return 5;
    if (k == SDLK_DOWN) return 4;
    if (k == SDLK_UP) return 3;
    if (k == SDLK_LEFT) return 2;
    if (k == SDLK_RETURN || k == SDLK_KP_ENTER) return 6;
    if (k == SDLK_ESCAPE || k == 'q') return 1;
    if (k == SDLK_SPACE) return 7;
    if (k == 'x') return 8;
    if (k == 'c' || k == SDLK_LCTRL || k == SDLK_RCTRL) return 9;
    if (k == 'p') return 10;
    return 0;
}

static int menu_idx;
static void run_menu(void) {
    SDL_Texture *bp = img("button-play.png"), *bo = img("button-options.png"),
                *bq = img("button-quit.png");
    menu_idx = 0;
    for (;;) {
        int a = poll_action();
        if (a == 3 || a == 8) menu_idx = (menu_idx + 2) % 3;
        if (a == 4) menu_idx = (menu_idx + 1) % 3;
        if (a == 1) { in_menu = 0; break; }
        if (a == 6) {
            if (menu_idx == 0) { reset_game(); in_menu = 0; break; }
            if (menu_idx == 1) { in_opts = 1; return; }
            in_menu = 0; break;
        }
        SDL_SetRenderDrawColor(ren, 20, 20, 30, 255);
        SDL_RenderClear(ren);
        text(270, 60, "Pixeltetris!", font);
        SDL_Rect r = {250, 130, 140, 40};
        if (bp) SDL_RenderCopy(ren, bp, 0, &r);
        else text(270, 140, "Play", font);
        r.y = 180;
        if (bo) SDL_RenderCopy(ren, bo, 0, &r);
        else text(260, 190, "Options", font);
        r.y = 230;
        if (bq) SDL_RenderCopy(ren, bq, 0, &r);
        else text(270, 240, "Quit", font);
        SDL_SetRenderDrawColor(ren, 255, 255, 0, 255);
        SDL_Rect h = {245, 130 + menu_idx * 50, 150, 44};
        SDL_RenderDrawRect(ren, &h);
        SDL_RenderPresent(ren);
        SDL_Delay(16);
    }
}

static void run_opts(void) {
    for (;;) {
        int a = poll_action();
        if (a == 5) scale_idx = (scale_idx + 1) % 3;
        if (a == 2) scale_idx = (scale_idx + 2) % 3;
        if (a == 1 || a == 6) {
            in_opts = 0;
            SDL_SetWindowSize(win, 640 * scales[scale_idx], 360 * scales[scale_idx]);
            return;
        }
        SDL_SetRenderDrawColor(ren, 20, 20, 30, 255);
        SDL_RenderClear(ren);
        char b[64];
        text(250, 100, "Resolution", font);
        snprintf(b, sizeof(b), "%dx%d", 640 * scales[scale_idx], 360 * scales[scale_idx]);
        text(260, 160, b, font);
        text(220, 240, "Enter/Esc: back", font_sm);
        SDL_RenderPresent(ren);
        SDL_Delay(16);
    }
}

int main(int argc, char **argv) {
    (void)argc; (void)argv;
    srand((unsigned)time(0));
    if (SDL_Init(SDL_INIT_VIDEO) < 0) { fprintf(stderr, "Could not initialize SDL! SDL_Error: %s\n", SDL_GetError()); return 1; }
    win = SDL_CreateWindow("Pixeltetris", SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED, LW, LH, SDL_WINDOW_SHOWN);
    if (!win) { fprintf(stderr, "Could not create window! SDL_Error: %s\n", SDL_GetError()); return 1; }
    if (!(IMG_Init(IMG_INIT_JPG | IMG_INIT_PNG))) { fprintf(stderr, "SDL_image init fail: %s\n", IMG_GetError()); return 1; }
    if (TTF_Init() == -1) { fprintf(stderr, "Could not initialize SDL_ttf! SDL_ttf error: %s\n", TTF_GetError()); return 1; }
    ren = SDL_CreateRenderer(win, -1, SDL_RENDERER_ACCELERATED | SDL_RENDERER_PRESENTVSYNC);
    SDL_RenderSetLogicalSize(ren, LW, LH);
    font = TTF_OpenFont("assets/munro.ttf", 28);
    font_sm = TTF_OpenFont("assets/munro-small.ttf", 16);
    if (!font || !font_sm) { fprintf(stderr, "font: %s\n", TTF_GetError()); return 1; }
    in_menu = 1; in_opts = 0;
    Uint32 last = SDL_GetTicks();
    int acc = 0;
    while (in_menu || in_opts) { if (in_opts) run_opts(); else run_menu(); if (!in_menu && !in_opts) break; }
    if (!in_menu && !in_opts && score == 0 && !over) {
        /* quit from menu: exit */
        if (menu_idx == 2) { TTF_Quit(); IMG_Quit(); SDL_Quit(); return 0; }
    }
    for (;;) {
        int a = poll_action();
        if (a == 1) break;
        if (a == 10) { paused = !paused; continue; }
        if (over) {
            if (a == 6) reset_game();
            /* draw game over */
            SDL_SetRenderDrawColor(ren, 20, 20, 30, 255);
            SDL_RenderClear(ren);
            text(250, 120, "Game Over!", font);
            char b[64];
            snprintf(b, sizeof(b), "Score: %d", score);
            text(260, 170, b, font);
            text(230, 230, "Enter: restart  Esc: quit", font_sm);
            SDL_RenderPresent(ren);
            SDL_Delay(16);
            continue;
        }
        if (paused) {
            SDL_SetRenderDrawColor(ren, 20, 20, 30, 255);
            SDL_RenderClear(ren);
            text(270, 160, "Paused", font);
            SDL_RenderPresent(ren);
            SDL_Delay(16);
            continue;
        }
        if (a == 2 && !collide(ptype, prot, px - 1, py)) px--;
        if (a == 5 && !collide(ptype, prot, px + 1, py)) px++;
        if (a == 4) { if (!collide(ptype, prot, px, py + 1)) py++; else lock_piece(); acc = 0; last = SDL_GetTicks(); }
        if ((a == 3 || a == 8) && !collide(ptype, (prot + 1) % 4, px, py)) prot = (prot + 1) % 4;
        if (a == 7) { while (!collide(ptype, prot, px, py + 1)) py++; lock_piece(); }
        if (a == 9 && !hold_used) {
            int t = hold; hold = ptype;
            if (t < 0) spawn(); else { ptype = t; prot = 0; px = 4; py = 0; }
            hold_used = 1;
        }
        Uint32 now = SDL_GetTicks();
        acc += (int)(now - last); last = now;
        int g = gravity_ms();
        while (acc >= g && !over) {
            acc -= g;
            if (!collide(ptype, prot, px, py + 1)) py++;
            else lock_piece();
        }
        /* render */
        SDL_SetRenderDrawColor(ren, 20, 20, 30, 255);
        SDL_RenderClear(ren);
        SDL_SetRenderDrawColor(ren, 60, 60, 80, 255);
        SDL_Rect pf = {FX - 2, FY - 2, BW * CELL + 4, BH * CELL + 4};
        SDL_RenderDrawRect(ren, &pf);
        for (int y = 0; y < BH; y++)
            for (int x = 0; x < BW; x++)
                if (board[y][x]) draw_block(x, y, (board[y][x] - 1) % 7, 255);
        /* ghost */
        int gy = py;
        while (!collide(ptype, prot, px, gy + 1)) gy++;
        for (int y = 0; y < 4; y++)
            for (int x = 0; x < 4; x++)
                if (cell_at(ptype, prot, x, y)) draw_block(px + x - 1, gy + y, ptype % 7, 90);
        for (int y = 0; y < 4; y++)
            for (int x = 0; x < 4; x++)
                if (cell_at(ptype, prot, x, y)) draw_block(px + x - 1, py + y, ptype % 7, 255);
        char b[64];
        snprintf(b, sizeof(b), "Score %d", score);
        text(20, 40, b, font_sm);
        snprintf(b, sizeof(b), "Level %d", level);
        text(20, 70, b, font_sm);
        snprintf(b, sizeof(b), "Lines %d", lines);
        text(20, 100, b, font_sm);
        SDL_RenderPresent(ren);
        SDL_Delay(8);
    }
    TTF_Quit(); IMG_Quit(); SDL_Quit();
    return 0;
}
