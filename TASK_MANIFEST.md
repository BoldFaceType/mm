# Task Manifest — GGUF import hardening (PR1–PR5)

- **Repo:** `BoldFaceType/mm`
- **Baseline:** `master` @ `f957768`
- **Date:** 2026-09-15
- **Status:** all five PRs implemented; 42 unit gates + 14 browser gates green
- **Audience:** an agent picking this up cold, or a reviewer checking the claims

Read this top to bottom once. Each task is self-contained: it names the files it
touches, what "done" means, and the exact command that proves it. Do not start a
task before its predecessor's gates are green.

---

## 0. Ground rules

1. **Every claim is a gate.** If it is not asserted by `npm test` or
   `npm run test:browser`, it is not done.
2. **Never widen scope.** A defect outside the five PRs gets a note in
   `docs/adr/`, not a fix in this stack.
3. **Never make a test pass by weakening it.** If a gate fails, the code is
   wrong until proven otherwise.
4. **Reference values are external.** Expected decoder output comes from the
   `gguf` Python package, not from this repo's JavaScript. Do not replace a
   reference vector with the code's own output.
5. **Commit per task**, with the gate result in the message.

### Environment

```
node >= 22            # tests use node --test and module-syntax detection
python3 + pip install gguf numpy      # only to regenerate fixtures
playwright + a chromium build          # only for browser gates
```

### Branch stack

Each branch is cut from the previous one, not from master.

```
master f957768
  └── chore/verification-harness      test harness, fixtures, RED baseline
        └── fix/pr1-gguf-decode       PR1
              └── fix/pr2-numerics    PR2
                    └── perf/pr4-lazy-decode      PR4  (before PR3 — see note)
                          └── feat/pr3-tensor-picker   PR3
                                └── fix/pr5-load-lifecycle  PR5
                                      └── integration/gguf-hardening
```

**Why PR4 precedes PR3 in the stack.** The VCR ranking that produced these five
is about shipping value; the build order is about avoiding rework. PR3's picker
consumes the per-tensor decode API that PR4 introduces. Building PR3 first would
mean writing a whole-file-decode picker and then replacing it. The PR numbers are
kept as ranked.

---

## 1. Task 0 — verification harness

**Branch:** `chore/verification-harness` from `master`
**Touches:** `package.json`, `.github/workflows/verify.yml`, `scripts/check-js-syntax.mjs`,
`tests/helpers/*`, `tests/fixtures/*`

### Steps

1. Add `package.json` with `"type": "module"` and the scripts in the README's
   Development section.
2. Port `scripts/check-js-syntax.mjs` from `feat/vertical-slice-base`.
3. Add `tests/helpers/three-stub.mjs`, `three-hook.mjs`, `register-hooks.mjs` so
   `viz.js` imports under Node without a DOM. Regenerate the stub's export list
   with:
   ```
   grep -ohE "THREE\.[A-Za-z_][A-Za-z0-9_]*" viz.js util.js gui.js index.html \
     | sed 's/THREE\.//' | sort -u
   ```
4. Add `tests/fixtures/make_fixtures.py` and run it. It writes real GGUF files
   plus `expected.json` holding reference dequantized values.
5. Write the gate files for PR1 and PR2 **before** touching production code, and
   record the red baseline.

### Acceptance

| Check | Command | Expected |
| --- | --- | --- |
| Fixtures build | `npm run fixtures` | 6 `.gguf` files + `expected.json` |
| Syntax gate runs | `npm run check:syntax` | passes for 11 files |
| Baseline is red | `npm test` | **5 pass / 12 fail** |
| Failures are real | read the output | every failure names a defect, none is a harness error |

Captured in `verification/gates/00-baseline-master-RED.txt`.

**Stop condition:** if the baseline is not 5/12, the harness is wrong, not the
code. Fix the harness first.

---

## 2. PR1 — correct GGUF decoding, reject undecodable tensors

**Branch:** `fix/pr1-gguf-decode`
**Touches:** `GGUFLoader.js`, `docs/adr/ADR-0003-drop-q8k-decoder.md`
**Gates:** G1.1–G1.4, G2.1–G2.6 in `tests/unit/gguf-decode.test.mjs`,
`tests/unit/gguf-structure.test.mjs`

### The defect

`Q4_0`, `Q4_1`, `Q5_0`, `Q5_1` decoded each 32-element block as interleaved
pairs — byte `j`'s low nibble to output `2j`, high nibble to `2j+1`. llama.cpp
packs them as two halves:

