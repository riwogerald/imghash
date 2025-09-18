import fs from 'fs';
import { createHash } from 'node:crypto';
import { Buffer } from 'buffer';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { cpus } from 'node:os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class OptimizedImageHashSpoofer {
  constructor() {
    this.PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    this.JPEG_SIGNATURE = Buffer.from([0xFF, 0xD8]);
    this.GIF87A_SIGNATURE = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]); // GIF87a
    this.GIF89A_SIGNATURE = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]); // GIF89a
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

  // Create PNG chunk
  createPNGChunk(chunkType, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    
    const chunk = Buffer.concat([chunkType, data]);
    const crc = this.calculateCRC32(chunk);
    const crcBuffer = Buffer.alloc(4);
    crcBuffer.writeUInt32BE(crc, 0);
    
    return Buffer.concat([length, chunk, crcBuffer]);
  }

  // Optimized CRC32 calculation using pre-generated table
  calculateCRC32(data) {
    let crc = 0xFFFFFFFF;
    
    for (let i = 0; i < data.length; i++) {
      crc = this.crcTable[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    }
    
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  // Check if file is GIF format
  isGIF(content) {
    if (content.length < 6) return false;
    const header = content.subarray(0, 6);
    return header.equals(this.GIF87A_SIGNATURE) || header.equals(this.GIF89A_SIGNATURE);
  }

  // Calculate optimal attempt count based on target difficulty
  calculateOptimalMaxAttempts(targetPrefix) {
    const prefixLength = targetPrefix.length;
    const expectedAttempts = Math.pow(16, prefixLength);
    // Use statistical approach: 3 * expected attempts for ~95% success rate
    return Math.min(Math.max(expectedAttempts * 3, 100000), 50000000);
  }

  // Parse PNG chunks
  parsePNGChunks(content) {
    if (!content.subarray(0, 8).equals(this.PNG_SIGNATURE)) {
      throw new Error('Not a valid PNG file');
    }

    const chunks = [];
    let pos = 8;

    while (pos < content.length) {
      const length = content.readUInt32BE(pos);
      const chunkType = content.subarray(pos + 4, pos + 8);
      const chunkData = content.subarray(pos + 8, pos + 8 + length);
      const crc = content.subarray(pos + 8 + length, pos + 8 + length + 4);

      if (!chunkType.equals(Buffer.from('IEND'))) {
        chunks.push(content.subarray(pos, pos + 8 + length + 4));
      }

      pos += 8 + length + 4;
    }

    return chunks;
  }

  // Add JPEG comment
  addJPEGComment(content, comment) {
    // Find the position after SOI marker (0xFFD8)
    let insertPos = 2;
    
    // Skip existing markers until we find a good insertion point
    while (insertPos < content.length - 1) {
      if (content[insertPos] === 0xFF) {
        const marker = content[insertPos + 1];
        if (marker === 0xDA) break; // Start of scan - insert before this
        
        if (marker >= 0xE0 && marker <= 0xEF) {
          // Application marker - skip it
          const segmentLength = (content[insertPos + 2] << 8) | content[insertPos + 3];
          insertPos += 2 + segmentLength;
        } else {
          break;
        }
      } else {
        insertPos++;
      }
    }

    // Create comment segment (0xFFFE)
    const commentData = Buffer.from(comment, 'utf-8');
    const segmentLength = commentData.length + 2;
    const commentSegment = Buffer.alloc(4 + commentData.length);
    
    commentSegment[0] = 0xFF;
    commentSegment[1] = 0xFE;
    commentSegment[2] = (segmentLength >> 8) & 0xFF;
    commentSegment[3] = segmentLength & 0xFF;
    commentData.copy(commentSegment, 4);

    // Insert comment segment
    return Buffer.concat([
      content.subarray(0, insertPos),
      commentSegment,
      content.subarray(insertPos)
    ]);
  }

  // Add GIF comment extension
  addGIFComment(content, comment) {
    if (!this.isGIF(content)) {
      throw new Error('Not a valid GIF file');
    }

    // Find a good position to insert the comment extension
    // GIF structure: Header (6 bytes) + Logical Screen Descriptor (7 bytes) + [Global Color Table] + Data Stream
    let insertPos = 13; // After header + logical screen descriptor

    // Check if there's a Global Color Table
    const logicalScreenDescriptor = content.subarray(6, 13);
    const globalColorTableFlag = (logicalScreenDescriptor[4] & 0x80) !== 0;
    
    if (globalColorTableFlag) {
      const globalColorTableSize = logicalScreenDescriptor[4] & 0x07;
      const colorTableSize = 3 * Math.pow(2, globalColorTableSize + 1);
      insertPos += colorTableSize;
    }

    // Create GIF Comment Extension
    // Format: Extension Introducer (0x21) + Comment Label (0xFE) + Data Sub-blocks + Block Terminator (0x00)
    const commentData = Buffer.from(comment, 'utf-8');
    const maxSubBlockSize = 255;
    const subBlocks = [];
    
    // Split comment data into sub-blocks of max 255 bytes each
    for (let i = 0; i < commentData.length; i += maxSubBlockSize) {
      const subBlockData = commentData.subarray(i, Math.min(i + maxSubBlockSize, commentData.length));
      const subBlock = Buffer.alloc(1 + subBlockData.length);
      subBlock[0] = subBlockData.length; // Sub-block size
      subBlockData.copy(subBlock, 1);
      subBlocks.push(subBlock);
    }

    // Build the complete comment extension
    const commentExtension = Buffer.concat([
      Buffer.from([0x21, 0xFE]), // Extension Introducer + Comment Label
      ...subBlocks,
      Buffer.from([0x00]) // Block Terminator
    ]);

    // Insert comment extension
    return Buffer.concat([
      content.subarray(0, insertPos),
      commentExtension,
      content.subarray(insertPos)
    ]);
  }

  // Find matching hash for PNG
  findMatchingHashPNG(targetHex, originalChunks, hashAlgorithm = 'sha512', maxAttempts = 10000000) {
    const targetPrefix = targetHex.startsWith('0x') ? targetHex.slice(2) : targetHex;
    
    for (let i = 0; i < maxAttempts; i++) {
      if (i % 100000 === 0) {
        console.log(`Attempt ${i}/${maxAttempts}...`);
      }

      const testData = Buffer.from(`Hash attempt ${i} - ${Date.now()}`, 'utf-8');
      const commentChunk = this.createPNGChunk(Buffer.from('tEXt'), testData);

      const testContent = Buffer.concat([
        this.PNG_SIGNATURE,
        ...originalChunks,
        commentChunk,
        this.createPNGChunk(Buffer.from('IEND'), Buffer.alloc(0))
      ]);

      const hash = createHash(hashAlgorithm).update(testContent).digest('hex');
      
      if (hash.startsWith(targetPrefix.toLowerCase())) {
        console.log(`Found matching hash after ${i + 1} attempts!`);
        return { commentChunk, hash };
      }
    }

    throw new Error(`Could not find matching hash after ${maxAttempts} attempts`);
  }

  // Find matching hash for JPEG
  findMatchingHashJPEG(targetHex, originalContent, hashAlgorithm = 'sha512', maxAttempts = 10000000) {
    const targetPrefix = targetHex.startsWith('0x') ? targetHex.slice(2) : targetHex;
    
    for (let i = 0; i < maxAttempts; i++) {
      if (i % 100000 === 0) {
        console.log(`Attempt ${i}/${maxAttempts}...`);
      }

      const comment = `Hash attempt ${i} - ${Date.now()}`;
      const testContent = this.addJPEGComment(originalContent, comment);

      const hash = createHash(hashAlgorithm).update(testContent).digest('hex');
      
      if (hash.startsWith(targetPrefix.toLowerCase())) {
        console.log(`Found matching hash after ${i + 1} attempts!`);
        return { content: testContent, hash };
      }
    }

    throw new Error(`Could not find matching hash after ${maxAttempts} attempts`);
  }

  // Find matching hash for GIF
  findMatchingHashGIF(targetHex, originalContent, hashAlgorithm = 'sha512', maxAttempts = 10000000) {
    const targetPrefix = targetHex.startsWith('0x') ? targetHex.slice(2) : targetHex;
    
    for (let i = 0; i < maxAttempts; i++) {
      if (i % 100000 === 0) {
        console.log(`Attempt ${i}/${maxAttempts}...`);
      }

      const comment = `Hash attempt ${i} - ${Date.now()}`;
      const testContent = this.addGIFComment(originalContent, comment);

      const hash = createHash(hashAlgorithm).update(testContent).digest('hex');
      
      if (hash.startsWith(targetPrefix.toLowerCase())) {
        console.log(`Found matching hash after ${i + 1} attempts!`);
        return { content: testContent, hash };
      }
    }

    throw new Error(`Could not find matching hash after ${maxAttempts} attempts`);
  }

  // Main spoofing function
  async spoofImage(targetHex, inputPath, outputPath, hashAlgorithm = 'sha512') {
    console.log(`Starting hash spoofing for target: ${targetHex}`);
    console.log(`Using hash algorithm: ${hashAlgorithm}`);
    
    const content = fs.readFileSync(inputPath);
    let result;

    if (content.subarray(0, 8).equals(this.PNG_SIGNATURE)) {
      console.log('Detected PNG format');
      const chunks = this.parsePNGChunks(content);
      const { commentChunk, hash } = this.findMatchingHashPNG(targetHex, chunks, hashAlgorithm);
      
      result = Buffer.concat([
        this.PNG_SIGNATURE,
        ...chunks,
        commentChunk,
        this.createPNGChunk(Buffer.from('IEND'), Buffer.alloc(0))
      ]);
      
      console.log(`Final hash: ${hash}`);
    } else if (content.subarray(0, 2).equals(this.JPEG_SIGNATURE)) {
      console.log('Detected JPEG format');
      const { content: modifiedContent, hash } = this.findMatchingHashJPEG(targetHex, content, hashAlgorithm);
      result = modifiedContent;
      console.log(`Final hash: ${hash}`);
    } else if (this.isGIF(content)) {
      console.log('Detected GIF format');
      const { content: modifiedContent, hash } = this.findMatchingHashGIF(targetHex, content, hashAlgorithm);
      result = modifiedContent;
      console.log(`Final hash: ${hash}`);
    } else {
      throw new Error('Unsupported image format. Only PNG, JPEG, and GIF are supported.');
    }

    fs.writeFileSync(outputPath, result);
    console.log(`Successfully created spoofed image: ${outputPath}`);
    
    // Verify the result
    const verification = createHash(hashAlgorithm).update(result).digest('hex');
    console.log(`Verification hash: ${verification}`);
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  
  // Check for batch processing mode
  if (args.length > 0 && args[0] === '--batch') {
    console.log('🚀 For batch processing, please use the dedicated batch-spoof.js script:');
    console.log('   node batch-spoof.js --help');
    console.log('');
    console.log('Quick examples:');
    console.log('   node batch-spoof.js pattern "*.jpg" ./output 0x24');
    console.log('   node batch-spoof.js config batch-config.json');
    process.exit(0);
  }
  
  if (args.length < 3 || args.length > 4) {
    console.log('Usage: node spoof.js <target_hex> <input_image> <output_image> [hash_algorithm]');
    console.log('Example: node spoof.js 0x24 original.jpg altered.jpg sha512');
    console.log('Supported hash algorithms: sha256, sha512 (default)');
    console.log('');
    console.log('💡 For batch processing multiple files, use:');
    console.log('   node batch-spoof.js --help');
    process.exit(1);
  }

  const [targetHex, inputPath, outputPath, hashAlgorithm = 'sha512'] = args;

  if (!targetHex.startsWith('0x')) {
    console.error('Target hex must start with "0x"');
    process.exit(1);
  }

  if (!fs.existsSync(inputPath)) {
    console.error(`Input file does not exist: ${inputPath}`);
    process.exit(1);
  }

  console.log('🔧 Initializing optimized image hash spoofer...');
  const spoofer = new OptimizedImageHashSpoofer();
  
  try {
    const startTime = process.hrtime.bigint();
    await spoofer.spoofImage(targetHex, inputPath, outputPath, hashAlgorithm);
    const endTime = process.hrtime.bigint();
    const processingTimeMs = Number(endTime - startTime) / 1000000;
    console.log(`🎉 Success! Hash spoofing completed in ${(processingTimeMs / 1000).toFixed(2)}s`);
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

// Export for use as module
export { OptimizedImageHashSpoofer };

// Run CLI if this file is executed directly
if (import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  main();
}
