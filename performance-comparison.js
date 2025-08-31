import fs from 'fs';
import { createHash } from 'node:crypto';
import { performance } from 'perf_hooks';
import { MicroBenchmark, OperationTimer } from './timer.js';

// Mock image data for testing
function createMockPNGImage(size = 1024) {
    const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const mockImageData = Buffer.alloc(size);
    mockImageData.fill(0x42); // Fill with some data
    
    // Create a minimal IHDR chunk
    const ihdrData = Buffer.alloc(13);
    ihdrData.writeUInt32BE(100, 0); // width
    ihdrData.writeUInt32BE(100, 4); // height
    ihdrData[8] = 8; // bit depth
    ihdrData[9] = 2; // color type
    
    const ihdrChunk = createPNGChunk('IHDR', ihdrData);
    const idatChunk = createPNGChunk('IDAT', mockImageData);
    const iendChunk = createPNGChunk('IEND', Buffer.alloc(0));
    
    return Buffer.concat([PNG_SIGNATURE, ihdrChunk, idatChunk, iendChunk]);
}

function createPNGChunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    
    const typeBuffer = Buffer.from(type);
    const chunk = Buffer.concat([typeBuffer, data]);
    
    // Simplified CRC calculation (for testing only)
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(0x12345678, 0);
    
    return Buffer.concat([length, chunk, crc]);
}

function createMockJPEGImage(size = 1024) {
    const JPEG_SIGNATURE = Buffer.from([0xFF, 0xD8]);
    const mockData = Buffer.alloc(size);
    mockData.fill(0x55);
    
    const jpegEnd = Buffer.from([0xFF, 0xD9]);
    
    return Buffer.concat([JPEG_SIGNATURE, mockData, jpegEnd]);
}

// Enhanced performance test functions with detailed timing
async function testOriginalAlgorithm(data, targetPrefix, maxAttempts = 10000) {
    console.log(`Testing original algorithm with ${maxAttempts} attempts...`);
    const operationTimer = new OperationTimer();
    const startTime = performance.now();
    
    const timingBreakdown = {
        dataPreparation: 0,
        hashCalculation: 0,
        comparison: 0
    };
    
    for (let i = 0; i < maxAttempts; i++) {
        // Time data preparation
        const prepStart = performance.now();
        const testData = Buffer.concat([data, Buffer.from(`attempt-${i}`)]);
        timingBreakdown.dataPreparation += performance.now() - prepStart;
        
        // Time hash calculation
        const hashStart = performance.now();
        const hash = createHash('sha256').update(testData).digest('hex');
        timingBreakdown.hashCalculation += performance.now() - hashStart;
        
        // Time comparison
        const compStart = performance.now();
        const matches = hash.startsWith(targetPrefix);
        timingBreakdown.comparison += performance.now() - compStart;
        
        if (matches) {
            const endTime = performance.now();
            const totalTime = endTime - startTime;
            return {
                found: true,
                attempts: i + 1,
                time: totalTime,
                rate: (i + 1) / (totalTime / 1000),
                timingBreakdown,
                averageOperationTimes: {
                    dataPreparation: timingBreakdown.dataPreparation / (i + 1),
                    hashCalculation: timingBreakdown.hashCalculation / (i + 1),
                    comparison: timingBreakdown.comparison / (i + 1)
                }
            };
        }
    }
    
    const endTime = performance.now();
    const totalTime = endTime - startTime;
    return {
        found: false,
        attempts: maxAttempts,
        time: totalTime,
        rate: maxAttempts / (totalTime / 1000),
        timingBreakdown,
        averageOperationTimes: {
            dataPreparation: timingBreakdown.dataPreparation / maxAttempts,
            hashCalculation: timingBreakdown.hashCalculation / maxAttempts,
            comparison: timingBreakdown.comparison / maxAttempts
        }
    };
}

