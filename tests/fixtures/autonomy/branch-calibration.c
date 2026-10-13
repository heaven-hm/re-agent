/* Authored validation fixture, not a proprietary benchmark. */
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
__attribute__((noinline)) long rea_unknown_transform(long x) {
    return x < 0 ? 7 - 3 * x : 7 + 5 * x;
}
int main(int argc, char **argv) {
    if (argc != 2) return 2;
    char *end;
    errno = 0;
    long x = strtol(argv[1], &end, 10);
    if (errno || *end || end == argv[1] || x < -1000000 || x > 1000000) return 2;
    printf("%ld\n", rea_unknown_transform(x));
    return 0;
}
