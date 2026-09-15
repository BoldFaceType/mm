# Changelog

All notable changes to this fork. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased] — 2026-09-15

GGUF import hardening. Five changes, each on its own branch, stacked from
`master` @ `f957768`. See [TASK_MANIFEST.md](TASK_MANIFEST.md).

### Fixed

- **GGUF block element ordering.** `Q4_0`, `Q4_1`, `Q5_0` and `Q5_1` decoded
  each 32-element block as interleaved `(2j, 2j+1)` pairs. llama.cpp packs them
  as two halves — low nibble of byte `j` is element `j`, high nibble is element
  `j+16`. `Q5_0`/`Q5_1` also read the fifth bit from the wrong `qh` bits. Output
  was a permutation of the correct values, plausible on screen and wrong
  everywhere. Now verified element-for-element against the `gguf` Python
  package. (PR1)
- **Undecodable tensors returned zeros.** Any quant type without a decoder
  produced `new Float32Array(n)`, indistinguishable from real data in the
  visualization. Unsupported types now throw a named error. (PR1)
- **No bounds validation.** Tensor byte ranges are now checked against the file
  length, and `loadGGUF` validates every tensor before decoding any, so a
  truncated file fails before producing partial output. (PR1)
- **softmax collapsed on all-negative rows.** `row_max` started at `0`, making
  the max-subtraction a no-op; every `exp()` underflowed and the row was written
  out as zeros. `softmax([-1000, -1001])` returned `[0, 0]`. (PR2)
- **`Array2D.map` always threw.** It allocated `new Float32Array(n)` with `n`
  undeclared. (PR2)
- **Dropping a file could not complete an import.** The drop set the left
  operand's source but never a tensor name, so a fresh configuration had nothing
  to load. (PR3)
- **Loaded tensors were folded in with modulo indexing.** A tensor larger than
  the matrix showed a wrapped tile of itself. Mapping is now an explicit window;
  out-of-range positions read 0 and are counted. (PR3)
- **Whole-file decoding.** Every tensor was dequantized so the caller could keep
  one — 4 bytes per weight, ~28 GB for a 7B model, repeated on every new
  selection. Files are now indexed once and decoded per tensor. (PR4)
- **Silent load failures and placeholder zeros.** Pending loads rendered zeros
  into the scene and failures reached the console only. Loads now carry explicit
  states and the scene is rebuilt only once data is in hand. (PR5)
- **Stale cache on file replacement.** Local buffers were keyed by filename, so
  a new file with an old name kept serving the previous file's decoded tensors.
  (PR5)
- **Stale completions.** A slow load could commit after a newer selection.
  Requests now report themselves superseded. (PR5)

### Added

- Tensor picker on file drop: every tensor with name, dims, quant type and
  decoded size; undecodable and rank > 2 tensors listed with the reason. (PR3)
- `gguf_row0`, `gguf_col0`, `gguf_transpose` operand controls. (PR3)
- `openGGUF()`, `loadTensor()`, `DEFAULT_MAX_DECODED_BYTES`, `isSupportedType()`,
  `SUPPORTED_TYPE_NAMES`, `decodeStats()` in `GGUFLoader.js`. (PR1, PR4)
- `GGUF_STATUS`, `ggufState()`, `requestGGUFTensor()`, `indexGGUFSource()`,
  `ggufTensorList()`, `ggufCropInit()` in `viz.js`. (PR3, PR4, PR5)
- Verification harness: 42 `node --test` gates, 14 Playwright browser gates,
  GGUF fixtures with reference vectors from the `gguf` Python package, and
  before/after screenshots in `verification/`.
- `docs/adr/` — ADR-0001 through ADR-0003.

### Removed

- `Q8_K` decoder. It is a runtime-only ggml type that does not appear in GGUF
  files and cannot be verified against any reference. See
  [ADR-0003](docs/adr/ADR-0003-drop-q8k-decoder.md).

### Notes

- Decoded-size budget per tensor defaults to 256 MB.
- The source file is still held whole in memory; only decoding is per tensor.
