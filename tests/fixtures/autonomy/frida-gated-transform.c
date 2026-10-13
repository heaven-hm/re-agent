#include <stdio.h>
#include <stdint.h>
#include <unistd.h>
/* Owned fixture: input gate permits attachment before this unknown function runs. */
__attribute__((noinline)) int64_t rea_hidden_transform(int64_t value) {
    if (value < 0) return value * 5 - 7;
    return value * 3 + 11;
}
int main(void) {
    long long input;
    while (scanf("%lld", &input) == 1) {
        printf("%lld\n", (long long)rea_hidden_transform((int64_t)input));
        fflush(stdout);
    }
    /* Permit final instrumentation messages to arrive before process teardown. */
    usleep(100000);
    return 0;
}
