#include <iostream>
#include <iomanip>
#include <string>
#include <chrono>
#include <thread>
#include <random>
#include <csignal>

#if defined(_WIN32)
#include <windows.h>
#include <process.h>
#define GET_PID() GetCurrentProcessId()
#else
#include <unistd.h>
#define GET_PID() getpid()
#endif

namespace {

struct Inventory {
    uint32_t ammo{100};
    uint32_t grenades{5};
    uint32_t padding[6]{};
};

struct Player {
    uint32_t health{100};
    uint32_t armor{50};
    uint32_t score{1250};
    uint32_t pad{0};
    Inventory* inventory{nullptr};
};

struct World {
    uint64_t map_id{1};
    Player* player{nullptr};
};

struct GameManager {
    uint32_t version{1};
    uint32_t pad{0};
    World* world{nullptr};
};

// Global root pointer (module-relative anchor)
GameManager* g_game_manager = nullptr;
volatile bool g_running = true;

void init_game() {
    auto gm = new GameManager();
    gm->world = new World();
    gm->world->player = new Player();
    gm->world->player->inventory = new Inventory();
    g_game_manager = gm;
}

void relocate_player() {
    if (!g_game_manager || !g_game_manager->world) return;
    auto old_player = g_game_manager->world->player;
    auto new_player = new Player();
    new_player->inventory = new Inventory();

    if (old_player) {
        new_player->health = old_player->health;
        new_player->armor = old_player->armor;
        new_player->score = old_player->score;
        if (old_player->inventory) {
            new_player->inventory->ammo = old_player->inventory->ammo;
            new_player->inventory->grenades = old_player->inventory->grenades;
            delete old_player->inventory;
        }
        delete old_player;
    }

    g_game_manager->world->player = new_player;
}

void print_status_json() {
    if (!g_game_manager || !g_game_manager->world || !g_game_manager->world->player) return;
    auto p = g_game_manager->world->player;
    auto inv = p->inventory;

    std::cout << "{"
              << "\"pid\":" << GET_PID() << ","
              << "\"health\":" << p->health << ","
              << "\"armor\":" << p->armor << ","
              << "\"score\":" << p->score << ","
              << "\"ammo\":" << (inv ? inv->ammo : 0) << ","
              << "\"grenades\":" << (inv ? inv->grenades : 0) << ","
              << "\"root_ptr\":\"0x" << std::hex << reinterpret_cast<uintptr_t>(&g_game_manager) << "\","
              << "\"player_ptr\":\"0x" << reinterpret_cast<uintptr_t>(p) << "\","
              << "\"ammo_ptr\":\"0x" << (inv ? reinterpret_cast<uintptr_t>(&(inv->ammo)) : 0) << "\""
              << std::dec << "}" << std::endl;
}

} // namespace

int main(int argc, char** argv) {
    init_game();

    bool daemon = false;
    for (int i = 1; i < argc; ++i) {
        std::string arg(argv[i]);
        if (arg == "--status") {
            print_status_json();
            return 0;
        } else if (arg == "--fire") {
            if (g_game_manager->world->player->inventory->ammo > 0) {
                g_game_manager->world->player->inventory->ammo--;
            }
            print_status_json();
            return 0;
        } else if (arg == "--damage") {
            if (g_game_manager->world->player->health >= 10) {
                g_game_manager->world->player->health -= 10;
            } else {
                g_game_manager->world->player->health = 0;
            }
            print_status_json();
            return 0;
        } else if (arg == "--daemon") {
            daemon = true;
        }
    }

    if (!daemon) {
        print_status_json();
        return 0;
    }

    // Interactive daemon loop reading commands from stdin
    std::string line;
    print_status_json();

    while (g_running) {
        if (!std::getline(std::cin, line)) {
            // CI and detached launches may provide closed stdin. Keep the
            // controlled test process alive until its parent terminates it.
            std::cin.clear();
            std::this_thread::sleep_for(std::chrono::milliseconds(100));
            continue;
        }
        if (line == "status") {
            print_status_json();
        } else if (line == "fire") {
            if (g_game_manager->world->player->inventory->ammo > 0) {
                g_game_manager->world->player->inventory->ammo--;
            }
            print_status_json();
        } else if (line == "damage") {
            if (g_game_manager->world->player->health >= 10) {
                g_game_manager->world->player->health -= 10;
            } else {
                g_game_manager->world->player->health = 0;
            }
            print_status_json();
        } else if (line == "relocate") {
            relocate_player();
            print_status_json();
        } else if (line == "quit" || line == "exit") {
            break;
        }
    }

    return 0;
}
