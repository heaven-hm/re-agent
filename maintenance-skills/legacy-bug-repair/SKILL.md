---
name: legacy-bug-repair
description: Reproduce a real legacy defect and repair a separately owned candidate with regression evidence.
---

# Legacy Bug Repair

Start with a target-scoped, reproducible failure and preserve original executable identity, input artifacts, environment and failing observation. Form a hypothesis from static/runtime evidence, implement the smallest appropriate change in a separately controlled and authorized candidate, and run the same scenario on the original and candidate. Require a negative test that detects the original defect and a passing regression for the repair. Do not silently modify the reference binary, normalize away crashes, infer success from compilation alone, or expand the declared scope. Preserve failed attempts, counterexamples, cleanup failures and unsupported observations.
