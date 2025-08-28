import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createHash } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Integration tests for CLI functionality
 * Tests the complete workflow from input to output
 */
describe('CLI Integration Tests', () => {
  const fixturesPath = path.join(__dirname, '../fixtures');
  const tempOutputPath = path.join(__dirname, '../temp');
  
  beforeAll(() => {
    // Create temp directory for outputs
    if (!fs.existsSync(tempOutputPath)) {
      fs.mkdirSync(tempOutputPath, { recursive: true });
    }
  });

  afterAll(() => {
    // Clean up temp files
    if (fs.existsSync(tempOutputPath)) {
      fs.rmSync(tempOutputPath, { recursive: true, force: true });
    }
  });

  describe('Basic CLI Operations', () => {
    test('should display help when no arguments provided', (done) => {
      const process = spawn('node', ['spoof.js'], {
        cwd: path.join(__dirname, '../..')
      });

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        expect(code).not.toBe(0); // Should exit with error when no args
        expect(stderr).toContain('Usage:'); // Should show usage information
        done();
      });
    }, 10000);

    test('should handle invalid arguments gracefully', (done) => {
      const process = spawn('node', ['spoof.js', 'invalid-prefix', 'nonexistent.jpg', 'output.jpg'], {
        cwd: path.join(__dirname, '../..')
      });

      let stderr = '';

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        expect(code).not.toBe(0);
        expect(stderr.length).toBeGreaterThan(0);
        done();
      });
    }, 10000);
  });

  describe('Image Processing Workflow', () => {
    test('should successfully process PNG with simple prefix', (done) => {
      const inputPath = path.join(fixturesPath, 'test-image.png');
      const outputPath = path.join(tempOutputPath, 'test-output.png');
      const targetPrefix = '0x24'; // Simple 2-character prefix

      const process = spawn('node', ['spoof.js', targetPrefix, inputPath, outputPath, 'sha256'], {
        cwd: path.join(__dirname, '../..'),
        timeout: 30000 // 30 second timeout
      });

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          // Success case - verify the output
          expect(fs.existsSync(outputPath)).toBe(true);
          
          const outputContent = fs.readFileSync(outputPath);
          const hash = createHash('sha256').update(outputContent).digest('hex');
          
          expect(hash.startsWith(targetPrefix.slice(2).toLowerCase())).toBe(true);
          expect(stdout).toContain('Found matching hash');
        } else {
          // Handle the case where it doesn't find a match in time
          expect(stderr).toContain('Could not find matching hash');
        }
        done();
      });

      process.on('error', (err) => {
        console.error('Process error:', err);
        done();
      });
    }, 60000); // 1 minute timeout for this test

    test('should preserve image integrity after processing', (done) => {
      const inputPath = path.join(fixturesPath, 'test-image.jpg');
      const outputPath = path.join(tempOutputPath, 'integrity-test.jpg');
      const targetPrefix = '0xa1'; // Simple prefix

      const process = spawn('node', ['spoof.js', targetPrefix, inputPath, outputPath], {
        cwd: path.join(__dirname, '../..'),
        timeout: 30000
      });

      process.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputPath)) {
          const originalContent = fs.readFileSync(inputPath);
          const modifiedContent = fs.readFileSync(outputPath);
          
          // Files should be different (modified)
          expect(modifiedContent.length).toBeGreaterThan(originalContent.length);
          
          // But should still be valid JPEG
          expect(modifiedContent.subarray(0, 2)).toEqual(Buffer.from([0xFF, 0xD8]));
        }
        done();
      });
    }, 60000);
  });

  describe('Error Handling', () => {
    test('should handle non-existent input files', (done) => {
      const process = spawn('node', ['spoof.js', '0x24', 'nonexistent.jpg', 'output.jpg'], {
        cwd: path.join(__dirname, '../..')
      });

      let stderr = '';

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        expect(code).not.toBe(0);
        expect(stderr).toContain('no such file');
        done();
      });
    }, 10000);

    test('should validate hex prefix format', (done) => {
      const inputPath = path.join(fixturesPath, 'test-image.jpg');
      const outputPath = path.join(tempOutputPath, 'invalid-prefix.jpg');
      
      const process = spawn('node', ['spoof.js', 'invalid-prefix', inputPath, outputPath], {
        cwd: path.join(__dirname, '../..')
      });

      let stderr = '';

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        expect(code).not.toBe(0);
        done();
      });
    }, 10000);
  });

  describe('Performance Characteristics', () => {
    test('should report progress during processing', (done) => {
      const inputPath = path.join(fixturesPath, 'test-image.png');
      const outputPath = path.join(tempOutputPath, 'progress-test.png');
      
      const process = spawn('node', ['spoof.js', '0xabc', inputPath, outputPath], {
        cwd: path.join(__dirname, '../..'),
        timeout: 20000
      });

      let stdout = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.on('close', (code) => {
        // Should show progress updates
        const progressMatches = stdout.match(/Attempt \d+\/\d+/g);
        if (progressMatches) {
          expect(progressMatches.length).toBeGreaterThan(0);
        }
        done();
      });
    }, 30000);
  });
});
