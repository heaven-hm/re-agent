# Standalone AI Mode & LLM Providers

## Overview

In Standalone AI Mode (Mode B), `cheat-agent` runs independently from external coding agents like Claude Code or Codex. It manages its own reasoning loop, context window, model prompts, tool call dispatch, and state machine.

Supported LLM provider backends:
1. **OpenAI API** (`gpt-4o`, `o1`, `gpt-4-turbo`)
2. **Anthropic API** (`claude-3-5-sonnet`, `claude-3-opus`)
3. **OpenRouter** (Aggregated access to DeepSeek-V3, Llama 3.3, Mistral Large, etc.)
4. **Ollama** (Local self-hosted models: `qwen2.5-coder:32b`, `llama3.3:70b`, `codestral`)

---

## Authentication & Security

- **Zero Hardcoded Keys:** API keys are never embedded in code, configuration files, or trainer outputs.
- **Environment Variables:**
  - `OPENAI_API_KEY`
  - `ANTHROPIC_API_KEY`
  - `OPENROUTER_API_KEY`
  - `OLLAMA_HOST` (Defaults to `http://127.0.0.1:11434`)
- **Telemetry Redaction:** Tracing and SQLite audit logs automatically mask API keys and bearer tokens.

---

## CLI Usage

### 1. Direct Autonomous Run
```bash
# Using OpenAI
cheat-agent run \
  --provider openai \
  --model gpt-4o \
  --goal "Find the ammunition value in target game, build a persistent trainer, and verify across restarts" \
  --max-iterations 30 \
  --max-budget-usd 2.00

# Using Ollama (offline local model)
cheat-agent run \
  --provider ollama \
  --model qwen2.5-coder:32b \
  --goal "Discover player health, resolve multi-level pointer, and generate a verified trainer"
```

### 2. Manual CLI Commands
```bash
# Scan exact value
cheat-agent scan --pid 1234 --type uint32 --exact 100

# Next scan: decreased value
cheat-agent scan --pid 1234 --type uint32 --decreased

# Pointer scan candidate address
cheat-agent pointer-scan --pid 1234 --target 0x00AABBCC --max-depth 4

# Generate C++ trainer
cheat-agent generate --cheat cheat.json --lang cpp --output-dir ./trainer_build

# Verify cheat across target restarts
cheat-agent verify --cheat cheat.json --target-command "./test_game"
```
