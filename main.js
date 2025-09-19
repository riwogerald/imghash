// Import timer functionality
import { HashPerformanceAnalyzer, OperationTimer } from './timer.js';

class WebImageHashSpoofer {
    constructor() {
        this.PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
        this.JPEG_SIGNATURE = new Uint8Array([0xFF, 0xD8]);
        this.GIF87A_SIGNATURE = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]); // GIF87a
        this.GIF89A_SIGNATURE = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]); // GIF89a
        this.worker = null;
        this.workerPool = [];
        this.poolSize = Math.min(navigator.hardwareConcurrency || 4, 4);
        this.performanceAnalyzer = new HashPerformanceAnalyzer();
        this.operationTimer = new OperationTimer();
    }

    async init() {
        // Create a Web Worker for hash computation
        const workerCode = `
            class OptimizedHashWorker {
                constructor() {
                    this.PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
                    this.JPEG_SIGNATURE = new Uint8Array([0xFF, 0xD8]);
                    this.GIF87A_SIGNATURE = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]); // GIF87a
                    this.GIF89A_SIGNATURE = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]); // GIF89a
                    // Pre-generate CRC table once for better performance
                    this.crcTable = this.makeCRCTable();
                    // Pre-computed hex lookup table
                    this.hexLookup = [];
                    for (let i = 0; i < 256; i++) {
                        this.hexLookup[i] = i.toString(16).padStart(2, '0');
                    }
                }

                // Optimized hex conversion using pre-computed lookup table
                bytesToHex(bytes) {
                    let result = '';
                    for (let i = 0; i < bytes.length; i++) {
                        result += this.hexLookup[bytes[i]];
                    }
                    return result;
                }

                async sha256(data) {
                    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
                    const hashArray = new Uint8Array(hashBuffer);
                    return this.bytesToHex(hashArray);
                }

                async sha512(data) {
                    const hashBuffer = await crypto.subtle.digest('SHA-512', data);
                    const hashArray = new Uint8Array(hashBuffer);
                    return this.bytesToHex(hashArray);
                }

                // CRC32 hash computation for web worker
                crc32(data) {
                    const crc = this.calculateCRC32(data);
                    // Convert CRC32 to 8-character hex string (padded with zeros)
                    return crc.toString(16).padStart(8, '0');
                }

                createPNGChunk(chunkType, data) {
                    const length = new ArrayBuffer(4);
                    new DataView(length).setUint32(0, data.length, false);
                    
                    const chunk = new Uint8Array(chunkType.length + data.length);
                    chunk.set(chunkType, 0);
                    chunk.set(data, chunkType.length);
                    
                    const crc = this.calculateCRC32(chunk);
                    const crcBuffer = new ArrayBuffer(4);
                    new DataView(crcBuffer).setUint32(0, crc, false);
                    
                    const result = new Uint8Array(4 + chunk.length + 4);
                    result.set(new Uint8Array(length), 0);
                    result.set(chunk, 4);
                    result.set(new Uint8Array(crcBuffer), 4 + chunk.length);
                    
                    return result;
                }

                calculateCRC32(data) {
                    let crc = 0xFFFFFFFF;
                    
                    for (let i = 0; i < data.length; i++) {
                        crc = this.crcTable[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
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

                parsePNGChunks(content) {
                    const chunks = [];
                    let pos = 8;

                    while (pos < content.length) {
                        const length = new DataView(content.buffer, content.byteOffset + pos).getUint32(0, false);
                        const chunkType = content.slice(pos + 4, pos + 8);
                        
                        if (!this.arraysEqual(chunkType, new Uint8Array([73, 69, 78, 68]))) { // Not IEND
                            chunks.push(content.slice(pos, pos + 8 + length + 4));
                        }

                        pos += 8 + length + 4;
                    }

                    return chunks;
                }

                addJPEGComment(content, comment) {
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

                    const commentData = new TextEncoder().encode(comment);
                    const segmentLength = commentData.length + 2;
                    const commentSegment = new Uint8Array(4 + commentData.length);
                    
                    commentSegment[0] = 0xFF;
                    commentSegment[1] = 0xFE;
                    commentSegment[2] = (segmentLength >> 8) & 0xFF;
                    commentSegment[3] = segmentLength & 0xFF;
                    commentSegment.set(commentData, 4);

                    const result = new Uint8Array(content.length + commentSegment.length);
                    result.set(content.slice(0, insertPos), 0);
                    result.set(commentSegment, insertPos);
                    result.set(content.slice(insertPos), insertPos + commentSegment.length);
                    
                    return result;
                }

                arraysEqual(a, b) {
                    if (a.length !== b.length) return false;
                    for (let i = 0; i < a.length; i++) {
                        if (a[i] !== b[i]) return false;
                    }
                    return true;
                }

                // Check if file is GIF format
                isGIF(content) {
                    if (content.length < 6) return false;
                    const header = content.slice(0, 6);
                    return this.arraysEqual(header, this.GIF87A_SIGNATURE) || this.arraysEqual(header, this.GIF89A_SIGNATURE);
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
                    const logicalScreenDescriptor = content.slice(6, 13);
                    const globalColorTableFlag = (logicalScreenDescriptor[4] & 0x80) !== 0;
                    
                    if (globalColorTableFlag) {
                        const globalColorTableSize = logicalScreenDescriptor[4] & 0x07;
                        const colorTableSize = 3 * Math.pow(2, globalColorTableSize + 1);
                        insertPos += colorTableSize;
                    }

                    // Create GIF Comment Extension
                    // Format: Extension Introducer (0x21) + Comment Label (0xFE) + Data Sub-blocks + Block Terminator (0x00)
                    const commentData = new TextEncoder().encode(comment);
                    const maxSubBlockSize = 255;
                    const subBlocks = [];
                    
                    // Split comment data into sub-blocks of max 255 bytes each
                    for (let i = 0; i < commentData.length; i += maxSubBlockSize) {
                        const subBlockData = commentData.slice(i, Math.min(i + maxSubBlockSize, commentData.length));
                        const subBlock = new Uint8Array(1 + subBlockData.length);
                        subBlock[0] = subBlockData.length; // Sub-block size
                        subBlock.set(subBlockData, 1);
                        subBlocks.push(subBlock);
                    }

                    // Build the complete comment extension
                    let commentExtensionLength = 2 + 1; // Extension Introducer + Comment Label + Block Terminator
                    subBlocks.forEach(block => commentExtensionLength += block.length);
                    
                    const commentExtension = new Uint8Array(commentExtensionLength);
                    let pos = 0;
                    
                    commentExtension[pos++] = 0x21; // Extension Introducer
                    commentExtension[pos++] = 0xFE; // Comment Label
                    
                    subBlocks.forEach(block => {
                        commentExtension.set(block, pos);
                        pos += block.length;
                    });
                    
                    commentExtension[pos] = 0x00; // Block Terminator

                    // Insert comment extension
                    const result = new Uint8Array(content.length + commentExtension.length);
                    result.set(content.slice(0, insertPos), 0);
                    result.set(commentExtension, insertPos);
                    result.set(content.slice(insertPos), insertPos + commentExtension.length);
                    
                    return result;
                }

                // Calculate optimal attempt count based on target difficulty
                calculateOptimalMaxAttempts(targetPrefix) {
                    const prefixLength = targetPrefix.length;
                    const expectedAttempts = Math.pow(16, prefixLength);
                    // Use statistical approach: 3 * expected attempts for ~95% success rate
                    return Math.min(Math.max(expectedAttempts * 3, 100000), 10000000);
                }

                // Enhanced progress reporting with timing
                reportProgressWithTiming(attempt, maxAttempts, startTime) {
                    const elapsed = (performance.now() - startTime) / 1000;
                    const rate = attempt / elapsed;
                    const remaining = (maxAttempts - attempt) / rate;
                    const eta = new Date(Date.now() + remaining * 1000);
                    
                    return {
                        attempt,
                        maxAttempts,
                        elapsed,
                        rate: Math.round(rate),
                        estimatedRemaining: remaining,
                        eta: eta.toLocaleTimeString(),
                        percentage: (attempt / maxAttempts) * 100
                    };
                }

                async findMatchingHash(targetHex, originalData, imageFormat, hashAlgorithm, maxAttempts = 1000000) {
                    const targetPrefix = targetHex.startsWith('0x') ? targetHex.slice(2).toLowerCase() : targetHex.toLowerCase();
                    const optimalMaxAttempts = this.calculateOptimalMaxAttempts(targetPrefix);
                    const actualMaxAttempts = Math.min(maxAttempts, optimalMaxAttempts);
                    
                    // Enhanced timing with adaptive progress updates
                    const startTime = performance.now();
                    const progressInterval = Math.max(10000, Math.floor(actualMaxAttempts / 200)); // More frequent updates
                    let lastProgressTime = startTime;
                    
                    // Pre-parse chunks for PNG to avoid repeated parsing
                    let chunks;
                    if (imageFormat === 'PNG') {
                        chunks = this.parsePNGChunks(originalData);
                    }
                    
                    for (let i = 0; i < actualMaxAttempts; i++) {
                        // Enhanced progress reporting with timing data
                        if (i % progressInterval === 0) {
                            const now = performance.now();
                            const timingData = this.reportProgressWithTiming(i, actualMaxAttempts, startTime);
                            
                            self.postMessage({ 
                                type: 'progress', 
                                attempt: i, 
                                maxAttempts: actualMaxAttempts,
                                timing: timingData,
                                memoryUsage: performance.memory ? {
                                    used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024 * 100) / 100,
                                    total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024 * 100) / 100
                                } : null
                            });
                            
                            lastProgressTime = now;
                        }

                        let testContent;
                        
                        if (imageFormat === 'PNG') {
                            const testData = new TextEncoder().encode('Hash attempt ' + i + ' - ' + Date.now());
                            const commentChunk = this.createPNGChunk(new Uint8Array([116, 69, 88, 116]), testData); // tEXt
                            const iendChunk = this.createPNGChunk(new Uint8Array([73, 69, 78, 68]), new Uint8Array(0)); // IEND
                            
                            let totalLength = this.PNG_SIGNATURE.length + commentChunk.length + iendChunk.length;
                            chunks.forEach(chunk => totalLength += chunk.length);
                            
                            testContent = new Uint8Array(totalLength);
                            let pos = 0;
                            
                            testContent.set(this.PNG_SIGNATURE, pos);
                            pos += this.PNG_SIGNATURE.length;
                            
                            chunks.forEach(chunk => {
                                testContent.set(chunk, pos);
                                pos += chunk.length;
                            });
                            
                            testContent.set(commentChunk, pos);
                            pos += commentChunk.length;
                            
                            testContent.set(iendChunk, pos);
                        } else if (imageFormat === 'GIF') {
                            const comment = 'Hash attempt ' + i + ' - ' + Date.now();
                            testContent = this.addGIFComment(originalData, comment);
                        } else {
                            const comment = 'Hash attempt ' + i + ' - ' + Date.now();
                            testContent = this.addJPEGComment(originalData, comment);
                        }

                        let hash;
                        if (hashAlgorithm === 'crc32') {
                            hash = this.crc32(testContent);
                        } else if (hashAlgorithm === 'sha512') {
                            hash = await this.sha512(testContent);
                        } else {
                            hash = await this.sha256(testContent);
                        }
                        
                        if (hash.startsWith(targetPrefix)) {
                            const finalTime = performance.now();
                            const totalDuration = finalTime - startTime;
                            const finalRate = (i + 1) / (totalDuration / 1000);
                            
                            self.postMessage({ 
                                type: 'success', 
                                content: Array.from(testContent),
                                hash: hash,
                                attempts: i + 1,
                                timing: {
                                    totalDuration: totalDuration / 1000, // seconds
                                    averageRate: finalRate,
                                    timePerAttempt: totalDuration / (i + 1)
                                }
                            });
                            return;
                        }
                    }

                    self.postMessage({ type: 'error', message: 'Could not find matching hash after ' + maxAttempts + ' attempts' });
                }
            }

            const worker = new OptimizedHashWorker();

            self.onmessage = async function(e) {
                const { targetHex, originalData, imageFormat, hashAlgorithm, maxAttempts } = e.data;
                const dataArray = new Uint8Array(originalData);
                await worker.findMatchingHash(targetHex, dataArray, imageFormat, hashAlgorithm, maxAttempts);
            };
        `;

        const blob = new Blob([workerCode], { type: 'application/javascript' });
        this.worker = new Worker(URL.createObjectURL(blob));
    }

    async spoofImage(targetHex, imageFile, hashAlgorithm = 'sha512', onProgress = null) {
        if (!this.worker) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                const content = new Uint8Array(e.target.result);
                const isPNG = this.arraysEqual(content.slice(0, 8), this.PNG_SIGNATURE);
                const isJPEG = this.arraysEqual(content.slice(0, 2), this.JPEG_SIGNATURE);
                const isGIF87A = this.arraysEqual(content.slice(0, 6), this.GIF87A_SIGNATURE);
                const isGIF89A = this.arraysEqual(content.slice(0, 6), this.GIF89A_SIGNATURE);
                const isGIF = isGIF87A || isGIF89A;

                let imageFormat;
                if (isPNG) {
                    imageFormat = 'PNG';
                } else if (isJPEG) {
                    imageFormat = 'JPEG';
                } else if (isGIF) {
                    imageFormat = 'GIF';
                } else {
                    reject(new Error('Unsupported image format. Only PNG, JPEG, and GIF are supported.'));
                    return;
                }

                this.worker.onmessage = (e) => {
                    const { type, content: resultContent, hash, attempts, attempt, maxAttempts, message, timing, memoryUsage } = e.data;
                    
                    if (type === 'progress' && onProgress) {
                        onProgress(attempt, maxAttempts, timing, memoryUsage);
                    } else if (type === 'success') {
                        const resultArray = new Uint8Array(resultContent);
                        let mimeType;
                        if (imageFormat === 'PNG') {
                            mimeType = 'image/png';
                        } else if (imageFormat === 'GIF') {
                            mimeType = 'image/gif';
                        } else {
                            mimeType = 'image/jpeg';
                        }
                        const blob = new Blob([resultArray], { type: mimeType });
                        resolve({ blob, hash, attempts, timing });
                    } else if (type === 'error') {
                        reject(new Error(message));
                    }
                };

                this.worker.postMessage({
                    targetHex,
                    originalData: Array.from(content),
                    imageFormat,
                    hashAlgorithm,
                    maxAttempts: 1000000
                });
            };

            reader.readAsArrayBuffer(imageFile);
        });
    }

    arraysEqual(a, b) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) return false;
        }
        return true;
    }
}

