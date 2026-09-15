# ADR-0001 — Decoder tests assert against an external reference

- Status: Accepted
- Date: 2026-09-15

## Context

The defect that motivated PR1 was a decoder that produced plausible-looking
wrong numbers. A test written from the same reading of the spec as the
implementation would have passed against the broken code: both would have
agreed that byte `j`'s high nibble belongs at output `2j+1`.

Hand-rolled fixtures have the same problem one level down. If the expected
values are computed by the author from the layout they believe is correct, the
test confirms the code agrees with the author, not with llama.cpp.

## Decision

Expected values come from the `gguf` PyPI package — the reference
implementation maintained alongside llama.cpp. `tests/fixtures/make_fixtures.py`
quantizes known float data with `gguf.quants.quantize`, writes real GGUF files
with `GGUFWriter`, and records `gguf.quants.dequantize` output as
`expected.json`. The JavaScript is asserted against that file.

Fixture bytes are committed so the suite runs without Python. Regenerating them
needs `pip install gguf numpy`.

## Consequences

- A decoder can only pass by agreeing with llama.cpp, which is the actual
  contract.
- The supported-type list is bounded by what the reference can produce.
  `Q6_K` has no reference `quantize`, so its fixture is synthesized packed bytes
  with a valid fp16 scale and its expectations still come from the reference
  `dequantize`. This is noted in the generator.
- `Q8_K` has neither, which is one of the reasons it was dropped (ADR-0003).
- Adding a K-quant decoder later means adding its fixture first.

## Alternatives rejected

- **Round-trip tests** (quantize in JS, dequantize in JS, compare to the input).
  Passes for any self-consistent pair of wrong functions.
- **Golden files captured from the current implementation.** Freezes the defect.
- **Comparing against a second JS implementation.** Two readings of the same
  spec by the same author is one reading.
