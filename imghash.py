import sys
import png
import struct
import hashlib
from zlib import crc32

def create_chunk(chunk_type, data):
    """Create a PNG chunk with given type and data."""
    length = len(data)
    chunk = struct.pack('>I', length) + chunk_type + data
    crc = struct.pack('>I', crc32(chunk_type + data))
    return chunk

def find_matching_data(target_hex, original_chunks, max_attempts=10000000):
    """Find data that results in desired hash prefix."""
    for i in range(max_attempts):
        # Create a test comment with counter
        test_data = f"Hash attempt {i}".encode('utf-8')
        comment_chunk = create_chunk(b'tEXt', test_data)
        
        # Reconstruct file content
        test_content = PNG_SIGNATURE
        for chunk in original_chunks:
            test_content += chunk
        test_content += comment_chunk
        test_content += create_chunk(b'IEND', b'')
        
        # Check hash
        file_hash = hashlib.sha256(test_content).hexdigest()
        if file_hash.startswith(target_hex[2:]):  # Remove '0x' prefix
            return comment_chunk
    
    raise Exception("Could not find matching hash after maximum attempts")

PNG_SIGNATURE = b'\x89PNG\r\n\x1a\n'

def spoof_image(target_hex, input_path, output_path):
    # Read original PNG file
    with open(input_path, 'rb') as f:
        content = f.read()
    
    # Verify PNG signature
    if content[:8] != PNG_SIGNATURE:
        raise ValueError("Not a valid PNG file")
    
    # Parse chunks
    pos = 8
    chunks = []
    while pos < len(content):
        length = struct.unpack('>I', content[pos:pos+4])[0]
        chunk_type = content[pos+4:pos+8]
        chunk_data = content[pos+8:pos+8+length]
        crc = content[pos+8+length:pos+8+length+4]
        
        # Skip IEND chunk as we'll add it later
        if chunk_type != b'IEND':
            chunks.append(content[pos:pos+8+length+4])
        
        pos += 8 + length + 4
    
    # Find matching comment data
    comment_chunk = find_matching_data(target_hex, chunks)
    
    # Write new file
    with open(output_path, 'wb') as f:
        f.write(PNG_SIGNATURE)
        for chunk in chunks:
            f.write(chunk)
        f.write(comment_chunk)
        f.write(create_chunk(b'IEND', b''))

def main():
    if len(sys.argv) != 4:
        print("Usage: python spoof.py <target_hex> <input_image> <output_image>")
        sys.exit(1)
    
    target_hex = sys.argv[1]
    input_image = sys.argv[2]
    output_image = sys.argv[3]
    
    if not target_hex.startswith('0x'):
        print("Target hex must start with '0x'")
        sys.exit(1)
    
    try:
        spoof_image(target_hex, input_image, output_image)
        print(f"Successfully created image with hash prefix {target_hex}")
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()