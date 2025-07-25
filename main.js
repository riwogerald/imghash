class WebImageHashSpoofer {
    constructor() {
        this.PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
        this.JPEG_SIGNATURE = new Uint8Array([0xFF, 0xD8]);
        this.worker = null;
    }

    async init() {
        // Create a Web Worker for hash computation
        const workerCode = `
            class HashWorker {
                constructor() {
                    this.PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
                    this.JPEG_SIGNATURE = new Uint8Array([0xFF, 0xD8]);
                }

                async sha256(data) {
                    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
                    const hashArray = Array.from(new Uint8Array(hashBuffer));
                    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                }

                async sha512(data) {
                    const hashBuffer = await crypto.subtle.digest('SHA-512', data);
                    const hashArray = Array.from(new Uint8Array(hashBuffer));
                    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
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

                async findMatchingHash(targetHex, originalData, isPNG, hashAlgorithm, maxAttempts = 1000000) {
                    const targetPrefix = targetHex.startsWith('0x') ? targetHex.slice(2).toLowerCase() : targetHex.toLowerCase();
                    
                    for (let i = 0; i < maxAttempts; i++) {
                        if (i % 10000 === 0) {
                            self.postMessage({ type: 'progress', attempt: i, maxAttempts });
                        }

                        let testContent;
                        
                        if (isPNG) {
                            const chunks = this.parsePNGChunks(originalData);
                            const testData = new TextEncoder().encode(\`Hash attempt \${i} - \${Date.now()}\`);
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
                        } else {
                            const comment = \`Hash attempt \${i} - \${Date.now()}\`;
                            testContent = this.addJPEGComment(originalData, comment);
                        }

                        const hash = await (hashAlgorithm === 'sha512' ? this.sha512(testContent) : this.sha256(testContent));
                        
                        if (hash.startsWith(targetPrefix)) {
                            self.postMessage({ 
                                type: 'success', 
                                content: Array.from(testContent),
                                hash: hash,
                                attempts: i + 1
                            });
                            return;
                        }
                    }

                    self.postMessage({ type: 'error', message: \`Could not find matching hash after \${maxAttempts} attempts\` });
                }
            }

            const worker = new HashWorker();

            self.onmessage = async function(e) {
                const { targetHex, originalData, isPNG, hashAlgorithm, maxAttempts } = e.data;
                const dataArray = new Uint8Array(originalData);
                await worker.findMatchingHash(targetHex, dataArray, isPNG, hashAlgorithm, maxAttempts);
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

                if (!isPNG && !isJPEG) {
                    reject(new Error('Unsupported image format. Only PNG and JPEG are supported.'));
                    return;
                }

                this.worker.onmessage = (e) => {
                    const { type, content: resultContent, hash, attempts, attempt, maxAttempts, message } = e.data;
                    
                    if (type === 'progress' && onProgress) {
                        onProgress(attempt, maxAttempts);
                    } else if (type === 'success') {
                        const resultArray = new Uint8Array(resultContent);
                        const blob = new Blob([resultArray], { type: isPNG ? 'image/png' : 'image/jpeg' });
                        resolve({ blob, hash, attempts });
                    } else if (type === 'error') {
                        reject(new Error(message));
                    }
                };

                this.worker.postMessage({
                    targetHex,
                    originalData: Array.from(content),
                    isPNG,
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

// UI Management
class UI {
    constructor() {
        this.spoofer = new WebImageHashSpoofer();
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        const form = document.getElementById('spoofForm');
        const fileInput = document.getElementById('imageFile');
        const fileDisplay = document.getElementById('fileDisplay');

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                fileDisplay.classList.add('has-file');
                fileDisplay.innerHTML = `
                    <svg class="upload-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                    </svg>
                    <span>${file.name}</span>
                `;
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

        button.disabled = true;
        button.textContent = 'Processing...';
        progress.classList.add('show');
        result.classList.remove('show');

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

            const downloadUrl = URL.createObjectURL(blob);
            const originalExt = imageFile.name.split('.').pop();
            const filename = `spoofed_${targetHash.replace('0x', '')}.${originalExt}`;

            this.showResult(`
                <h3>✅ Success!</h3>
                <p>Found matching hash after <strong>${attempts.toLocaleString()}</strong> attempts.</p>
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