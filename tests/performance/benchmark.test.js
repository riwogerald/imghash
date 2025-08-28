import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createHash } from 'crypto';
import { performance } from 'perf_hooks';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Performance benchmarking tests
 * Tracks optimization improvements and regression detection
 */
describe('Performance Benchmarks', () => {
  const fixturesPath = path.join(__dirname, '../fixtures');
  const benchmarkResults = {
    hashPerformance: {},
    crcPerformance: {},
    imageProcessing: {}
  };

  describe('Hash Algorithm Performance', () => {
    const testData = Buffer.alloc(1024 * 1024, 'benchmark data'); // 1MB test data

    test('SHA-256 performance benchmark', () => {
      const iterations = 100;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        createHash('sha256').update(testData).digest('hex');
      }

      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const avgTime = totalTime / iterations;

      benchmarkResults.hashPerformance.sha256 = {
        totalTime,
        avgTime,
        iterations,
        dataSize: testData.length,
        throughput: (testData.length * iterations) / (totalTime / 1000) / 1024 / 1024 // MB/s
      };

      // Performance expectations
      expect(avgTime).toBeLessThan(50); // Should be under 50ms per MB on modern hardware
      expect(benchmarkResults.hashPerformance.sha256.throughput).toBeGreaterThan(10); // At least 10 MB/s

      console.log(`SHA-256 Performance: ${avgTime.toFixed(2)}ms avg, ${benchmarkResults.hashPerformance.sha256.throughput.toFixed(2)} MB/s`);
    });

    test('SHA-512 performance benchmark', () => {
      const iterations = 100;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        createHash('sha512').update(testData).digest('hex');
      }

      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const avgTime = totalTime / iterations;

      benchmarkResults.hashPerformance.sha512 = {
        totalTime,
        avgTime,
        iterations,
        dataSize: testData.length,
        throughput: (testData.length * iterations) / (totalTime / 1000) / 1024 / 1024
      };

      expect(avgTime).toBeLessThan(100); // Should be under 100ms per MB
      expect(benchmarkResults.hashPerformance.sha512.throughput).toBeGreaterThan(5); // At least 5 MB/s

      console.log(`SHA-512 Performance: ${avgTime.toFixed(2)}ms avg, ${benchmarkResults.hashPerformance.sha512.throughput.toFixed(2)} MB/s`);
    });
  });

  describe('CRC32 Performance', () => {
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

    function calculateCRC32(data, crcTable) {
      let crc = 0xFFFFFFFF;
      
      for (let i = 0; i < data.length; i++) {
        crc = crcTable[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
      }
      
      return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    test('CRC32 table generation performance', () => {
      const iterations = 1000;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        makeCRCTable();
      }

      const endTime = performance.now();
      const avgTime = (endTime - startTime) / iterations;

      benchmarkResults.crcPerformance.tableGeneration = {
        avgTime,
        iterations
      };

      expect(avgTime).toBeLessThan(1); // Should be under 1ms per table generation
      console.log(`CRC Table Generation: ${avgTime.toFixed(4)}ms avg`);
    });

    test('CRC32 calculation performance', () => {
      const testData = Buffer.alloc(64 * 1024, 'crc test data'); // 64KB
      const crcTable = makeCRCTable();
      const iterations = 1000;
      
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        calculateCRC32(testData, crcTable);
      }

      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const avgTime = totalTime / iterations;

      benchmarkResults.crcPerformance.calculation = {
        avgTime,
        iterations,
        dataSize: testData.length,
        throughput: (testData.length * iterations) / (totalTime / 1000) / 1024 / 1024
      };

      expect(avgTime).toBeLessThan(5); // Should be under 5ms per 64KB
      console.log(`CRC32 Calculation: ${avgTime.toFixed(2)}ms avg, ${benchmarkResults.crcPerformance.calculation.throughput.toFixed(2)} MB/s`);
    });
  });

  describe('Image Processing Performance', () => {
    test('PNG parsing performance', () => {
      const pngPath = path.join(fixturesPath, 'test-image.png');
      const pngContent = fs.readFileSync(pngPath);
      const iterations = 100;
      
      function parsePNGChunks(content) {
        const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
        if (!content.subarray(0, 8).equals(PNG_SIGNATURE)) {
          throw new Error('Not a valid PNG file');
        }

        const chunks = [];
        let pos = 8;

        while (pos < content.length) {
          const length = content.readUInt32BE(pos);
          const chunkType = content.subarray(pos + 4, pos + 8);

          if (!chunkType.equals(Buffer.from('IEND'))) {
            chunks.push(content.subarray(pos, pos + 8 + length + 4));
          }

          pos += 8 + length + 4;
        }

        return chunks;
      }

      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        parsePNGChunks(pngContent);
      }

      const endTime = performance.now();
      const avgTime = (endTime - startTime) / iterations;

      benchmarkResults.imageProcessing.pngParsing = {
        avgTime,
        iterations,
        fileSize: pngContent.length
      };

      expect(avgTime).toBeLessThan(10); // Should parse PNG in under 10ms
      console.log(`PNG Parsing: ${avgTime.toFixed(2)}ms avg for ${Math.round(pngContent.length / 1024)}KB file`);
    });

    test('JPEG comment insertion performance', () => {
      const jpegPath = path.join(fixturesPath, 'test-image.jpg');
      const jpegContent = fs.readFileSync(jpegPath);
      const iterations = 100;
      
      function addJPEGComment(content, comment) {
        let insertPos = 2;
        
        while (insertPos < content.length - 1) {
          if (content[insertPos] === 0xFF) {
            const marker = content[insertPos + 1];
            if (marker === 0xDA) break;
            
            if (marker >= 0xE0 && marker <= 0xEF) {
              const segmentLength = (content[insertPos + 2] << 8) | content[insertPos + 3];
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
        const commentSegment = Buffer.alloc(4 + commentData.length);
        
        commentSegment[0] = 0xFF;
        commentSegment[1] = 0xFE;
        commentSegment[2] = (segmentLength >> 8) & 0xFF;
        commentSegment[3] = segmentLength & 0xFF;
        commentData.copy(commentSegment, 4);

        return Buffer.concat([
          content.subarray(0, insertPos),
          commentSegment,
          content.subarray(insertPos)
        ]);
      }

      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        addJPEGComment(jpegContent, `test comment ${i}`);
      }

      const endTime = performance.now();
      const avgTime = (endTime - startTime) / iterations;

      benchmarkResults.imageProcessing.jpegCommentInsertion = {
        avgTime,
        iterations,
        fileSize: jpegContent.length
      };

      expect(avgTime).toBeLessThan(5); // Should insert comment in under 5ms
      console.log(`JPEG Comment Insertion: ${avgTime.toFixed(2)}ms avg for ${Math.round(jpegContent.length / 1024)}KB file`);
    });
  });

  describe('Memory Usage Analysis', () => {
    test('should not leak memory during repeated operations', () => {
      const initialMemory = process.memoryUsage();
      const iterations = 1000;
      const testData = Buffer.alloc(1024, 'memory test');

      // Perform many hash operations
      for (let i = 0; i < iterations; i++) {
        const hash = createHash('sha256').update(testData).digest('hex');
        // Force garbage collection periodically
        if (i % 100 === 0 && global.gc) {
          global.gc();
        }
      }

      const finalMemory = process.memoryUsage();
      const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;

      // Memory growth should be minimal (less than 10MB for this test)
      expect(memoryGrowth).toBeLessThan(10 * 1024 * 1024);
      
      console.log(`Memory growth: ${Math.round(memoryGrowth / 1024 / 1024)}MB after ${iterations} operations`);
    });
  });

  afterAll(() => {
    // Save benchmark results for tracking over time
    const benchmarkFile = path.join(__dirname, '../benchmark-results.json');
    const timestamp = new Date().toISOString();
    
    const results = {
      timestamp,
      ...benchmarkResults,
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch
      }
    };

    fs.writeFileSync(benchmarkFile, JSON.stringify(results, null, 2));
    console.log('\n📊 Benchmark Results Summary:');
    console.log('================================');
    console.log(`Hash Performance:`);
    if (benchmarkResults.hashPerformance.sha256) {
      console.log(`  SHA-256: ${benchmarkResults.hashPerformance.sha256.throughput.toFixed(2)} MB/s`);
    }
    if (benchmarkResults.hashPerformance.sha512) {
      console.log(`  SHA-512: ${benchmarkResults.hashPerformance.sha512.throughput.toFixed(2)} MB/s`);
    }
    console.log(`CRC32 Performance:`);
    if (benchmarkResults.crcPerformance.calculation) {
      console.log(`  CRC32: ${benchmarkResults.crcPerformance.calculation.throughput.toFixed(2)} MB/s`);
    }
    console.log(`\n📁 Results saved to: ${benchmarkFile}`);
  });
});
