import { WebImageHashSpoofer } from './main.js';

export class WebBatchProcessor {
    constructor() {
        this.spoofer = new WebImageHashSpoofer();
        this.jobs = [];
        this.currentJobIndex = 0;
        this.isProcessing = false;
        this.isPaused = false;
        this.results = [];
        this.onProgress = null;
        this.onJobComplete = null;
        this.onBatchComplete = null;
        this.onError = null;
        this.startTime = null;
        this.completedJobs = 0;
        this.failedJobs = 0;
    }

    /**
     * Add files to the batch queue
     * @param {FileList|File[]} files - Files to process
     * @param {string} targetHex - Target hash prefix
     * @param {string} hashAlgorithm - Hash algorithm to use
     */
    addFiles(files, targetHex, hashAlgorithm = 'sha512') {
        const fileArray = Array.from(files);
        
        for (const file of fileArray) {
            // Validate file type
            if (!file.type.match(/^image\/(png|jpeg|jpg)$/)) {
                console.warn(`Skipping unsupported file type: ${file.name}`);
                continue;
            }
            
            // Validate file size (max 50MB)
            if (file.size > 50 * 1024 * 1024) {
                console.warn(`Skipping oversized file: ${file.name}`);
                continue;
            }

            const job = {
                id: `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                file: file,
                fileName: file.name,
                targetHex: targetHex,
                hashAlgorithm: hashAlgorithm,
                status: 'pending', // pending, processing, completed, failed
                startTime: null,
                endTime: null,
                processingTime: 0,
                attempts: 0,
                hash: null,
                blob: null,
                error: null
            };

            this.jobs.push(job);
        }

        return this.jobs.length;
    }

    /**
     * Add jobs with individual configurations
     * @param {Array} jobConfigs - Array of job configurations
     */
    addJobConfigs(jobConfigs) {
        for (const config of jobConfigs) {
            if (!config.file || !config.targetHex) {
                console.warn('Skipping invalid job configuration');
                continue;
            }

            const job = {
                id: config.id || `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                file: config.file,
                fileName: config.file.name,
                targetHex: config.targetHex,
                hashAlgorithm: config.hashAlgorithm || 'sha512',
                status: 'pending',
                startTime: null,
                endTime: null,
                processingTime: 0,
                attempts: 0,
                hash: null,
                blob: null,
                error: null
            };

            this.jobs.push(job);
        }

        return this.jobs.length;
    }

    /**
     * Get current batch status
     */
    getStatus() {
        const pending = this.jobs.filter(job => job.status === 'pending').length;
        const processing = this.jobs.filter(job => job.status === 'processing').length;
        const completed = this.jobs.filter(job => job.status === 'completed').length;
        const failed = this.jobs.filter(job => job.status === 'failed').length;

        const progress = this.jobs.length > 0 ? ((completed + failed) / this.jobs.length) * 100 : 0;
        const elapsedTime = this.startTime ? Date.now() - this.startTime : 0;

        return {
            total: this.jobs.length,
            pending,
            processing,
            completed,
            failed,
            progress: Math.round(progress * 10) / 10,
            elapsedTime,
            currentJobIndex: this.currentJobIndex,
            isProcessing: this.isProcessing,
            isPaused: this.isPaused
        };
    }

    /**
     * Get detailed results
     */
    getResults() {
        return {
            status: this.getStatus(),
            jobs: this.jobs.map(job => ({
                id: job.id,
                fileName: job.fileName,
                targetHex: job.targetHex,
                hashAlgorithm: job.hashAlgorithm,
                status: job.status,
                attempts: job.attempts,
                hash: job.hash,
                processingTime: job.processingTime,
                error: job.error,
                hasBlob: !!job.blob
            }))
        };
    }

    /**
     * Clear all jobs
     */
    clear() {
        if (this.isProcessing) {
            throw new Error('Cannot clear jobs while processing. Stop the batch first.');
        }
        this.jobs = [];
        this.currentJobIndex = 0;
        this.results = [];
        this.completedJobs = 0;
        this.failedJobs = 0;
    }

