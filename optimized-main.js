class OptimizedWebImageHashSpoofer {
    constructor() {
        this.PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
        this.JPEG_SIGNATURE = new Uint8Array([0xFF, 0xD8]);
        this.worker = null;
        this.workerPool = [];
        this.poolSize = Math.min(navigator.hardwareConcurrency || 4, 4);
    }

    async init() {
        // Create a Web Worker pool for parallel processing
        const workerCode = `
            class OptimizedHashWorker {
                constructor() {
                    this.PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
                    this.JPEG_SIGNATURE = new Uint8Array([0xFF, 0xD8]);
                    // Pre-generate CRC table once
                    this.crcTable = this.makeCRCTable();
                }

                async sha256(data) {
                    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
                    const hashArray = new Uint8Array(hashBuffer);
                    // Optimized hex conversion using lookup table
                    return this.bytesToHex(hashArray);
                }

                async sha512(data) {
                    const hashBuffer = await crypto.subtle.digest('SHA-512', data);
                    const hashArray = new Uint8Array(hashBuffer);
                    return this.bytesToHex(hashArray);
                }

                // Optimized hex conversion with lookup table
                bytesToHex(bytes) {
                    const hexLookup = [];
                    for (let i = 0; i < 256; i++) {
                        hexLookup[i] = i.toString(16).padStart(2, '0');
                    }
                    
                    let result = '';
                    for (let i = 0; i < bytes.length; i++) {
                        result += hexLookup[bytes[i]];
                    }
                    return result;
                }

                createPNGChunk(chunkType, data) {
                    // Pre-allocate result buffer for better performance
                    const totalLength = 4 + chunkType.length + data.length + 4;
                    const result = new Uint8Array(totalLength);
                    
                    // Write length (big-endian)
                    const length = data.length;
                    result[0] = (length >>> 24) & 0xFF;
                    result[1] = (length >>> 16) & 0xFF;
                    result[2] = (length >>> 8) & 0xFF;
                    result[3] = length & 0xFF;
                    
                    // Write chunk type and data
                    result.set(chunkType, 4);
                    result.set(data, 4 + chunkType.length);
                    
                    // Calculate and write CRC
                    const chunkData = result.subarray(4, 4 + chunkType.length + data.length);
                    const crc = this.calculateCRC32(chunkData);
                    const crcPos = 4 + chunkType.length + data.length;
                    result[crcPos] = (crc >>> 24) & 0xFF;
                    result[crcPos + 1] = (crc >>> 16) & 0xFF;
                    result[crcPos + 2] = (crc >>> 8) & 0xFF;
                    result[crcPos + 3] = crc & 0xFF;
                    
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

                parsePNGChunks(content) {
                    const chunks = [];
                    let pos = 8;

                    while (pos < content.length - 8) {
                        const length = (content[pos] << 24) | (content[pos + 1] << 16) | 
                                     (content[pos + 2] << 8) | content[pos + 3];
                        const chunkType = content.slice(pos + 4, pos + 8);
                        
                        // Check if not IEND chunk (avoid string comparison)
                        if (!(chunkType[0] === 73 && chunkType[1] === 69 && 
                              chunkType[2] === 78 && chunkType[3] === 68)) {
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
                    
                    // Pre-allocate result buffer
                    const result = new Uint8Array(content.length + 4 + commentData.length);
                    
                    // Copy parts efficiently
                    result.set(content.subarray(0, insertPos), 0);
                    
                    // Add comment segment
                    let pos = insertPos;
                    result[pos++] = 0xFF;
                    result[pos++] = 0xFE;
                    result[pos++] = (segmentLength >>> 8) & 0xFF;
                    result[pos++] = segmentLength & 0xFF;
                    result.set(commentData, pos);
                    pos += commentData.length;
                    
                    // Copy remaining content
                    result.set(content.subarray(insertPos), pos);
                    
                    return result;
                }

                // Adaptive algorithm to determine optimal attempt count
                calculateOptimalMaxAttempts(targetPrefix) {
                    const prefixLength = targetPrefix.length;
                    const expectedAttempts = Math.pow(16, prefixLength);
                    
                    // Use statistical approach: 3 * expected attempts for ~95% success rate
                    return Math.min(Math.max(expectedAttempts * 3, 100000), 10000000);
                }

                async findMatchingHash(targetHex, originalData, isPNG, hashAlgorithm, maxAttempts, workerId = 0) {
                    const targetPrefix = targetHex.startsWith('0x') ? targetHex.slice(2).toLowerCase() : targetHex.toLowerCase();
                    const optimalMaxAttempts = this.calculateOptimalMaxAttempts(targetPrefix);
                    const actualMaxAttempts = Math.min(maxAttempts || optimalMaxAttempts, optimalMaxAttempts);
                    
                    // Reduce progress update frequency for better performance
                    const progressInterval = Math.max(50000, Math.floor(actualMaxAttempts / 100));
                    
                    // Pre-parse chunks for PNG to avoid repeated parsing
                    let chunks;
                    if (isPNG) {
                        chunks = this.parsePNGChunks(originalData);
                    }
                    
                    for (let i = workerId; i < actualMaxAttempts; i += self.poolSize || 1) {
                        if (i % progressInterval === 0) {
                            self.postMessage({ type: 'progress', attempt: i, maxAttempts: actualMaxAttempts });
                        }

                        let testContent;
                        
                        if (isPNG) {
                            // Use timestamp + counter for better randomness
                            const testData = new TextEncoder().encode(\`\${Date.now()}-\${i}-\${Math.random()}\`);
                            const commentChunk = this.createPNGChunk(new Uint8Array([116, 69, 88, 116]), testData);
                            const iendChunk = this.createPNGChunk(new Uint8Array([73, 69, 78, 68]), new Uint8Array(0));
                            
                            // Pre-calculate total length and allocate buffer
                            let totalLength = this.PNG_SIGNATURE.length + commentChunk.length + iendChunk.length;
                            chunks.forEach(chunk => totalLength += chunk.length);
                            
                            testContent = new Uint8Array(totalLength);
                            let pos = 0;
                            
                            testContent.set(this.PNG_SIGNATURE, pos);
                            pos += this.PNG_SIGNATURE.length;
                            
                            for (const chunk of chunks) {
                                testContent.set(chunk, pos);
                                pos += chunk.length;
                            }
                            
                            testContent.set(commentChunk, pos);
                            pos += commentChunk.length;
                            
                            testContent.set(iendChunk, pos);
                        } else {
                            const comment = \`\${Date.now()}-\${i}-\${Math.random()}\`;
                            testContent = this.addJPEGComment(originalData, comment);
                        }

                        const hash = await (hashAlgorithm === 'sha512' ? this.sha512(testContent) : this.sha256(testContent));
                        
                        if (hash.startsWith(targetPrefix)) {
                            self.postMessage({ 
                                type: 'success', 
                                content: testContent,
                                hash: hash,
                                attempts: i + 1
                            });
                            return;
                        }
                    }

                    self.postMessage({ 
                        type: 'error', 
                        message: \`Could not find matching hash after \${actualMaxAttempts} attempts\` 
                    });
                }
            }

            const worker = new OptimizedHashWorker();
            
            self.onmessage = async function(e) {
                const { targetHex, originalData, isPNG, hashAlgorithm, maxAttempts, workerId, poolSize } = e.data;
                self.poolSize = poolSize;
                const dataArray = new Uint8Array(originalData);
                await worker.findMatchingHash(targetHex, dataArray, isPNG, hashAlgorithm, maxAttempts, workerId);
            };
        `;

        // Create worker pool for parallel processing
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        const workerUrl = URL.createObjectURL(blob);
        
        for (let i = 0; i < this.poolSize; i++) {
            this.workerPool.push(new Worker(workerUrl));
        }
    }

    async spoofImage(targetHex, imageFile, hashAlgorithm = 'sha512', onProgress = null) {
        if (this.workerPool.length === 0) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                const content = new Uint8Array(e.target.result);
                const isPNG = this.arraysEqual(content.slice(0, 8), this.PNG_SIGNATURE);
                const isJPEG = this.arraysEqual(content.slice(0, 2), this.JPEG_SIGNATURE);

                if (!isPNG && !isJPEG) {
                    reject(new Error('Unsupported image format. Only PNG and JPEG are supported.'));
                    return;
                }

                // Use SharedArrayBuffer for better performance if available
                let sharedData;
                try {
                    sharedData = new SharedArrayBuffer(content.length);
                    new Uint8Array(sharedData).set(content);
                } catch (e) {
                    // Fallback to regular array buffer
                    sharedData = content.buffer.slice();
                }

                let resolved = false;
                let completedWorkers = 0;

                const handleMessage = (workerId) => (e) => {
                    const { type, content: resultContent, hash, attempts, attempt, maxAttempts, message } = e.data;
                    
                    if (resolved) return;
                    
                    if (type === 'progress' && onProgress) {
                        onProgress(attempt, maxAttempts);
                    } else if (type === 'success') {
                        resolved = true;
                        // Terminate all workers
                        this.workerPool.forEach(worker => worker.terminate());
                        
                        const resultArray = new Uint8Array(resultContent);
                        const blob = new Blob([resultArray], { type: isPNG ? 'image/png' : 'image/jpeg' });
                        resolve({ blob, hash, attempts });
                    } else if (type === 'error') {
                        completedWorkers++;
                        if (completedWorkers === this.poolSize) {
                            resolved = true;
                            reject(new Error(message));
                        }
                    }
                };

                // Start all workers
                this.workerPool.forEach((worker, index) => {
                    worker.onmessage = handleMessage(index);
                    worker.postMessage({
                        targetHex,
                        originalData: sharedData,
                        isPNG,
                        hashAlgorithm,
                        maxAttempts: 10000000,
                        workerId: index,
                        poolSize: this.poolSize
                    });
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

// UI Management (unchanged interface, optimized backend)
class UI {
    constructor() {
        this.spoofer = new OptimizedWebImageHashSpoofer();
        this.initializeEventListeners();
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
                const validTypes = ['image/png', 'image/jpeg', 'image/jpg'];
                if (!validTypes.includes(file.type)) {
                    this.showResult('Please select a valid PNG or JPEG image file', 'error');
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
            fileDisplay.classList.add('drag-over');
        });

        fileInputWrapper.addEventListener('dragleave', (e) => {
            e.preventDefault();
            fileDisplay.classList.remove('drag-over');
        });

        fileInputWrapper.addEventListener('drop', (e) => {
            e.preventDefault();
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
            return;
        }

        if (!targetHash.startsWith('0x')) {
            this.showResult('Target hash must start with "0x"', 'error');
            return;
        }

        // Additional validation for target hash
        const hexPattern = /^0x[0-9a-fA-F]+$/;
        if (!hexPattern.test(targetHash)) {
            this.showResult('Target hash must be a valid hexadecimal string (e.g., 0x24, 0xabc123)', 'error');
            return;
        }

        button.disabled = true;
        button.textContent = 'Processing...';
        progress.classList.add('show');
        result.classList.remove('show');

        const startTime = performance.now();

        try {
            const { blob, hash, attempts } = await this.spoofer.spoofImage(
                targetHash,
                imageFile,
                hashAlgorithm,
                (attempt, maxAttempts) => {
                    const percentage = (attempt / maxAttempts) * 100;
                    document.getElementById('progressFill').style.width = `${percentage}%`;
                    document.getElementById('progressText').textContent = 
                        `Attempt ${attempt.toLocaleString()} of ${maxAttempts.toLocaleString()}...`;
                }
            );

            const endTime = performance.now();
            const processingTime = ((endTime - startTime) / 1000).toFixed(2);

            const downloadUrl = URL.createObjectURL(blob);
            const originalExt = imageFile.name.split('.').pop();
            const filename = `spoofed_${targetHash.replace('0x', '')}.${originalExt}`;

            this.showResult(`
                <h3>✅ Success!</h3>
                <p>Found matching hash after <strong>${attempts.toLocaleString()}</strong> attempts in <strong>${processingTime}s</strong>.</p>
                <div class="hash-display">
                    <strong>Final Hash:</strong><br>
                    ${hash}
                </div>
                <a href="${downloadUrl}" download="${filename}" class="download-link">
                    📥 Download Spoofed Image
                </a>
            `, 'success');

        } catch (error) {
            this.showResult(`❌ Error: ${error.message}`, 'error');
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
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    new UI();
});