```
ggml-quants.c, dequantize_row_q4_0:
    y[j     ] = ((qs[j] & 0x0F) - 8) * d
    y[j + 16] = ((qs[j] >>   4) - 8) * d
```

`Q5_0`/`Q5_1` additionally read the fifth bit from `qh` bits `2j` and `2j+1`
instead of bits `j` and `j+16`:

```
    xh_0 = ((qh >> j) << 4) & 0x10
    xh_1 =  (qh >> (j + 12)) & 0x10      // bit j+16, shifted to position 4
```

The output was a permutation of the right values — plausible on screen, wrong
everywhere. Separately, any type without a decoder returned `new Float32Array(n)`,
so an undecodable tensor rendered as a clean field of zeros.

### Steps

1. Rewrite the four decoders to the half-block layout above.
2. Replace `Math.floor(n / block)` with exact division; a partial block is a
   malformed tensor, not something to round down.
3. Introduce one `QUANT_SPEC` table keyed by type id holding `{block, type_size,
   decode}`. Dispatch, byte-size arithmetic and the `supported` flag all read
   from it, so a type cannot be half-supported.
4. `tensorByteSize` and `dequantize` throw a named error for an unsupported
   type. Delete the zero-fill fallback.
5. Add `tensorRange()`: compute each tensor's `[start, end)` and throw if it
   exceeds the buffer. `loadGGUF` validates **every** tensor before decoding
   **any**, so a truncated file fails before producing partial output.
6. Extend `listTensors` with `dims`, `rank`, `supported`, `numel`,
   `byteSize`, `decodedBytes`.
7. Remove the `Q8_K` decoder and record ADR-0003.

### Acceptance

| Gate | Asserts |
| --- | --- |
| G1.1 | every fixture tensor is listed with the right quant type and shape |
| G1.2 | decoded values match the reference, worst relative error < 1e-5 |
| G1.3 | no supported tensor decodes to all zeros |
| G1.4 | elements 0, 1, 16, 17 match — the two layouts cannot agree here |
| G2.1 | a `Q4_K` tensor **throws**, naming the type |
| G2.2 | it is still listed, with `supported: false` |
| G2.3 | every supported fixture tensor is `supported: true` |
| G2.4 | a truncated data section throws a bounds error |
| G2.5 | a non-GGUF buffer throws a magic-mismatch error |
| G2.6 | rank-3 tensors report `rank` and full `dims` |

```
npm test       # expect 17 pass / 5 fail — the 5 remaining are PR2's
```

**Do not proceed** while any G1 or G2 gate is red.

---

## 3. PR2 — the two inherited numerical defects

**Branch:** `fix/pr2-numerics`
**Touches:** `viz.js` (two edits, four lines)
**Gates:** G3.1–G3.7 in `tests/unit/numerics.test.mjs`

### The defects

1. `softmax_`'s `row_max` starts at `0`. For a row whose entries are all
   negative the max-subtraction becomes a no-op, every `exp()` underflows, the
   denominator is `0`, and the `NaN` guard writes `0` into every cell.
   `softmax([-1000, -1001])` returned `[0, 0]` instead of `[0.7311, 0.2689]`.
   All-negative attention logit rows hit this routinely.
2. `Array2D.map` allocates `new Float32Array(n)` with `n` never declared, so the
   method throws `ReferenceError` on every call.

### Steps

1. Seed `row_max` with `-Infinity`.
2. Declare `const n = this.h * this.w` at the top of `map`.

That is the whole change. Resist enlarging it.

### Acceptance

| Gate | Asserts |
| --- | --- |
| G3.1 | `softmax([-1000,-1001])` ≈ `[0.7311, 0.2689]` |
| G3.2 | rows sum to 1 across six shapes including all-negative and uniform |
| G3.3 | agrees with the shifted-exponential definition |
| G3.4 | a uniform row is uniform |
| G3.5 | `map` returns the right shape and values |
| G3.6 | `map` does not mutate the source |
| G3.7 | `map` handles the 0-element case |

```
npm test       # expect 17 / 17
```

---

## 4. PR4 — decode only the selected tensor

**Branch:** `perf/pr4-lazy-decode`
**Touches:** `GGUFLoader.js`, `viz.js`, `tests/fixtures/make_fixtures.py`
**Gates:** G4.1–G4.8 in `tests/unit/gguf-lazy.test.mjs`

### The defect

