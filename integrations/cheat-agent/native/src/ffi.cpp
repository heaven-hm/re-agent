#include "cheat_agent.h"
#include "process_backend.hpp"
#include "memory_scanner.hpp"
#include "pointer_resolver.hpp"
#include <cstring>
#include <memory>
#include <algorithm>

struct CheatProcessBackend {
    std::shared_ptr<cheat_agent::IProcessBackend> impl;
};

struct CheatMemoryScanner {
    std::unique_ptr<cheat_agent::MemoryScanner> impl;
};

extern "C" {

int32_t cheat_backend_create(uint32_t pid, CheatProcessBackend** out_backend) {
    if (!out_backend) return CHEAT_STATUS_INVALID_ARGUMENT;
    try {
        auto backend = cheat_agent::IProcessBackend::create(pid);
        if (!backend) return CHEAT_STATUS_ERROR;

        auto wrapper = new CheatProcessBackend();
        wrapper->impl = std::move(backend);
        *out_backend = wrapper;
        return CHEAT_STATUS_OK;
    } catch (...) {
        return CHEAT_STATUS_ERROR;
    }
}

void cheat_backend_destroy(CheatProcessBackend* backend) {
    if (backend) {
        delete backend;
    }
}

int32_t cheat_backend_is_alive(CheatProcessBackend* backend) {
    if (!backend || !backend->impl) return 0;
    return backend->impl->is_alive() ? 1 : 0;
}

uint32_t cheat_backend_get_pid(CheatProcessBackend* backend) {
    if (!backend || !backend->impl) return 0;
    return backend->impl->get_pid();
}

int32_t cheat_backend_read_memory(
    CheatProcessBackend* backend,
    uint64_t address,
    void* buffer,
    size_t size,
    size_t* bytes_read) {

    if (!backend || !backend->impl || !buffer || size == 0) return CHEAT_STATUS_INVALID_ARGUMENT;
    size_t read_count = 0;
    int32_t res = backend->impl->read_memory(address, buffer, size, read_count);
    if (bytes_read) *bytes_read = read_count;
    return res;
}

int32_t cheat_backend_write_memory(
    CheatProcessBackend* backend,
    uint64_t address,
    const void* buffer,
    size_t size,
    size_t* bytes_written) {

    if (!backend || !backend->impl || !buffer || size == 0) return CHEAT_STATUS_INVALID_ARGUMENT;
    size_t written_count = 0;
    int32_t res = backend->impl->write_memory(address, buffer, size, written_count);
    if (bytes_written) *bytes_written = written_count;
    return res;
}

int32_t cheat_backend_query_regions(
    CheatProcessBackend* backend,
    CheatMemoryRegion* out_regions,
    size_t max_regions,
    size_t* count) {

    if (!backend || !backend->impl || !out_regions || max_regions == 0) return CHEAT_STATUS_INVALID_ARGUMENT;
    try {
        auto regions = backend->impl->query_regions();
        size_t n = std::min(max_regions, regions.size());
        for (size_t i = 0; i < n; ++i) {
            out_regions[i].base_address = regions[i].base_address;
            out_regions[i].size = regions[i].size;
            out_regions[i].protection = regions[i].protection;
            out_regions[i].is_writable = regions[i].is_writable ? 1 : 0;
            out_regions[i].is_executable = regions[i].is_executable ? 1 : 0;
        }
        if (count) *count = n;
        return CHEAT_STATUS_OK;
    } catch (...) {
        return CHEAT_STATUS_ERROR;
    }
}

int32_t cheat_backend_query_modules(
    CheatProcessBackend* backend,
    CheatModuleInfo* out_modules,
    size_t max_modules,
    size_t* count) {

    if (!backend || !backend->impl || !out_modules || max_modules == 0) return CHEAT_STATUS_INVALID_ARGUMENT;
    try {
        auto modules = backend->impl->query_modules();
        size_t n = std::min(max_modules, modules.size());
        for (size_t i = 0; i < n; ++i) {
            std::memset(&out_modules[i], 0, sizeof(CheatModuleInfo));
            std::strncpy(out_modules[i].name, modules[i].name.c_str(), sizeof(out_modules[i].name) - 1);
            std::strncpy(out_modules[i].path, modules[i].path.c_str(), sizeof(out_modules[i].path) - 1);
            out_modules[i].base_address = modules[i].base_address;
            out_modules[i].size = modules[i].size;
        }
        if (count) *count = n;
        return CHEAT_STATUS_OK;
    } catch (...) {
        return CHEAT_STATUS_ERROR;
    }
}

int32_t cheat_scanner_create(CheatProcessBackend* backend, CheatMemoryScanner** out_scanner) {
    if (!backend || !backend->impl || !out_scanner) return CHEAT_STATUS_INVALID_ARGUMENT;
    try {
        auto scanner = std::make_unique<cheat_agent::MemoryScanner>(backend->impl);
        auto wrapper = new CheatMemoryScanner();
        wrapper->impl = std::move(scanner);
        *out_scanner = wrapper;
        return CHEAT_STATUS_OK;
    } catch (...) {
        return CHEAT_STATUS_ERROR;
    }
}

void cheat_scanner_destroy(CheatMemoryScanner* scanner) {
    if (scanner) {
        delete scanner;
    }
}

int32_t cheat_scanner_reset(CheatMemoryScanner* scanner) {
    if (!scanner || !scanner->impl) return CHEAT_STATUS_INVALID_ARGUMENT;
    scanner->impl->reset();
    return CHEAT_STATUS_OK;
}

int32_t cheat_scanner_first_scan(
    CheatMemoryScanner* scanner,
    int32_t data_type,
    int32_t scan_mode,
    const void* value1,
    const void* value2,
    size_t value_size) {

    if (!scanner || !scanner->impl) return CHEAT_STATUS_INVALID_ARGUMENT;
    return scanner->impl->first_scan(data_type, scan_mode, value1, value2, value_size);
}

int32_t cheat_scanner_next_scan(
    CheatMemoryScanner* scanner,
    int32_t scan_mode,
    const void* value1,
    const void* value2,
    size_t value_size) {

    if (!scanner || !scanner->impl) return CHEAT_STATUS_INVALID_ARGUMENT;
    return scanner->impl->next_scan(scan_mode, value1, value2, value_size);
}

int32_t cheat_scanner_scan_aob(CheatMemoryScanner* scanner, const char* pattern) {
    if (!scanner || !scanner->impl || !pattern) return CHEAT_STATUS_INVALID_ARGUMENT;
    return scanner->impl->scan_aob(pattern);
}

size_t cheat_scanner_get_match_count(CheatMemoryScanner* scanner) {
    if (!scanner || !scanner->impl) return 0;
    return scanner->impl->get_match_count();
}

int32_t cheat_scanner_get_matches(
    CheatMemoryScanner* scanner,
    uint64_t* out_addresses,
    size_t max_count,
    size_t* count) {

    if (!scanner || !scanner->impl || !out_addresses || max_count == 0) return CHEAT_STATUS_INVALID_ARGUMENT;
    const auto& candidates = scanner->impl->get_candidates();
    size_t n = std::min(max_count, candidates.size());
    for (size_t i = 0; i < n; ++i) {
        out_addresses[i] = candidates[i].address;
    }
    if (count) *count = n;
    return CHEAT_STATUS_OK;
}

int32_t cheat_pointer_resolve(
    CheatProcessBackend* backend,
    const CheatPointerChain* chain,
    uint64_t* out_address) {

    if (!backend || !backend->impl || !chain || !out_address) return CHEAT_STATUS_INVALID_ARGUMENT;
    return cheat_agent::PointerResolver::resolve(*(backend->impl), *chain, *out_address);
}

int32_t cheat_pointer_scan(
    CheatProcessBackend* backend,
    uint64_t target_address,
    size_t max_depth,
    int64_t max_offset,
    CheatPointerChain* out_chains,
    size_t max_chains,
    size_t* found_count) {

    if (!backend || !backend->impl || !out_chains || max_chains == 0) return CHEAT_STATUS_INVALID_ARGUMENT;
    try {
        auto chains = cheat_agent::PointerResolver::scan(
            *(backend->impl), target_address, max_depth, max_offset, max_chains);
        size_t n = std::min(max_chains, chains.size());
        for (size_t i = 0; i < n; ++i) {
            out_chains[i] = chains[i];
        }
        if (found_count) *found_count = n;
        return CHEAT_STATUS_OK;
    } catch (...) {
        return CHEAT_STATUS_ERROR;
    }
}

} // extern "C"
