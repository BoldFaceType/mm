# MM Spec Traceability Matrix

Scope: trace current implementation against the MM planning docs summarized in `MM_MANIFEST.md`.

Legend: `Done` = implemented and wired, `Partial` = scaffolded/foundation present, `Missing` = not implemented.

| Spec Area                              | Source                    | Status  | Evidence                                                                          | Next Action                                                                   |
| -------------------------------------- | ------------------------- | ------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Vertical-slice architecture boundaries | Conceptual AST, File Tree | Partial | Slice branches/worktrees + contract docs per slice; orchestrator + board protocol | Merge slice contracts/tests into `feat/vertical-slice-base` in order          |
| URL state and message protocol         | Data/Control flow docs    | Partial | `src/app/url-state.js` in slice branch, plus `URL_STATE_CONTRACT.md` and tests    | Merge URL-state slice and add schema validation for incoming message payloads |
| Runtime shell lifecycle ownership      | Control flow docs         | Partial | `RUNTIME_SHELL_CONTRACT.md`, extracted runtime entrypoint in slice branch         | Merge runtime-shell slice; add smoke browser test                             |
| UI control composition contract        | Conceptual/File Tree docs | Partial | `src/app/ui-controls.js`, `UI_CONTROLS_CONTRACT.md`, contract test                | Merge ui-controls slice                                                       |
| Visualization object lifecycle         | viz_js doc                | Partial | `src/app/visualization-runtime.js`, `VISUALIZATION_CONTRACT.md`, unit test        | Merge visualization slice; add perf baseline test                             |
| Data loader modularization             | GGUFLoader/Data flow docs | Partial | `src/data/url-data-loader.js`, `DATA_LOADING_CONTRACT.md`, unit test              | Add `DataManager` abstraction and merge data-loading slice                    |
| Simulation runtime contract            | PRD + Control flow docs   | Partial | `src/app/simulation-runtime.js`, `SIMULATION_CONTRACT.md`, unit test              | Merge simulation slice; extend step semantics tests                           |
| GGUF model loading                     | GGUFLoader doc + PRD      | Missing | No production `GGUFLoader` module in integration branch                           | Implement minimal GGUF MVP (metadata + limited tensor types)                  |
| Quantization-aware labeling            | viz_js doc                | Missing | No end-to-end quantization metadata flow to legends in integration branch         | Add tensor metadata propagation and legend formatting                         |
| SimulationEngine abstraction           | PRD + diagrams            | Missing | No explicit SimulationEngine module boundary in integration branch                | Promote simulation slice into dedicated engine API                            |
| CI/CD quality gates for parallel work  | Process requirement       | Done    | `.github/workflows/slice-governance.yml`, board/syntax/type/test/format checks    | Keep adding slice-level tests                                                 |
| Git-backed orchestration               | Process requirement       | Done    | `ORCHESTRATOR.md`, `AGENT_BOARD.jsonl`, `manifest_slices.md`, validator scripts   | Maintain heartbeat/lease discipline                                           |

## AST Status

- Implemented: minimal expression AST parser at `src/expr/expression-ast.js`.
- Current usage: expression parsing path in `viz.js` now uses `parseExpressionAst(...)` instead of eval-based parsing.
- Tests: `tests/expr/expression-ast.test.mjs`.

## When to Implement Full AST

Implement full AST only when all three conditions are true:

1. GGUF MVP is merged and expression trees must carry tensor metadata/shape constraints.
2. SimulationEngine API is stable enough to consume typed node kinds beyond simple `Mat`/`MatMul`.
3. At least two upcoming features require AST transforms (for example: graph optimizations, operator fusion, or serialization).

Until then, keep the expression AST minimal and focused on correctness + compatibility.