async function testOptimizedAlgorithm(data, targetPrefix, maxAttempts = 10000) {
    console.log(`Testing optimized algorithm with ${maxAttempts} attempts...`);
    const operationTimer = new OperationTimer();
    const startTime = performance.now();
    
    // Time the optimization setup
    operationTimer.startOperation('setup');
    
    // Pre-allocate hex lookup table (optimization)
    const hexLookup = [];
    for (let i = 0; i < 256; i++) {
        hexLookup[i] = i.toString(16).padStart(2, '0');
    }
    
    function optimizedHex(bytes) {
        let result = '';
        for (let i = 0; i < bytes.length; i++) {
            result += hexLookup[bytes[i]];
        }
        return result;
    }
    
    // Pre-allocate buffer
    const baseSize = data.length;
    const maxCommentSize = 50;
    const buffer = Buffer.allocUnsafe(baseSize + maxCommentSize);
    data.copy(buffer, 0);
    
    operationTimer.endOperation('setup');
    
    const timingBreakdown = {
        dataPreparation: 0,
        hashCalculation: 0,
        hexConversion: 0,
        comparison: 0
    };
    
    for (let i = 0; i < maxAttempts; i++) {
        // Time data preparation
        const prepStart = performance.now();
        const comment = `attempt-${i}`;
        const commentBuffer = Buffer.from(comment);
        commentBuffer.copy(buffer, baseSize);
        const testData = buffer.subarray(0, baseSize + commentBuffer.length);
        timingBreakdown.dataPreparation += performance.now() - prepStart;
        
        // Time hash calculation
        const hashStart = performance.now();
        const hashBuffer = createHash('sha256').update(testData).digest();
        timingBreakdown.hashCalculation += performance.now() - hashStart;
        
        // Time hex conversion
        const hexStart = performance.now();
        const hash = optimizedHex(hashBuffer);
        timingBreakdown.hexConversion += performance.now() - hexStart;
        
        // Time comparison
        const compStart = performance.now();
        const matches = hash.startsWith(targetPrefix);
        timingBreakdown.comparison += performance.now() - compStart;
        
        if (matches) {
            const endTime = performance.now();
            const totalTime = endTime - startTime;
            return {
                found: true,
                attempts: i + 1,
                time: totalTime,
                rate: (i + 1) / (totalTime / 1000),
                timingBreakdown,
                averageOperationTimes: {
                    dataPreparation: timingBreakdown.dataPreparation / (i + 1),
                    hashCalculation: timingBreakdown.hashCalculation / (i + 1),
                    hexConversion: timingBreakdown.hexConversion / (i + 1),
                    comparison: timingBreakdown.comparison / (i + 1)
                },
                optimizations: {
                    preAllocatedBuffer: true,
                    hexLookupTable: true,
                    setupTime: operationTimer.getOperationStats('setup').duration
                }
            };
        }
    }
    
    const endTime = performance.now();
    const totalTime = endTime - startTime;
    return {
        found: false,
        attempts: maxAttempts,
        time: totalTime,
        rate: maxAttempts / (totalTime / 1000),
        timingBreakdown,
        averageOperationTimes: {
            dataPreparation: timingBreakdown.dataPreparation / maxAttempts,
            hashCalculation: timingBreakdown.hashCalculation / maxAttempts,
            hexConversion: timingBreakdown.hexConversion / maxAttempts,
            comparison: timingBreakdown.comparison / maxAttempts
        },
        optimizations: {
            preAllocatedBuffer: true,
            hexLookupTable: true,
            setupTime: operationTimer.getOperationStats('setup').duration
        }
    };
}

// Memory usage comparison
function measureMemoryUsage() {
    const used = process.memoryUsage();
    return {
        rss: Math.round(used.rss / 1024 / 1024 * 100) / 100,
        heapTotal: Math.round(used.heapTotal / 1024 / 1024 * 100) / 100,
        heapUsed: Math.round(used.heapUsed / 1024 / 1024 * 100) / 100,
        external: Math.round(used.external / 1024 / 1024 * 100) / 100
    };
}

