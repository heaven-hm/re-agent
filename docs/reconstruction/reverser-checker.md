# Reconstruction roles and evidence

RE-Agent's existing autonomous controller and provider architecture remain authoritative. A reconstruction candidate is a hypothesis to test, not a verified fact. Model output or a checker approval cannot substitute for measured original/candidate behavior, structural Evidence, or an explicitly scoped proof.

Dryxio/ReAgent has separate reverser and checker prompts and supports different provider configuration. RE-Agent's existing integration already separates coding-agent/provider calls from deterministic evidence and execution checks, but this change does not add a new universal per-function reverser/checker loop. For general native function reconstruction, independent model-checker coverage remains an open capability rather than an implied guarantee.

The new scheduler only prioritizes function dossiers and carries their Evidence IDs, incomplete-coverage limitations, missing dossiers, and retry disposition forward. It makes no model calls and grants no approval.