// Export main class for use in other modules
export { WebImageHashSpoofer };

// Import batch processor
import { WebBatchProcessor } from './web-batch-processor.js';

// Import theme manager
import { themeManager } from './theme-manager.js';

// UI Management
class UI {
    constructor() {
        this.spoofer = new WebImageHashSpoofer();
        this.batchProcessor = new WebBatchProcessor();
        this.isBatchMode = false;
        this.batchFiles = [];
        this.initializeEventListeners();
        this.setupBatchProcessing();
        this.setupThemeToggle();
    }

    initializeEventListeners() {
        const form = document.getElementById('spoofForm');
        const fileInput = document.getElementById('imageFile');
        const fileDisplay = document.getElementById('fileDisplay');
        const fileInputWrapper = document.querySelector('.file-input-wrapper');

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                // Validate file type
                const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif'];
                if (!validTypes.includes(file.type)) {
                    this.showResult('Please select a valid PNG, JPEG, or GIF image file', 'error');
                    fileInput.value = '';
                    return;
                }
                
                // Validate file size (max 50MB)
                if (file.size > 50 * 1024 * 1024) {
                    this.showResult('File size too large. Please select a file smaller than 50MB', 'error');
                    fileInput.value = '';
                    return;
                }
                
                fileDisplay.classList.add('has-file');
                fileDisplay.innerHTML = `
                    <svg class="upload-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                    </svg>
                    <span>${file.name}</span>
                    <button type="button" class="remove-file" onclick="this.parentElement.parentElement.querySelector('input').value=''; this.parentElement.classList.remove('has-file'); this.parentElement.innerHTML='<svg class=\\"upload-icon\\" fill=\\"none\\" stroke=\\"currentColor\\" viewBox=\\"0 0 24 24\\"><path stroke-linecap=\\"round\\" stroke-linejoin=\\"round\\" stroke-width=\\"2\\" d=\\"M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12\\"></path></svg><span>Click to select an image file</span>';">×</button>
                `;
            } else {
                fileDisplay.classList.remove('has-file');
                fileDisplay.innerHTML = `
                    <svg class="upload-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                    </svg>
                    <span>Click to select an image file</span>
                `;
            }
        });

        // Handle click on file display to trigger file input
        fileDisplay.addEventListener('click', () => {
            fileInput.click();
        });

        // Handle drag and drop
        fileInputWrapper.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            fileDisplay.classList.add('drag-over');
        });

        fileInputWrapper.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            fileDisplay.classList.remove('drag-over');
        });

        fileInputWrapper.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            fileDisplay.classList.remove('drag-over');
            
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                fileInput.files = files;
                // Trigger change event
                const event = new Event('change', { bubbles: true });
                fileInput.dispatchEvent(event);
            }
        });

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSpoof();
        });
    }

    async handleSpoof() {
        const targetHash = document.getElementById('targetHash').value.trim();
        const hashAlgorithm = document.getElementById('hashAlgorithm').value;
        const imageFile = document.getElementById('imageFile').files[0];
        const button = document.getElementById('spoofButton');
        const progress = document.getElementById('progress');
        const result = document.getElementById('result');

        if (!targetHash || !imageFile) {
            this.showResult('Please fill in all fields', 'error');
            // Scroll to result smoothly
            result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            return;
        }

        if (!targetHash.startsWith('0x')) {
            this.showResult('Target hash must start with "0x"', 'error');
            result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            return;
        }

        // Additional validation for target hash
        const hexPattern = /^0x[0-9a-fA-F]+$/;
        if (!hexPattern.test(targetHash)) {
            this.showResult('Target hash must be a valid hexadecimal string (e.g., 0x24, 0xabc123)', 'error');
            result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            return;
        }

        button.disabled = true;
        button.textContent = 'Processing...';
        progress.classList.add('show');
        result.classList.remove('show');

        try {
            const { blob, hash, attempts, timing } = await this.spoofer.spoofImage(
                targetHash,
                imageFile,
                hashAlgorithm,
                (attempt, maxAttempts, timingData, memoryUsage) => {
                    const percentage = (attempt / maxAttempts) * 100;
                    document.getElementById('progressFill').style.width = `${percentage}%`;
                    
                    // Enhanced progress text with timing information
                    let progressText = `Attempt ${attempt.toLocaleString()} of ${maxAttempts.toLocaleString()}`;
                    
                    if (timingData) {
                        progressText += ` (${timingData.rate.toLocaleString()} attempts/sec)`;
                        if (timingData.estimatedRemaining > 0) {
                            const remainingMinutes = Math.round(timingData.estimatedRemaining / 60);
                            const remainingSeconds = Math.round(timingData.estimatedRemaining % 60);
                            if (remainingMinutes > 0) {
                                progressText += ` - ETA: ${remainingMinutes}m ${remainingSeconds}s`;
                            } else {
                                progressText += ` - ETA: ${remainingSeconds}s`;
                            }
                        }
                        if (memoryUsage) {
                            progressText += ` - Memory: ${memoryUsage.used}MB`;
                        }
                    }
                    
                    document.getElementById('progressText').textContent = progressText;
                }
            );

            const downloadUrl = URL.createObjectURL(blob);
            const originalExt = imageFile.name.split('.').pop();
            const filename = `spoofed_${targetHash.replace('0x', '')}.${originalExt}`;

            // Enhanced success message with timing information
            let successMessage = `
                <h3>✅ Success!</h3>
                <p>Found matching hash after <strong>${attempts.toLocaleString()}</strong> attempts.</p>`;
            
            if (timing) {
                successMessage += `
                <div class="performance-stats">
                    <strong>Performance Stats:</strong><br>
                    Total Time: ${timing.totalDuration.toFixed(2)}s<br>
                    Average Rate: ${Math.round(timing.averageRate).toLocaleString()} attempts/sec<br>
                    Time per Attempt: ${timing.timePerAttempt.toFixed(3)}ms
                </div>`;
            }
            
            successMessage += `
                <div class="hash-display">
                    <strong>Final Hash:</strong><br>
                    ${hash}
                </div>
                <a href="${downloadUrl}" download="${filename}" class="download-link">
                    📥 Download Spoofed Image
                </a>
            `;
            
            this.showResult(successMessage, 'success');

            // Scroll to result smoothly after success
            setTimeout(() => {
                result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 100);
        } catch (error) {
            this.showResult(`❌ Error: ${error.message}`, 'error');
            // Scroll to result smoothly after error
            setTimeout(() => {
                result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 100);
        } finally {
            button.disabled = false;
            button.textContent = 'Start Hash Spoofing';
            progress.classList.remove('show');
        }
    }

    showResult(content, type) {
        const result = document.getElementById('result');
        const resultContent = document.getElementById('resultContent');
        
        result.className = `result ${type} show`;
        resultContent.innerHTML = content;
    }

    // Setup batch processing functionality
    setupBatchProcessing() {
        // Create batch mode toggle button
        const form = document.getElementById('spoofForm');
        const batchToggle = document.createElement('div');
        batchToggle.className = 'batch-toggle';
        batchToggle.innerHTML = `
            <button type="button" id="batchModeBtn" class="batch-mode-btn">
                📦 Switch to Batch Mode
            </button>
        `;
        form.parentNode.insertBefore(batchToggle, form);

        // Add event listeners
        document.getElementById('batchModeBtn').addEventListener('click', () => {
            this.toggleBatchMode();
        });

        // Setup batch processor callbacks
        this.batchProcessor.setCallbacks({
            onProgress: (status, currentJob) => {
                this.updateBatchProgress(status, currentJob);
            },
            onJobComplete: (job, status) => {
                this.updateBatchJobStatus(job, status);
            },
            onBatchComplete: (results) => {
                this.showBatchResults(results);
            },
            onError: (error, results) => {
                this.showBatchError(error, results);
            }
        });
    }

    // Toggle between single and batch mode
    toggleBatchMode() {
        this.isBatchMode = !this.isBatchMode;
        const form = document.getElementById('spoofForm');
        const batchModeBtn = document.getElementById('batchModeBtn');
        
        if (this.isBatchMode) {
            this.setupBatchUI();
            batchModeBtn.textContent = '📄 Switch to Single Mode';
        } else {
            this.setupSingleUI();
            batchModeBtn.textContent = '📦 Switch to Batch Mode';
        }
    }

    // Setup UI for batch mode
    setupBatchUI() {
        const form = document.getElementById('spoofForm');
        form.innerHTML = `
            <div class="batch-header">
                <h3>📦 Batch Processing Mode</h3>
                <p>Upload multiple images and process them all with the same settings</p>
            </div>

            <div class="form-group">
                <label for="batchTargetHash">Target Hash Prefix (e.g., 0x24, 0xabc123)</label>
                <input type="text" id="batchTargetHash" placeholder="0x24" required>
            </div>

            <div class="form-group">
                <label for="batchHashAlgorithm">Hash Algorithm</label>
                <select id="batchHashAlgorithm">
                    <option value="sha512">SHA-512</option>
                    <option value="sha256">SHA-256</option>
                </select>
            </div>

            <div class="form-group">
                <label for="batchImageFiles">Select Image Files (Multiple)</label>
                <div class="file-input-wrapper batch-file-input">
                    <input type="file" id="batchImageFiles" class="file-input" 
                           accept="image/png,image/jpeg,image/jpg" multiple required>
                    <div class="file-input-display" id="batchFileDisplay">
                        <svg class="upload-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                        </svg>
                        <span>Click to select multiple image files</span>
                    </div>
                </div>
            </div>

            <div id="batchFileList" class="batch-file-list" style="display: none;"></div>

            <div class="batch-controls">
                <button type="submit" class="spoof-button" id="batchSpoofButton">
                    🚀 Start Batch Processing
                </button>
                <button type="button" class="batch-control-btn" id="batchPauseBtn" style="display: none;">
                    ⏸️ Pause
                </button>
                <button type="button" class="batch-control-btn" id="batchStopBtn" style="display: none;">
                    🛑 Stop
                </button>
                <button type="button" class="batch-control-btn" id="batchClearBtn">
                    🗑️ Clear All
                </button>
            </div>
        `;

        this.setupBatchEventListeners();
    }

    // Setup UI for single mode
    setupSingleUI() {
        const form = document.getElementById('spoofForm');
        form.innerHTML = `
            <div class="form-group">
                <label for="targetHash">Target Hash Prefix (e.g., 0x24, 0xabc123)</label>
                <input type="text" id="targetHash" placeholder="0x24" required>
            </div>

            <div class="form-group">
                <label for="hashAlgorithm">Hash Algorithm</label>
                <select id="hashAlgorithm">
                    <option value="sha512">SHA-512</option>
                    <option value="sha256">SHA-256</option>
                </select>
            </div>

            <div class="form-group">
                <label for="imageFile">Select Image File</label>
                <div class="file-input-wrapper">
                    <input type="file" id="imageFile" class="file-input" accept="image/png,image/jpeg,image/jpg" required>
                    <div class="file-input-display" id="fileDisplay">
                        <svg class="upload-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                        </svg>
                        <span>Click to select an image file</span>
                    </div>
                </div>
            </div>

            <button type="submit" class="spoof-button" id="spoofButton">
                Start Hash Spoofing
            </button>
        `;

        this.initializeEventListeners();
    }

    // Setup event listeners for batch mode
    setupBatchEventListeners() {
        const form = document.getElementById('spoofForm');
        const fileInput = document.getElementById('batchImageFiles');
        const fileDisplay = document.getElementById('batchFileDisplay');
        const fileList = document.getElementById('batchFileList');

        // File input change handler
        fileInput.addEventListener('change', (e) => {
            this.handleBatchFileSelection(e.target.files);
        });

        // Click handler for file display
        fileDisplay.addEventListener('click', () => {
            fileInput.click();
        });

        // Drag and drop handlers
        const fileInputWrapper = document.querySelector('.batch-file-input');
        fileInputWrapper.addEventListener('dragover', (e) => {
            e.preventDefault();
            fileDisplay.classList.add('drag-over');
        });

        fileInputWrapper.addEventListener('dragleave', (e) => {
            e.preventDefault();
            fileDisplay.classList.remove('drag-over');
        });

        fileInputWrapper.addEventListener('drop', (e) => {
            e.preventDefault();
            fileDisplay.classList.remove('drag-over');
            this.handleBatchFileSelection(e.dataTransfer.files);
        });

        // Form submit handler
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleBatchSpoof();
        });

        // Control button handlers
        document.getElementById('batchPauseBtn')?.addEventListener('click', () => {
            if (this.batchProcessor.isPaused) {
                this.batchProcessor.resumeBatch();
                document.getElementById('batchPauseBtn').textContent = '⏸️ Pause';
            } else {
                this.batchProcessor.pauseBatch();
                document.getElementById('batchPauseBtn').textContent = '▶️ Resume';
            }
        });

        document.getElementById('batchStopBtn')?.addEventListener('click', () => {
            this.batchProcessor.stopBatch();
        });

        document.getElementById('batchClearBtn')?.addEventListener('click', () => {
            this.clearBatchFiles();
        });
    }

    // Handle batch file selection
    handleBatchFileSelection(files) {
        const fileArray = Array.from(files);
        const fileList = document.getElementById('batchFileList');
        const fileDisplay = document.getElementById('batchFileDisplay');
        
        // Filter valid image files
        const validFiles = fileArray.filter(file => {
            const validTypes = ['image/png', 'image/jpeg', 'image/jpg'];
            return validTypes.includes(file.type) && file.size <= 50 * 1024 * 1024;
        });

        if (validFiles.length === 0) {
            this.showResult('No valid image files selected. Please select PNG or JPEG files under 50MB.', 'error');
            return;
        }

        this.batchFiles = validFiles;
        
        // Update file display
        fileDisplay.classList.add('has-file');
        fileDisplay.innerHTML = `
            <svg class="upload-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
            </svg>
            <span>${validFiles.length} files selected</span>
            <button type="button" class="remove-file" onclick="ui.clearBatchFiles();">×</button>
        `;

        // Show file list
        fileList.style.display = 'block';
        fileList.innerHTML = `
            <h4>📋 Files to Process (${validFiles.length}):</h4>
            <div class="batch-file-items">
                ${validFiles.map((file, index) => `
                    <div class="batch-file-item" data-index="${index}">
                        <span class="file-icon">
                            ${file.type.includes('png') ? '🖼️' : '📸'}
                        </span>
                        <span class="file-name">${file.name}</span>
                        <span class="file-size">(${(file.size / 1024 / 1024).toFixed(2)} MB)</span>
                        <span class="file-status" id="status-${index}">⏳ Pending</span>
                    </div>
                `).join('')}
            </div>
        `;
    }

    // Clear batch files
    clearBatchFiles() {
        this.batchFiles = [];
        this.batchProcessor.clear();
        
        const fileDisplay = document.getElementById('batchFileDisplay');
        const fileList = document.getElementById('batchFileList');
        const fileInput = document.getElementById('batchImageFiles');
        
        fileInput.value = '';
        fileList.style.display = 'none';
        fileDisplay.classList.remove('has-file');
        fileDisplay.innerHTML = `
            <svg class="upload-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
            </svg>
            <span>Click to select multiple image files</span>
        `;
    }

    // Handle batch processing
    async handleBatchSpoof() {
        const targetHash = document.getElementById('batchTargetHash').value.trim();
        const hashAlgorithm = document.getElementById('batchHashAlgorithm').value;
        const button = document.getElementById('batchSpoofButton');
        const progress = document.getElementById('progress');
        const result = document.getElementById('result');

        if (!targetHash || this.batchFiles.length === 0) {
            this.showResult('Please enter target hash and select files', 'error');
            return;
        }

        if (!targetHash.startsWith('0x') || !/^0x[0-9a-fA-F]+$/.test(targetHash)) {
            this.showResult('Target hash must be a valid hexadecimal string (e.g., 0x24, 0xabc123)', 'error');
            return;
        }

        try {
            // Clear previous batch and add new jobs
            this.batchProcessor.clear();
            this.batchProcessor.addFiles(this.batchFiles, targetHash, hashAlgorithm);
            
            // Update UI for processing state
            button.disabled = true;
            button.textContent = 'Processing Batch...';
            document.getElementById('batchPauseBtn').style.display = 'inline-block';
            document.getElementById('batchStopBtn').style.display = 'inline-block';
            progress.classList.add('show');
            result.classList.remove('show');

            // Start batch processing
            await this.batchProcessor.startBatch();

        } catch (error) {
            this.showResult(`❌ Batch Error: ${error.message}`, 'error');
        } finally {
            // Reset UI state
            button.disabled = false;
            button.textContent = '🚀 Start Batch Processing';
            document.getElementById('batchPauseBtn').style.display = 'none';
            document.getElementById('batchStopBtn').style.display = 'none';
            progress.classList.remove('show');
        }
    }

    // Update batch progress display
    updateBatchProgress(status, currentJob) {
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        
        if (progressFill) {
            progressFill.style.width = `${status.progress}%`;
        }

        if (progressText && currentJob) {
            const elapsed = (status.elapsedTime / 1000).toFixed(1);
            progressText.textContent = `Processing ${currentJob.fileName} (${status.completed + 1}/${status.total}) - ${status.progress.toFixed(1)}% - ${elapsed}s`;
        }
    }

    // Update individual job status
    updateBatchJobStatus(job, status) {
        const statusElement = document.getElementById(`status-${this.batchFiles.findIndex(f => f.name === job.fileName)}`);
        
        if (statusElement) {
            switch (job.status) {
                case 'processing':
                    statusElement.textContent = '⏳ Processing...';
                    statusElement.className = 'file-status processing';
                    break;
                case 'completed':
                    statusElement.textContent = '✅ Completed';
                    statusElement.className = 'file-status completed';
                    break;
                case 'failed':
                    statusElement.textContent = '❌ Failed';
                    statusElement.className = 'file-status failed';
                    break;
            }
        }
    }

    // Show batch results
    showBatchResults(results) {
        const status = results.status;
        const successRate = ((status.completed / status.total) * 100).toFixed(1);
        const totalTime = (status.elapsedTime / 1000).toFixed(2);
        
        let resultContent = `
            <h3>🎉 Batch Processing Complete!</h3>
            <div class="batch-summary">
                <div class="batch-stat">
                    <strong>Total Files:</strong> ${status.total}
                </div>
                <div class="batch-stat">
                    <strong>Completed:</strong> ${status.completed} ✅
                </div>
                <div class="batch-stat">
                    <strong>Failed:</strong> ${status.failed} ❌
                </div>
                <div class="batch-stat">
                    <strong>Success Rate:</strong> ${successRate}%
                </div>
                <div class="batch-stat">
                    <strong>Total Time:</strong> ${totalTime}s
                </div>
            </div>
        `;

        if (status.completed > 0) {
            resultContent += `
                <div class="batch-downloads">
                    <button onclick="ui.downloadAllBatchFiles()" class="download-link">
                        📥 Download All Completed Files
                    </button>
                    <button onclick="ui.batchProcessor.exportResults()" class="analytics-btn" style="margin-left: 10px;">
                        📊 Export Results
                    </button>
                </div>
            `;
        }

        this.showResult(resultContent, status.failed === 0 ? 'success' : 'error');
    }

    // Show batch error
    showBatchError(error, results) {
        this.showResult(`❌ Batch Processing Error: ${error.message}`, 'error');
    }

    // Download all completed batch files
    async downloadAllBatchFiles() {
        try {
            const downloads = await this.batchProcessor.downloadAsZip();
            
            // For now, trigger individual downloads
            // In a full implementation, you'd create a ZIP file
            downloads.forEach((download, index) => {
                setTimeout(() => {
                    const a = document.createElement('a');
                    a.href = download.url;
                    a.download = download.filename;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(download.url);
                }, index * 100); // Stagger downloads
            });
        } catch (error) {
            this.showResult(`Download Error: ${error.message}`, 'error');
        }
    }

    // Setup theme toggle functionality
    setupThemeToggle() {
        // Create and insert theme toggle
        themeManager.createThemeToggle();
        
        // Listen for theme changes to update chart colors if needed
        window.addEventListener('themechange', (e) => {
            const { theme } = e.detail;
            console.log(`Theme changed to: ${theme}`);
            
            // Update analytics charts if they exist
            if (typeof createSimpleCharts === 'function') {
                setTimeout(() => createSimpleCharts(), 100);
            }
        });
    }
}

