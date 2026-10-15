---
layout: home

hero:
  name: RE-Agent
  text: Legacy Software Maintenance & Reverse Engineering
  tagline: Evidence-driven static, runtime, and memory investigation for authorized application and game compatibility work.
  actions:
    - theme: brand
      text: Install and configure
      link: /installation
    - theme: alt
      text: Source repository
      link: https://github.com/heaven-hm/re-agent

features:
  - title: Diagnose unsupported applications
    details: Bind original binary identity, reproduce failures, and preserve scoped runtime and static evidence.
    link: /legacy-maintenance
  - title: Investigate native programs
    details: Use supported Ghidra, IDA, Hopper, and runtime provider integrations without conflating available tools with verified target coverage.
    link: /native-investigation
  - title: Validate independent ports
    details: Compare original and candidate executions with explicit assumptions, limitations, and reproducible test scenarios.
    link: /autonomous-reconstruction-benchmark
---

## Start with an authorized target

```bash
git clone https://github.com/heaven-hm/re-agent.git
cd re-agent
npm ci
npm run build:cached
node scripts/rea.mjs --help
node scripts/rea.mjs maintenance-skills
```

Configure the [CLI and MCP host](./installation.md). For maintenance planning and bounded repair workflows, see [legacy maintenance](./legacy-maintenance.md).

## Documented investigation

**Project I.G.I. 2 GConv / QVM (Windows PE32)** — [static binary inventory, independent QVM tooling and measured limitations](../benchmarks/native-windows-ports/gconv/README.md). This is a partial investigation, **not** a verified complete application or game port.

The [benchmark archive](../benchmarks/README.md) contains small validation fixtures, managed examples and partial open-source reconstructions. They are engineering tests and must not be described as completed preservation projects.

## Engineering references

- [Native investigation](./native-investigation.md)
- [Runtime instrumentation](./frida-instrumentation.md)
- [Legacy maintenance](./legacy-maintenance.md)
- [Autonomous investigation](./autonomous-reconstruction.md)
- [Differential and reconstruction verification](./autonomous-reconstruction-benchmark.md)
- [Binary and evidence contracts](./mcp-contracts.md)
- [Game behavior verification](./game-behavior-verification.md)
- [Testing and reproducibility](./testing.md)

No whole-program equivalence, broad Windows execution coverage, or complete legacy-port success is implied by the existence of a provider or a passing finite fixture.
