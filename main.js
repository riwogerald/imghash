class WebImageHashSpoofer {
    constructor() {
        this.PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
        this.JPEG_SIGNATURE = new Uint8Array([0xFF, 0xD8]);
        this.worker = null;
        this.workerPool = [];
        this.poolSize = Math.min(navigator.hardwareConcurrency || 4, 4);
    }

    async init() {
        // Create a Web Worker for hash computation
        const workerCode = `
            class OptimizedHashWorker {
                constructor() {
                    this.PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
                    this.JPEG_SIGNATURE = new Uint8Array([0xFF, 0xD8]);
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

                // Calculate optimal attempt count based on target difficulty
                calculateOptimalMaxAttempts(targetPrefix) {
                    const prefixLength = targetPrefix.length;
                    const expectedAttempts = Math.pow(16, prefixLength);
                    // Use statistical approach: 3 * expected attempts for ~95% success rate
                    return Math.min(Math.max(expectedAttempts * 3, 100000), 10000000);
                }

                async findMatchingHash(targetHex, originalData, isPNG, hashAlgorithm, maxAttempts = 1000000) {
                    const targetPrefix = targetHex.startsWith('0x') ? targetHex.slice(2).toLowerCase() : targetHex.toLowerCase();
                    const optimalMaxAttempts = this.calculateOptimalMaxAttempts(targetPrefix);
                    const actualMaxAttempts = Math.min(maxAttempts, optimalMaxAttempts);
                    
                    // Reduce progress update frequency for better performance (every 50K attempts)
                    const progressInterval = Math.max(50000, Math.floor(actualMaxAttempts / 100));
                    
                    // Pre-parse chunks for PNG to avoid repeated parsing
                    let chunks;
                    if (isPNG) {
                        chunks = this.parsePNGChunks(originalData);
                    }
                    
                    for (let i = 0; i < actualMaxAttempts; i++) {
                        if (i % progressInterval === 0) {
                            self.postMessage({ type: 'progress', attempt: i, maxAttempts: actualMaxAttempts });
                        }

                        let testContent;
                        
                        if (isPNG) {
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
                        } else {
                            const comment = 'Hash attempt ' + i + ' - ' + Date.now();
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

                    self.postMessage({ type: 'error', message: 'Could not find matching hash after ' + maxAttempts + ' attempts' });
                }
            }

            const worker = new OptimizedHashWorker();

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
