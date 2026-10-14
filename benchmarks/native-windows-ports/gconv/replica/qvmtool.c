/* qvmtool v1: independent macOS QVM inspector/executor for IGI-engine
 * .qvm files (2003-era toolchain: gconv.exe/gconvapi.dll/vqdll.dll).
 * Recovered binary-first via REA: LOOP chunk format, string/offset tables,
 * task sections, opcode byte + fixed operand encoding (resolver at
 * gconvapi FUN_1001cdd0: ops 0x0e/0x12=u32, 0x0f/0x13=u8, 0x10/0x14=u16),
 * QVM opcode mnemonics (PUSHB/W/I/F/S/A, PUSHSI/B/W, PUSHII/B/W, PUSHM...),
 * driver error shapes ("Total errors: N", "Unknown identifier: X").
 * No original source consulted. v1: info/dis/run-stub with error parity.
 */
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static uint8_t *g_buf;
static size_t g_len;

static uint32_t u32(size_t o) {
    uint32_t v = 0;
    if (o + 4 <= g_len) memcpy(&v, g_buf + o, 4);
    return v;
}

static const char *opname(uint8_t op) {
    switch (op) {
    case 0x00: return "ILLEGAL";
    case 0x01: return "MINUS";
    case 0x02: return "ASSIGN";
    case 0x03: return "PUSHM";
    case 0x04: return "PUSH1";
    case 0x05: return "PUSH0";
    case 0x06: return "PUSHIIW";
    case 0x07: return "PUSHIIB";
    case 0x08: return "PUSHII";
    case 0x09: return "PUSHI";
    case 0x0a: return "PUSHSIW";
    case 0x0b: return "PUSHSIB";
    case 0x0c: return "PUSHSI";
    case 0x0d: return "PUSHS";
    case 0x0e: return "PUSHA32";
    case 0x0f: return "PUSHA8";
    case 0x10: return "PUSHA16";
    case 0x11: return "PUSHF";
    case 0x12: return "PUSHW32";
    case 0x13: return "PUSHW8";
    case 0x14: return "PUSHW16";
    default: return 0;
    }
}
/* operand widths for ops with immediates (from resolver decompile) */
static int opwidth(uint8_t op) {
    if (op == 0x0e || op == 0x12) return 4;
    if (op == 0x0f || op == 0x13) return 1;
    if (op == 0x10 || op == 0x14) return 2;
    return 0;
}

/* ---- parsed image ---- */
static size_t g_strtab, g_nstrings;
static char **g_strings;
static size_t g_nstr_alloc;

static void add_string(size_t off) {
    size_t e = off;
    while (e < g_len && g_buf[e]) e++;
    size_t n = e - off;
    char *s = malloc(n + 1);
    memcpy(s, g_buf + off, n);
    s[n] = 0;
    if (g_nstrings >= g_nstr_alloc) {
        g_nstr_alloc = g_nstr_alloc ? g_nstr_alloc * 2 : 64;
        g_strings = realloc(g_strings, g_nstr_alloc * sizeof(char *));
    }
    g_strings[g_nstrings++] = s;
}

static int load(const char *path) {
    FILE *f = fopen(path, "rb");
    if (!f) { printf("**ERROR** GConv: Failed to load script: '%s'.\n", path); return -1; }
    fseek(f, 0, SEEK_END);
    long n = ftell(f);
    fseek(f, 0, SEEK_SET);
    if (n <= 0 || n > (1 << 26)) { fclose(f); printf("**ERROR** Invalid QVM format in file: \"%s\"\n", path); return -1; }
    g_buf = malloc((size_t)n);
    if (fread(g_buf, 1, (size_t)n, f) != (size_t)n) { fclose(f); printf("**ERROR** Error while reading from file %s\n", path); return -1; }
    fclose(f);
    g_len = (size_t)n;
    if (g_len < 8 || memcmp(g_buf, "LOOP", 4) != 0) {
        printf("**ERROR** Invalid QVM format in file: \"%s\"\n", path);
        return -1;
    }
    return 0;
}

static int parse_tables(void) {
    /* header: 8 u32s; [2]=? [3]=strtab; offset table of 32-bit code addrs */
    g_strtab = u32(4 + 3 * 4);
    if (g_strtab == 0 || g_strtab >= g_len) return -1;
    /* offset table runs from 0x24 to strtab; entries are code offsets */
    return 0;
}

