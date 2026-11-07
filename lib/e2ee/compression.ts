/**
 * Compression utilities for file and message optimization
 * 
 * Prior to encryption, data should be compressed to:
 * - Reduce bandwidth usage
 * - Decrease encrypted data size
 * - Improve transfer speeds
 */

import { randomBytes } from "./sha256";

/**
 * Compression algorithm types
 */
export type CompressionAlgorithm = "gzip" | "brotli" | "none";

/**
 * Compressed result
 */
export interface CompressionResult {
  data: Uint8Array;
  originalSize: number;
  compressedSize: number;
  ratio: number; // Percentage reduction
  algorithm: CompressionAlgorithm;
}

/**
 * Get available compression algorithms
 */
export function getAvailableCompression(): CompressionAlgorithm[] {
  const available: CompressionAlgorithm[] = ["gzip", "none"];
  
  // Check for Brotli support
  if (typeof CompressionStream !== "undefined") {
    // Check if brotli is supported
    try {
      new CompressionStream("brotli");
      available.push("brotli");
    } catch {
      // Brotli not supported
    }
  }
  
  return available;
}

/**
 * Compress data with best available algorithm
 */
export async function compress(
  data: Uint8Array,
  algorithm: CompressionAlgorithm = "gzip"
): Promise<CompressionResult> {
  const originalSize = data.length;
  
  if (algorithm === "none") {
    return {
      data,
      originalSize,
      compressedSize: originalSize,
      ratio: 0,
      algorithm: "none",
    };
  }
  
  if (algorithm === "brotli" && typeof CompressionStream !== "undefined") {
    try {
      const result = await compressWithStream(data, "brotli");
      return {
        ...result,
        algorithm: "brotli",
      };
    } catch {
      // Fall back to gzip
    }
  }
  
  // Default to gzip
  const result = await compressWithStream(data, "gzip");
  return result;
}

/**
 * Compress using CompressionStream API
 */
async function compressWithStream(
  data: Uint8Array,
  format: "gzip" | "brotli"
): Promise<CompressionResult> {
  const originalSize = data.length;
  
  const inputStream = new ReadableStream({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });
  
  const compressedStream = inputStream.pipeThrough(
    new CompressionStream(format)
  );
  
  const chunks: Uint8Array[] = [];
  const reader = compressedStream.getReader();
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  
  // Concatenate chunks
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  
  return {
    data: result,
    originalSize,
    compressedSize: result.length,
    ratio: ((originalSize - result.length) / originalSize) * 100,
    algorithm: format,
  };
}

/**
 * Decompress data
 */
export async function decompress(
  data: Uint8Array,
  algorithm: CompressionAlgorithm = "gzip"
): Promise<Uint8Array> {
  if (algorithm === "none") {
    return data;
  }
  
  const inputStream = new ReadableStream({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });
  
  let format: "gzip" | "br" = "gzip";
  if (algorithm === "brotli") {
    format = "br";
  }
  
  const decompressedStream = inputStream.pipeThrough(
    new DecompressionStream(format)
  );
  
  const chunks: Uint8Array[] = [];
  const reader = decompressedStream.getReader();
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  
  return result;
}

/**
 * Compress text specifically (optimized for JSON, markdown, etc.)
 */
export async function compressText(
  text: string,
  algorithm: CompressionAlgorithm = "gzip"
): Promise<CompressionResult> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  return compress(data, algorithm);
}

/**
 * Decompress to text
 */
export async function decompressToText(
  data: Uint8Array,
  algorithm: CompressionAlgorithm = "gzip"
): Promise<string> {
  const decompressed = await decompress(data, algorithm);
  const decoder = new TextDecoder();
  return decoder.decode(decompressed);
}

/**
 * Estimate compression ratio for given content type
 */
export function estimateCompressionRatio(
  contentType: string,
  data: Uint8Array
): number {
  // Text-based content compresses well
  const textTypes = [
    "text/",
    "application/json",
    "application/javascript",
    "application/xml",
    "application/x-www-form-urlencoded",
  ];
  
  // Binary content doesn't compress well
  const binaryTypes = [
    "image/",
    "audio/",
    "video/",
    "application/pdf",
    "application/zip",
    "application/gzip",
  ];
  
  for (const type of textTypes) {
    if (contentType.startsWith(type)) {
      // Text typically compresses 50-80%
      return 60;
    }
  }
  
  for (const type of binaryTypes) {
    if (contentType.startsWith(type)) {
      // Already compressed binary doesn't compress much
      return 5;
    }
  }
  
  // Default for unknown types
  return 30;
}

/**
 * Decide whether to compress based on size and type
 */
export function shouldCompress(
  size: number,
  contentType: string,
  threshold: number = 1024 * 1024 // 1MB
): boolean {
  // Don't compress very small files (overhead not worth it)
  if (size < 512) return false;
  
  // Don't compress very large files (memory constraints)
  if (size > threshold) return false;
  
  // Already compressed formats don't benefit
  const noCompressTypes = [
    "image/webp",
    "image/avif",
    "image/png",
    "audio/mp3",
    "audio/aac",
    "video/mp4",
    "video/webm",
  ];
  
  if (noCompressTypes.includes(contentType)) {
    return false;
  }
  
  return true;
}

/**
 * Streaming compression for large files
 */
export class StreamingCompressor {
  private format: "gzip" | "brotli";
  private chunks: Uint8Array[] = [];
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writable: WritableStream<Uint8Array>;
  private transformStream: TransformStream<Uint8Array, Uint8Array>;
  
  constructor(format: "gzip" | "brotli" = "gzip") {
    this.format = format;
    
    this.transformStream = new CompressionStream(format);
    this.writable = this.transformStream.writable;
  }
  
  /**
   * Get readable side of compressed output
   */
  get readable(): ReadableStream<Uint8Array> {
    return this.transformStream.readable;
  }
  
  /**
   * Get writable side for input
   */
  get input(): WritableStream<Uint8Array> {
    return this.writable;
  }
  
  /**
   * Compress a chunk
   */
  async write(chunk: Uint8Array): Promise<void> {
    const writer = this.writable.getWriter();
    await writer.write(chunk);
    writer.releaseLock();
  }
  
  /**
   * Finish compression and get final result
   */
  async finish(): Promise<Uint8Array> {
    await this.writable.close();
    
    const chunks: Uint8Array[] = [];
    const reader = this.transformStream.readable.getReader();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    
    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    
    return result;
  }
}

/**
 * Streaming decompression for large files
 */
export class StreamingDecompressor {
  private format: "gzip" | "br";
  private transformStream: TransformStream<Uint8Array, Uint8Array>;
  
  constructor(format: "gzip" | "br" = "gzip") {
    this.format = format;
    this.transformStream = new DecompressionStream(format);
  }
  
  /**
   * Get readable side of decompressed output
   */
  get readable(): ReadableStream<Uint8Array> {
    return this.transformStream.readable;
  }
  
  /**
   * Get writable side for input
   */
  get input(): WritableStream<Uint8Array> {
    return this.transformStream.writable;
  }
  
  /**
   * Decompress a chunk
   */
  async write(chunk: Uint8Array): Promise<void> {
    const writer = this.transformStream.writable.getWriter();
    await writer.write(chunk);
    writer.releaseLock();
  }
  
  /**
   * Finish decompression and get final result
   */
  async finish(): Promise<Uint8Array> {
    await this.transformStream.writable.close();
    
    const chunks: Uint8Array[] = [];
    const reader = this.transformStream.readable.getReader();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    
    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    
    return result;
  }
}