// Analytics Dashboard functionality
let analyticsVisible = false;
let performanceAnalytics = null;
let chartManager = null;

// Initialize analytics when needed
function initializeAnalytics() {
    if (!performanceAnalytics) {
        // Simple analytics implementation without external dependencies for now
        performanceAnalytics = {
            data: JSON.parse(localStorage.getItem('imghash-analytics') || '{}'),
            recordAttempt: function(data) {
                if (!this.data.attempts) this.data.attempts = [];
                this.data.attempts.push({
                    timestamp: new Date().toISOString(),
                    ...data
                });
                localStorage.setItem('imghash-analytics', JSON.stringify(this.data));
                this.updateStats();
            },
            updateStats: function() {
                const attempts = this.data.attempts || [];
                const successes = attempts.filter(a => a.success);
                
                document.getElementById('totalAttempts').textContent = attempts.length;
                document.getElementById('totalSuccesses').textContent = successes.length;
                document.getElementById('overallSuccessRate').textContent = 
                    attempts.length > 0 ? Math.round((successes.length / attempts.length) * 100) + '%' : '0%';
                
                // Weekly stats
                const oneWeek = 7 * 24 * 60 * 60 * 1000;
                const weeklyAttempts = attempts.filter(a => 
                    Date.now() - new Date(a.timestamp).getTime() <= oneWeek
                );
                document.getElementById('weeklyAttempts').textContent = weeklyAttempts.length;
            },
            clearData: function() {
                this.data = {};
                localStorage.removeItem('imghash-analytics');
                this.updateStats();
            },
            exportData: function() {
                const data = {
                    exportDate: new Date().toISOString(),
                    analytics: this.data
                };
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'imghash-analytics-' + new Date().toISOString().split('T')[0] + '.json';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }
        };
        performanceAnalytics.updateStats();
    }
}

