// --- START OF GGUFLoader.js ---
"use strict";
// --- Constants ---
// GGUF files start with this magic number (ASCII "GGUF") to identify the format.
// Read as little-endian.
const GGUF_MAGIC = 0x46554747;
// Default alignment for GGUF data sections if not specified in metadata.
// Tensor data offsets are aligned to this boundary.
const GGUF_DEFAULT_ALIGNMENT = 32;
// Enum representing the types of values that can be stored in the GGUF metadata section.
// Based on the GGUF specification.
const GGUF_VALUE_TYPE = {
  UINT8: 0,
  INT8: 1,
  UINT16: 2,
  INT16: 3,
  UINT32: 4,
  INT32: 5,
  FLOAT32: 6,
  BOOL: 7,
  STRING: 8,
  ARRAY: 9,
  UINT64: 10,
  INT64: 11,
  FLOAT64: 12,
};
// Enum representing the quantization types for tensors, based on GGML library conventions.
// These values determine how tensor data is stored and needs to be dequantized.
// Add more types here if needed, mapping to their corresponding integer values.
const GGML_TYPE = {
  F32: 0,
  F16: 1,
  Q4_0: 2,
  Q4_1: 3, // Q4_1 often unsupported, Q4_2 deprecated
  Q5_0: 6,
  Q5_1: 7,
  Q8_0: 8,
  Q8_1: 9,
  Q2_K: 10,
  Q3_K: 11,
  Q4_K: 12,
  Q5_K: 13,
  Q6_K: 14,
  Q8_K: 15,
  I8: 16,
  I16: 17,
  I32: 18,
  COUNT: 19,
};
// Creates a reverse mapping { 0: "F32", 1: "F16", ... } for easy lookup of type names.
const GGML_TYPE_NAMES = Object.fromEntries(
  Object.entries(GGML_TYPE).map(([key, value]) => [value, key]),
);
// --- FP16 Helper ---
/**
 * Converts a 16-bit unsigned integer (representing IEEE 754 half-precision bits)
 * into a standard JavaScript 32-bit floating-point number.
 * @param {number} h - The 16-bit unsigned integer representing the FP16 value.
 * @returns {number} The corresponding 32-bit float value.
 */
function fp16ToFp32(h) {
  const s = (h & 0x8000) >> 15; // Extract sign bit (bit 15)
  const e = (h & 0x7c00) >> 10; // Extract exponent bits (bits 10-14)
  const f = h & 0x03ff; // Extract fraction bits (bits 0-9)
  // Handle special cases based on exponent value
  if (e === 0) {
    // Denormalized number or zero
    // Calculate value: (-1)^s * 2^(-14) * (f / 2^10)
    return (s ? -1 : 1) * Math.pow(2, -14) * (f / Math.pow(2, 10));
  } else if (e === 0x1f) {
    // Exponent bits are all 1s: Infinity or NaN
    // If fraction is non-zero, it's NaN; otherwise, it's +/- Infinity
    return f ? NaN : (s ? -1 : 1) * Infinity;
  }
  // Normalized number
  // Calculate value: (-1)^s * 2^(e-15) * (1 + f / 2^10)
  return (s ? -1 : 1) * Math.pow(2, e - 15) * (1 + f / Math.pow(2, 10));
}
// --- Dequantization Stubs/Implementations ---
// IMPORTANT: These functions need proper implementations based on the ggml library's
// dequantization logic for each specific type (e.g., Q4_K_M involves scales, mins, etc.).
// Providing stubs with warnings for now.
function dequantize_Q4_K_M(buffer, numElements, shape) {
  console.warn("Dequantization for Q4_K_M not implemented.");
  return null;
}
function dequantize_Q8_0(buffer, numElements, shape) {
  console.warn("Dequantization for Q8_0 not implemented.");
  return null;
}
// ... add functions for other Q_ types as needed ...
/**
 * Central function to handle dequantization or conversion of raw tensor data.
 * @param {ArrayBuffer} buffer - The raw byte buffer for the tensor's data.
 * @param {number} typeEnum - The GGML_TYPE enum value indicating the quantization type.
 * @param {number} numElements - The total number of elements in the tensor.
 * @param {number[]} shape - The dimensions of the tensor.
 * @returns {{ data: Float32Array | null, typeName: string }} Object containing the dequantized data
 *          as Float32Array (or null on failure/unsupported type) and the original type name.
 */
