import fs from 'fs';
import { createHash } from 'node:crypto';
import { Buffer } from 'buffer';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { cpus } from 'node:os';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { HashingTimer, OperationTimer } from './timer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class OptimizedImageHashSpoofer {
  constructor() {
    this.PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    this.JPEG_SIGNATURE = Buffer.from([0xFF, 0xD8]);
    
    // Pre-generate CRC table for better performance
    this.crcTable = this.makeCRCTable();
    
    // Use available CPU cores for parallel processing
    this.numWorkers = Math.min(cpus().length, 8);
  }

  // Optimized CRC table generation
  makeCRCTable() {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
      }
      table[n] = c;
    }
    return table;
  }

  // Create PNG chunk with pre-allocated buffers
  createPNGChunk(chunkType, data) {
    const totalLength = 4 + chunkType.length + data.length + 4;
    const result = Buffer.allocUnsafe(totalLength);
    
    // Write length (big-endian)
    result.writeUInt32BE(data.length, 0);
    
    // Write chunk type and data
    chunkType.copy(result, 4);
    data.copy(result, 4 + chunkType.length);
    
    // Calculate and write CRC
    const chunkData = result.subarray(4, 4 + chunkType.length + data.length);
    const crc = this.calculateCRC32(chunkData);
    result.writeUInt32BE(crc, 4 + chunkType.length + data.length);
    
    return result;
  }

  // Optimized CRC32 calculation using pre-generated table
  calculateCRC32(data) {
    let crc = 0xFFFFFFFF;
    
    for (let i = 0; i < data.length; i++) {
      crc = this.crcTable[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    }
    
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  // Optimized PNG chunk parsing with better memory management
  parsePNGChunks(content) {
    if (!content.subarray(0, 8).equals(this.PNG_SIGNATURE)) {
      throw new Error('Not a valid PNG file');
    }

    const chunks = [];
    let pos = 8;

    while (pos < content.length - 8) {
      const length = content.readUInt32BE(pos);
      const chunkType = content.subarray(pos + 4, pos + 8);

      // Use buffer comparison instead of string comparison
      if (!chunkType.equals(Buffer.from('IEND'))) {
        chunks.push(content.subarray(pos, pos + 8 + length + 4));
      }

      pos += 8 + length + 4;
    }

    return chunks;
  }

  // Optimized JPEG comment addition with pre-allocated buffers
  addJPEGComment(content, comment) {
    let insertPos = 2;
    
    // Find optimal insertion point
    while (insertPos < content.length - 1) {
      if (content[insertPos] === 0xFF) {
        const marker = content[insertPos + 1];
        if (marker === 0xDA) break;
        
        if (marker >= 0xE0 && marker <= 0xEF) {
          const segmentLength = content.readUInt16BE(insertPos + 2);
          insertPos += 2 + segmentLength;
        } else {
          break;
        }
      } else {
        insertPos++;
      }
    }

    const commentData = Buffer.from(comment, 'utf-8');
    const segmentLength = commentData.length + 2;
    
    // Pre-allocate result buffer for better performance
    const result = Buffer.allocUnsafe(content.length + 4 + commentData.length);
    
    // Efficient buffer copying
    content.copy(result, 0, 0, insertPos);
    
    let pos = insertPos;
    result[pos++] = 0xFF;
    result[pos++] = 0xFE;
    result.writeUInt16BE(segmentLength, pos);
    pos += 2;
    
    commentData.copy(result, pos);
    pos += commentData.length;
    
    content.copy(result, pos, insertPos);
    
    return result;
  }

  // Calculate optimal attempt count based on target difficulty
  calculateOptimalMaxAttempts(targetPrefix) {
    const prefixLength = targetPrefix.length;
    const expectedAttempts = Math.pow(16, prefixLength);
    
    // Use statistical approach: 3 * expected attempts for ~95% success rate
    const optimal = Math.floor(expectedAttempts * 3);
    
    // Cap at reasonable limits
    return Math.min(Math.max(optimal, 100000), 50000000);
  }

  // Enhanced worker function with timing support
  static workerFunction({ targetHex, chunks, isPNG, hashAlgorithm, maxAttempts, workerId, numWorkers, originalData }) {
    const spoofer = new OptimizedImageHashSpoofer();
    const targetPrefix = targetHex.startsWith('0x') ? targetHex.slice(2).toLowerCase() : targetHex.toLowerCase();
    const operationTimer = new OperationTimer();
    const workerStartTime = performance.now();
    
    // Each worker handles a subset of attempts
    const startIndex = workerId;
    const step = numWorkers;
    
    let lastProgressTime = workerStartTime;
    const timingBreakdown = {
      imageModification: 0,
      hashCalculation: 0,
      comparison: 0
    };
    
    for (let i = startIndex; i < maxAttempts; i += step) {
      // Enhanced progress reporting with timing (every 100K attempts)
      if (i % 100000 === 0) {
        const now = performance.now();
        const elapsed = (now - workerStartTime) / 1000;
        const rate = (i - startIndex) / elapsed;
        const estimatedRemaining = ((maxAttempts - i) / step) / rate;
        
        parentPort.postMessage({ 
          type: 'progress', 
          attempt: i, 
          workerId,
          timing: {
            elapsed,
            rate: Math.round(rate),
            estimatedRemaining,
            breakdown: {
              imageModification: timingBreakdown.imageModification / (i - startIndex + 1),
              hashCalculation: timingBreakdown.hashCalculation / (i - startIndex + 1),
              comparison: timingBreakdown.comparison / (i - startIndex + 1)
            }
          }
        });
        
        lastProgressTime = now;
      }

      let testContent;
      
      // Time image modification
      const modStart = performance.now();
      
      if (isPNG) {
        // Use high-entropy data for better randomness distribution
        const entropy = `${Date.now()}-${i}-${Math.random()}-${process.hrtime.bigint()}`;
        const testData = Buffer.from(entropy, 'utf-8');
        const commentChunk = spoofer.createPNGChunk(Buffer.from('tEXt'), testData);

        // Pre-calculate buffer size
        let totalLength = spoofer.PNG_SIGNATURE.length + commentChunk.length + 12; // 12 for IEND chunk
        chunks.forEach(chunk => totalLength += chunk.length);

        testContent = Buffer.allocUnsafe(totalLength);
        let pos = 0;

        // Efficient buffer assembly
        spoofer.PNG_SIGNATURE.copy(testContent, pos);
        pos += spoofer.PNG_SIGNATURE.length;

        for (const chunk of chunks) {
          chunk.copy(testContent, pos);
          pos += chunk.length;
        }

        commentChunk.copy(testContent, pos);
        pos += commentChunk.length;

        // Add IEND chunk
        const iendChunk = spoofer.createPNGChunk(Buffer.from('IEND'), Buffer.alloc(0));
        iendChunk.copy(testContent, pos);
      } else {
        const comment = `${Date.now()}-${i}-${Math.random()}-${process.hrtime.bigint()}`;
        testContent = spoofer.addJPEGComment(originalData, comment);
      }
      
      timingBreakdown.imageModification += performance.now() - modStart;

      // Time hash calculation
      const hashStart = performance.now();
      const hash = createHash(hashAlgorithm, { highWaterMark: 1024 * 64 })
        .update(testContent)
        .digest('hex');
      timingBreakdown.hashCalculation += performance.now() - hashStart;
      
      // Time comparison
      const compStart = performance.now();
      const matches = hash.startsWith(targetPrefix);
      timingBreakdown.comparison += performance.now() - compStart;
      
      if (matches) {
        const workerEndTime = performance.now();
        const totalWorkerTime = workerEndTime - workerStartTime;
        
        parentPort.postMessage({ 
          type: 'success', 
          content: testContent,
          hash: hash,
          attempts: i + 1,
          workerId,
          timing: {
            totalDuration: totalWorkerTime / 1000,
            averageRate: (i + 1) / (totalWorkerTime / 1000),
            timePerAttempt: totalWorkerTime / (i + 1),
            breakdown: {
              imageModification: timingBreakdown.imageModification / (i + 1),
              hashCalculation: timingBreakdown.hashCalculation / (i + 1),
              comparison: timingBreakdown.comparison / (i + 1)
            }
          }
        });
        return;
      }
    }

    const workerEndTime = performance.now();
    const totalWorkerTime = workerEndTime - workerStartTime;
    const workerAttempts = Math.floor((maxAttempts - startIndex) / step);
    
    parentPort.postMessage({ 
      type: 'complete', 
      workerId,
      message: `Worker ${workerId} completed ${workerAttempts} attempts without finding match`,
      timing: {
        totalDuration: totalWorkerTime / 1000,
        averageRate: workerAttempts / (totalWorkerTime / 1000),
        attemptsCompleted: workerAttempts,
        breakdown: {
          imageModification: timingBreakdown.imageModification / workerAttempts,
          hashCalculation: timingBreakdown.hashCalculation / workerAttempts,
          comparison: timingBreakdown.comparison / workerAttempts
        }
      }
    });
  }

  // Parallel processing with worker threads
  async findMatchingHashParallel(targetHex, originalData, isPNG, hashAlgorithm = 'sha512') {
    const targetPrefix = targetHex.startsWith('0x') ? targetHex.slice(2).toLowerCase() : targetHex.toLowerCase();
    const optimalMaxAttempts = this.calculateOptimalMaxAttempts(targetPrefix);
    const attemptsPerWorker = Math.floor(optimalMaxAttempts / this.numWorkers);
    
    console.log(`Using ${this.numWorkers} workers with ${attemptsPerWorker.toLocaleString()} attempts each`);
    console.log(`Target difficulty: ${targetPrefix.length} hex characters (expected: ${Math.pow(16, targetPrefix.length).toLocaleString()} attempts)`);
    
    let chunks;
    if (isPNG) {
      chunks = this.parsePNGChunks(originalData);
    }

    return new Promise((resolve, reject) => {
      const workers = [];
      let completedWorkers = 0;
      let lastProgressTime = Date.now();
      
      // Create workers
      for (let i = 0; i < this.numWorkers; i++) {
        const worker = new Worker(__filename, {
          workerData: {
            targetHex,
            chunks,
            isPNG,
            hashAlgorithm,
            maxAttempts: optimalMaxAttempts,
            workerId: i,
            numWorkers: this.numWorkers,
            originalData: isPNG ? null : originalData
          }
        });

        worker.on('message', (message) => {
          const { type, content, hash, attempts, workerId, attempt } = message;
          
          if (type === 'success') {
            // Terminate all workers
            workers.forEach(w => w.terminate());
            resolve({ content, hash, attempts });
          } else if (type === 'complete') {
            completedWorkers++;
            if (completedWorkers === this.numWorkers) {
              reject(new Error(`Could not find matching hash after ${optimalMaxAttempts.toLocaleString()} total attempts`));
            }
          } else if (type === 'progress') {
            const now = Date.now();
            // Throttle progress updates to once per second
            if (now - lastProgressTime > 1000) {
              const totalAttempted = attempt * this.numWorkers;
              const rate = attempt / ((now - lastProgressTime) / 1000);
              console.log(`Progress: ${totalAttempted.toLocaleString()} attempts (${rate.toFixed(0)} attempts/sec per worker)`);
              lastProgressTime = now;
            }
          }
        });

        worker.on('error', reject);
        workers.push(worker);
      }
    });
  }

  // Main spoofing function with performance optimizations
  async spoofImage(targetHex, inputPath, outputPath, hashAlgorithm = 'sha512') {
    console.log(`🎯 Starting optimized hash spoofing for target: ${targetHex}`);
    console.log(`📊 Using hash algorithm: ${hashAlgorithm}`);
    
    const startTime = process.hrtime.bigint();
    const content = fs.readFileSync(inputPath);
    let result;

    if (content.subarray(0, 8).equals(this.PNG_SIGNATURE)) {
      console.log('🖼️  Detected PNG format');
      const { content: modifiedContent, hash, attempts } = await this.findMatchingHashParallel(
        targetHex, content, true, hashAlgorithm
      );
      result = modifiedContent;
      console.log(`✅ Found matching hash: ${hash} after ${attempts.toLocaleString()} attempts`);
    } else if (content.subarray(0, 2).equals(this.JPEG_SIGNATURE)) {
      console.log('📸 Detected JPEG format');
      const { content: modifiedContent, hash, attempts } = await this.findMatchingHashParallel(
        targetHex, content, false, hashAlgorithm
      );
      result = modifiedContent;
      console.log(`✅ Found matching hash: ${hash} after ${attempts.toLocaleString()} attempts`);
    } else {
      throw new Error('Unsupported image format. Only PNG and JPEG are supported.');
    }

    const endTime = process.hrtime.bigint();
    const processingTimeMs = Number(endTime - startTime) / 1000000;
    
    fs.writeFileSync(outputPath, result);
    console.log(`💾 Successfully created spoofed image: ${outputPath}`);
    console.log(`⏱️  Total processing time: ${(processingTimeMs / 1000).toFixed(2)}s`);
    
    // Verify the result
    const verification = createHash(hashAlgorithm).update(result).digest('hex');
    console.log(`🔍 Verification hash: ${verification}`);
    
    return { hash: verification, processingTime: processingTimeMs };
  }
}

// Worker thread execution
if (!isMainThread) {
  OptimizedImageHashSpoofer.workerFunction(workerData);
} else {
  // CLI interface
  function main() {
    const args = process.argv.slice(2);
    
    if (args.length < 3 || args.length > 4) {
      console.log('Usage: node optimized-spoof.js <target_hex> <input_image> <output_image> [hash_algorithm]');
      console.log('Example: node optimized-spoof.js 0x24 original.jpg altered.jpg sha512');
      console.log('Supported hash algorithms: sha256, sha512 (default)');
      console.log('\n🚀 Optimized version with parallel processing and performance improvements');
      process.exit(1);
    }

    const [targetHex, inputPath, outputPath, hashAlgorithm = 'sha512'] = args;

    if (!targetHex.startsWith('0x')) {
      console.error('❌ Target hex must start with "0x"');
      process.exit(1);
    }

    if (!fs.existsSync(inputPath)) {
      console.error(`❌ Input file does not exist: ${inputPath}`);
      process.exit(1);
    }

    console.log('🔧 Initializing optimized image hash spoofer...');
    const spoofer = new OptimizedImageHashSpoofer();
    
    spoofer.spoofImage(targetHex, inputPath, outputPath, hashAlgorithm)
      .then(({ hash, processingTime }) => {
        console.log(`\n🎉 Success! Hash spoofing completed in ${(processingTime / 1000).toFixed(2)}s`);
        console.log(`📝 Final hash: ${hash}`);
      })
      .catch(error => {
        console.error(`❌ Error: ${error.message}`);
        process.exit(1);
      });
  }

  // Export for use as module
  export { OptimizedImageHashSpoofer };

  // Run CLI if this file is executed directly
  if (process.argv[1] === __filename) {
    main();
  }
}