// Toggle analytics dashboard visibility
function toggleAnalytics() {
    const analyticsSection = document.getElementById('analyticsSection');
    const toggleBtn = document.getElementById('toggleAnalyticsBtn');
    
    analyticsVisible = !analyticsVisible;
    
    if (analyticsVisible) {
        analyticsSection.style.display = 'block';
        toggleBtn.textContent = '📊 Hide Performance Analytics';
        initializeAnalytics();
        createSimpleCharts();
    } else {
        analyticsSection.style.display = 'none';
        toggleBtn.textContent = '📊 Show Performance Analytics';
    }
}

// Clear analytics data
function clearAnalytics() {
    if (confirm('Are you sure you want to clear all analytics data? This cannot be undone.')) {
        initializeAnalytics();
        performanceAnalytics.clearData();
        createSimpleCharts(); // Refresh charts
    }
}

// Export analytics data
function exportAnalytics() {
    initializeAnalytics();
    performanceAnalytics.exportData();
}

// Generate prediction
function generatePrediction() {
    const prefixInput = document.getElementById('predictionPrefix');
    const algorithmSelect = document.getElementById('predictionAlgorithm');
    const resultsDiv = document.getElementById('predictionResults');
    
    const targetPrefix = prefixInput.value.trim();
    if (!targetPrefix) {
        alert('Please enter a target prefix (e.g., 0x24)');
        return;
    }
    
    // Validate hex prefix
    if (!targetPrefix.match(/^0x[0-9a-fA-F]+$/)) {
        alert('Please enter a valid hex prefix (e.g., 0x24, 0xabc)');
        return;
    }
    
    const prefixLength = targetPrefix.replace('0x', '').length;
    const algorithm = algorithmSelect.value;
    
    // Calculate theoretical attempts
    const theoreticalAttempts = Math.pow(16, prefixLength);
    const estimatedSeconds = Math.round(theoreticalAttempts / 1000); // Rough estimate: 1000 attempts/sec
    const difficulty = prefixLength <= 2 ? 'Easy' : prefixLength <= 4 ? 'Medium' : prefixLength <= 6 ? 'Hard' : 'Very Hard';
    
    resultsDiv.style.display = 'block';
    resultsDiv.innerHTML = `
        <div class="prediction-item">
            <span class="prediction-label">Difficulty:</span>
            <span class="prediction-value">${difficulty}</span>
        </div>
        <div class="prediction-item">
            <span class="prediction-label">Expected Attempts:</span>
            <span class="prediction-value">${theoreticalAttempts.toLocaleString()}</span>
        </div>
        <div class="prediction-item">
            <span class="prediction-label">Estimated Time:</span>
            <span class="prediction-value">${estimatedSeconds < 60 ? estimatedSeconds + 's' : Math.round(estimatedSeconds/60) + 'm'}</span>
        </div>
        <div class="prediction-item">
            <span class="prediction-label">Algorithm:</span>
            <span class="prediction-value">${algorithm.toUpperCase()}</span>
        </div>
        <div class="prediction-item">
            <span class="prediction-label">Success Probability:</span>
            <span class="prediction-value">~63% after ${theoreticalAttempts.toLocaleString()} attempts</span>
        </div>
    `;
}