// Micro-benchmark individual operations
async function runMicroBenchmarks() {
    console.log('🔬 Running Micro-Benchmarks\n');
    const microBench = new MicroBenchmark();
    const results = {};

    // Test data preparation
    const testData = Buffer.alloc(1024, 0x42);
    
    console.log('Testing individual operations...');
    
    // Benchmark Buffer.concat vs pre-allocated buffer
    results.bufferConcat = await microBench.benchmark(
        'buffer_concat',
        () => {
            const additional = Buffer.from('test-data-123');
            return Buffer.concat([testData, additional]);
        },
        10000,
        1000
    );
    
    // Benchmark pre-allocated buffer approach
    const preAllocBuffer = Buffer.allocUnsafe(testData.length + 50);
    testData.copy(preAllocBuffer, 0);
    
    results.bufferPrealloc = await microBench.benchmark(
        'buffer_prealloc',
        () => {
            const additional = Buffer.from('test-data-123');
            additional.copy(preAllocBuffer, testData.length);
            return preAllocBuffer.subarray(0, testData.length + additional.length);
        },
        10000,
        1000
    );
    
    // Benchmark SHA-256 hash calculation
    results.sha256Hash = await microBench.benchmark(
        'sha256_hash',
        () => {
            return createHash('sha256').update(testData).digest('hex');
        },
        5000,
        500
    );
    
    // Benchmark hex conversion methods
    const hashBuffer = createHash('sha256').update(testData).digest();
    
    results.hexStandard = await microBench.benchmark(
        'hex_standard',
        () => {
            return hashBuffer.toString('hex');
        },
        100000,
        10000
    );
    
    // Create lookup table for optimized hex
    const hexLookup = [];
    for (let i = 0; i < 256; i++) {
        hexLookup[i] = i.toString(16).padStart(2, '0');
    }
    
    results.hexOptimized = await microBench.benchmark(
        'hex_optimized',
        () => {
            let result = '';
            for (let i = 0; i < hashBuffer.length; i++) {
                result += hexLookup[hashBuffer[i]];
            }
            return result;
        },
        100000,
        10000
    );
    
    // Benchmark string comparisons
    const testHash = 'a1b2c3d4e5f6789';
    const prefix = 'a1b';
    
    results.stringStartsWith = await microBench.benchmark(
        'string_startswith',
        () => {
            return testHash.startsWith(prefix);
        },
        1000000,
        100000
    );
    
    results.stringSliceCompare = await microBench.benchmark(
        'string_slice_compare',
        () => {
            return testHash.slice(0, prefix.length) === prefix;
        },
        1000000,
        100000
    );
    
    // Print micro-benchmark results
    console.log('\n🔬 MICRO-BENCHMARK RESULTS');
    console.log('='.repeat(50));
    
    Object.entries(results).forEach(([name, result]) => {
        console.log(`\n${name}:`);
        console.log(`  Operations/sec: ${result.throughput.operationsPerSecond.toFixed(0)}`);
        console.log(`  Average time:   ${result.statistics.mean.toFixed(4)}ms`);
        console.log(`  Min time:       ${result.statistics.min.toFixed(4)}ms`);
        console.log(`  Max time:       ${result.statistics.max.toFixed(4)}ms`);
        console.log(`  P95 time:       ${result.statistics.p95.toFixed(4)}ms`);
    });
    
    // Performance comparisons
    console.log('\n📊 OPERATION COMPARISONS');
    console.log('='.repeat(50));
    
    const bufferSpeedup = results.bufferConcat.statistics.mean / results.bufferPrealloc.statistics.mean;
    console.log(`Buffer pre-allocation is ${bufferSpeedup.toFixed(2)}x faster than Buffer.concat`);
    
    const hexSpeedup = results.hexStandard.statistics.mean / results.hexOptimized.statistics.mean;
    console.log(`Optimized hex conversion is ${hexSpeedup.toFixed(2)}x faster than standard`);
    
    const stringSpeedup = results.stringSliceCompare.statistics.mean / results.stringStartsWith.statistics.mean;
    console.log(`String.startsWith is ${stringSpeedup.toFixed(2)}x faster than slice comparison`);
    
    return results;
}

