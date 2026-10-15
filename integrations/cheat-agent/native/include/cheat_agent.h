#ifndef CHEAT_AGENT_H
#define CHEAT_AGENT_H

#include <stddef.h>
#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/* Status and Error Codes */
#define CHEAT_STATUS_OK                      0
#define CHEAT_STATUS_ERROR                  -1
#define CHEAT_STATUS_INVALID_ARGUMENT       -2
#define CHEAT_STATUS_NOT_CONNECTED          -3
#define CHEAT_STATUS_PERMISSION_DENIED      -4
#define CHEAT_STATUS_NOT_FOUND              -5
#define CHEAT_STATUS_PARTIAL_READ           -6
#define CHEAT_STATUS_CAPABILITY_MISSING     -7
#define CHEAT_STATUS_TIMEOUT                -8

/* Data Types */
#define CHEAT_DATA_TYPE_INT8                 1
#define CHEAT_DATA_TYPE_UINT8                2
#define CHEAT_DATA_TYPE_INT16                3
#define CHEAT_DATA_TYPE_UINT16               4
#define CHEAT_DATA_TYPE_INT32                5
#define CHEAT_DATA_TYPE_UINT32               6
#define CHEAT_DATA_TYPE_INT64                7
#define CHEAT_DATA_TYPE_UINT64               8
#define CHEAT_DATA_TYPE_FLOAT                9
#define CHEAT_DATA_TYPE_DOUBLE               10
#define CHEAT_DATA_TYPE_BYTE_ARRAY           11
#define CHEAT_DATA_TYPE_STRING               12
#define CHEAT_DATA_TYPE_AOB                  13

/* Scan Modes */
#define CHEAT_SCAN_MODE_EXACT                0
#define CHEAT_SCAN_MODE_UNKNOWN_INITIAL      1
#define CHEAT_SCAN_MODE_CHANGED              2
#define CHEAT_SCAN_MODE_UNCHANGED            3
#define CHEAT_SCAN_MODE_INCREASED            4
#define CHEAT_SCAN_MODE_DECREASED            5
#define CHEAT_SCAN_MODE_RANGE                6

/* Protection Flags */
#define CHEAT_PROTECT_NONE                   0x00
#define CHEAT_PROTECT_READ                   0x01
#define CHEAT_PROTECT_WRITE                  0x02
#define CHEAT_PROTECT_EXECUTE                0x04

typedef struct CheatProcessBackend CheatProcessBackend;
typedef struct CheatMemoryScanner CheatMemoryScanner;

typedef struct CheatMemoryRegion {
    uint64_t base_address;
    uint64_t size;
    uint32_t protection;
    uint32_t is_writable;
    uint32_t is_executable;
} CheatMemoryRegion;

typedef struct CheatModuleInfo {
    char name[256];
    char path[1024];
    uint64_t base_address;
    uint64_t size;
} CheatModuleInfo;

typedef struct CheatPointerChain {
    char base_module[256];
    uint64_t base_offset;
    int64_t offsets[16];
    size_t offset_count;
} CheatPointerChain;

/* Backend APIs */
int32_t cheat_backend_create(uint32_t pid, CheatProcessBackend** out_backend);
void cheat_backend_destroy(CheatProcessBackend* backend);
int32_t cheat_backend_is_alive(CheatProcessBackend* backend);
uint32_t cheat_backend_get_pid(CheatProcessBackend* backend);
int32_t cheat_backend_read_memory(CheatProcessBackend* backend, uint64_t address, void* buffer, size_t size, size_t* bytes_read);
int32_t cheat_backend_write_memory(CheatProcessBackend* backend, uint64_t address, const void* buffer, size_t size, size_t* bytes_written);
int32_t cheat_backend_query_regions(CheatProcessBackend* backend, CheatMemoryRegion* out_regions, size_t max_regions, size_t* count);
int32_t cheat_backend_query_modules(CheatProcessBackend* backend, CheatModuleInfo* out_modules, size_t max_modules, size_t* count);

/* Memory Scanner APIs */
int32_t cheat_scanner_create(CheatProcessBackend* backend, CheatMemoryScanner** out_scanner);
void cheat_scanner_destroy(CheatMemoryScanner* scanner);
int32_t cheat_scanner_reset(CheatMemoryScanner* scanner);
int32_t cheat_scanner_first_scan(CheatMemoryScanner* scanner, int32_t data_type, int32_t scan_mode, const void* value1, const void* value2, size_t value_size);
int32_t cheat_scanner_next_scan(CheatMemoryScanner* scanner, int32_t scan_mode, const void* value1, const void* value2, size_t value_size);
int32_t cheat_scanner_scan_aob(CheatMemoryScanner* scanner, const char* pattern);
size_t cheat_scanner_get_match_count(CheatMemoryScanner* scanner);
int32_t cheat_scanner_get_matches(CheatMemoryScanner* scanner, uint64_t* out_addresses, size_t max_count, size_t* count);

/* Pointer Resolution APIs */
int32_t cheat_pointer_resolve(CheatProcessBackend* backend, const CheatPointerChain* chain, uint64_t* out_address);
int32_t cheat_pointer_scan(CheatProcessBackend* backend, uint64_t target_address, size_t max_depth, int64_t max_offset, CheatPointerChain* out_chains, size_t max_chains, size_t* found_count);

#ifdef __cplusplus
}
#endif

#endif /* CHEAT_AGENT_H */