// Create simple charts without external Chart.js dependency
function createSimpleCharts() {
    initializeAnalytics();
    const attempts = performanceAnalytics.data.attempts || [];
    
    // Create simple visualizations for each chart area
    createSimpleSuccessChart(attempts);
    createSimplePrefixChart(attempts);
    createSimpleAlgorithmChart(attempts);
    createSimplePerformanceChart(attempts);
}

function createSimpleSuccessChart(attempts) {
    const canvas = document.getElementById('successRateChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Simple bar chart showing success rate
    const successes = attempts.filter(a => a.success).length;
    const failures = attempts.length - successes;
    const total = attempts.length;
    
    if (total === 0) {
        ctx.fillStyle = '#6b7280';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('No data available yet', width / 2, height / 2);
        return;
    }
    
    const successRate = (successes / total) * 100;
    const barWidth = width * 0.6;
    const barHeight = 30;
    const startX = (width - barWidth) / 2;
    const startY = height / 2 - barHeight / 2;
    
    // Background bar
    ctx.fillStyle = '#e5e7eb';
    ctx.fillRect(startX, startY, barWidth, barHeight);
    
    // Success bar
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(startX, startY, (barWidth * successRate) / 100, barHeight);
    
    // Text
    ctx.fillStyle = '#1f2937';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`Success Rate: ${successRate.toFixed(1)}%`, width / 2, startY - 10);
    ctx.fillText(`${successes}/${total} attempts successful`, width / 2, startY + barHeight + 20);
}

