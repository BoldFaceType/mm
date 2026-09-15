# ADR-0003 — Remove the Q8_K decoder rather than leave it unverified

- Status: Accepted
- Date: 2026-09-15
- Supersedes: none
- Context branch: `fix/pr1-gguf-decode`

## Context

`GGUFLoader.js` shipped a `dequantizeQ8_K` implementation alongside the other
quant types. Q8_K is a runtime-only ggml type: llama.cpp produces it in memory
as the activation side of a quantized dot product. It is not a storage type and
does not appear in GGUF files.

The reference `gguf` Python package implements neither `quantize` nor
`dequantize` for Q8_K, so no fixture and no reference vector can be produced
for it. A decoder that cannot appear in any input and cannot be tested is
untestable code that still has to be read, maintained, and trusted.

## Decision

Remove the Q8_K branch. Q8_K now falls through to the unsupported-type path and
raises a named error.

## Consequences

- The supported set is exactly what `tests/fixtures/expected.json` verifies:
  F32, F16, Q4_0, Q4_1, Q5_0, Q5_1, Q8_0, Q6_K.
- A hypothetical file carrying a Q8_K tensor now fails loudly instead of
  producing values no one has ever checked. That is the behaviour PR1 adopts
  for every undecodable type.
- If a real Q8_K-bearing file ever turns up, restoring the decoder means
  restoring it *with* a fixture, which is the bar every other type meets.

## Alternatives rejected

- **Keep the decoder, mark it unverified.** Leaves a code path whose
  correctness is asserted by nobody, in a loader whose entire defect class was
  "plausible output from an unchecked path".
- **Keep it and write a hand-rolled fixture.** The expected values would come
  from the same reading of the spec as the implementation, so the test would
  confirm the code agrees with itself.
