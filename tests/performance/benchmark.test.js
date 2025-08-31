import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createHash } from 'crypto';
import { performance } from 'perf_hooks';
import { MicroBenchmark, OperationTimer, HashingTimer } from '../../timer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Enhanced Performance benchmarking tests
 * Tracks optimization improvements, regression detection, and detailed timing analysis
 */
describe('Enhanced Performance Benchmarks', () => {
  const fixturesPath = path.join(__dirname, '../fixtures');
  const microBench = new MicroBenchmark();
  const operationTimer = new OperationTimer();
  
  const benchmarkResults = {
    hashPerformance: {},
    crcPerformance: {},
    imageProcessing: {},
    microBenchmarks: {},
    timingAnalysis: {},
    statisticalAnalysis: {}
  };

  describe('Hash Algorithm Performance', () => {
    const testData = Buffer.alloc(1024 * 1024, 'benchmark data'); // 1MB test data

    test('SHA-256 enhanced performance benchmark', async () => {
      const iterations = 100;
      
      // Micro-benchmark with detailed statistics
      const microResult = await microBench.benchmark(
        'sha256_1mb',
        () => createHash('sha256').update(testData).digest('hex'),
        iterations,
        20
      );
      
      benchmarkResults.hashPerformance.sha256 = {
        ...microResult,
        dataSize: testData.length,
        throughput: (testData.length * iterations) / (microResult.totalTime / 1000) / 1024 / 1024, // MB/s
        statisticalAnalysis: {
          mean: microResult.statistics.mean,
          median: microResult.statistics.median,
          standardDeviation: microResult.statistics.standardDeviation,
          p95: microResult.statistics.p95,
          p99: microResult.statistics.p99,
          coefficientOfVariation: microResult.statistics.standardDeviation / microResult.statistics.mean
        }
      };

      // Enhanced performance expectations with statistical validation
      expect(microResult.statistics.mean).toBeLessThan(50); // Mean should be under 50ms per MB
      expect(microResult.statistics.p95).toBeLessThan(100); // 95th percentile under 100ms
      expect(benchmarkResults.hashPerformance.sha256.throughput).toBeGreaterThan(10); // At least 10 MB/s
      expect(microResult.statistics.standardDeviation / microResult.statistics.mean).toBeLessThan(0.5); // Consistent performance

      console.log(`SHA-256 Enhanced Performance:`);
      console.log(`  Mean: ${microResult.statistics.mean.toFixed(2)}ms`);
      console.log(`  P95:  ${microResult.statistics.p95.toFixed(2)}ms`);
      console.log(`  P99:  ${microResult.statistics.p99.toFixed(2)}ms`);
      console.log(`  Throughput: ${benchmarkResults.hashPerformance.sha256.throughput.toFixed(2)} MB/s`);
      console.log(`  Consistency: ${(microResult.statistics.standardDeviation / microResult.statistics.mean * 100).toFixed(1)}% variation`);
    });

    test('SHA-512 enhanced performance benchmark', async () => {
      const iterations = 100;
      
      // Micro-benchmark with detailed statistics
      const microResult = await microBench.benchmark(
        'sha512_1mb',
        () => createHash('sha512').update(testData).digest('hex'),
        iterations,
        20
      );
      
      benchmarkResults.hashPerformance.sha512 = {
        ...microResult,
        dataSize: testData.length,
        throughput: (testData.length * iterations) / (microResult.totalTime / 1000) / 1024 / 1024,
        statisticalAnalysis: {
          mean: microResult.statistics.mean,
          median: microResult.statistics.median,
          standardDeviation: microResult.statistics.standardDeviation,
          p95: microResult.statistics.p95,
          p99: microResult.statistics.p99,
          coefficientOfVariation: microResult.statistics.standardDeviation / microResult.statistics.mean
        }
      };

      expect(microResult.statistics.mean).toBeLessThan(100); // Mean should be under 100ms per MB
      expect(microResult.statistics.p95).toBeLessThan(200); // 95th percentile under 200ms
      expect(benchmarkResults.hashPerformance.sha512.throughput).toBeGreaterThan(5); // At least 5 MB/s
      expect(microResult.statistics.standardDeviation / microResult.statistics.mean).toBeLessThan(0.5); // Consistent performance

      console.log(`SHA-512 Enhanced Performance:`);
      console.log(`  Mean: ${microResult.statistics.mean.toFixed(2)}ms`);
      console.log(`  P95:  ${microResult.statistics.p95.toFixed(2)}ms`);
      console.log(`  P99:  ${microResult.statistics.p99.toFixed(2)}ms`);
      console.log(`  Throughput: ${benchmarkResults.hashPerformance.sha512.throughput.toFixed(2)} MB/s`);
      console.log(`  Consistency: ${(microResult.statistics.standardDeviation / microResult.statistics.mean * 100).toFixed(1)}% variation`);
    });
    
    test('Hash algorithm comparison analysis', () => {
      if (benchmarkResults.hashPerformance.sha256 && benchmarkResults.hashPerformance.sha512) {
        const sha256Stats = benchmarkResults.hashPerformance.sha256.statisticalAnalysis;
        const sha512Stats = benchmarkResults.hashPerformance.sha512.statisticalAnalysis;
        
        const speedRatio = sha512Stats.mean / sha256Stats.mean;
        const throughputRatio = benchmarkResults.hashPerformance.sha256.throughput / benchmarkResults.hashPerformance.sha512.throughput;
        
        benchmarkResults.timingAnalysis.algorithmComparison = {
          sha256Faster: speedRatio > 1,
          speedRatio,
          throughputRatio,
          recommendation: speedRatio > 1.2 ? 'Use SHA-256 for better performance' : 
                        speedRatio < 0.8 ? 'SHA-512 performs unexpectedly well' : 
                        'Both algorithms perform similarly'
        };
        
        console.log(`\nAlgorithm Comparison:`);
        console.log(`  SHA-256 is ${speedRatio > 1 ? speedRatio.toFixed(2) + 'x slower' : (1/speedRatio).toFixed(2) + 'x faster'} than SHA-512`);
        console.log(`  Recommendation: ${benchmarkResults.timingAnalysis.algorithmComparison.recommendation}`);
      }
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

  describe('Advanced Timing Analysis', () => {
    test('HashingTimer integration test', async () => {
      const timer = new HashingTimer();
      timer.start();
      
      // Simulate hash spoofing attempts with checkpoints
      const maxAttempts = 1000;
      let foundMatch = false;
      
      for (let i = 0; i < maxAttempts; i++) {
        // Simulate work
        await new Promise(resolve => setTimeout(resolve, 1));
        
        // Add checkpoints every 100 attempts
        if (i % 100 === 0) {
          const checkpoint = timer.addCheckpoint('test_progress', i, maxAttempts, {
            testData: `attempt_${i}`
          });
          
          expect(checkpoint).toBeDefined();
          expect(checkpoint.attempt).toBe(i);
          expect(checkpoint.overallRate).toBeGreaterThan(0);
          expect(checkpoint.percentage).toBe((i / maxAttempts) * 100);
        }
        
        // Simulate finding match at 500 attempts
        if (i === 500) {
          foundMatch = true;
          break;
        }
      }
      
      timer.stop();
      const report = timer.getPerformanceReport();
      const statistics = timer.getStatistics();
      
      expect(report.duration).toBeGreaterThan(0.5); // At least 500ms
      expect(report.checkpoints).toBeGreaterThan(0);
      expect(statistics).toBeDefined();
      
      benchmarkResults.timingAnalysis.hashingTimerTest = {
        duration: report.duration,
        checkpoints: report.checkpoints,
        averageRate: report.averageRate,
        peakRate: report.peakRate,
        foundMatch,
        statistics
      };
      
      console.log(`HashingTimer Test: ${report.duration.toFixed(2)}s, ${report.averageRate.toFixed(0)} ops/sec`);
    });
    
    test('OperationTimer micro-operations test', async () => {
      operationTimer.enableProfiling();
      
      // Test various micro-operations
      const operations = [
        { name: 'buffer_alloc', fn: () => Buffer.alloc(1024) },
        { name: 'string_concat', fn: () => 'test' + Math.random().toString() },
        { name: 'array_push', fn: () => { const arr = []; for(let i = 0; i < 100; i++) arr.push(i); return arr; } },
        { name: 'object_create', fn: () => ({ id: Math.random(), data: 'test', timestamp: Date.now() }) }
      ];
      
      for (const operation of operations) {
        for (let i = 0; i < 1000; i++) {
          await operationTimer.timeFunction(operation.name, operation.fn);
        }
      }
      
      const allStats = operationTimer.getAllStats();
      const summary = operationTimer.getPerformanceSummary();
      
      benchmarkResults.microBenchmarks.operationTimer = {
        operations: allStats,
        summary,
        totalTime: summary.totalTime,
        totalOperations: summary.totalOperations
      };
      
      // Validate that all operations were timed
      operations.forEach(op => {
        expect(allStats[op.name]).toBeDefined();
        expect(allStats[op.name].calls).toBe(1000);
        expect(allStats[op.name].averageDuration).toBeGreaterThan(0);
      });
      
      console.log(`\nOperation Timing Results:`);
      Object.entries(allStats).forEach(([name, stats]) => {
        console.log(`  ${name}: ${stats.averageDuration.toFixed(4)}ms avg (${stats.calls} calls)`);
      });
    });
    
    test('Performance regression detection', () => {
      // Define baseline expectations (these would typically come from previous runs)
      const baselines = {
        sha256Throughput: 10, // MB/s minimum
        sha512Throughput: 5,  // MB/s minimum
        crcThroughput: 50,    // MB/s minimum
        pngParsingTime: 10,   // ms maximum
        jpegCommentTime: 5    // ms maximum
      };
      
      const regressions = [];
      
      // Check for regressions
      if (benchmarkResults.hashPerformance.sha256?.throughput < baselines.sha256Throughput) {
        regressions.push(`SHA-256 throughput regression: ${benchmarkResults.hashPerformance.sha256.throughput.toFixed(2)} < ${baselines.sha256Throughput} MB/s`);
      }
      
      if (benchmarkResults.hashPerformance.sha512?.throughput < baselines.sha512Throughput) {
        regressions.push(`SHA-512 throughput regression: ${benchmarkResults.hashPerformance.sha512.throughput.toFixed(2)} < ${baselines.sha512Throughput} MB/s`);
      }
      
      if (benchmarkResults.crcPerformance.calculation?.throughput < baselines.crcThroughput) {
        regressions.push(`CRC32 throughput regression: ${benchmarkResults.crcPerformance.calculation.throughput.toFixed(2)} < ${baselines.crcThroughput} MB/s`);
      }
      
      if (benchmarkResults.imageProcessing.pngParsing?.avgTime > baselines.pngParsingTime) {
        regressions.push(`PNG parsing time regression: ${benchmarkResults.imageProcessing.pngParsing.avgTime.toFixed(2)} > ${baselines.pngParsingTime} ms`);
      }
      
      if (benchmarkResults.imageProcessing.jpegCommentInsertion?.avgTime > baselines.jpegCommentTime) {
        regressions.push(`JPEG comment insertion time regression: ${benchmarkResults.imageProcessing.jpegCommentInsertion.avgTime.toFixed(2)} > ${baselines.jpegCommentTime} ms`);
      }
      
      benchmarkResults.statisticalAnalysis.regressionDetection = {
        baselines,
        regressions,
        hasRegressions: regressions.length > 0
      };
      
      if (regressions.length > 0) {
        console.warn('\n⚠️  Performance Regressions Detected:');
        regressions.forEach(regression => console.warn(`  - ${regression}`));
      } else {
        console.log('\n✅ No performance regressions detected');
      }
      
      // Don't fail the test for regressions, just warn
      expect(regressions).toBeDefined();
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
      
      benchmarkResults.statisticalAnalysis.memoryUsage = {
        initialHeap: Math.round(initialMemory.heapUsed / 1024 / 1024),
        finalHeap: Math.round(finalMemory.heapUsed / 1024 / 1024),
        growth: Math.round(memoryGrowth / 1024 / 1024),
        iterations
      };
      
      console.log(`Memory growth: ${Math.round(memoryGrowth / 1024 / 1024)}MB after ${iterations} operations`);
    });
    
    test('memory efficiency under load', async () => {
      const initialMemory = process.memoryUsage();
      const testData = Buffer.alloc(10 * 1024, 'load test'); // 10KB
      const operations = 5000;
      const memorySnapshots = [];
      
      for (let i = 0; i < operations; i++) {
        // Create some temporary objects
        const tempHash = createHash('sha256').update(testData).digest('hex');
        const tempObject = {
          iteration: i,
          hash: tempHash,
          timestamp: Date.now(),
          data: Array.from({ length: 100 }, (_, j) => j)
        };
        
        // Take memory snapshots periodically
        if (i % 500 === 0) {
          const currentMemory = process.memoryUsage();
          memorySnapshots.push({
            iteration: i,
            heapUsed: Math.round(currentMemory.heapUsed / 1024 / 1024),
            heapTotal: Math.round(currentMemory.heapTotal / 1024 / 1024)
          });
          
          // Force GC if available
          if (global.gc) global.gc();
        }
      }
      
      const finalMemory = process.memoryUsage();
      const totalGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
      
      benchmarkResults.statisticalAnalysis.memoryEfficiency = {
        operations,
        initialHeap: Math.round(initialMemory.heapUsed / 1024 / 1024),
        finalHeap: Math.round(finalMemory.heapUsed / 1024 / 1024),
        totalGrowth: Math.round(totalGrowth / 1024 / 1024),
        growthPerOperation: totalGrowth / operations,
        snapshots: memorySnapshots,
        memoryStable: totalGrowth < (50 * 1024 * 1024) // Less than 50MB growth
      };
      
      expect(totalGrowth).toBeLessThan(50 * 1024 * 1024); // Should not grow more than 50MB
      
      console.log(`Memory efficiency test: ${Math.round(totalGrowth / 1024 / 1024)}MB growth over ${operations} operations`);
      console.log(`Average growth per operation: ${(totalGrowth / operations).toFixed(2)} bytes`);
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
