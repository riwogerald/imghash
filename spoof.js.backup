import fs from 'fs';
import { createHash } from 'node:crypto';
import { Buffer } from 'buffer';

class ImageHashSpoofer {
  constructor() {
    this.PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    this.JPEG_SIGNATURE = Buffer.from([0xFF, 0xD8]);
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

  // CRC32 calculation for PNG chunks
  calculateCRC32(data) {
    const crcTable = this.makeCRCTable();
    let crc = 0xFFFFFFFF;
    
    for (let i = 0; i < data.length; i++) {
      crc = crcTable[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    }
    
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  makeCRCTable() {
    if (this.crcTable) return this.crcTable;
    
    this.crcTable = new Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
      }
      this.crcTable[n] = c;
    }
    return this.crcTable;
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
    } else {
      throw new Error('Unsupported image format. Only PNG and JPEG are supported.');
    }

    fs.writeFileSync(outputPath, result);
    console.log(`Successfully created spoofed image: ${outputPath}`);
    
    // Verify the result
    const verification = createHash(hashAlgorithm).update(result).digest('hex');
    console.log(`Verification hash: ${verification}`);
  }
}

// CLI interface
function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 3 || args.length > 4) {
    console.log('Usage: node spoof.js <target_hex> <input_image> <output_image> [hash_algorithm]');
    console.log('Example: node spoof.js 0x24 original.jpg altered.jpg sha512');
    console.log('Supported hash algorithms: sha256, sha512 (default)');
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

  const spoofer = new ImageHashSpoofer();
  
  try {
    spoofer.spoofImage(targetHex, inputPath, outputPath, hashAlgorithm);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// Export for use as module
export { ImageHashSpoofer };

// Run CLI if this file is executed directly
if (import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  main();
}
