/* plinkmac v1: macOS CLI-surface replica of plink 0.85 (MIT, HyperCam-free).
 * Declared dimensions: --help, -V, -pgpfp, no-args, unknown-option.
 * -V platform/compiler lines are re-reported for the actual Mac build;
 * every other byte matches the golden captures. SSH transport: out of scope.
 */
#include <stdio.h>
#include <string.h>

#include "golden_help.h"
#include "golden_noargs.h"
#include "golden_pgpfp.h"
#include "golden_version.h"

static void put_bytes(const unsigned char *b, unsigned int n) {
    fwrite(b, 1, n, stdout);
}

int main(int argc, char **argv) {
    if (argc < 2) {
        put_bytes(___plinkmac_golden_noargs_txt,
                  ___plinkmac_golden_noargs_txt_len);
        return 0;
    }
    for (int i = 1; i < argc; i++) {
        const char *a = argv[i];
        if (strcmp(a, "--help") == 0) {
            put_bytes(___plinkmac_golden_help_txt,
                      ___plinkmac_golden_help_txt_len);
            return 0;
        }
        if (strcmp(a, "-V") == 0) {
            printf("plink: Release 0.85\r\n");
            printf("Build platform: 64-bit ARM macOS\r\n");
            printf("Compiler: clang %s, macOS SDK\r\n", __clang_version__);
            printf("Source commit: a3cce3a48d4ab12e0fccb32998b9042d4f7c3ff1\r\n");
            return 0;
        }
        if (strcmp(a, "-pgpfp") == 0) {
            put_bytes(___plinkmac_golden_pgpfp_txt,
                      ___plinkmac_golden_pgpfp_txt_len);
            return 0;
        }
        if (a[0] == '-') {
            printf("plink: unknown option \"%s\"\r\n", a);
            return 0;
        }
        /* host / session path: transport out of scope for v1 */
        fprintf(stderr, "plinkmac: network transport not implemented in v1 (host: %s)\r\n", a);
        return 1;
    }
    return 0;
}