function dequantizeTensorData(buffer, typeEnum, numElements, shape) {
  const typeName = GGML_TYPE_NAMES[typeEnum] || `UNKNOWN(${typeEnum})`;
  console.log(
    `Attempting Dequantization: type ${typeName}, ${numElements} elements, buffer size ${buffer.byteLength} bytes.`,
  );
  try {
    if (typeEnum === GGML_TYPE.F32) {
      // FP32: Data is already in the target format. Ensure size matches.
      if (buffer.byteLength !== numElements * 4) {
        throw new Error(
          `F32 buffer size mismatch. Expected ${numElements * 4}, got ${buffer.byteLength}`,
        );
      }
      // Return a *copy* of the buffer data as Float32Array.
      return { data: new Float32Array(buffer.slice(0)), typeName: "FP32" };
    } else if (typeEnum === GGML_TYPE.F16) {
      // FP16: Convert each 16-bit value to 32-bit float. Ensure size matches.
      if (buffer.byteLength !== numElements * 2) {
        throw new Error(
          `F16 buffer size mismatch. Expected ${numElements * 2}, got ${buffer.byteLength}`,
        );
      }
      const dataView = new DataView(buffer);
      const floatArray = new Float32Array(numElements);
      for (let i = 0; i < numElements; i++) {
        // Convert using helper, assuming little-endian byte order (standard for GGUF)
        floatArray[i] = fp16ToFp32(dataView.getUint16(i * 2, true));
      }
      return { data: floatArray, typeName: "FP16" };
    }
    // --- Placeholder calls for other dequantization types ---
    else if (typeEnum === GGML_TYPE.Q4_K_M) {
      return { data: dequantize_Q4_K_M(buffer, numElements, shape), typeName }; // Use specific dequant func
    } else if (typeEnum === GGML_TYPE.Q8_0) {
      return { data: dequantize_Q8_0(buffer, numElements, shape), typeName }; // Use specific dequant func
    }
    // ... Add other else if blocks for implemented quantization types ...
    else {
      // If the type is not supported, log an error and return null data.
      console.error(
        `Unsupported GGML tensor type for dequantization: ${typeName}`,
      );
      return { data: null, typeName };
    }
  } catch (error) {
    console.error(`Error during dequantization for type ${typeName}:`, error);
    return { data: null, typeName }; // Return null on any error during processing
  }
}
// --- GGUFLoader Class ---
export class GGUFLoader {
  /**
   * Initializes the loader state variables.
   */
  constructor() {
    this.arrayBuffer = null; // Stores the entire GGUF file content
    this.dataView = null; // Provides methods to read binary data from the buffer
    this.offset = 0; // Current reading position within the buffer
    this.metadata = new Map(); // Stores parsed key-value metadata pairs
    // Stores information about each tensor found in the file:
    // { name: string, shape: number[], typeEnum: number, typeName: string, byteOffset: number, sizeInBytes: number, numElements: number }
    this.tensorInfos = [];
    this.version = 0; // GGUF file format version
    this.dataSectionStartOffset = 0; // Byte offset where the actual tensor data begins (after alignment)
  }
  // --- Private Binary Reading Methods ---
  // These methods read specific data types from the current offset and advance it.
  // Assume little-endian byte order as per GGUF standard.
  _readUint32() {
    const val = this.dataView.getUint32(this.offset, true);
    this.offset += 4;
    return val;
  }
  _readUint64() {
    const val = this.dataView.getBigUint64(this.offset, true);
    this.offset += 8;
    return val;
  } // Returns BigInt
  _readFloat32() {
    const val = this.dataView.getFloat32(this.offset, true);
    this.offset += 4;
    return val;
  }
  _readFloat64() {
    const val = this.dataView.getFloat64(this.offset, true);
    this.offset += 8;
    return val;
  }
  _readBoolean() {
    const val = this.dataView.getUint8(this.offset) !== 0;
    this.offset += 1;
    return val;
  }
  /** Reads a GGUF string (uint64 length followed by UTF-8 bytes). */
  _readString() {
    const len = Number(this._readUint64()); // Length prefix is 64-bit
    if (this.offset + len > this.dataView.byteLength) {
      throw new Error(
        `String length (${len}) exceeds buffer bounds at offset ${this.offset}.`,
      );
    }
    const bytes = new Uint8Array(this.arrayBuffer, this.offset, len);
    this.offset += len;
    return new TextDecoder().decode(bytes); // Decode bytes as UTF-8
  }
  /** Reads a value whose type is determined by the next uint32 in the buffer. */
  _readValue() {
    const type = this._readUint32(); // First, read the type identifier
    switch (type) {
      // Read corresponding data type based on the identifier
      case GGUF_VALUE_TYPE.UINT8: {
        const v = this.dataView.getUint8(this.offset);
        this.offset += 1;
        return v;
      }
      case GGUF_VALUE_TYPE.INT8: {
        const v = this.dataView.getInt8(this.offset);
        this.offset += 1;
        return v;
      }
      case GGUF_VALUE_TYPE.UINT16: {
        const v = this.dataView.getUint16(this.offset, true);
        this.offset += 2;
        return v;
      }
      case GGUF_VALUE_TYPE.INT16: {
        const v = this.dataView.getInt16(this.offset, true);
        this.offset += 2;
        return v;
      }
      case GGUF_VALUE_TYPE.UINT32:
        return this._readUint32();
      case GGUF_VALUE_TYPE.INT32: {
        const v = this.dataView.getInt32(this.offset, true);
        this.offset += 4;
        return v;
      }
      case GGUF_VALUE_TYPE.FLOAT32:
        return this._readFloat32();
      case GGUF_VALUE_TYPE.BOOL:
        return this._readBoolean();
      case GGUF_VALUE_TYPE.STRING:
        return this._readString();
      case GGUF_VALUE_TYPE.UINT64:
        return this._readUint64(); // Returns BigInt
      case GGUF_VALUE_TYPE.INT64: {
        const v = this.dataView.getBigInt64(this.offset, true);
        this.offset += 8;
        return v;
      } // Returns BigInt
      case GGUF_VALUE_TYPE.FLOAT64:
        return this._readFloat64();
      case GGUF_VALUE_TYPE.ARRAY: {
        // Array reading is complex: reads element type, length, then elements.
        const arrayType = this._readUint32();
        const arrayLen = Number(this._readUint64());
        const arr = [];
        console.warn(
          "Reading ARRAY values is complex and potentially inaccurate in this simplified parser.",
        );
        // This simplified loop assumes fixed-size, non-nested types.
        // A robust implementation needs to handle nested arrays and strings properly.
        for (let i = 0; i < arrayLen; i++) {
          // Manually read based on simple types for this example
          if (arrayType === GGUF_VALUE_TYPE.FLOAT32)
            arr.push(this._readFloat32());
          else if (arrayType === GGUF_VALUE_TYPE.UINT32)
            arr.push(this._readUint32());
          // Add other simple, fixed-size types as needed
          else {
            throw new Error(
              `Cannot read array of complex/unsupported type ${arrayType} in this simplified parser.`,
            );
          }
        }
        return arr;
      }
      default:
        throw new Error(
          `Unknown GGUF metadata value type encountered: ${type}`,
        );
    }
  }
  /** Helper to estimate the byte size of metadata types (inaccurate for string/array). */
  _getTypeSize(type) {
    switch (type) {
      case GGUF_VALUE_TYPE.UINT8:
      case GGUF_VALUE_TYPE.INT8:
      case GGUF_VALUE_TYPE.BOOL:
        return 1;
      case GGUF_VALUE_TYPE.UINT16:
      case GGUF_VALUE_TYPE.INT16:
        return 2;
      case GGUF_VALUE_TYPE.UINT32:
      case GGUF_VALUE_TYPE.INT32:
      case GGUF_VALUE_TYPE.FLOAT32:
        return 4;
      case GGUF_VALUE_TYPE.UINT64:
      case GGUF_VALUE_TYPE.INT64:
      case GGUF_VALUE_TYPE.FLOAT64:
        return 8;
      default:
        console.warn(`Cannot determine size for metadata type ${type}`);
        return 0; // String/Array size varies
    }
  }
  // --- GGUF Parsing Methods ---
  /** Parses the GGUF header (magic number, version, counts). */
  _parseHeader() {
    const magic = this.dataView.getUint32(this.offset, true);
    this.offset += 4;
    if (magic !== GGUF_MAGIC) {
      throw new Error(
        `Invalid GGUF magic number. Expected 0x${GGUF_MAGIC.toString(16)}, got 0x${magic.toString(16)}`,
      );
    }
    this.version = this._readUint32();
    if (this.version < 2 || this.version > 3) {
      // Currently supporting V2/V3
      console.warn(
        `Potentially unsupported GGUF version: ${this.version}. Parsing may fail or be incomplete.`,
      );
    }
    this.tensorCount = Number(this._readUint64()); // Convert BigInt to Number
    this.metadataKvCount = Number(this._readUint64()); // Convert BigInt to Number
    console.log(
      `GGUF Header Parsed: Version=${this.version}, Tensors=${this.tensorCount}, Metadata=${this.metadataKvCount}`,
    );
  }
  /** Parses the metadata key-value pairs section. */
  _parseMetadata() {
    console.log("Parsing metadata section...");
    for (let i = 0; i < this.metadataKvCount; i++) {
      try {
        const key = this._readString();
        const value = this._readValue(); // Reads type code then the value itself
        this.metadata.set(key, value);
      } catch (e) {
        console.error(`Error reading metadata item ${i}:`, e);
        throw new Error(
          `Failed during metadata parsing at item ${i}. File might be corrupt or unsupported.`,
        );
      }
    }
    console.log(`Parsed ${this.metadata.size} metadata key-value pairs.`);
  }
  /** Parses the tensor information section (name, shape, type, offset for each tensor). */
  _parseTensorInfos() {
    console.log("Parsing tensor info section...");
    this.tensorInfos = []; // Reset tensor info array
    // Determine data alignment from metadata, default if not present
    let alignment = GGUF_DEFAULT_ALIGNMENT;
    const alignmentMeta = this.metadata.get("general.alignment");
    if (
      typeof alignmentMeta === "number" ||
      typeof alignmentMeta === "bigint"
    ) {
      alignment = Number(alignmentMeta) > 0 ? Number(alignmentMeta) : alignment;
    }
    console.log(`Using data alignment: ${alignment}`);
    // Loop through the number of tensors specified in the header
    for (let i = 0; i < this.tensorCount; i++) {
      try {
        const name = this._readString(); // Read tensor name
        const nDims = this._readUint32(); // Read number of dimensions
        const ggufShape = []; // Array to store dimensions as read from file
        let numElements = 1;
        for (let d = 0; d < nDims; d++) {
          const dim = Number(this._readUint64()); // Read dimension size (uint64)
          ggufShape.push(dim);
          numElements *= dim; // Calculate total number of elements
        }
        // GGUF often stores dimensions in reverse order (e.g., [cols, rows] for 2D)
        // Reverse it for a more conventional user-facing order [rows, cols, ...]
        const userShape = [...ggufShape].reverse();
        const typeEnum = this._readUint32(); // Read the GGML tensor type enum value
        const byteOffset = Number(this._readUint64()); // Read the offset (relative to data section start)
        // Calculate the *approximate* size of this tensor's data in bytes.
        // This is difficult for quantized types without ggml library logic.
        let sizeInBytes = this._calculateTensorSizeApprox(
          typeEnum,
          numElements,
          name,
        );
        const tensorInfo = {
          name: name,
          shape: userShape, // User-friendly shape order
          typeEnum: typeEnum,
          typeName: GGML_TYPE_NAMES[typeEnum] || `UNKNOWN(${typeEnum})`,
          numElements: numElements,
          byteOffset: byteOffset, // Offset from the start of the (aligned) data section
          sizeInBytes: sizeInBytes, // Approximate size
        };
        this.tensorInfos.push(tensorInfo);
      } catch (e) {
        console.error(`Error parsing tensor info for tensor index ${i}:`, e);
        throw new Error(
          `Failed during tensor info parsing at index ${i}. File might be corrupt or unsupported.`,
        );
      }
    }
    console.log(`Parsed info for ${this.tensorInfos.length} tensors.`);
    // Calculate the starting offset of the actual tensor data section, applying alignment padding
    // after the tensor info section.
    const tensorInfoSectionEnd = this.offset;
    const dataPadding =
      (alignment - (tensorInfoSectionEnd % alignment)) % alignment;
    this.dataSectionStartOffset = tensorInfoSectionEnd + dataPadding;
    console.log(
      `Tensor Info End Offset: ${tensorInfoSectionEnd}, Padding: ${dataPadding}, Data Section Start Offset: ${this.dataSectionStartOffset}`,
    );
  }
  /**
   * Approximates the byte size of a tensor based on its type and element count.
   * WARNING: Highly inaccurate for quantized types without proper ggml block info.
   * @param {number} typeEnum - The GGML_TYPE enum value.
   * @param {number} numElements - Total number of elements.
   * @param {string} tensorName - Name of the tensor (for logging).
   * @returns {number} Approximate size in bytes.
   */
  _calculateTensorSizeApprox(typeEnum, numElements, tensorName = "tensor") {
    // TODO: Replace this with accurate calculations based on ggml.c source for each type.
    // This requires understanding block sizes (QK_K, QK8_0) and overhead per block (scales, mins).
    let bytesPerElementApprox = 0;
    switch (typeEnum) {
      case GGML_TYPE.F32:
        bytesPerElementApprox = 4;
        break;
      case GGML_TYPE.F16:
        bytesPerElementApprox = 2;
        break;
      case GGML_TYPE.Q8_0:
        bytesPerElementApprox = 1 + 4 / 32;
        break; // Rough guess for Q8_0
      case GGML_TYPE.Q4_K_M:
        bytesPerElementApprox = 0.5 + 12 / 256;
        break; // Rough guess for Q4_K_M
      // Add more rough estimates or ideally *accurate* calculations based on ggml.c
      default:
        console.warn(
          `Cannot accurately estimate size for type ${GGML_TYPE_NAMES[typeEnum] || typeEnum} for tensor "${tensorName}". Returning 0. Extraction may fail.`,
        );
        return 0;
    }
    // For types quantized in blocks, the correct calculation is:
    // (numElements / blockSize) * bytesPerBlock
    // This linear approximation will be wrong.
    return Math.ceil(numElements * bytesPerElementApprox);
  }
  /**
   * Main method to parse the entire GGUF file from an ArrayBuffer.
   * @param {ArrayBuffer} arrayBuffer - The content of the GGUF file.
   * @returns {boolean} True if parsing completed successfully, false otherwise.
   */
  parse(arrayBuffer) {
    if (!arrayBuffer || !(arrayBuffer instanceof ArrayBuffer)) {
      console.error("Invalid ArrayBuffer provided to GGUFLoader parse method.");
      return false;
    }
    // Reset internal state for parsing a new buffer
    this.arrayBuffer = arrayBuffer;
    this.dataView = new DataView(this.arrayBuffer);
    this.offset = 0;
    this.metadata = new Map();
    this.tensorInfos = [];
    this.version = 0;
    this.dataSectionStartOffset = 0;
    try {
      console.log(
        `Parsing GGUF file (${this.arrayBuffer.byteLength} bytes)...`,
      );
      this._parseHeader(); // Read header info
      this._parseMetadata(); // Read metadata key-value pairs
      this._parseTensorInfos(); // Read information about each tensor
      console.log("GGUF parsing completed successfully.");
      return true;
    } catch (error) {
      console.error("GGUF parsing failed:", error);
      // Clear potentially inconsistent state
      this.arrayBuffer = null;
      this.dataView = null;
      this.metadata = new Map();
      this.tensorInfos = [];
      return false;
    }
  }
  /**
   * Returns the array of tensor information objects parsed from the file.
   * Each object contains name, shape, type, offset, etc.
   * @returns {Array<object>}
   */
  getTensorInfos() {
    return this.tensorInfos;
  }
  /**
   * Retrieves a specific metadata value by its key.
   * @param {string} key - The metadata key (e.g., 'general.architecture').
   * @returns {any | undefined} The metadata value, or undefined if the key doesn't exist.
   */
  getMetadata(key) {
    return this.metadata.get(key);
  }
  /**
   * Extracts the data for a specific tensor by name, performing necessary
   * dequantization/conversion to Float32Array.
   * @param {string} name - The exact name of the tensor as listed in the GGUF file.
   * @returns {{ data: Float32Array | null, shape: number[], originalQuantType: string } | null}
   *          An object containing the processed Float32 data, the tensor's shape (user-friendly order),
   *          and its original quantization type name. Returns null if tensor not found or processing fails.
   */
  getTensorData(name) {
    if (!this.arrayBuffer || this.dataSectionStartOffset === 0) {
      console.error(
        "GGUF file not parsed or data section invalid. Cannot get tensor data.",
      );
      return null;
    }
    // Find the information for the requested tensor name
    const tensorInfo = this.tensorInfos.find((info) => info.name === name);
    if (!tensorInfo) {
      console.warn(`Tensor "${name}" not found in GGUF file.`);
      return null;
    }
    // Calculate the start and end byte offsets for this tensor's data slice
    // Note: tensorInfo.byteOffset is relative to dataSectionStartOffset
    const tensorStart = this.dataSectionStartOffset + tensorInfo.byteOffset;
    // tensorInfo.sizeInBytes is APPROXIMATE for quantized types
    const tensorEnd = tensorStart + tensorInfo.sizeInBytes;
    // --- Basic Sanity Checks ---
    if (tensorInfo.sizeInBytes <= 0) {
      console.error(
        `Cannot extract tensor "${name}", calculated size is ${tensorInfo.sizeInBytes} (likely unsupported quantized type).`,
      );
      return null;
    }
    if (
      tensorStart < this.dataSectionStartOffset ||
      tensorEnd > this.arrayBuffer.byteLength ||
      tensorStart >= tensorEnd
    ) {
      console.error(
        `Calculated tensor data range [${tensorStart}, ${tensorEnd}) for tensor "${name}" (size ${tensorInfo.sizeInBytes}) is invalid within buffer size ${this.arrayBuffer.byteLength}. Offset: ${tensorInfo.byteOffset}, Data Section Start: ${this.dataSectionStartOffset}.`,
      );
      return null;
    }
    // --- End Sanity Checks ---
    try {
      // Extract the raw byte slice for this tensor. slice() creates a copy.
      const rawTensorBuffer = this.arrayBuffer.slice(tensorStart, tensorEnd);
      // Warn if the sliced size doesn't match the calculated size (can happen with quantization estimations)
      if (rawTensorBuffer.byteLength !== tensorInfo.sizeInBytes) {
        console.warn(
          `Sliced buffer size (${rawTensorBuffer.byteLength}) differs from estimated size (${tensorInfo.sizeInBytes}) for tensor "${name}". Results may be incorrect if size calculation was wrong.`,
        );
        // Consider adjusting the buffer if needed, though slice should be correct if offset/sizeInBytes were.
      }
      // Call the central dequantization function
      const { data, typeName } = dequantizeTensorData(
        rawTensorBuffer,
        tensorInfo.typeEnum,
        tensorInfo.numElements,
        tensorInfo.shape, // Pass shape in case dequant needs it
      );
      // Check if dequantization was successful
      if (data === null) {
        console.error(
          `Dequantization/conversion failed for tensor "${name}" (Original Type: ${typeName}).`,
        );
        return null;
      }
      // Return the processed data, shape, and original type
      return {
        data: data, // Float32Array
        shape: [...tensorInfo.shape], // Return a copy of the shape (user-friendly order)
        originalQuantType: typeName, // The GGML_TYPE name string
      };
    } catch (error) {
      console.error(`Error processing tensor data for "${name}":`, error);
      return null;
    }
  }
}
// --- END OF GGUFLoader.js ---