`loadGGUF()` dequantized every tensor and the caller kept one. Decoded Float32
storage is 4 bytes per weight: 7B weights need ~28 GB before the visualization
allocates anything. Selecting a second tensor repeated the whole job, refetching
remote files as it went.

### Steps

1. Add fixtures `mixed.gguf` (one `Q8_0` + one `Q4_K`) and `many.gguf` (24
   tensors); regenerate.
2. Add `openGGUF(buffer)` returning a reusable index: metadata, alignment,
   `data_start`, the `listTensors` output, and a private name→info map.
3. Add `loadTensor(index, name, {maxDecodedBytes})`. It validates the name,
   checks `numel * 4` against the budget **before** allocating, validates that
   one tensor's byte range, and decodes only it.
4. Add `DEFAULT_MAX_DECODED_BYTES = 256 MB`.
5. Add `decodeStats()` / `resetDecodeStats()` counters inside `dequantize`, so
   "decoded exactly one tensor" is assertable rather than asserted by eye.
6. In `viz.js`, keep the index per source in `GGUF_INDEX` and decode through
   `loadTensor`. Export `indexGGUFSource` and `ggufTensorList`.
7. Keep `loadGGUF` exported for tests and small tooling.

### Acceptance

| Gate | Asserts |
| --- | --- |
| G4.1 | `openGGUF` decodes nothing (`tensorsDecoded === 0`) |
| G4.2 | `loadTensor` decodes exactly one tensor and no extra elements |
| G4.3 | a second selection reuses the index, decodes one more |
| G4.4 | values match the reference through the new path too |
| G4.5 | an undecodable tensor does not poison the rest of the file |
| G4.6 | an unknown name throws and lists what is available |
| G4.7 | the budget is enforced before allocation, and the error states the size |
| G4.8 | bounds are validated for the requested tensor |

```
npm test       # expect 25 / 25
```

**Known remaining cost:** the source `ArrayBuffer` is still held whole. Range
reads are a follow-up; the decode-side blowup dominates and is what this fixes.

---

## 5. PR3 — tensor picker and explicit mapping

**Branch:** `feat/pr3-tensor-picker`
**Touches:** `viz.js`, `gui.js`, `index.html`
**Gates:** G5.1–G5.9 in `tests/unit/shape-mapping.test.mjs`, plus browser B2/B3/B4

### The defects

1. Dropping a file set the left operand's source and stopped. The tensor name
   stayed empty, so a fresh configuration could never complete an import from
   the drop alone.
2. Whatever did load was folded in with `data[(i % th) * tw + (j % tw)]`. A
   4096×4096 tensor in a 12×8 matrix showed a tile of itself and looked like
   weights.

### Steps

1. Export `ggufCropInit(tensor, {row0, col0, transpose})` from `viz.js`. It
   returns an init function plus `outOfRange`, `sourceShape`, `viewShape`,
   `origin`. Out-of-range reads return `0` and increment the counter. Origins
   are floored and clamped.
2. Add `gguf_row0`, `gguf_col0`, `gguf_transpose` to `defaultLeft`/`defaultRight`
   and thread them through `gui.js`: `childMat`, the `deleteProps` list, the
   `syncChildParams` `updateProps`, the `init`-change show/hide block, and three
   new controls.
3. Make `registerLocalGGUFBuffer` return the source string `local:<name>`.
4. In `index.html`, add the picker: overlay markup, CSS, and a drop handler that
   indexes the file and opens the picker. Each row shows name, dims, quant type
   and decoded size. `blockedReason(t)` greys a row and states why:
   undecodable type, `rank > 2`, empty.
5. Selecting a row sets the operand, optionally resizes the matrix to the tensor
   (capped at `MAX_MATRIX_DIM = 1024`, via `viz.fixShape` so the shared inner
   dimension stays consistent), and writes a status line naming the region shown.

### Acceptance

| Gate | Asserts |
| --- | --- |
| G5.1 | an exact-fit crop reproduces the tensor |
| G5.2 | a smaller matrix takes the top-left crop, not a fold |
| G5.3 | the origin selects a sub-block |
| G5.4 | reading past the tensor yields 0, never a wrapped value |
| G5.5 | out-of-range reads are counted |
| G5.6 | transpose swaps the axes |
| G5.7 | transpose composes with the origin |
| G5.8 | a negative or fractional origin is clamped |
| G5.9 | the init function exposes `sourceShape` and `origin` |

```
npm test       # expect 34 / 34
```

---

## 6. PR5 — load state and cache lifecycle

