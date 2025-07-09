# Image Hash Spoofer

A powerful tool for modifying image file hashes while preserving their visual appearance. This tool adds invisible metadata to image files to make their hash start with a desired prefix.

## LIVE TEST LINK: https://image-hash-spoofer.netlify.app/

## Original Problem Statement

Build a tool that takes an image and an arbitrary hexstring and outputs an adjusted file that displays identically to the human eye (when opened in image viewers) but has a hash that begins with the given hexstring.
It should work in such a way that we can run, e.g.

spoof 0x24 original.jpg altered.jpg
and get a file altered.jpg such that running the sum on a Linux machine produces output like this:
sha512sum altered.jpg
2448a6512f[...more bytes...]93de43f4b5b  altered.jpg

You can use a different image format (PNG, TIFF, etc.) if you find it better suited to the problem. Also, you can change the hash algorithm to another SHA-based one if you deem it more appropriate. (Obviously, the name spoof is only used as an example; you can name your program as you wish.)

## Features

- **Multiple Formats**: Supports PNG and JPEG image formats
- **Hash Algorithms**: SHA-256 and SHA-512 support
- **Web Interface**: Easy-to-use browser-based interface
- **Command Line**: Node.js CLI for batch processing
- **Visual Preservation**: Images look identical to the human eye
- **Progress Tracking**: Real-time progress updates during processing

## How It Works

The tool works by adding invisible metadata to image files:
- **PNG files**: Adds tEXt chunks with comment data
- **JPEG files**: Inserts comment segments (0xFFFE markers)

The metadata is invisible when viewing the image but changes the file's hash. The tool uses brute force to find metadata that produces a hash starting with your desired prefix.

## Usage

### Web Interface

1. Open `index.html` in your browser
2. Enter your target hash prefix (e.g., `0x24`, `0xabc123`)
3. Select your hash algorithm (SHA-512 recommended)
4. Upload your image file
5. Click "Start Hash Spoofing"
6. Download the modified image when complete

### Command Line

```bash
# Basic usage
node spoof.js 0x24 original.jpg altered.jpg

# With specific hash algorithm
node spoof.js 0x24 original.png altered.png sha512

# Examples
node spoof.js 0xabc123 photo.jpg spoofed.jpg sha256
node spoof.js 0x999 image.png modified.png sha512
```

### Parameters

- `target_hex`: Desired hash prefix (must start with "0x")
- `input_image`: Path to original image file
- `output_image`: Path for the modified image file
- `hash_algorithm`: Optional, "sha256" or "sha512" (default: sha512)

## Installation

### Prerequisites

- Node.js 16+ for CLI usage
- Modern web browser for web interface

### Setup

```bash
# Clone or download the project
# Install dependencies
npm install

# Run the web interface
npm run dev

# Use CLI directly
node spoof.js 0x24 image.jpg spoofed.jpg
```

## Technical Details

### PNG Implementation
- Adds tEXt chunks before the IEND chunk
- Maintains proper CRC32 checksums
- Preserves all original image data and metadata

### JPEG Implementation
- Inserts comment segments (0xFFFE) after existing headers
- Maintains JPEG structure and compatibility
- Preserves EXIF and other metadata

### Performance
- Brute force approach with optimized iterations
- Progress reporting every 10,000 attempts (web) / 100,000 (CLI)
- Typical success within 1-10 million attempts for 2-3 character prefixes
- Uses Web Workers in browser to prevent UI blocking

## Security Considerations

This tool is designed for legitimate purposes such as:
- Testing hash-based systems
- Educational demonstrations
- Digital forensics research
- File organization systems

**Important**: Do not use this tool for malicious purposes such as bypassing security systems or creating misleading file signatures.

## Limitations

- Longer hash prefixes require exponentially more attempts
- Processing time varies based on target prefix and system performance
- Maximum attempts limited to prevent infinite loops
- Only supports PNG and JPEG formats currently

## Examples

### Successful Output
```bash
$ node spoof.js 0x24 photo.jpg spoofed.jpg sha512
Starting hash spoofing for target: 0x24
Using hash algorithm: sha512
Detected JPEG format
Attempt 100000/10000000...
Attempt 200000/10000000...
Found matching hash after 234567 attempts!
Final hash: 2448a6512f93de43f4b5b8c7e2a1d9f6...
Successfully created spoofed image: spoofed.jpg
Verification hash: 2448a6512f93de43f4b5b8c7e2a1d9f6...
```

### Verification
```bash
$ sha512sum spoofed.jpg
2448a6512f93de43f4b5b8c7e2a1d9f6...  spoofed.jpg
```

## License

MIT License - see LICENSE file for details.

## Contributing

Contributions welcome! Please feel free to submit issues and enhancement requests.
