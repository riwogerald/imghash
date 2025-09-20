#!/usr/bin/env node

import { BatchProcessor, validateBatchConfig } from './batch-processor.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ANSI color codes for better CLI output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m'
};

function colorize(text, color) {
    return `${colors[color]}${text}${colors.reset}`;
}

function showHelp() {
    console.log(`${colorize('📦 Image Hash Spoofer - Batch Processing', 'cyan')}
    
${colorize('USAGE:', 'yellow')}
  ${colorize('Pattern Mode:', 'bright')}
  node batch-spoof.js pattern <glob-pattern> <output-dir> <target-hex> [options]
  
  ${colorize('Config File Mode:', 'bright')}
  node batch-spoof.js config <config-file> [options]
  
  ${colorize('Individual Files:', 'bright')}
  node batch-spoof.js files <target-hex> <hash-algorithm> <input1> <output1> [input2] [output2] ...

${colorize('EXAMPLES:', 'yellow')}
  ${colorize('Process all JPGs in current directory:', 'bright')}
  node batch-spoof.js pattern "*.jpg" ./output 0x24 --algorithm sha512

  ${colorize('Process images from subdirectories:', 'bright')}
  node batch-spoof.js pattern "photos/**/*.{jpg,png}" ./spoofed 0xabc123 --suffix _modified

  ${colorize('Use a configuration file:', 'bright')}
  node batch-spoof.js config batch-config.json --export-results results.json

  ${colorize('Process specific files:', 'bright')}
  node batch-spoof.js files 0x24 sha512 photo1.jpg out1.jpg photo2.png out2.png

${colorize('OPTIONS:', 'yellow')}
  --algorithm, -a      Hash algorithm (sha256|sha512|sha3-256|sha3-512|crc32) [default: sha512]
  --suffix, -s         Suffix for output filenames [default: _spoofed]
  --export-config      Export batch configuration to file
  --export-results     Export batch results to file
  --max-concurrent     Maximum concurrent jobs [default: 4]
  --summary            Show detailed summary after processing
  --quiet, -q          Suppress progress output
  --help, -h           Show this help message

${colorize('CONFIGURATION FILE FORMAT:', 'yellow')}
{
  "jobs": [
    {
      "inputPath": "photo1.jpg",
      "outputPath": "output/photo1_spoofed.jpg",
      "targetHex": "0x24",
      "hashAlgorithm": "sha512"
    }
  ],
  "patterns": [
    {
      "pattern": "photos/*.jpg",
      "outputDir": "./output",
      "targetHex": "0xabc",
      "hashAlgorithm": "sha256",
      "outputSuffix": "_modified"
    }
  ]
}
`);
}

function parseArgs() {
    const args = process.argv.slice(2);
    
    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        showHelp();
        process.exit(0);
    }

    const mode = args[0];
    const options = {};
    const positional = [];

    // Parse options
    for (let i = 1; i < args.length; i++) {
        const arg = args[i];
        
        if (arg.startsWith('--')) {
            const key = arg.slice(2);
            if (key === 'quiet') {
                options.quiet = true;
            } else if (key === 'summary') {
                options.summary = true;
            } else if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
                options[key] = args[i + 1];
                i++; // Skip next argument as it's the value
            } else {
                options[key] = true;
            }
        } else if (arg.startsWith('-') && arg.length === 2) {
            const key = arg.slice(1);
            if (key === 'q') {
                options.quiet = true;
            } else if (key === 'h') {
                showHelp();
                process.exit(0);
            } else if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
                const fullKey = { 'a': 'algorithm', 's': 'suffix' }[key] || key;
                options[fullKey] = args[i + 1];
                i++; // Skip next argument as it's the value
            }
        } else {
            positional.push(arg);
        }
    }

    return { mode, positional, options };
}

