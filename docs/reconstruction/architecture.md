# Reconstruction architecture

RE-Agent remains the owner of the reconstruction workflow: provider analysis produces artifact-bound Evidence, the autonomous controller retains observations and hypotheses, and existing process/workspace facilities execute bounded candidate builds and comparisons. CLI, MCP, provider setup, Evidence persistence, and controller checkpoints remain shared platform services.

The `schedule_reconstruction_functions` MCP operation uses a pure domain scheduler over `analyze_function` Evidence. It validates a common artifact and provider identity, forms caller-to-callee edges, groups recursive functions into strongly connected components, and emits dependency-ready components first. A caller is scheduled only when its observed in-scope dependencies have been scheduled. Missing function dossiers are recorded as missing rather than silently treated as non-dependencies. Caller counts provide a deterministic tie-break priority among ready components.

The scheduler does not acquire target execution or filesystem authority. The MCP operation accepts existing Evidence records, records the plan with links to those records, and creates an Unknown when relationship coverage is incomplete. A finite function budget can defer a component; cyclic components are kept together. Attempt counts provide retry eligibility without replacing controller checkpoint state. There is no dedicated CLI command in this change.

Dryxio/ReAgent's dependency-order function picker informed this capability. The implementation is native TypeScript and uses RE-Agent's dossier and Evidence contracts; see [the integration review](../third-party/dryxio-integration.md).
