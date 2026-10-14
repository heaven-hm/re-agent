/* tetrismac v1: independent macOS SDL2 port of Tetris v1.0.0
 * (oleh-maliuta/tetris, MIT). No original source consulted.
 * Recovered via REA: SDL2+TTF+Mixer dynamic stack, page architecture
 * (MainMenu/Guide/Controls/Settings/ScoreValues/Play), widget names
 * (score/level text+values, pause & game-over menus), shipped assets.
 * UNVERIFIED: scoring table, gravity curve, exact key bindings, sounds.
 */
#include <SDL2/SDL.h>
#include <SDL2/SDL_image.h>
#include <SDL2/SDL_ttf.h>
#include <SDL2/SDL_mixer.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#define LW 960
#define LH 640
#define BW 10
#define BH 20
#define CELL 28
#define FX 330
#define FY 40

static SDL_Window *win;
static SDL_Renderer *ren;
static TTF_Font *font, *font_lg;
static int board[BH][BW];
static int score, level, lines, over, paused, page;
static int ptype, prot, px, py, hold, hold_used;

enum { PG_MENU, PG_GUIDE, PG_CONTROLS, PG_SETTINGS, PG_SCORES, PG_PLAY };

static const char *P[7][4] = {
    { "...." "XXXX" "...." "....", "..X." "..X." "..X." "..X.",
      "...." "...." "XXXX" "....", ".X.." ".X.." ".X.." ".X.." },
    { "X..." "XXX." "...." "....", ".XX." ".X.." ".X.." "....",
      "...." ".XXX" "...X" "....", ".X.." ".X.." ".XX." "...." },
    { "...X" ".XXX" "...." "....", ".X.." ".X.." ".XX." "....",
      "...." "XXX." "X..." "....", ".XX." ".X.." ".X.." "...." },
    { ".XX." ".XX." "...." "....", ".XX." ".XX." "...." "....",
      ".XX." ".XX." "...." "....", ".XX." ".XX." "...." "...." },
    { ".XX." "XX.." "...." "....", ".X.." ".XX." "..X." "....",
      "...." ".XX." "XX.." "....", ".X.." ".XX." "..X." "...." },
    { ".X.." "XXX." "...." "....", ".X.." ".XX." ".X.." "....",
      "...." "XXX." ".X.." "....", ".X.." ".XX." ".X.." "...." },
    { "XX.." ".XX." "...." "....", "..X." ".XX." ".X.." "....",
      "...." "XX.." ".XX." "....", "..X." ".XX." ".X.." "...." },
};
static const int PCOL[7][3] = {
    {0,255,255},{0,0,255},{255,165,0},{255,255,0},{0,255,0},{160,32,240},{255,0,0},
};
static int bag[7], bag_n;

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
static void spawn(void) {
    if (bag_n >= 7) refill();
    ptype = bag[bag_n++]; prot = 0; px = 4; py = 0; hold_used = 0;
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
static int gravity_ms(void) { int m = 800 - level * 70; return m < 50 ? 50 : m; }
static void reset_game(void) {
    memset(board, 0, sizeof(board));
    score = 0; level = 0; lines = 0; over = 0; paused = 0;
    hold = -1; refill(); spawn(); page = PG_PLAY;
}
static void text(int x, int y, const char *s, TTF_Font *f) {
    SDL_Color c = {235, 235, 245, 255};
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
static int menu_idx;
static const char *MENU[6] = {"Play", "Guide", "Controls", "Settings", "Score Values", "Quit"};

static void draw_menu(void) {
    SDL_SetRenderDrawColor(ren, 12, 12, 24, 255);
    SDL_RenderClear(ren);
    text(400, 80, "TETRIS", font_lg);
    for (int i = 0; i < 6; i++) {
        text(430, 180 + i * 48, MENU[i], font);
        if (i == menu_idx) {
            SDL_SetRenderDrawColor(ren, 255, 220, 60, 255);
            SDL_Rect h = {410, 176 + i * 48, 150, 36};
            SDL_RenderDrawRect(ren, &h);
        }
    }
    text(330, 520, "Arrows move  X rotate  Space drop  P pause", font);
    SDL_RenderPresent(ren);
}
static void draw_page_text(const char *title, const char **lines, int n) {
    SDL_SetRenderDrawColor(ren, 12, 12, 24, 255);
    SDL_RenderClear(ren);
    text(380, 60, title, font_lg);
    for (int i = 0; i < n; i++) text(240, 150 + i * 40, lines[i], font);
    text(300, 560, "Esc: back", font);
    SDL_RenderPresent(ren);
}
static const char *GUIDE_L[] = {"Move: Left/Right arrows", "Rotate: Up or X", "Soft drop: Down",
    "Hard drop: Space", "Hold: C", "Pause: P", "Clear lines to score."};
static const char *CONTROLS_L[] = {"Left/Right: move piece", "Up/X: rotate", "Down: soft drop",
    "Space: hard drop", "C: hold piece", "P: pause", "Enter: confirm", "Esc: back/quit"};
static const char *SETTINGS_L[] = {"Music: on (fixed in v1)", "SFX: on (fixed in v1)", "Resolution: 960x640 (fixed in v1)"};
static const char *SCORES_L[] = {"Single: 100", "Double: 300", "Triple: 500", "Tetris: 800", "Times (level+1). Guideline values."};

static void draw_play(void) {
    SDL_SetRenderDrawColor(ren, 12, 12, 24, 255);
    SDL_RenderClear(ren);
    SDL_SetRenderDrawColor(ren, 70, 70, 100, 255);
    SDL_Rect pf = {FX - 2, FY - 2, BW * CELL + 4, BH * CELL + 4};
    SDL_RenderDrawRect(ren, &pf);
    for (int y = 0; y < BH; y++)
        for (int x = 0; x < BW; x++)
            if (board[y][x]) draw_block(x, y, (board[y][x] - 1) % 7, 255);
    if (!over) {
        int gy = py;
        while (!collide(ptype, prot, px, gy + 1)) gy++;
        for (int y = 0; y < 4; y++)
            for (int x = 0; x < 4; x++) {
                if (cell_at(ptype, prot, x, y)) draw_block(px + x - 1, gy + y, ptype % 7, 80);
                if (cell_at(ptype, prot, x, y)) draw_block(px + x - 1, py + y, ptype % 7, 255);
            }
    }
    char b[64];
    snprintf(b, sizeof(b), "Score: %d", score); text(60, 120, b, font);
    snprintf(b, sizeof(b), "Level: %d", level); text(60, 170, b, font);
    snprintf(b, sizeof(b), "Lines: %d", lines); text(60, 220, b, font);
    text(60, 300, hold >= 0 ? "Hold: yes" : "Hold: -", font);
    if (paused) { text(380, 280, "Pause", font_lg); }
    if (over) {
        text(390, 220, "Game Over", font_lg);
        snprintf(b, sizeof(b), "Score: %d", score); text(400, 280, b, font);
        text(360, 340, "Enter: restart  Esc: menu", font);
    }
    SDL_RenderPresent(ren);
}

int main(int argc, char **argv) {
    (void)argc; (void)argv;
    srand((unsigned)time(0));
    if (SDL_Init(SDL_INIT_VIDEO | SDL_INIT_AUDIO) < 0) return 1;
    win = SDL_CreateWindow("Tetris", SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED, LW, LH, SDL_WINDOW_SHOWN);
    if (!win) return 1;
    IMG_Init(IMG_INIT_JPG | IMG_INIT_PNG);
    if (TTF_Init() == -1) return 1;
    if (Mix_OpenAudio(44100, MIX_DEFAULT_FORMAT, 2, 2048) < 0) fprintf(stderr, "mixer: %s\n", Mix_GetError());
    ren = SDL_CreateRenderer(win, -1, SDL_RENDERER_ACCELERATED | SDL_RENDERER_PRESENTVSYNC);
    SDL_RenderSetLogicalSize(ren, LW, LH);
    font = TTF_OpenFont("assets/fonts/open_sans/normal.ttf", 22);
    font_lg = TTF_OpenFont("assets/fonts/open_sans/bold.ttf", 44);
    if (!font || !font_lg) { fprintf(stderr, "font: %s\n", TTF_GetError()); return 1; }
    page = PG_MENU; menu_idx = 0;
    Uint32 last = SDL_GetTicks();
    int acc = 0, quit = 0;
    while (!quit) {
        SDL_Event e;
        while (SDL_PollEvent(&e)) {
            if (e.type == SDL_QUIT) { quit = 1; break; }
            if (e.type != SDL_KEYDOWN) continue;
            SDL_Keycode k = e.key.keysym.sym;
            if (page == PG_MENU) {
                if (k == SDLK_UP) menu_idx = (menu_idx + 5) % 6;
                else if (k == SDLK_DOWN) menu_idx = (menu_idx + 1) % 6;
                else if (k == SDLK_RETURN || k == SDLK_KP_ENTER) {
                    if (menu_idx == 0) reset_game();
                    else if (menu_idx == 1) page = PG_GUIDE;
                    else if (menu_idx == 2) page = PG_CONTROLS;
                    else if (menu_idx == 3) page = PG_SETTINGS;
                    else if (menu_idx == 4) page = PG_SCORES;
                    else quit = 1;
                } else if (k == SDLK_ESCAPE) quit = 1;
            } else if (page == PG_PLAY) {
                if (k == SDLK_ESCAPE) { page = PG_MENU; menu_idx = 0; }
                else if (k == 'p' || k == 'P') paused = !paused;
                else if (over) { if (k == SDLK_RETURN || k == SDLK_KP_ENTER) reset_game(); }
                else if (!paused) {
                    if (k == SDLK_LEFT && !collide(ptype, prot, px - 1, py)) px--;
                    else if (k == SDLK_RIGHT && !collide(ptype, prot, px + 1, py)) px++;
                    else if (k == SDLK_DOWN) { if (!collide(ptype, prot, px, py + 1)) py++; else lock_piece(); acc = 0; last = SDL_GetTicks(); }
                    else if ((k == SDLK_UP || k == 'x' || k == 'X') && !collide(ptype, (prot + 1) % 4, px, py)) prot = (prot + 1) % 4;
                    else if (k == SDLK_SPACE) { while (!collide(ptype, prot, px, py + 1)) py++; lock_piece(); }
                    else if ((k == 'c' || k == 'C') && !hold_used) {
                        int t = hold; hold = ptype;
                        if (t < 0) spawn(); else { ptype = t; prot = 0; px = 4; py = 0; }
                        hold_used = 1;
                    }
                }
            } else {
                if (k == SDLK_ESCAPE || k == SDLK_RETURN) page = PG_MENU;
            }
        }
        if (page == PG_MENU) draw_menu();
        else if (page == PG_GUIDE) draw_page_text("Guide", GUIDE_L, 7);
        else if (page == PG_CONTROLS) draw_page_text("Controls", CONTROLS_L, 8);
        else if (page == PG_SETTINGS) draw_page_text("Settings", SETTINGS_L, 3);
        else if (page == PG_SCORES) draw_page_text("Score Values", SCORES_L, 5);
        else {
            if (!paused && !over) {
                Uint32 now = SDL_GetTicks();
                acc += (int)(now - last); last = now;
                int g = gravity_ms();
                while (acc >= g && !over) {
                    acc -= g;
                    if (!collide(ptype, prot, px, py + 1)) py++;
                    else lock_piece();
                }
            } else {
                last = SDL_GetTicks(); acc = 0;
            }
            draw_play();
        }
        SDL_Delay(8);
    }
    Mix_CloseAudio(); TTF_Quit(); IMG_Quit(); SDL_Quit();
    return 0;
}