    /**
     * Start batch processing
     */
    async startBatch() {
        if (this.isProcessing) {
            throw new Error('Batch is already processing');
        }

        if (this.jobs.length === 0) {
            throw new Error('No jobs in batch');
        }

        this.isProcessing = true;
        this.isPaused = false;
        this.startTime = Date.now();
        this.currentJobIndex = 0;
        this.completedJobs = 0;
        this.failedJobs = 0;

        console.log(`🚀 Starting web batch processing of ${this.jobs.length} jobs...`);

        try {
            for (let i = 0; i < this.jobs.length; i++) {
                if (!this.isProcessing) {
                    console.log('⏹️ Batch processing stopped');
                    break;
                }

                // Handle pause
                while (this.isPaused && this.isProcessing) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }

                this.currentJobIndex = i;
                const job = this.jobs[i];
                await this.processJob(job);

                // Report progress
                if (this.onProgress) {
                    this.onProgress(this.getStatus(), job);
                }
            }

            const finalStatus = this.getStatus();
            console.log(`✅ Batch processing completed!`);
            console.log(`   Total: ${finalStatus.total}, Completed: ${finalStatus.completed}, Failed: ${finalStatus.failed}`);

            if (this.onBatchComplete) {
                this.onBatchComplete(this.getResults());
            }

        } catch (error) {
            console.error(`❌ Batch processing error: ${error.message}`);
            if (this.onError) {
                this.onError(error, this.getResults());
            }
        } finally {
            this.isProcessing = false;
            this.isPaused = false;
        }
    }

    /**
     * Pause batch processing
     */
    pauseBatch() {
        if (this.isProcessing) {
            this.isPaused = true;
            console.log('⏸️ Batch processing paused');
        }
    }

    /**
     * Resume batch processing
     */
    resumeBatch() {
        if (this.isProcessing && this.isPaused) {
            this.isPaused = false;
            console.log('▶️ Batch processing resumed');
        }
    }

    /**
     * Stop batch processing
     */
    stopBatch() {
        if (this.isProcessing) {
            this.isProcessing = false;
            this.isPaused = false;
            console.log('🛑 Batch processing stopped');
        }
    }

    /**
     * Process a single job
     * @private
     */
    async processJob(job) {
        console.log(`📷 Processing: ${job.fileName}`);
        console.log(`🎯 Target: ${job.targetHex}, Algorithm: ${job.hashAlgorithm}`);

        job.status = 'processing';
        job.startTime = Date.now();

        try {
            const result = await this.spoofer.spoofImage(
                job.targetHex,
                job.file,
                job.hashAlgorithm,
                (attempt, maxAttempts, timing, memoryUsage) => {
                    job.attempts = attempt;
                    // Optional: Report individual job progress
                }
            );

            job.endTime = Date.now();
            job.processingTime = job.endTime - job.startTime;
            job.status = 'completed';
            job.hash = result.hash;
            job.blob = result.blob;
            job.attempts = result.attempts;

            this.completedJobs++;

            console.log(`✅ Completed: ${job.fileName} in ${(job.processingTime / 1000).toFixed(2)}s`);
            console.log(`📝 Final hash: ${job.hash}`);

            if (this.onJobComplete) {
                this.onJobComplete(job, this.getStatus());
            }

        } catch (error) {
            job.endTime = Date.now();
            job.processingTime = job.endTime - job.startTime;
            job.status = 'failed';
            job.error = error.message;

            this.failedJobs++;

            console.log(`❌ Failed: ${job.fileName} - ${error.message}`);

            if (this.onJobComplete) {
                this.onJobComplete(job, this.getStatus());
            }
        }
    }

    /**
     * Download completed files as a ZIP
     */
    async downloadAsZip() {
        const completedJobs = this.jobs.filter(job => job.status === 'completed' && job.blob);
        
        if (completedJobs.length === 0) {
            throw new Error('No completed jobs with files to download');
        }

        // For now, we'll create individual downloads
        // In a full implementation, you'd use JSZip or similar library
        const downloads = [];
        
        for (const job of completedJobs) {
            const url = URL.createObjectURL(job.blob);
            const originalName = job.fileName;
            const ext = originalName.substring(originalName.lastIndexOf('.'));
            const baseName = originalName.substring(0, originalName.lastIndexOf('.'));
            const newName = `${baseName}_spoofed_${job.targetHex.replace('0x', '')}${ext}`;
            
            downloads.push({
                url,
                filename: newName,
                job: job
            });
        }

        return downloads;
    }

    /**
     * Download individual completed file
     */
    downloadFile(jobId) {
        const job = this.jobs.find(j => j.id === jobId);
        
        if (!job || job.status !== 'completed' || !job.blob) {
            throw new Error('Job not found or not completed');
        }

        const url = URL.createObjectURL(job.blob);
        const originalName = job.fileName;
        const ext = originalName.substring(originalName.lastIndexOf('.'));
        const baseName = originalName.substring(0, originalName.lastIndexOf('.'));
        const newName = `${baseName}_spoofed_${job.targetHex.replace('0x', '')}${ext}`;

        const a = document.createElement('a');
        a.href = url;
        a.download = newName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Export batch configuration as JSON
     */
    exportConfig() {
        const config = {
            timestamp: new Date().toISOString(),
            version: "1.0",
            jobs: this.jobs.map(job => ({
                fileName: job.fileName,
                targetHex: job.targetHex,
                hashAlgorithm: job.hashAlgorithm
            }))
        };

        const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'batch-config.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Export batch results as JSON
     */
    exportResults() {
        const results = {
            ...this.getResults(),
            timestamp: new Date().toISOString(),
            version: "1.0"
        };

        const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'batch-results.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Set event callbacks
     */
    setCallbacks({ onProgress, onJobComplete, onBatchComplete, onError }) {
        this.onProgress = onProgress;
        this.onJobComplete = onJobComplete;
        this.onBatchComplete = onBatchComplete;
        this.onError = onError;
    }

    /**
     * Generate summary statistics
     */
    generateSummary() {
        const status = this.getStatus();
        const completedJobs = this.jobs.filter(job => job.status === 'completed');
        const failedJobs = this.jobs.filter(job => job.status === 'failed');
        
        const totalProcessingTime = completedJobs.reduce((sum, job) => sum + job.processingTime, 0);
        const avgProcessingTime = completedJobs.length > 0 ? totalProcessingTime / completedJobs.length : 0;
        
        const totalAttempts = completedJobs.reduce((sum, job) => sum + job.attempts, 0);
        const avgAttempts = completedJobs.length > 0 ? totalAttempts / completedJobs.length : 0;

        return {
            overview: {
                totalJobs: status.total,
                completed: status.completed,
                failed: status.failed,
                successRate: status.total > 0 ? (status.completed / status.total) * 100 : 0,
                totalProcessingTime: status.elapsedTime,
                averageProcessingTime: avgProcessingTime,
                totalAttempts: totalAttempts,
                averageAttempts: avgAttempts
            },
            completedJobs: completedJobs.map(job => ({
                fileName: job.fileName,
                targetHex: job.targetHex,
                hashAlgorithm: job.hashAlgorithm,
                finalHash: job.hash,
                processingTime: job.processingTime,
                attempts: job.attempts
            })),
            failedJobs: failedJobs.map(job => ({
                fileName: job.fileName,
                targetHex: job.targetHex,
                error: job.error
            }))
        };
    }
}
