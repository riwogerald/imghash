import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Test suite for image file parsing and format detection
 */
describe('Image Parsing', () => {
  const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const JPEG_SIGNATURE = Buffer.from([0xFF, 0xD8]);

  describe('Format Detection', () => {
    test('should detect PNG format from signature', () => {
      const pngPath = join(__dirname, '../fixtures/test-image.png');
      const content = fs.readFileSync(pngPath);
      
      expect(content.subarray(0, 8)).toEqual(PNG_SIGNATURE);
    });

    test('should detect JPEG format from signature', () => {
      const jpegPath = join(__dirname, '../fixtures/test-image.jpg');
      const content = fs.readFileSync(jpegPath);
      
      expect(content.subarray(0, 2)).toEqual(JPEG_SIGNATURE);
    });

    test('should reject invalid file formats', () => {
      const invalidData = Buffer.from('This is not an image');
      
      expect(invalidData.subarray(0, 8)).not.toEqual(PNG_SIGNATURE);
      expect(invalidData.subarray(0, 2)).not.toEqual(JPEG_SIGNATURE);
    });
  });

  describe('CRC32 Calculation', () => {
    function makeCRCTable() {
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

    function calculateCRC32(data) {
      const crcTable = makeCRCTable();
      let crc = 0xFFFFFFFF;
      
      for (let i = 0; i < data.length; i++) {
        crc = crcTable[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
      }
      
      return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    test('should calculate consistent CRC32 values', () => {
      const testData = Buffer.from('test data');
      const crc1 = calculateCRC32(testData);
      const crc2 = calculateCRC32(testData);
      
      expect(crc1).toBe(crc2);
      expect(typeof crc1).toBe('number');
    });

    test('should produce different CRC32 for different data', () => {
      const data1 = Buffer.from('test data 1');
      const data2 = Buffer.from('test data 2');
      
      const crc1 = calculateCRC32(data1);
      const crc2 = calculateCRC32(data2);
      
      expect(crc1).not.toBe(crc2);
    });

    test('should handle empty data', () => {
      const emptyData = Buffer.from([]);
      const crc = calculateCRC32(emptyData);
      
      expect(crc).toBe(0); // CRC32 of empty data should be 0
    });
  });

  describe('PNG Chunk Handling', () => {
    function createPNGChunk(chunkType, data) {
      const length = Buffer.alloc(4);
      length.writeUInt32BE(data.length, 0);
      
      const chunk = Buffer.concat([chunkType, data]);
      
      // Simple CRC calculation for testing
      const crc = Buffer.alloc(4);
      crc.writeUInt32BE(0x12345678, 0); // Mock CRC
      
      return Buffer.concat([length, chunk, crc]);
    }

    test('should create valid PNG chunks', () => {
      const chunkType = Buffer.from('tEXt');
      const data = Buffer.from('test comment');
      const chunk = createPNGChunk(chunkType, data);
      
      expect(chunk.length).toBe(4 + 4 + data.length + 4); // length + type + data + crc
      
      const lengthValue = chunk.readUInt32BE(0);
      expect(lengthValue).toBe(data.length); // PNG chunk length field contains only data length
    });

    test('should handle different chunk types', () => {
      const testChunks = [
        { type: 'tEXt', data: 'text comment' },
        { type: 'iTXt', data: 'international text' },
        { type: 'zTXt', data: 'compressed text' }
      ];

      testChunks.forEach(({ type, data }) => {
        const chunkType = Buffer.from(type);
        const chunkData = Buffer.from(data);
        const chunk = createPNGChunk(chunkType, chunkData);
        
        expect(chunk).toBeDefined();
        expect(chunk.length).toBeGreaterThan(8); // Minimum chunk size
      });
    });
  });

  describe('JPEG Comment Handling', () => {
    test('should create valid JPEG comment segments', () => {
      const comment = 'test comment';
      const commentData = Buffer.from(comment, 'utf-8');
      const segmentLength = commentData.length + 2;
      
      const commentSegment = Buffer.alloc(4 + commentData.length);
      commentSegment[0] = 0xFF;
      commentSegment[1] = 0xFE; // Comment marker
      commentSegment[2] = (segmentLength >> 8) & 0xFF;
      commentSegment[3] = segmentLength & 0xFF;
      commentData.copy(commentSegment, 4);
      
      expect(commentSegment[0]).toBe(0xFF);
      expect(commentSegment[1]).toBe(0xFE);
      expect(commentSegment.length).toBe(4 + commentData.length);
    });

    test('should handle unicode comments', () => {
      const unicodeComment = 'Test with unicode: 🔐 🖼️ ⚡';
      const commentData = Buffer.from(unicodeComment, 'utf-8');
      
      expect(commentData.length).toBeGreaterThan(unicodeComment.length); // UTF-8 encoding
      expect(commentData.toString('utf-8')).toBe(unicodeComment);
    });
  });
});
