import fs from 'fs';
import { createHash } from 'node:crypto';
import { performance } from 'perf_hooks';

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

// Performance test functions
async function testOriginalAlgorithm(data, targetPrefix, maxAttempts = 10000) {
    console.log(`Testing original algorithm with ${maxAttempts} attempts...`);
    const startTime = performance.now();
    
    for (let i = 0; i < maxAttempts; i++) {
        const testData = Buffer.concat([data, Buffer.from(`attempt-${i}`)]);
        const hash = createHash('sha256').update(testData).digest('hex');
        
        if (hash.startsWith(targetPrefix)) {
            const endTime = performance.now();
            return {
                found: true,
                attempts: i + 1,
                time: endTime - startTime,
                rate: i / ((endTime - startTime) / 1000)
            };
        }
    }
    
    const endTime = performance.now();
    return {
        found: false,
        attempts: maxAttempts,
        time: endTime - startTime,
        rate: maxAttempts / ((endTime - startTime) / 1000)
    };
}

async function testOptimizedAlgorithm(data, targetPrefix, maxAttempts = 10000) {
    console.log(`Testing optimized algorithm with ${maxAttempts} attempts...`);
    const startTime = performance.now();
    
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
    
    for (let i = 0; i < maxAttempts; i++) {
        const comment = `attempt-${i}`;
        const commentBuffer = Buffer.from(comment);
        
        // Efficient buffer manipulation
        commentBuffer.copy(buffer, baseSize);
        const testData = buffer.subarray(0, baseSize + commentBuffer.length);
        
        const hashBuffer = createHash('sha256').update(testData).digest();
        const hash = optimizedHex(hashBuffer);
        
        if (hash.startsWith(targetPrefix)) {
            const endTime = performance.now();
            return {
                found: true,
                attempts: i + 1,
                time: endTime - startTime,
                rate: i / ((endTime - startTime) / 1000)
            };
        }
    }
    
    const endTime = performance.now();
    return {
        found: false,
        attempts: maxAttempts,
        time: endTime - startTime,
        rate: maxAttempts / ((endTime - startTime) / 1000)
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

// Run performance comparison
async function runPerformanceComparison() {
    console.log('🚀 Starting Performance Comparison\n');
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