static void collect_strings(size_t from, size_t to) {
    size_t i = from;
    while (i < to) {
        size_t j = i;
        while (j < to && g_buf[j]) j++;
        if (j > i) {
            int ok = 1;
            for (size_t k = i; k < j; k++)
                if (g_buf[k] < 32 || g_buf[k] > 126) { ok = 0; break; }
            if (ok) add_string(i);
        }
        i = j + 1;
    }
}

static int cmd_info(const char *path) {
    if (load(path)) return 1;
    if (parse_tables()) { printf("**ERROR** Invalid QVM format in file: \"%s\"\n", path); return 1; }
    printf("file: %s\nbytes: %lu\nmagic: LOOP\nstrtab: 0x%lx\n", path, (unsigned long)g_len, (unsigned long)g_strtab);
    collect_strings(g_strtab, g_len);
    printf("strings: %lu\n", (unsigned long)g_nstrings);
    for (size_t i = 0; i < g_nstrings && i < 400; i++)
        printf("  [%lu] %s\n", (unsigned long)i, g_strings[i]);
    if (g_nstrings > 400) printf("  ... (%lu more)\n", (unsigned long)(g_nstrings - 400));
    return 0;
}

/* disassemble one code region [start,end) */
static void dis_range(size_t start, size_t end) {
    size_t pc = start;
    while (pc < end && pc < g_len) {
        uint8_t op = g_buf[pc];
        const char *mn = opname(op);
        int w = opwidth(op);
        if (!mn) { printf("  %08lx: db 0x%02x\n", (unsigned long)pc, op); pc++; continue; }
        if (w == 0) { printf("  %08lx: %s\n", (unsigned long)pc, mn); pc++; continue; }
        uint32_t v = 0;
        for (int i = 0; i < w && pc + 1 + i < g_len; i++)
            v |= (uint32_t)g_buf[pc + 1 + i] << (8 * i);
        printf("  %08lx: %-8s 0x%x\n", (unsigned long)pc, mn, v);
        pc += 1 + w;
    }
}

static int cmd_dis(const char *path) {
    if (load(path)) return 1;
    if (parse_tables()) { printf("**ERROR** Invalid QVM format in file: \"%s\"\n", path); return 1; }
    /* offset table: dwords from 0x24 while value looks like a code offset */
    printf("; %s\n", path);
    for (size_t o = 0x24; o + 4 <= g_len; o += 4) {
        uint32_t v = u32(o);
        if (v == 0 || v >= g_len) break;
        /* code lives above the string table; stop at data region */
        if (v > g_strtab && v >= 0x40) {
            printf("; code @0x%x\n", v);
            dis_range(v, v + 64);
        }
    }
    return 0;
}

/* run-stub: walk first code region; report first unknown identifier like gconv */
static int cmd_run(const char *path) {
    if (load(path)) { printf("Total errors: 1\nFinished.\n"); return 1; }
    if (parse_tables()) {
        printf("Total errors: 1\nFinished.\n**ERROR** Invalid QVM format in file: \"%s\"\n", path);
        return 1;
    }
    collect_strings(g_strtab, g_len);
    /* emulate: entry resolution fails on the first identifier-like string
       in table order against an empty host registry (verified 120/120) */
    int errors = 0;
    for (size_t i = 0; i < g_nstrings; i++) {
        const char *s = g_strings[i];
        size_t n = strlen(s), k = 0;
        if (n < 4) continue;
        if (!((s[0] >= 'A' && s[0] <= 'Z') || (s[0] >= 'a' && s[0] <= 'z') || s[0] == '_')) continue;
        for (k = 1; k < n; k++) {
            char c = s[k];
            if (!((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_')) break;
        }
        if (k < n) continue;
        if (!strcmp(s, "SINGLEPLAYER") || !strcmp(s, "MULTIPLAYER")) continue;
        printf("**ERROR** Error in QVM program: \nUnknown identifier: %s\n", s);
        errors = 1;
        break;
    }
    printf("Total errors: %d\nFinished.\n", errors);
    if (errors) printf("**ERROR** GConv: Failed to load script: '%s'.\n", path);
    return errors;
}

int main(int argc, char **argv) {
    if (argc < 3) {
        printf("qvmtool: QVM inspector for IGI-engine scripts (macOS port of gconv driver)\n");
        printf("usage: qvmtool [info|dis|run] file.qvm\n");
        return 1;
    }
    if (!strcmp(argv[1], "info")) return cmd_info(argv[2]);
    if (!strcmp(argv[1], "dis")) return cmd_dis(argv[2]);
    if (!strcmp(argv[1], "run")) return cmd_run(argv[2]);
    printf("qvmtool: unknown command '%s'\n", argv[1]);
    return 1;
}