**Branch:** `fix/pr5-load-lifecycle`
**Touches:** `viz.js`, `index.html`
**Gates:** G6.1–G6.8 in `tests/unit/load-lifecycle.test.mjs`, plus browser B5

### The defects

1. A pending load rendered placeholder zeros — indistinguishable from a tensor
   that really is zero.
2. Failures reached `console.log` and nothing else.
3. Local buffers were keyed by filename, so dropping a different file under a
   name already in use kept serving the old decoded tensors.
4. A slow load could commit after a newer selection had been made.

### Steps

1. Add `GGUF_STATUS` (`idle`/`loading`/`ready`/`error`), `GGUF_STATE` per cache
   key, `ggufState(source, name)`, and a `gguf-state` event.
2. Guard every event dispatch with `typeof window !== 'undefined'` so the module
   imports under Node.
3. Add `invalidateSource(source)` dropping that source's index, decoded tensors,
   states and in-flight entries. Call it from `registerLocalGGUFBuffer` when the
   bytes differ from what is registered under that name — and only then.
4. Add a monotonic `GGUF_SEQ`. `requestGGUFTensor(source, name)` takes a
   sequence number, resolves (never rejects) with `{status, error, stale}`, and
   only updates shared state when it is still the newest request.
5. On failure, delete the cache entry so the next attempt retries.
6. Add `resetGGUFState()` for tests.
7. In `index.html`, make the picker decode first and rebuild second: `await
   viz.requestGGUFTensor(...)`, return early on `stale`, show the error and
   leave params untouched on `error`, and only then mutate params and call
   `initFromParams()`.
8. Listen for `gguf-state` to surface loads that did not come from the picker.

### Acceptance

| Gate | Asserts |
| --- | --- |
| G6.1 | idle → loading → ready |
| G6.2 | failures land in `error` with a usable message |
| G6.3 | a failed request caches nothing; the next retries |
| G6.4 | replacing a same-named file invalidates index, cache and state |
| G6.5 | re-registering identical bytes does **not** invalidate |
| G6.6 | a superseded in-flight request reports `stale: true` |
| G6.7 | the newest request wins regardless of completion order |
| G6.8 | state is per tensor, not per file |

```
npm test       # expect 42 / 42
```

---

## 7. Browser verification

**Touches:** `tests/browser/*`, one debug handle (`window.__mmviz`) in `index.html`

```
npm run test:browser                                        # after
node tests/browser/run-browser-gates.mjs --observe-only --label before
```

The second command is run from a worktree at `f957768` with `tests/browser` and
`tests/fixtures` copied in. `--observe-only` records without asserting, which is
how the "before" column exists at all — most gates cannot pass on master by
construction.

| Gate | Asserts |
| --- | --- |
| B0.0–B0.3 | the numeric and decoder fixes hold under three.js and the importmap, not only in Node |
| B1.0 | the default scene still renders |
| B2.0–B2.2 | dropping a `.gguf` opens a picker listing real tensors with real dims |
| B3.0–B3.1 | selecting one loads it, closes the picker, and records it in the URL |
| B4.0 | an undecodable tensor is listed, greyed, and states why |
| B5.0 | a failing load produces an error state |
| B6.0 | softmax over all-negative logits renders a distribution |
| B7.0 | no uncaught page errors across the run |

Expect **14 / 14**. Screenshots land in `verification/screenshots/<label>/`.

---

## 8. Integration

```
git checkout -b integration/gguf-hardening fix/pr5-load-lifecycle
npm run verify && npm run test:browser
```

Then update `CHANGELOG.md` and open the five PRs bottom-up, each against its
parent branch, so reviewers see one concern per diff.

---

## 9. Data flow