// Analyze timing breakdown
function analyzeTimingBreakdown(originalResult, optimizedResult) {
    console.log('\n⏱️  DETAILED TIMING ANALYSIS');
    console.log('='.repeat(50));
    
    console.log('\nOriginal Algorithm Breakdown:');
    Object.entries(originalResult.averageOperationTimes).forEach(([op, time]) => {
        const percentage = (time / (originalResult.time / originalResult.attempts)) * 100;
        console.log(`  ${op}: ${time.toFixed(4)}ms (${percentage.toFixed(1)}%)`);
    });
    
    console.log('\nOptimized Algorithm Breakdown:');
    Object.entries(optimizedResult.averageOperationTimes).forEach(([op, time]) => {
        const percentage = (time / (optimizedResult.time / optimizedResult.attempts)) * 100;
        console.log(`  ${op}: ${time.toFixed(4)}ms (${percentage.toFixed(1)}%)`);
    });
    
    // Calculate improvement per operation
    console.log('\nOperation-by-Operation Improvements:');
    const commonOps = ['dataPreparation', 'hashCalculation', 'comparison'];
    
    commonOps.forEach(op => {
        if (originalResult.averageOperationTimes[op] && optimizedResult.averageOperationTimes[op]) {
            const improvement = originalResult.averageOperationTimes[op] / optimizedResult.averageOperationTimes[op];
            console.log(`  ${op}: ${improvement.toFixed(2)}x faster`);
        }
    });
    
    if (optimizedResult.optimizations) {
        console.log('\nOptimizations Applied:');
        Object.entries(optimizedResult.optimizations).forEach(([opt, value]) => {
            if (typeof value === 'boolean' && value) {
                console.log(`  ✅ ${opt}`);
            } else if (typeof value === 'number') {
                console.log(`  ⏱️  ${opt}: ${value.toFixed(4)}ms`);
            }
        });
    }
}

