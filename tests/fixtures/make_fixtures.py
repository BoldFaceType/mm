#!/usr/bin/env python3
"""
Generate GGUF test fixtures and independent reference dequantization vectors.

Ground truth comes from the official `gguf` Python package (the reference
implementation maintained alongside llama.cpp), NOT from this repo's
JavaScript. The JS decoders are asserted against these vectors, so the
verification is not circular.

Two construction paths, both ending in a reference dequantization:

  quantize path  - real float data -> gguf.quants.quantize -> packed bytes.
                   Used for F32, F16, Q4_0, Q4_1, Q5_0, Q5_1, Q8_0.
  synthesize path- deterministic pseudo-random packed bytes with a valid fp16
                   scale field written in. Used for Q6_K, where the reference
                   package implements dequantize but not quantize.

In both paths the expected values come from gguf.quants.dequantize.

Outputs (written next to this file):
  fixtures.gguf     - real GGUF v3 file, one tensor per supported quant type
  expected.json     - reference dequantized values + tensor metadata
  unsupported.gguf  - only tensor is Q4_K, for the reject-don't-zero-fill gate
  rank3.gguf        - rank-3 and rank-2 tensors, for the shape-handling gate
  truncated.gguf    - fixtures.gguf with the tensor data section cut short,
                      for the bounds-validation gate

Reproduce:
  pip install gguf numpy
  python3 tests/fixtures/make_fixtures.py
"""

from __future__ import annotations

import json
import pathlib
import struct

import numpy as np
from gguf import GGMLQuantizationType as QT
from gguf import GGUFWriter, quants

HERE = pathlib.Path(__file__).resolve().parent

# 256 columns is a multiple of both block sizes in play (32 and 256).
N_COLS = 256
N_ROWS = 4

QUANTIZE_PATH = ["F32", "F16", "Q4_0", "Q4_1", "Q5_0", "Q5_1", "Q8_0"]
SYNTHESIZE_PATH = ["Q6_K"]

# Byte offset and value of the fp16 scale field inside one block, for types
# built by the synthesize path. Only used to keep the scale finite; the
# expected values still come from the reference dequantizer.
SYNTH_SCALE = {
    # Q6_K block is 210 bytes: ql[128] qh[64] scales[16] d(fp16)
    "Q6_K": (208, 0.015625),
}


def source_matrix(seed: int, rows: int = N_ROWS, cols: int = N_COLS) -> np.ndarray:
    """Deterministic, sign-mixed, non-degenerate source values."""
    rng = np.random.default_rng(seed)
    base = rng.standard_normal((rows, cols)).astype(np.float32)
    # Extremes at indices that differ between interleaved and half-block
    # orderings, so an ordering error cannot hide in a narrow value range.
    base[0, 0] = 3.5
    base[0, 1] = -3.5
    base[0, 16] = -2.25
    base[0, 17] = 2.25
    return np.ascontiguousarray(base, dtype=np.float32)


def synthesize_blocks(qtype: QT, shape: tuple[int, int], seed: int) -> np.ndarray:
    """Deterministic packed bytes for a type the reference cannot quantize."""
    byte_shape = quants.quant_shape_to_byte_shape(shape, qtype)
    rng = np.random.default_rng(seed)
    raw = rng.integers(0, 256, size=byte_shape, dtype=np.uint8)

    block_size, type_size = quants.GGML_QUANT_SIZES[qtype]
    scale_off, scale_val = SYNTH_SCALE[qtype.name]
    scale_bytes = np.frombuffer(
        struct.pack("<e", np.float16(scale_val)), dtype=np.uint8
    )
    blocks = raw.reshape(-1, type_size)
    blocks[:, scale_off : scale_off + 2] = scale_bytes
    return blocks.reshape(byte_shape)


def build_main() -> dict:
    writer = GGUFWriter(HERE / "fixtures.gguf", "mm-fixture")
    writer.add_description("mm fork GGUF decoder fixtures")

    expected: dict[str, dict] = {}

    for idx, tname in enumerate(QUANTIZE_PATH + SYNTHESIZE_PATH):
        qtype = QT[tname]
        shape = (N_ROWS, N_COLS)
        name = f"test.{tname.lower()}"

        if tname == "F32":
            raw = source_matrix(1000 + idx)
            ref = raw.astype(np.float32)
            writer.add_tensor(name, raw)
            origin = "quantize"
        elif tname == "F16":
            raw = source_matrix(1000 + idx).astype(np.float16)
            ref = raw.astype(np.float32)
            writer.add_tensor(name, raw)
            origin = "quantize"
        elif tname in QUANTIZE_PATH:
            raw = quants.quantize(source_matrix(1000 + idx), qtype)
            ref = quants.dequantize(raw, qtype).astype(np.float32)
            writer.add_tensor(name, raw, raw_shape=raw.shape, raw_dtype=qtype)
            origin = "quantize"
        else:
            raw = synthesize_blocks(qtype, shape, 2000 + idx)
            ref = quants.dequantize(raw, qtype).astype(np.float32)
            writer.add_tensor(name, raw, raw_shape=raw.shape, raw_dtype=qtype)
            origin = "synthesize"

        assert np.isfinite(ref).all(), f"{tname}: reference output is not finite"

        expected[name] = {
            "quantType": tname,
            "origin": origin,
            # GGUF stores dims innermost-first; the loader reports [rows, cols].
            "shape": [int(shape[0]), int(shape[1])],
            "numel": int(shape[0] * shape[1]),
            "values": [float(v) for v in ref.reshape(-1)],
        }

    writer.write_header_to_file()
    writer.write_kv_data_to_file()
    writer.write_tensors_to_file()
    writer.close()
    return expected