function createSimplePrefixChart(attempts) {
    const canvas = document.getElementById('prefixDifficultyChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Group by prefix length
    const lengthStats = {};
    attempts.forEach(a => {
        const len = (a.targetPrefix || '0x0').replace('0x', '').length;
        if (!lengthStats[len]) lengthStats[len] = { total: 0, success: 0 };
        lengthStats[len].total++;
        if (a.success) lengthStats[len].success++;
    });
    
    const lengths = Object.keys(lengthStats).sort((a, b) => a - b);
    if (lengths.length === 0) {
        ctx.fillStyle = '#6b7280';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('No data available yet', canvas.width / 2, canvas.height / 2);
        return;
    }
    
    // Simple bar chart
    const barWidth = Math.min(50, canvas.width / lengths.length - 10);
    const maxHeight = canvas.height - 60;
    const maxRate = Math.max(...lengths.map(len => (lengthStats[len].success / lengthStats[len].total) * 100));
    
    lengths.forEach((len, i) => {
        const stats = lengthStats[len];
        const rate = (stats.success / stats.total) * 100;
        const barHeight = maxRate > 0 ? (rate / maxRate) * maxHeight : 0;
        const x = (canvas.width / lengths.length) * i + (canvas.width / lengths.length - barWidth) / 2;
        const y = canvas.height - 40 - barHeight;
        
        ctx.fillStyle = '#667eea';
        ctx.fillRect(x, y, barWidth, barHeight);
        
        ctx.fillStyle = '#1f2937';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`${len}`, x + barWidth / 2, canvas.height - 10);
        ctx.fillText(`${rate.toFixed(0)}%`, x + barWidth / 2, y - 5);
    });
}

