# ADR-0002 — Refuse what cannot be decoded; never substitute zeros

- Status: Accepted
- Date: 2026-09-15

## Context

`GGUFLoader.js` handled an unknown quant type by logging a warning and returning
`new Float32Array(n)`. Downstream, that zero-filled array flowed into `Array2D`
and rendered as a clean, symmetric field of points.

Nothing in the visualization distinguishes "these weights are zero" from "we
could not read these weights". A user looking at a `Q4_K` model would have seen
a plausible picture of nothing, with a console warning they had no reason to
open. The same applied to a tensor whose byte range ran past the end of a
truncated file, and to element counts that did not fill whole blocks — where
`Math.floor` quietly dropped the remainder.

This is the worst failure mode a visualization tool can have: it is a tool for
looking at data, and it was willing to show data it did not have.

## Decision

Any condition that prevents a correct decode raises an error naming the tensor
and the reason. No zero-fill, no partial result, no rounding down:

- unsupported quant type -> error naming the type and listing supported ones
- element count not a multiple of the block size -> error
- byte range outside the buffer -> error naming the range and file size
- unknown tensor name -> error listing available names

`loadGGUF` validates every tensor before decoding any, so a whole-file load
cannot produce a partially correct map. `listTensors` reports `supported: false`
rather than omitting the tensor, so a file's contents stay legible even when a
given tensor is not usable — the picker greys those rows and states why.

## Consequences

- Files that previously "worked" now fail. That is the point: they were not
  working, they were rendering zeros.
- The UI has to have somewhere to put an error, which is why PR5 exists.
- Adding support for a type is now a visible change in behaviour rather than a
  silent improvement in output quality.

## Alternatives rejected

- **Zero-fill with a visible watermark.** Still puts fabricated data in the
  scene; the watermark is a second thing to miss.
- **Skip undecodable tensors from the listing.** Hides what the file contains,
  and makes "this model has no tensors" the symptom of an unsupported format.
- **Best-effort partial decode.** A partially correct matrix is harder to
  distinguish from a correct one than an error is.