async function runPatternMode(positional, options) {
    if (positional.length < 3) {
        console.error(colorize('❌ Error: Pattern mode requires <glob-pattern> <output-dir> <target-hex>', 'red'));
        console.log('Usage: node batch-spoof.js pattern <glob-pattern> <output-dir> <target-hex> [options]');
        process.exit(1);
    }

    const [pattern, outputDir, targetHex] = positional;
    const algorithm = options.algorithm || 'sha512';
    const suffix = options.suffix || '_spoofed';

    if (!targetHex.startsWith('0x')) {
        console.error(colorize('❌ Error: Target hex must start with "0x"', 'red'));
        process.exit(1);
    }

    console.log(colorize('🔍 Scanning for images...', 'cyan'));
    console.log(`   Pattern: ${colorize(pattern, 'bright')}`);
    console.log(`   Output: ${colorize(outputDir, 'bright')}`);
    console.log(`   Target: ${colorize(targetHex, 'bright')}`);
    console.log(`   Algorithm: ${colorize(algorithm, 'bright')}`);

    const processor = new BatchProcessor();
    
    try {
        const jobIds = await processor.addJobsFromPattern(pattern, outputDir, targetHex, algorithm, suffix);
        console.log(colorize(`✅ Found ${jobIds.length} images to process`, 'green'));

        if (options['export-config']) {
            processor.exportConfig(options['export-config']);
        }

        await runBatch(processor, options);
        
    } catch (error) {
        console.error(colorize(`❌ Error: ${error.message}`, 'red'));
        process.exit(1);
    }
}

async function runConfigMode(positional, options) {
    if (positional.length < 1) {
        console.error(colorize('❌ Error: Config mode requires <config-file>', 'red'));
        console.log('Usage: node batch-spoof.js config <config-file> [options]');
        process.exit(1);
    }

    const configFile = positional[0];
    
    if (!fs.existsSync(configFile)) {
        console.error(colorize(`❌ Error: Configuration file not found: ${configFile}`, 'red'));
        process.exit(1);
    }

    console.log(colorize('📄 Loading configuration...', 'cyan'));
    
    try {
        const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        const errors = validateBatchConfig(config);
        
        if (errors.length > 0) {
            console.error(colorize('❌ Configuration validation errors:', 'red'));
            errors.forEach(error => console.error(`   • ${error}`));
            process.exit(1);
        }

        const processor = new BatchProcessor();
        const jobIds = await processor.addJobsFromConfig(configFile);
        
        console.log(colorize(`✅ Loaded ${jobIds.length} jobs from configuration`, 'green'));
        
        await runBatch(processor, options);
        
    } catch (error) {
        console.error(colorize(`❌ Error loading configuration: ${error.message}`, 'red'));
        process.exit(1);
    }
}

async function runFilesMode(positional, options) {
    if (positional.length < 4 || positional.length % 2 !== 2) {
        console.error(colorize('❌ Error: Files mode requires <target-hex> <hash-algorithm> and pairs of <input> <output>', 'red'));
        console.log('Usage: node batch-spoof.js files <target-hex> <hash-algorithm> <input1> <output1> [input2] [output2] ...');
        process.exit(1);
    }

    const [targetHex, algorithm, ...fileArgs] = positional;
    
    if (!targetHex.startsWith('0x')) {
        console.error(colorize('❌ Error: Target hex must start with "0x"', 'red'));
        process.exit(1);
    }

    const processor = new BatchProcessor();
    
    // Add jobs from file pairs
    for (let i = 0; i < fileArgs.length; i += 2) {
        const inputPath = fileArgs[i];
        const outputPath = fileArgs[i + 1];
        
        if (!outputPath) {
            console.error(colorize(`❌ Error: Missing output path for input: ${inputPath}`, 'red'));
            process.exit(1);
        }
        
        processor.addJob({ inputPath, outputPath, targetHex, hashAlgorithm: algorithm });
    }

    console.log(colorize(`✅ Added ${fileArgs.length / 2} jobs`, 'green'));
    
    await runBatch(processor, options);
}