```
  ┌──────────────┐        ┌──────────────┐        ┌─────────────────┐
  │ dropped file │        │ gguf_url     │        │  ?params=...    │
  │ (DataTransfer)        │ (GUI field)  │        │  (URL state)    │
  └──────┬───────┘        └──────┬───────┘        └────────┬────────┘
         │ FileReader                   │ fetch / HF expand         │
         v                              v                           │
  ┌────────────────────────────────────────────────┐                │
  │ LOCAL_GGUF_BUFFERS[name]  |  response bytes    │                │
  └───────────────────────┬────────────────────────┘                │
                          │  ArrayBuffer                            │
                          v                                         │
                 ┌──────────────────┐                               │
                 │ openGGUF(buffer) │  header + KV + tensor dir     │
                 │  NO WEIGHTS YET  │  -> GGUF_INDEX[source]        │
                 └────────┬─────────┘                               │
                          │ listing: name, dims, rank, quantType,   │
                          │          supported, decodedBytes        │
                          v                                         │
                 ┌──────────────────┐                               │
                 │  tensor picker   │<──── user chooses operand ────┘
                 └────────┬─────────┘      + tensor
                          │ (source, tensorName)
                          v
              ┌───────────────────────────┐
              │ requestGGUFTensor()       │
              │  budget check -> bounds   │
              │  check -> dequantize ONE  │
              └────────┬──────────────────┘
                       │ Float32Array + shape   -> GGUF_CACHE[src:name]
                       v
              ┌───────────────────────────┐
              │ ggufCropInit(tensor, win) │  origin + extent + transpose
              │  outside -> 0, counted    │  (no modulo wrap)
              └────────┬──────────────────┘
                       │ (i, j) -> value
                       v
              ┌───────────────────────────┐
              │ Array2D.fromInit(h, w, f) │ -> epilog (softmax / layernorm)
              └────────┬──────────────────┘
                       v
                   three.js scene
```

## 10. Control flow — one selection

```
  user clicks a picker row
          │
          v
  choose(t) ──────────────────────────────────────────────┐
          │                                               │
          │ status: "decoding <name>..."                  │
          v                                               │
  await requestGGUFTensor(source, name)                   │
          │                                               │
          ├── seq = ++GGUF_SEQ                            │
          ├── cache hit? ──yes──> settle(READY)           │
          │                                               │
          ├── setState(LOADING) ──> 'gguf-state' event ───┤
          │                                               │
          ├── ensureGGUFIndex(source)                     │
          │      └── miss -> fetch/lookup -> openGGUF     │
          │                  -> 'gguf-indexed'            │
          │                                               │
          ├── loadTensor(index, name)                     │
          │      ├── unknown name ──────> throw           │
          │      ├── over budget ───────> throw           │
          │      ├── out of bounds ─────> throw           │
          │      └── dequantize -> GGUF_CACHE[key]        │
          │                                               │
          └── settle(status, error)                       │
                 │                                        │
                 ├── stale = (seq !== GGUF_SEQ)           │
                 ├── if !stale: setState(status)          │
                 └── if READY:  'gguf-loaded' {stale}     │
          │                                               │
          v                                               │
  ┌───────────────┬──────────────────┬──────────────────┐ │
  │ stale         │ error            │ ready            │ │
  ├───────────────┼──────────────────┼──────────────────┤ │
  │ return,       │ show error,      │ set params,      │ │
  │ change        │ params and scene │ resize matrix,   │ │
  │ nothing       │ left untouched   │ initFromParams() │ │
  └───────────────┴──────────────────┴──────────────────┘ │
                                              │            │
                                              └────────────┘
                                             scene rebuilt once,
                                             with data in hand
```

## 11. File ownership

```
GGUFLoader.js   parse, index, decode, validate.       No DOM. No app state.
viz.js          sources, caches, load state, crop.    No DOM except events.
gui.js          lil-gui controls for the params.
index.html      picker UI, drop handling, status line, scene wiring.
tests/unit/     node --test gates G1-G6.
tests/browser/  Playwright gates B0-B7 + screenshots.
tests/fixtures/ GGUF files and reference vectors (generated).
verification/   gate logs, screenshots, before/after index (generated).
docs/adr/       decisions with rejected alternatives.
```

## 12. Definition of done

- [x] `npm run check:syntax` passes
- [x] `npm test` — 42/42
- [x] `npm run test:browser` — 14/14
- [x] before/after screenshots for every UI-visible change
- [x] every decoder value checked against an external reference
- [x] README documents the working import path and the supported formats
- [x] CHANGELOG entry
- [x] ADRs for the decisions that removed or refused something
- [x] one concern per branch, each cut from its predecessor

## 13. Known gaps — deliberately not in this stack

| Gap | Why it is out |
| --- | --- |
| Range reads of the source file | The decode-side blowup dominates; whole-file buffering is the next bottleneck, not this one. |
| K-quant decoders (`Q2_K`–`Q5_K`) | Real work, its own PR. Today they are refused by name, which is correct behaviour. |
| Rank > 2 slicing | Needs a UI for choosing which plane. Listed and refused for now. |
| Camera auto-framing after a resize | Cosmetic. A 4×256 operand loads correctly but sits off-centre. |
| Seeded RNG for the generator inits | Unrelated to GGUF import. |
