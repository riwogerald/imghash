import { OptimizedImageHashSpoofer } from './spoof.js';
import fs from 'fs';
import path from 'path';
import { glob } from 'glob';

export class BatchProcessor {
    constructor() {
        this.spoofer = new OptimizedImageHashSpoofer();
        this.jobs = [];
        this.currentJobIndex = 0;
        this.results = [];
        this.isProcessing = false;
        this.onProgress = null;
        this.onComplete = null;
        this.onError = null;
        this.startTime = null;
    }

    /**
     * Add a single job to the batch
     * @param {Object} job - Job configuration
     * @param {string} job.inputPath - Path to input image
     * @param {string} job.outputPath - Path for output image
     * @param {string} job.targetHex - Target hash prefix
     * @param {string} job.hashAlgorithm - Hash algorithm to use
     * @param {string} job.id - Unique job identifier
     */
    addJob(job) {
        const jobWithDefaults = {
            id: job.id || `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            inputPath: job.inputPath,
            outputPath: job.outputPath,
            targetHex: job.targetHex,
            hashAlgorithm: job.hashAlgorithm || 'sha512',
            status: 'pending',
            attempts: 0,
            startTime: null,
            endTime: null,
            error: null,
            hash: null,
            processingTimeMs: 0
        };

        this.jobs.push(jobWithDefaults);
        return jobWithDefaults.id;
    }

    /**
     * Add multiple jobs from file patterns
     * @param {string} pattern - Glob pattern for input files
     * @param {string} outputDir - Output directory
     * @param {string} targetHex - Target hash prefix
     * @param {string} hashAlgorithm - Hash algorithm
     * @param {string} outputSuffix - Suffix to add to output filenames
     */
    async addJobsFromPattern(pattern, outputDir, targetHex, hashAlgorithm = 'sha512', outputSuffix = '_spoofed') {
        const files = await glob(pattern, { nodir: true });
        const supportedExtensions = ['.jpg', '.jpeg', '.png', '.gif'];
        const imageFiles = files.filter(file => 
            supportedExtensions.includes(path.extname(file).toLowerCase())
        );

        if (imageFiles.length === 0) {
            throw new Error(`No supported image files found matching pattern: ${pattern}`);
        }

        // Ensure output directory exists
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const addedJobs = [];
        for (const inputPath of imageFiles) {
            const ext = path.extname(inputPath);
            const baseName = path.basename(inputPath, ext);
            const outputPath = path.join(outputDir, `${baseName}${outputSuffix}${ext}`);
            
            const jobId = this.addJob({
                inputPath,
                outputPath,
                targetHex,
                hashAlgorithm
            });
            addedJobs.push(jobId);
        }

        return addedJobs;
    }

    /**
     * Add jobs from a configuration file
     * @param {string} configPath - Path to JSON configuration file
     */
    async addJobsFromConfig(configPath) {
        if (!fs.existsSync(configPath)) {
            throw new Error(`Configuration file not found: ${configPath}`);
        }

        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const addedJobs = [];

        if (config.jobs && Array.isArray(config.jobs)) {
            for (const jobConfig of config.jobs) {
                const jobId = this.addJob(jobConfig);
                addedJobs.push(jobId);
            }
        }

        if (config.patterns && Array.isArray(config.patterns)) {
            for (const patternConfig of config.patterns) {
                const patternJobs = await this.addJobsFromPattern(
                    patternConfig.pattern,
                    patternConfig.outputDir,
                    patternConfig.targetHex,
                    patternConfig.hashAlgorithm,
                    patternConfig.outputSuffix
                );
                addedJobs.push(...patternJobs);
            }
        }

        return addedJobs;
    }

    /**
     * Get current batch status
     */
    getStatus() {
        const completed = this.jobs.filter(job => job.status === 'completed').length;
        const failed = this.jobs.filter(job => job.status === 'failed').length;
        const pending = this.jobs.filter(job => job.status === 'pending').length;
        const processing = this.jobs.filter(job => job.status === 'processing').length;

        return {
            total: this.jobs.length,
            completed,
            failed,
            pending,
            processing,
            currentJobIndex: this.currentJobIndex,
            isProcessing: this.isProcessing,
            progress: this.jobs.length > 0 ? ((completed + failed) / this.jobs.length) * 100 : 0,
            elapsedTime: this.startTime ? Date.now() - this.startTime : 0
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
                inputPath: job.inputPath,
                outputPath: job.outputPath,
                targetHex: job.targetHex,
                hashAlgorithm: job.hashAlgorithm,
                status: job.status,
                attempts: job.attempts,
                hash: job.hash,
                processingTimeMs: job.processingTimeMs,
                error: job.error
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
    }

    /**
     * Start processing the batch
     */
    async startBatch() {
        if (this.isProcessing) {
            throw new Error('Batch is already processing');
        }

        if (this.jobs.length === 0) {
            throw new Error('No jobs in batch');
        }

        this.isProcessing = true;
        this.startTime = Date.now();
        this.currentJobIndex = 0;

        console.log(`🚀 Starting batch processing of ${this.jobs.length} jobs...`);

        try {
            for (let i = 0; i < this.jobs.length; i++) {
                if (!this.isProcessing) {
                    console.log('⏹️  Batch processing stopped');
                    break;
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
            console.log(`   Processing time: ${(finalStatus.elapsedTime / 1000).toFixed(2)}s`);

            if (this.onComplete) {
                this.onComplete(this.getResults());
            }

        } catch (error) {
            console.error(`❌ Batch processing error: ${error.message}`);
            if (this.onError) {
                this.onError(error, this.getResults());
            }
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Stop batch processing
     */
    stopBatch() {
        if (this.isProcessing) {
            console.log('🛑 Stopping batch processing...');
            this.isProcessing = false;
        }
    }

    /**
     * Process a single job
     * @private
     */
    async processJob(job) {
        console.log(`\n📷 Processing: ${path.basename(job.inputPath)} -> ${path.basename(job.outputPath)}`);
        console.log(`🎯 Target: ${job.targetHex}, Algorithm: ${job.hashAlgorithm}`);

        job.status = 'processing';
        job.startTime = Date.now();

        try {
            // Validate input file
            if (!fs.existsSync(job.inputPath)) {
                throw new Error(`Input file not found: ${job.inputPath}`);
            }

            // Ensure output directory exists
            const outputDir = path.dirname(job.outputPath);
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            // Process the image
            await this.spoofer.spoofImage(
                job.targetHex, 
                job.inputPath, 
                job.outputPath, 
                job.hashAlgorithm
            );

            job.endTime = Date.now();
            job.processingTimeMs = job.endTime - job.startTime;
            job.status = 'completed';

            // Verify and get the final hash
            const content = fs.readFileSync(job.outputPath);
            if (job.hashAlgorithm === 'crc32') {
                job.hash = this.spoofer.computeCRC32Hash(content);
            } else {
                const { createHash } = await import('node:crypto');
                job.hash = createHash(job.hashAlgorithm).update(content).digest('hex');
            }

            console.log(`✅ Completed in ${(job.processingTimeMs / 1000).toFixed(2)}s`);
            console.log(`📝 Final hash: ${job.hash}`);

        } catch (error) {
            job.endTime = Date.now();
            job.processingTimeMs = job.endTime - job.startTime;
            job.status = 'failed';
            job.error = error.message;
            
            console.log(`❌ Failed: ${error.message}`);
        }
    }

    /**
     * Export batch configuration to JSON file
     */
    exportConfig(configPath) {
        const config = {
            timestamp: new Date().toISOString(),
            version: "1.0",
            jobs: this.jobs.map(job => ({
                inputPath: job.inputPath,
                outputPath: job.outputPath,
                targetHex: job.targetHex,
                hashAlgorithm: job.hashAlgorithm
            }))
        };

        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        console.log(`📄 Batch configuration exported to: ${configPath}`);
    }

    /**
     * Export results to JSON file
     */
    exportResults(resultsPath) {
        const results = {
            ...this.getResults(),
            timestamp: new Date().toISOString(),
            version: "1.0"
        };

        fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
        console.log(`📊 Batch results exported to: ${resultsPath}`);
    }

    /**
     * Generate a summary report
     */
    generateSummary() {
        const status = this.getStatus();
        const completedJobs = this.jobs.filter(job => job.status === 'completed');
        const failedJobs = this.jobs.filter(job => job.status === 'failed');
        
        const avgProcessingTime = completedJobs.length > 0 ? 
            completedJobs.reduce((sum, job) => sum + job.processingTimeMs, 0) / completedJobs.length : 0;

        const summary = {
            overview: {
                totalJobs: status.total,
                completed: status.completed,
                failed: status.failed,
                successRate: status.total > 0 ? (status.completed / status.total) * 100 : 0,
                totalProcessingTime: status.elapsedTime,
                averageProcessingTime: avgProcessingTime
            },
            completedJobs: completedJobs.map(job => ({
                inputFile: path.basename(job.inputPath),
                outputFile: path.basename(job.outputPath),
                targetHex: job.targetHex,
                finalHash: job.hash,
                processingTimeMs: job.processingTimeMs
            })),
            failedJobs: failedJobs.map(job => ({
                inputFile: path.basename(job.inputPath),
                targetHex: job.targetHex,
                error: job.error
            }))
        };

        return summary;
    }

    /**
     * Set event callbacks
     */
    setCallbacks({ onProgress, onComplete, onError }) {
        this.onProgress = onProgress;
        this.onComplete = onComplete;
        this.onError = onError;
    }
}

// Batch configuration validation
export function validateBatchConfig(config) {
    const errors = [];

    if (!config.jobs && !config.patterns) {
        errors.push('Configuration must contain either "jobs" or "patterns" array');
    }

    if (config.jobs) {
        if (!Array.isArray(config.jobs)) {
            errors.push('"jobs" must be an array');
        } else {
            config.jobs.forEach((job, index) => {
                if (!job.inputPath) errors.push(`Job ${index}: "inputPath" is required`);
                if (!job.outputPath) errors.push(`Job ${index}: "outputPath" is required`);
                if (!job.targetHex) errors.push(`Job ${index}: "targetHex" is required`);
                if (job.targetHex && !job.targetHex.startsWith('0x')) {
                    errors.push(`Job ${index}: "targetHex" must start with "0x"`);
                }
            });
        }
    }

    if (config.patterns) {
        if (!Array.isArray(config.patterns)) {
            errors.push('"patterns" must be an array');
        } else {
            config.patterns.forEach((pattern, index) => {
                if (!pattern.pattern) errors.push(`Pattern ${index}: "pattern" is required`);
                if (!pattern.outputDir) errors.push(`Pattern ${index}: "outputDir" is required`);
                if (!pattern.targetHex) errors.push(`Pattern ${index}: "targetHex" is required`);
                if (pattern.targetHex && !pattern.targetHex.startsWith('0x')) {
                    errors.push(`Pattern ${index}: "targetHex" must start with "0x"`);
                }
            });
        }
    }

    return errors;
}