function createSimpleAlgorithmChart(attempts) {
    const canvas = document.getElementById('algorithmComparisonChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const algorithmStats = { sha256: 0, sha512: 0 };
    attempts.forEach(a => {
        if (a.hashAlgorithm) algorithmStats[a.hashAlgorithm]++;
    });
    
    const total = algorithmStats.sha256 + algorithmStats.sha512;
    if (total === 0) {
        ctx.fillStyle = '#6b7280';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('No data available yet', canvas.width / 2, canvas.height / 2);
        return;
    }
    
    // Simple pie chart
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 20;
    
    let startAngle = 0;
    const colors = ['#667eea', '#764ba2'];
    const algorithms = ['sha256', 'sha512'];
    
    algorithms.forEach((algo, i) => {
        const count = algorithmStats[algo];
        if (count === 0) return;
        
        const sliceAngle = (count / total) * 2 * Math.PI;
        
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
        ctx.closePath();
        ctx.fillStyle = colors[i];
        ctx.fill();
        
        // Label
        const labelAngle = startAngle + sliceAngle / 2;
        const labelX = centerX + Math.cos(labelAngle) * (radius / 2);
        const labelY = centerY + Math.sin(labelAngle) * (radius / 2);
        
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(algo.toUpperCase(), labelX, labelY);
        ctx.fillText(`${count}`, labelX, labelY + 15);
        
        startAngle += sliceAngle;
    });
}

function createSimplePerformanceChart(attempts) {
    const canvas = document.getElementById('performanceChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (attempts.length === 0) {
        ctx.fillStyle = '#6b7280';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('No data available yet', canvas.width / 2, canvas.height / 2);
        return;
    }
    
    // Show recent attempts as a line chart
    const recentAttempts = attempts.slice(-20); // Last 20 attempts
    const maxAttempts = Math.max(...recentAttempts.map(a => a.attempts || 1));
    const width = canvas.width - 40;
    const height = canvas.height - 40;
    
    ctx.strokeStyle = '#667eea';
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    recentAttempts.forEach((attempt, i) => {
        const x = 20 + (width / Math.max(recentAttempts.length - 1, 1)) * i;
        const y = 20 + height - ((attempt.attempts || 1) / maxAttempts) * height;
        
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
        
        // Point
        ctx.fillStyle = attempt.success ? '#22c55e' : '#ef4444';
        ctx.fillRect(x - 2, y - 2, 4, 4);
    });
    
    ctx.stroke();
    
    // Labels
    ctx.fillStyle = '#1f2937';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Recent Attempts Performance', canvas.width / 2, 15);
}

// Make functions globally available
window.toggleAnalytics = toggleAnalytics;
window.clearAnalytics = clearAnalytics;
window.exportAnalytics = exportAnalytics;
window.generatePrediction = generatePrediction;

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    const ui = new UI();
    
    // Make UI available globally for onclick handlers
    window.ui = ui;
    
    // Override the original spoofImage to include analytics recording
    const originalSpoofImage = ui.spoofer.spoofImage.bind(ui.spoofer);
    ui.spoofer.spoofImage = async function(targetHex, imageFile, hashAlgorithm = 'sha512', onProgress = null) {
        const startTime = Date.now();
        try {
            const result = await originalSpoofImage(targetHex, imageFile, hashAlgorithm, onProgress);
            
            // Record successful attempt
            if (performanceAnalytics) {
                performanceAnalytics.recordAttempt({
                    targetPrefix: targetHex,
                    attempts: result.attempts,
                    duration: Date.now() - startTime,
                    success: true,
                    hashAlgorithm: hashAlgorithm,
                    imageFormat: imageFile.type,
                    fileSize: imageFile.size
                });
            }
            
            return result;
        } catch (error) {
            // Record failed attempt
            if (performanceAnalytics) {
                performanceAnalytics.recordAttempt({
                    targetPrefix: targetHex,
                    attempts: 0,
                    duration: Date.now() - startTime,
                    success: false,
                    hashAlgorithm: hashAlgorithm,
                    imageFormat: imageFile.type,
                    fileSize: imageFile.size
                });
            }
            
            throw error;
        }
    };
    
    // Prevent default scroll behavior on certain elements
    document.addEventListener('wheel', (e) => {
        // Allow normal scrolling on the container
        const container = document.querySelector('.container');
        if (container && container.contains(e.target)) {
            return;
        }
    }, { passive: true });
    
    // Prevent scroll restoration on page reload
    if ('scrollRestoration' in history) {
        history.scrollRestoration = 'manual';
    }
});
