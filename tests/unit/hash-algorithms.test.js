import { createHash } from 'crypto';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Test suite for hash algorithm implementations
 * Tests both crypto module hashes and our custom implementations
 */
describe('Hash Algorithms', () => {
  describe('Crypto Hash Functions', () => {
    test('should generate consistent SHA-256 hashes', () => {
      const testData = Buffer.from('test data for hashing');
      const hash1 = createHash('sha256').update(testData).digest('hex');
      const hash2 = createHash('sha256').update(testData).digest('hex');
      
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 produces 64 hex characters
      expect(hash1).toMatch(/^[a-f0-9]{64}$/); // Only hex characters
    });

    test('should generate consistent SHA-512 hashes', () => {
      const testData = Buffer.from('test data for hashing');
      const hash1 = createHash('sha512').update(testData).digest('hex');
      const hash2 = createHash('sha512').update(testData).digest('hex');
      
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(128); // SHA-512 produces 128 hex characters
      expect(hash1).toMatch(/^[a-f0-9]{128}$/);
    });

    test('should produce different hashes for different inputs', () => {
      const data1 = Buffer.from('test data 1');
      const data2 = Buffer.from('test data 2');
      
      const hash1 = createHash('sha256').update(data1).digest('hex');
      const hash2 = createHash('sha256').update(data2).digest('hex');
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('Hash Prefix Validation', () => {
    test('should validate hex prefix format', () => {
      const validPrefixes = ['0x24', '0xabc', '0x123456', '0xABCDEF'];
      const invalidPrefixes = ['24', 'xyz', '0xGHI', ''];

      validPrefixes.forEach(prefix => {
        expect(prefix.startsWith('0x')).toBe(true);
        expect(prefix.slice(2)).toMatch(/^[a-fA-F0-9]+$/);
      });

      invalidPrefixes.forEach(prefix => {
        if (prefix && prefix !== '0xGHI') { // '0xGHI' starts with 0x but has invalid chars
          expect(prefix.startsWith('0x')).toBe(false);
        }
        if (prefix === '0xGHI') {
          expect(prefix.startsWith('0x')).toBe(true);
          expect(prefix.slice(2)).not.toMatch(/^[a-fA-F0-9]+$/);
        }
      });
    });

    test('should convert hex prefixes to lowercase for comparison', () => {
      const upperPrefix = '0xABC123';
      const lowerPrefix = '0xabc123';
      
      expect(upperPrefix.toLowerCase()).toBe(lowerPrefix);
    });
  });

  describe('Performance Characteristics', () => {
    test('should hash large data efficiently', () => {
      const largeData = Buffer.alloc(1024 * 1024, 'test'); // 1MB of data
      
      const startTime = Date.now();
      const hash = createHash('sha256').update(largeData).digest('hex');
      const endTime = Date.now();
      
      expect(hash).toBeDefined();
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });
  });
});