async function runBatch(processor, options) {
    const startTime = Date.now();
    
    // Setup progress callback
    if (!options.quiet) {
        processor.setCallbacks({
            onProgress: (status, currentJob) => {
                const progress = status.progress.toFixed(1);
                const elapsed = ((status.elapsedTime) / 1000).toFixed(1);
                const currentFile = currentJob ? path.basename(currentJob.inputPath) : '';
                
                process.stdout.write(`\r${colorize('⏳', 'yellow')} Progress: ${colorize(`${progress}%`, 'cyan')} | ` +
                    `Completed: ${colorize(status.completed, 'green')} | ` +
                    `Failed: ${colorize(status.failed, 'red')} | ` +
                    `Time: ${colorize(`${elapsed}s`, 'blue')} | ` +
                    `Current: ${colorize(currentFile, 'bright')}`);
            },
            onComplete: (results) => {
                console.log('\n');
                console.log(colorize('🎉 Batch processing completed!', 'green'));
                
                if (options['export-results']) {
                    processor.exportResults(options['export-results']);
                }
                
                if (options.summary) {
                    showSummary(processor.generateSummary());
                }
            },
            onError: (error, results) => {
                console.log('\n');
                console.error(colorize(`❌ Batch processing error: ${error.message}`, 'red'));
                
                if (options['export-results']) {
                    processor.exportResults(options['export-results']);
                }
            }
        });
    }

    try {
        await processor.startBatch();
        
        // Final summary
        const status = processor.getStatus();
        const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
        
        console.log('\n' + '='.repeat(60));
        console.log(colorize('📊 BATCH PROCESSING SUMMARY', 'cyan'));
        console.log('='.repeat(60));
        console.log(`${colorize('Total Jobs:', 'bright')} ${status.total}`);
        console.log(`${colorize('Completed:', 'green')} ${status.completed}`);
        console.log(`${colorize('Failed:', 'red')} ${status.failed}`);
        console.log(`${colorize('Success Rate:', 'bright')} ${((status.completed / status.total) * 100).toFixed(1)}%`);
        console.log(`${colorize('Total Time:', 'blue')} ${totalTime}s`);
        console.log('='.repeat(60));
        
        if (status.failed > 0) {
            console.log(colorize('⚠️  Some jobs failed. Check the output above for details.', 'yellow'));
        }
        
        process.exit(status.failed > 0 ? 1 : 0);
        
    } catch (error) {
        console.error(colorize(`❌ Fatal error: ${error.message}`, 'red'));
        process.exit(1);
    }
}

function showSummary(summary) {
    console.log('\n' + '='.repeat(60));
    console.log(colorize('📈 DETAILED SUMMARY', 'cyan'));
    console.log('='.repeat(60));
    
    console.log(colorize('Overview:', 'bright'));
    console.log(`  Total Jobs: ${summary.overview.totalJobs}`);
    console.log(`  Completed: ${colorize(summary.overview.completed, 'green')}`);
    console.log(`  Failed: ${colorize(summary.overview.failed, 'red')}`);
    console.log(`  Success Rate: ${summary.overview.successRate.toFixed(1)}%`);
    console.log(`  Total Processing Time: ${(summary.overview.totalProcessingTime / 1000).toFixed(2)}s`);
    console.log(`  Average Processing Time: ${(summary.overview.averageProcessingTime / 1000).toFixed(2)}s`);
    
    if (summary.completedJobs.length > 0) {
        console.log(`\n${colorize('✅ Completed Jobs:', 'green')}`);
        summary.completedJobs.forEach(job => {
            console.log(`  ${job.inputFile} → ${job.outputFile}`);
            console.log(`    Target: ${job.targetHex} | Hash: ${job.finalHash.substring(0, 16)}... | Time: ${(job.processingTimeMs / 1000).toFixed(2)}s`);
        });
    }
    
    if (summary.failedJobs.length > 0) {
        console.log(`\n${colorize('❌ Failed Jobs:', 'red')}`);
        summary.failedJobs.forEach(job => {
            console.log(`  ${job.inputFile} (${job.targetHex}): ${job.error}`);
        });
    }
    
    console.log('='.repeat(60));
}

async function main() {
    console.log(colorize('🚀 Image Hash Spoofer - Batch Processing Tool', 'cyan'));
    console.log('');
    
    const { mode, positional, options } = parseArgs();
    
    switch (mode) {
        case 'pattern':
            await runPatternMode(positional, options);
            break;
            
        case 'config':
            await runConfigMode(positional, options);
            break;
            
        case 'files':
            await runFilesMode(positional, options);
            break;
            
        default:
            console.error(colorize(`❌ Unknown mode: ${mode}`, 'red'));
            console.log('Valid modes: pattern, config, files');
            console.log('Use --help for usage information');
            process.exit(1);
    }
}

// Handle process signals for graceful shutdown
process.on('SIGINT', () => {
    console.log(colorize('\n🛑 Received interrupt signal. Exiting...', 'yellow'));
    process.exit(1);
});

process.on('SIGTERM', () => {
    console.log(colorize('\n🛑 Received termination signal. Exiting...', 'yellow'));
    process.exit(1);
});

// Run the main function
main().catch(error => {
    console.error(colorize(`❌ Fatal error: ${error.message}`, 'red'));
    process.exit(1);
});