// Run performance comparison
async function runPerformanceComparison() {
    console.log('🚀 Starting Enhanced Performance Comparison\n');
    console.log('='.repeat(60));
    
    // First run micro-benchmarks
    const microResults = await runMicroBenchmarks();
    
    console.log('\n\n🏃 Starting Full Algorithm Tests\n');
    console.log('='.repeat(60));
    
    const testCases = [
        { name: 'PNG Image (Small)', data: createMockPNGImage(1024), target: '0x1' },
        { name: 'PNG Image (Medium)', data: createMockPNGImage(10240), target: '0x2' },
        { name: 'JPEG Image (Small)', data: createMockJPEGImage(1024), target: '0x3' },
        { name: 'JPEG Image (Medium)', data: createMockJPEGImage(10240), target: '0x4' }
    ];
    
    const results = [];
    
    for (const testCase of testCases) {
        console.log(`\n📊 Testing: ${testCase.name}`);
        console.log(`   Data size: ${testCase.data.length} bytes`);
        console.log(`   Target: ${testCase.target}`);
        console.log('-'.repeat(40));
        
        const memoryBefore = measureMemoryUsage();
        
        // Test original algorithm
        const originalResult = await testOriginalAlgorithm(testCase.data, testCase.target.slice(2), 5000);
        const memoryAfterOriginal = measureMemoryUsage();
        
        // Clear memory
        global.gc && global.gc();
        
        // Test optimized algorithm
        const optimizedResult = await testOptimizedAlgorithm(testCase.data, testCase.target.slice(2), 5000);
        const memoryAfterOptimized = measureMemoryUsage();
        
        const comparison = {
            testCase: testCase.name,
            original: originalResult,
            optimized: optimizedResult,
            speedup: originalResult.time > 0 ? (originalResult.time / optimizedResult.time).toFixed(2) : 'N/A',
            memoryOriginal: memoryAfterOriginal,
            memoryOptimized: memoryAfterOptimized
        };
        
        results.push(comparison);
        
        console.log(`✅ Original:  ${originalResult.time.toFixed(2)}ms, ${originalResult.rate.toFixed(0)} attempts/sec`);
        console.log(`🚀 Optimized: ${optimizedResult.time.toFixed(2)}ms, ${optimizedResult.rate.toFixed(0)} attempts/sec`);
        console.log(`📈 Speedup:   ${comparison.speedup}x`);
        
        // Add detailed timing analysis for the first test case
        if (results.length === 1) {
            analyzeTimingBreakdown(originalResult, optimizedResult);
        }
    }
    
    // Summary report
    console.log('\n' + '='.repeat(60));
    console.log('📋 PERFORMANCE SUMMARY REPORT');
    console.log('='.repeat(60));
    
    results.forEach(result => {
        console.log(`\n${result.testCase}:`);
        console.log(`  Original Time:     ${result.original.time.toFixed(2)}ms`);
        console.log(`  Optimized Time:    ${result.optimized.time.toFixed(2)}ms`);
        console.log(`  Performance Gain:  ${result.speedup}x faster`);
        console.log(`  Original Rate:     ${result.original.rate.toFixed(0)} attempts/sec`);
        console.log(`  Optimized Rate:    ${result.optimized.rate.toFixed(0)} attempts/sec`);
        console.log(`  Memory (Original): ${result.memoryOriginal.heapUsed}MB`);
        console.log(`  Memory (Optimized):${result.memoryOptimized.heapUsed}MB`);
    });
    
    const avgSpeedup = results.reduce((acc, r) => acc + parseFloat(r.speedup), 0) / results.length;
    console.log(`\n🎯 Average Performance Improvement: ${avgSpeedup.toFixed(2)}x`);
    
    // Statistical analysis of results
    console.log('\n📈 STATISTICAL ANALYSIS');
    console.log('='.repeat(60));
    
    const speedups = results.map(r => parseFloat(r.speedup)).filter(s => !isNaN(s));
    const minSpeedup = Math.min(...speedups);
    const maxSpeedup = Math.max(...speedups);
    const medianSpeedup = speedups.sort((a, b) => a - b)[Math.floor(speedups.length / 2)];
    
    console.log(`Minimum Speedup: ${minSpeedup.toFixed(2)}x`);
    console.log(`Maximum Speedup: ${maxSpeedup.toFixed(2)}x`);
    console.log(`Median Speedup:  ${medianSpeedup.toFixed(2)}x`);
    console.log(`Average Speedup: ${avgSpeedup.toFixed(2)}x`);
    
    // Memory efficiency analysis
    const memoryImprovements = results.map(r => {
        const originalMem = r.memoryOriginal.heapUsed;
        const optimizedMem = r.memoryOptimized.heapUsed;
        return ((originalMem - optimizedMem) / originalMem) * 100;
    });
    
    const avgMemoryImprovement = memoryImprovements.reduce((a, b) => a + b) / memoryImprovements.length;
    console.log(`\nMemory Usage Improvement: ${avgMemoryImprovement.toFixed(1)}% on average`);
    
    // Additional optimization suggestions
    console.log('\n' + '='.repeat(60));
    console.log('💡 OPTIMIZATION RECOMMENDATIONS');
    console.log('='.repeat(60));
    console.log('1. Use Web Workers/Worker Threads for parallel processing');
    console.log('2. Implement SharedArrayBuffer for better memory efficiency');
    console.log('3. Use pre-computed lookup tables for hex conversion');
    console.log('4. Reduce progress update frequency to minimize overhead');
    console.log('5. Pre-allocate buffers to avoid garbage collection');
    console.log('6. Use typed arrays (Uint8Array) for better performance');
    console.log('7. Implement adaptive stopping based on target difficulty');
    console.log('8. Cache frequently used computations (CRC tables)');
    
    return results;
}

// Export for use as module or run directly
if (import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
    runPerformanceComparison()
        .then(results => {
            console.log('\n✅ Performance comparison completed successfully!');
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Error during performance comparison:', error);
            process.exit(1);
        });
}

export { runPerformanceComparison, testOriginalAlgorithm, testOptimizedAlgorithm };
