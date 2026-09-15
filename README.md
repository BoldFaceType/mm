# mm

Matmul visualizations in 3D.

[Tool](https://bhosmer.github.io/mm) ·
[Reference](https://bhosmer.github.io/mm/ref.html)

Notes
* [Inside the Matrix: Visualizing matrix multiplications, Transformer Attention and Beyond](https://bhosmer.github.io/mm/intro/) ([slides](https://docs.google.com/presentation/d/19eaLLrANCHbPyuC26-z3GzgjCkRcYB1sFndf0jZ-lTg))

Examples
* [GPT2 attention head explorer](https://bhosmer.github.io/mm/examples/attngpt2)

---

## This fork

Adds GGUF import: load real model weights into either operand of a matmul and
look at them. Upstream `mm` initializes operands from generators, a CSV URL, or
a JavaScript expression; this fork adds a fourth source.

Everything below documents that path.

---

## Importing weights from a GGUF file

### The working path, end to end

1. **Drag a `.gguf` file onto the page.** The file is read in the browser and
   indexed — header, metadata and tensor directory only. No weights are decoded
   yet, so this is fast even for a large file.
2. **A picker opens** listing every tensor in the file: name, 2D shape, quant
   type, and how much Float32 memory decoding it would take. Filter by name if
   the list is long.
   * Tensors that cannot be mapped are shown greyed with the reason: an
     undecodable quant type, a rank above 2, or an empty tensor. They are still
     listed, so you can see what the file contains.
3. **Choose which operand** the tensor goes into — left (L) or right (R).
4. **Click a tensor.** It is decoded, then the scene is rebuilt. With *resize
   matrix to tensor* ticked (the default) the operand takes the tensor's shape,
   capped at 1024 per side.
5. **Adjust the window** in the GUI under that operand:
   * `gguf_row0`, `gguf_col0` — top-left corner of the region shown.
   * `gguf_transpose` — swap the tensor's axes before windowing.
   * `h`, `w` — how much of it to show.

The selection is captured in the URL along with the rest of the configuration,
so a view can be shared or reloaded. The bytes are not: a dropped file has to be
dropped again in a new session.

### Loading from a URL instead

Set an operand's `init` to `gguf` and fill in `gguf_url`:

| Form | Example |
| --- | --- |
| Hugging Face shorthand | `TheBloke/Llama-2-7B-GGUF/llama-2-7b.Q4_0.gguf` |
| Full URL | `https://example.com/model.gguf` |
| Dropped file | `local:model.gguf` (set for you by the drop) |

Shorthand expands to `https://huggingface.co/<owner>/<repo>/resolve/main/<path>`.
Remote loads need CORS to allow the request, and the whole file is fetched.

Then set `gguf_tensor` to a tensor name. The drop-and-pick flow above is the
easier route; this one exists for URLs and for restoring a shared link.

### What the window does, and does not, do

The operand is a window onto the tensor: origin `(gguf_row0, gguf_col0)`, extent
`(h, w)`, optionally transposed first. Positions outside the tensor read **0**
and are counted — they are never wrapped around. A 4096×4096 tensor in a 12×8
matrix shows its top-left 12×8 corner, and the status line says so.

Rank-3 and higher tensors are listed with their full dims but cannot be selected
yet. Slicing them is not implemented.

### Supported quantization formats

Decoded, and verified element-for-element against the reference implementation
in the [`gguf`](https://pypi.org/project/gguf/) Python package:

| Type | Block | Bytes/block |
| --- | --- | --- |
| `F32` | — | 4/element |
| `F16` | — | 2/element |
| `Q4_0` | 32 | 18 |
| `Q4_1` | 32 | 20 |
| `Q5_0` | 32 | 22 |
| `Q5_1` | 32 | 24 |
| `Q8_0` | 32 | 34 |
| `Q6_K` | 256 | 210 |

**Everything else is rejected with a named error** — including the common
K-quants `Q2_K`, `Q3_K`, `Q4_K` and `Q5_K`. A tensor the loader cannot decode is
never filled with zeros, because a zero-filled tensor is indistinguishable from
real data once it reaches the visualization. `Q8_K` is deliberately not
supported; see [ADR-0003](docs/adr/ADR-0003-drop-q8k-decoder.md).

`Q4_K_M`, `Q5_K_M` and similar file names mean the file's tensors are mostly
K-quants. Those files will list fine and mostly refuse to load. Use a `Q4_0`,
`Q8_0` or `F16` build.

### Limits

| Limit | Value | Why |
| --- | --- | --- |
| Decoded size per tensor | 256 MB | Checked before allocation; a larger tensor is refused by name and size. |
| Matrix dimension | 1024 | The `h`/`w` GUI range. Bigger tensors are windowed. |
| Source file | held whole in memory | Only the selected tensor is *decoded*; the file itself is not read by range. |

Decoded storage is 4 bytes per weight regardless of the quantization on disk.

---

## Development

```
npm run check:syntax     # parse every JS file
npm test                 # 42 unit gates (Node, no browser)
npm run test:browser     # 14 browser gates + screenshots
npm run verify           # syntax + unit
npm run fixtures         # regenerate GGUF fixtures and reference vectors
```

Unit tests run under `node --test`. `tests/helpers/three-hook.mjs` substitutes a
stub for three.js so `viz.js` can be imported without a DOM; no production
source is modified to make it testable.

Fixtures are real GGUF files built by `tests/fixtures/make_fixtures.py`, with
expected values taken from the `gguf` Python package rather than from this
repo's JavaScript — the decoder tests are not circular. Regenerating needs
`pip install gguf numpy`.

Browser gates need Playwright and a Chromium build; set `PLAYWRIGHT_EXECUTABLE`
if the installed Playwright and the available browser build disagree.

Verification artifacts, including before/after screenshots, are in
[`verification/`](verification/README.md).
Architecture decisions are in [`docs/adr/`](docs/adr/).
The per-PR implementation plan is in [`TASK_MANIFEST.md`](TASK_MANIFEST.md).