def build_unsupported() -> None:
    """A file whose only tensor uses a quant type the JS loader cannot decode."""
    writer = GGUFWriter(HERE / "unsupported.gguf", "mm-fixture")
    shape = (N_ROWS, N_COLS)
    raw = np.zeros(quants.quant_shape_to_byte_shape(shape, QT.Q4_K), dtype=np.uint8)
    writer.add_tensor("test.q4_k", raw, raw_shape=raw.shape, raw_dtype=QT.Q4_K)
    writer.write_header_to_file()
    writer.write_kv_data_to_file()
    writer.write_tensors_to_file()
    writer.close()


def build_rank3() -> None:
    """A rank-3 F32 tensor, plus a rank-2 companion, for shape-handling gates."""
    writer = GGUFWriter(HERE / "rank3.gguf", "mm-fixture")
    rng = np.random.default_rng(31337)
    writer.add_tensor(
        "test.rank3",
        np.ascontiguousarray(rng.standard_normal((2, 3, 64)).astype(np.float32)),
    )
    writer.add_tensor(
        "test.rank2",
        np.ascontiguousarray(rng.standard_normal((5, 64)).astype(np.float32)),
    )
    writer.write_header_to_file()
    writer.write_kv_data_to_file()
    writer.write_tensors_to_file()
    writer.close()


def build_mixed() -> None:
    """One decodable tensor alongside one the loader cannot decode.

    Whole-file decoding fails on this file entirely. Per-tensor decoding must
    still return the decodable tensor.
    """
    writer = GGUFWriter(HERE / "mixed.gguf", "mm-fixture")
    shape = (N_ROWS, N_COLS)

    good = quants.quantize(source_matrix(4242), QT.Q8_0)
    writer.add_tensor("good.q8_0", good, raw_shape=good.shape, raw_dtype=QT.Q8_0)

    bad = np.zeros(quants.quant_shape_to_byte_shape(shape, QT.Q4_K), dtype=np.uint8)
    writer.add_tensor("bad.q4_k", bad, raw_shape=bad.shape, raw_dtype=QT.Q4_K)

    writer.write_header_to_file()
    writer.write_kv_data_to_file()
    writer.write_tensors_to_file()
    writer.close()

    return {
        "good.q8_0": [
            float(v)
            for v in quants.dequantize(good, QT.Q8_0).astype(np.float32).reshape(-1)
        ]
    }


def build_many() -> None:
    """Many tensors, so a whole-file decode is measurably wasteful."""
    writer = GGUFWriter(HERE / "many.gguf", "mm-fixture")
    for i in range(24):
        raw = quants.quantize(source_matrix(9000 + i, rows=16, cols=256), QT.Q8_0)
        writer.add_tensor(
            f"blk.{i}.weight", raw, raw_shape=raw.shape, raw_dtype=QT.Q8_0
        )
    writer.write_header_to_file()
    writer.write_kv_data_to_file()
    writer.write_tensors_to_file()
    writer.close()


def build_truncated() -> None:
    """fixtures.gguf with the tail of the data section removed."""
    full = (HERE / "fixtures.gguf").read_bytes()
    (HERE / "truncated.gguf").write_bytes(full[: len(full) - 4096])


def main() -> None:
    expected = build_main()
    build_unsupported()
    build_rank3()
    mixed = build_mixed()
    build_many()
    build_truncated()

    meta = {
        "generator": "tests/fixtures/make_fixtures.py",
        "reference": "gguf (PyPI) - llama.cpp reference implementation",
        "rows": N_ROWS,
        "cols": N_COLS,
        "tensors": expected,
        "mixed": mixed,
    }
    (HERE / "expected.json").write_text(json.dumps(meta, indent=1))

    total = sum(len(t["values"]) for t in expected.values())
    print(
        "wrote fixtures.gguf, unsupported.gguf, rank3.gguf, "
        "mixed.gguf, many.gguf, truncated.gguf"
    )
    print(f"wrote expected.json - {len(expected)} tensors, {total} reference values")


if __name__ == "__main__":
    main()
