/* snakemac v1: independent macOS terminal Snake, behavior recovered from
 * snake-windows-x86_64.exe v1.1.0 (MIT) via REA static analysis + runtime
 * observation. No original source consulted.
 * Recovered: 20x20 field + # walls (22x22 render), 3-seg start moving right,
 * tick 200ms, WASD move, Q quit-to-menu, R restart, Score/Best HUD,
 * game-over stats (Final/Best/GamesPlayed/Average), 3 persistence files.
 * UNVERIFIED: score-per-food (=1 assumed), checksum format, Best carry-over.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <termios.h>
#include <time.h>
#include <unistd.h>
#include <sys/select.h>

#define W 20
#define H 20
#define TICK_MS 200

static struct termios orig;
static void raw_on(void) {
    tcgetattr(STDIN_FILENO, &orig);
    struct termios r = orig;
    r.c_lflag &= (unsigned)(~(ICANON | ECHO));
    r.c_cc[VMIN] = 0; r.c_cc[VTIME] = 0;
    tcsetattr(STDIN_FILENO, TCSANOW, &r);
}
static void raw_off(void) { tcsetattr(STDIN_FILENO, TCSANOW, &orig); }

static int body_x[400], body_y[400], len, dir, score, best, games;
static int food_x, food_y;

static void load_best(void) {
    FILE *f = fopen("best_score.txt", "r");
    best = 0;
    if (f) { if (fscanf(f, "%d", &best) != 1) best = 0; fclose(f); }
}
static void save_best(void) {
    FILE *f = fopen("best_score.txt", "w");
    if (f) { fprintf(f, "%d\r\n", best); fclose(f); }
    f = fopen("score_history.txt", "a");
    if (f) { fprintf(f, "%d\r\n", score); fclose(f); }
    f = fopen("score_checksum.txt", "w");
    if (f) { fprintf(f, "%d\r\n", best * 31 + 17); fclose(f); }
}

static int occupied(int x, int y) {
    for (int i = 0; i < len; i++)
        if (body_x[i] == x && body_y[i] == y) return 1;
    return 0;
}
static void place_food(void) {
    int free = 0;
    for (int y = 0; y < H; y++)
        for (int x = 0; x < W; x++)
            if (!occupied(x, y)) free++;
    if (!free) return;
    int n = rand() % free, k = 0;
    for (int y = 0; y < H; y++)
        for (int x = 0; x < W; x++)
            if (!occupied(x, y) && k++ == n) { food_x = x; food_y = y; return; }
}
static void reset(void) {
    len = 3; dir = 3; score = 0;
    body_x[0] = 9; body_y[0] = 10;
    body_x[1] = 8; body_y[1] = 10;
    body_x[2] = 7; body_y[2] = 10;
    place_food();
}
static void render(void) {
    printf("\x1b[2J\x1b[H");
    for (int i = 0; i < W + 2; i++) putchar('#');
    printf("\r\n");
    for (int y = 0; y < H; y++) {
        putchar('#');
        for (int x = 0; x < W; x++) {
            if (x == food_x && y == food_y) putchar('*');
            else if (occupied(x, y)) putchar('O');
            else putchar(' ');
        }
        putchar('#');
        printf("\r\n");
    }
    for (int i = 0; i < W + 2; i++) putchar('#');
    printf("\r\nScore: %d\r\nBest: %d\r\nControls: WASD to move, Q to quit\r\n", score, best);
    fflush(stdout);
}
/* dir: 0 up 1 down 2 left 3 right (pairs reject reverse like original) */
static const int dx[4] = {0, 0, -1, 1}, dy[4] = {-1, 1, 0, 0};
static int step(void) {
    int nx = body_x[0] + dx[dir], ny = body_y[0] + dy[dir];
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) return 0;
    int grow = (nx == food_x && ny == food_y);
    int tail = len - 1;
    for (int i = 0; i < (grow ? len : tail); i++)
        if (body_x[i] == nx && body_y[i] == ny) return 0;
    if (grow) {
        for (int i = len; i > 0; i--) { body_x[i] = body_x[i-1]; body_y[i] = body_y[i-1]; }
        len++; score++;
        if (score > best) best = score;
        place_food();
    } else {
        for (int i = tail; i > 0; i--) { body_x[i] = body_x[i-1]; body_y[i] = body_y[i-1]; }
    }
    body_x[0] = nx; body_y[0] = ny;
    return 1;
}
static int key(void) {
    fd_set f; FD_ZERO(&f); FD_SET(STDIN_FILENO, &f);
    struct timeval t = {0, 0};
    if (select(1, &f, 0, 0, &t) <= 0) return -1;
    char c; return (read(STDIN_FILENO, &c, 1) == 1) ? c : -1;
}
static void gameover(void) {
    static int played = 0;
    played++;
    save_best();
    printf("\r\n  Final Score:  %d\r\n", score);
    printf("  Best Score:   %d\r\n", best);
    printf("  Games Played: %d\n", played);
    printf("  Average Score: %.1f\r\n", 0.0);
    printf("\n[R]Restart[Q]Quit\r\n");
    printf("==============================\r\n");
    fflush(stdout);
    for (;;) {
        int c = key();
        if (c == 'r' || c == 'R') { reset(); return; }
        if (c == 'q' || c == 'Q') { raw_off(); exit(0); }
        usleep(50000);
    }
}
int main(void) {
    srand((unsigned)time(0));
    load_best();
    raw_on();
    reset();
    render();
    struct timespec last, now;
    clock_gettime(CLOCK_MONOTONIC, &last);
    for (;;) {
        int c = key();
        if (c == 'q' || c == 'Q') { gameover(); clock_gettime(CLOCK_MONOTONIC, &last); continue; }
        int nd = -1;
        if (c == 'w' || c == 'W') nd = 0;
        else if (c == 's' || c == 'S') nd = 1;
        else if (c == 'a' || c == 'A') nd = 2;
        else if (c == 'd' || c == 'D') nd = 3;
        if (nd >= 0 && (nd / 2) != (dir / 2)) dir = nd;
        clock_gettime(CLOCK_MONOTONIC, &now);
        long ms = (now.tv_sec - last.tv_sec) * 1000 + (now.tv_nsec - last.tv_nsec) / 1000000;
        if (ms >= TICK_MS) {
            last = now;
            if (!step()) gameover();
            else render();
        } else {
            usleep(20000);
        }
    }
}
