import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { BatchProcessor } from '../../batch-processor.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mock glob for testing
jest.unstable_mockModule('glob', () => ({
    glob: jest.fn()
}));

describe('BatchProcessor Integration Tests', () => {
    let processor;
    let testOutputDir;

    beforeEach(() => {
        processor = new BatchProcessor();
        testOutputDir = path.join(__dirname, '../temp-batch-output');
        
        // Create test output directory
        if (!fs.existsSync(testOutputDir)) {
            fs.mkdirSync(testOutputDir, { recursive: true });
        }
    });

    afterEach(() => {
        // Cleanup test files
        if (fs.existsSync(testOutputDir)) {
            const files = fs.readdirSync(testOutputDir);
            files.forEach(file => {
                fs.unlinkSync(path.join(testOutputDir, file));
            });
            fs.rmdirSync(testOutputDir);
        }
    });

    describe('Job Management', () => {
        test('should add single job correctly', () => {
            const jobId = processor.addJob({
                inputPath: 'test1.jpg',
                outputPath: 'output1.jpg',
                targetHex: '0x24',
                hashAlgorithm: 'sha512'
            });

            expect(jobId).toBeTruthy();
            expect(processor.jobs).toHaveLength(1);
            expect(processor.jobs[0]).toMatchObject({
                inputPath: 'test1.jpg',
                outputPath: 'output1.jpg',
                targetHex: '0x24',
                hashAlgorithm: 'sha512',
                status: 'pending'
            });
        });

        test('should add multiple jobs with defaults', () => {
            processor.addJob({
                inputPath: 'test1.jpg',
                outputPath: 'output1.jpg',
                targetHex: '0x24'
            });

            processor.addJob({
                inputPath: 'test2.png',
                outputPath: 'output2.png',
                targetHex: '0xabc',
                hashAlgorithm: 'sha256'
            });

            expect(processor.jobs).toHaveLength(2);
            expect(processor.jobs[0].hashAlgorithm).toBe('sha512'); // default
            expect(processor.jobs[1].hashAlgorithm).toBe('sha256'); // specified
        });

        test('should clear all jobs', () => {
            processor.addJob({
                inputPath: 'test1.jpg',
                outputPath: 'output1.jpg',
                targetHex: '0x24'
            });

            expect(processor.jobs).toHaveLength(1);
            processor.clear();
            expect(processor.jobs).toHaveLength(0);
        });

        test('should not allow clearing while processing', async () => {
            processor.isProcessing = true;
            expect(() => processor.clear()).toThrow('Cannot clear jobs while processing');
        });
    });

    describe('Status Tracking', () => {
        test('should return correct initial status', () => {
            const status = processor.getStatus();
            expect(status).toMatchObject({
                total: 0,
                pending: 0,
                processing: 0,
                completed: 0,
                failed: 0,
                progress: 0,
                isProcessing: false
            });
        });

        test('should update status as jobs are added', () => {
            processor.addJob({
                inputPath: 'test1.jpg',
                outputPath: 'output1.jpg',
                targetHex: '0x24'
            });

            processor.addJob({
                inputPath: 'test2.jpg',
                outputPath: 'output2.jpg',
                targetHex: '0x24'
            });

            const status = processor.getStatus();
            expect(status).toMatchObject({
                total: 2,
                pending: 2,
                processing: 0,
                completed: 0,
                failed: 0,
                progress: 0
            });
        });

        test('should calculate progress correctly', () => {
            processor.addJob({
                inputPath: 'test1.jpg',
                outputPath: 'output1.jpg',
                targetHex: '0x24'
            });

            processor.addJob({
                inputPath: 'test2.jpg',
                outputPath: 'output2.jpg',
                targetHex: '0x24'
            });

            // Simulate one completed, one failed
            processor.jobs[0].status = 'completed';
            processor.jobs[1].status = 'failed';

            const status = processor.getStatus();
            expect(status.progress).toBe(100); // (1 + 1) / 2 * 100
            expect(status.completed).toBe(1);
            expect(status.failed).toBe(1);
            expect(status.pending).toBe(0);
        });
    });

    describe('Results Generation', () => {
        test('should generate detailed results', () => {
            const jobId1 = processor.addJob({
                inputPath: 'test1.jpg',
                outputPath: 'output1.jpg',
                targetHex: '0x24',
                hashAlgorithm: 'sha512'
            });

            const jobId2 = processor.addJob({
                inputPath: 'test2.jpg',
                outputPath: 'output2.jpg',
                targetHex: '0xabc',
                hashAlgorithm: 'sha256'
            });

            const results = processor.getResults();
            expect(results).toHaveProperty('status');
            expect(results).toHaveProperty('jobs');
            expect(results.jobs).toHaveLength(2);
            expect(results.jobs[0]).toMatchObject({
                id: jobId1,
                inputPath: 'test1.jpg',
                outputPath: 'output1.jpg',
                targetHex: '0x24',
                hashAlgorithm: 'sha512',
                status: 'pending'
            });
        });

        test('should generate summary with statistics', () => {
            // Add jobs and simulate some completion
            processor.addJob({
                inputPath: 'test1.jpg',
                outputPath: 'output1.jpg',
                targetHex: '0x24'
            });

            processor.addJob({
                inputPath: 'test2.jpg',
                outputPath: 'output2.jpg',
                targetHex: '0x24'
            });

            processor.addJob({
                inputPath: 'test3.jpg',
                outputPath: 'output3.jpg',
                targetHex: '0x24'
            });

            // Simulate job completion
            processor.jobs[0].status = 'completed';
            processor.jobs[0].processingTimeMs = 5000;
            processor.jobs[0].hash = '24abcdef...';

            processor.jobs[1].status = 'completed';
            processor.jobs[1].processingTimeMs = 3000;
            processor.jobs[1].hash = '24123456...';

            processor.jobs[2].status = 'failed';
            processor.jobs[2].error = 'Could not find matching hash';

            const summary = processor.generateSummary();

            expect(summary.overview).toMatchObject({
                totalJobs: 3,
                completed: 2,
                failed: 1,
                successRate: (2/3) * 100,
                averageProcessingTime: 4000 // (5000 + 3000) / 2
            });

            expect(summary.completedJobs).toHaveLength(2);
            expect(summary.failedJobs).toHaveLength(1);
            expect(summary.completedJobs[0]).toHaveProperty('finalHash', '24abcdef...');
            expect(summary.failedJobs[0]).toHaveProperty('error', 'Could not find matching hash');
        });
    });

    describe('Pattern Matching', () => {
        test('should handle glob patterns correctly', async () => {
            // Mock glob to return test files
            const { glob } = await import('glob');
            glob.mockResolvedValueOnce([
                'test-images/image1.jpg',
                'test-images/image2.png',
                'test-images/document.pdf', // Should be filtered out
                'test-images/image3.jpeg'
            ]);

            const addedJobs = await processor.addJobsFromPattern(
                'test-images/*',
                testOutputDir,
                '0x24',
                'sha512',
                '_modified'
            );

            expect(addedJobs).toHaveLength(3); // Only image files
            expect(processor.jobs).toHaveLength(3);
            
            // Verify job configurations
            expect(processor.jobs[0]).toMatchObject({
                inputPath: 'test-images/image1.jpg',
                outputPath: path.join(testOutputDir, 'image1_modified.jpg'),
                targetHex: '0x24',
                hashAlgorithm: 'sha512'
            });

            expect(processor.jobs[1]).toMatchObject({
                inputPath: 'test-images/image2.png',
                outputPath: path.join(testOutputDir, 'image2_modified.png')
            });

            expect(processor.jobs[2]).toMatchObject({
                inputPath: 'test-images/image3.jpeg',
                outputPath: path.join(testOutputDir, 'image3_modified.jpeg')
            });
        });

        test('should throw error for no matching files', async () => {
            const { glob } = await import('glob');
            glob.mockResolvedValueOnce([]);

            await expect(
                processor.addJobsFromPattern(
                    'nonexistent/*',
                    testOutputDir,
                    '0x24'
                )
            ).rejects.toThrow('No supported image files found matching pattern');
        });
    });

    describe('Configuration File Handling', () => {
        let testConfigPath;

        beforeEach(() => {
            testConfigPath = path.join(__dirname, '../temp-config.json');
        });

        afterEach(() => {
            if (fs.existsSync(testConfigPath)) {
                fs.unlinkSync(testConfigPath);
            }
        });

        test('should load valid configuration file', async () => {
            const config = {
                jobs: [
                    {
                        inputPath: 'test1.jpg',
                        outputPath: 'output1.jpg',
                        targetHex: '0x24',
                        hashAlgorithm: 'sha512'
                    },
                    {
                        inputPath: 'test2.png',
                        outputPath: 'output2.png',
                        targetHex: '0xabc',
                        hashAlgorithm: 'sha256'
                    }
                ],
                patterns: [
                    {
                        pattern: 'images/*.jpg',
                        outputDir: './outputs',
                        targetHex: '0x123',
                        hashAlgorithm: 'sha512'
                    }
                ]
            };

            fs.writeFileSync(testConfigPath, JSON.stringify(config, null, 2));

            // Mock glob for pattern matching
            const { glob } = await import('glob');
            glob.mockResolvedValueOnce(['images/photo1.jpg', 'images/photo2.jpg']);

            const addedJobs = await processor.addJobsFromConfig(testConfigPath);
            
            expect(addedJobs).toHaveLength(4); // 2 direct jobs + 2 from pattern
            expect(processor.jobs).toHaveLength(4);
            
            // Verify direct jobs
            expect(processor.jobs[0]).toMatchObject({
                inputPath: 'test1.jpg',
                outputPath: 'output1.jpg',
                targetHex: '0x24',
                hashAlgorithm: 'sha512'
            });

            // Verify pattern jobs
            expect(processor.jobs[2]).toMatchObject({
                inputPath: 'images/photo1.jpg',
                targetHex: '0x123',
                hashAlgorithm: 'sha512'
            });
        });

        test('should throw error for non-existent config file', async () => {
            await expect(
                processor.addJobsFromConfig('nonexistent-config.json')
            ).rejects.toThrow('Configuration file not found');
        });

        test('should throw error for invalid JSON config', async () => {
            fs.writeFileSync(testConfigPath, 'invalid json content');

            await expect(
                processor.addJobsFromConfig(testConfigPath)
            ).rejects.toThrow();
        });
    });

    describe('Export Functions', () => {
        test('should export configuration correctly', () => {
            processor.addJob({
                inputPath: 'test1.jpg',
                outputPath: 'output1.jpg',
                targetHex: '0x24',
                hashAlgorithm: 'sha512'
            });

            const configPath = path.join(testOutputDir, 'export-config.json');
            processor.exportConfig(configPath);

            expect(fs.existsSync(configPath)).toBe(true);

            const exportedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            expect(exportedConfig).toHaveProperty('timestamp');
            expect(exportedConfig).toHaveProperty('version', '1.0');
            expect(exportedConfig.jobs).toHaveLength(1);
            expect(exportedConfig.jobs[0]).toMatchObject({
                inputPath: 'test1.jpg',
                outputPath: 'output1.jpg',
                targetHex: '0x24',
                hashAlgorithm: 'sha512'
            });
        });

        test('should export results correctly', () => {
            processor.addJob({
                inputPath: 'test1.jpg',
                outputPath: 'output1.jpg',
                targetHex: '0x24'
            });

            // Simulate completion
            processor.jobs[0].status = 'completed';
            processor.jobs[0].hash = '24abcdef123456789...';
            processor.jobs[0].attempts = 12345;

            const resultsPath = path.join(testOutputDir, 'export-results.json');
            processor.exportResults(resultsPath);

            expect(fs.existsSync(resultsPath)).toBe(true);

            const exportedResults = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
            expect(exportedResults).toHaveProperty('timestamp');
            expect(exportedResults).toHaveProperty('version', '1.0');
            expect(exportedResults).toHaveProperty('status');
            expect(exportedResults).toHaveProperty('jobs');
            expect(exportedResults.jobs[0]).toMatchObject({
                inputPath: 'test1.jpg',
                status: 'completed',
                hash: '24abcdef123456789...',
                attempts: 12345
            });
        });
    });

    describe('Batch Control', () => {
        test('should not start batch without jobs', async () => {
            await expect(processor.startBatch()).rejects.toThrow('No jobs in batch');
        });

        test('should not start batch if already processing', async () => {
            processor.isProcessing = true;
            await expect(processor.startBatch()).rejects.toThrow('Batch is already processing');
        });

        test('should handle stop batch correctly', () => {
            processor.isProcessing = true;
            processor.stopBatch();
            expect(processor.isProcessing).toBe(false);
        });

        test('should handle stop batch when not processing', () => {
            processor.isProcessing = false;
            // Should not throw error
            processor.stopBatch();
            expect(processor.isProcessing).toBe(false);
        });
    });

    describe('Callback Integration', () => {
        test('should set callbacks correctly', () => {
            const mockCallbacks = {
                onProgress: jest.fn(),
                onComplete: jest.fn(),
                onError: jest.fn()
            };

            processor.setCallbacks(mockCallbacks);

            expect(processor.onProgress).toBe(mockCallbacks.onProgress);
            expect(processor.onComplete).toBe(mockCallbacks.onComplete);
            expect(processor.onError).toBe(mockCallbacks.onError);
        });

        test('should handle partial callbacks', () => {
            const partialCallbacks = {
                onProgress: jest.fn()
                // onComplete and onError not provided
            };

            processor.setCallbacks(partialCallbacks);

            expect(processor.onProgress).toBe(partialCallbacks.onProgress);
            expect(processor.onComplete).toBeUndefined();
            expect(processor.onError).toBeUndefined();
        });
    });

    describe('Error Handling', () => {
        test('should handle individual job failures gracefully', () => {
            processor.addJob({
                inputPath: 'nonexistent.jpg',
                outputPath: 'output.jpg',
                targetHex: '0x24'
            });

            // Simulate job failure
            processor.jobs[0].status = 'failed';
            processor.jobs[0].error = 'Input file not found';

            const status = processor.getStatus();
            expect(status.failed).toBe(1);
            expect(status.completed).toBe(0);

            const summary = processor.generateSummary();
            expect(summary.failedJobs).toHaveLength(1);
            expect(summary.failedJobs[0].error).toBe('Input file not found');
        });
    });
});
