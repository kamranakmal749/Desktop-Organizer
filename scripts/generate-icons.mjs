// Generate minimal valid PNG icons for Tauri
// Pure Node.js - no external dependencies

import { writeFileSync } from 'fs';
import { deflateSync } from 'zlib';

function createPNG(size) {
  // Create a simple colored square PNG
  const width = size;
  const height = size;
  
  // Raw pixel data: each row starts with filter byte 0x00 (None)
  // Then RGB bytes (3 bytes per pixel)
  const rawData = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + width * 3);
    rawData[rowOffset] = 0; // filter: None
    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 3;
      // Create a gradient blue/purple icon
      const r = Math.min(255, Math.floor(100 + (x / width) * 80));
      const g = Math.min(255, Math.floor(80 + (y / height) * 60));
      const b = Math.min(255, Math.floor(200 + ((x + y) / (width + height)) * 55));
      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
    }
  }
  
  // Compress with zlib
  const compressed = deflateSync(rawData);
  
  // Build PNG file
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  
  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);   // bit depth
  ihdr.writeUInt8(2, 9);   // color type: RGB
  ihdr.writeUInt8(0, 10);  // compression
  ihdr.writeUInt8(0, 11);  // filter
  ihdr.writeUInt8(0, 12);  // interlace
  
  // IDAT chunk
  const idat = compressed;
  
  // IEND chunk
  const iend = Buffer.alloc(0);
  
  function crc32(buf) {
    let crc = 0xFFFFFFFF;
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[i] = c;
    }
    for (let i = 0; i < buf.length; i++) {
      crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  
  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeB = Buffer.from(type, 'ascii');
    const crcInput = Buffer.concat([typeB, data]);
    const crcVal = crc32(crcInput);
    const crcB = Buffer.alloc(4);
    crcB.writeUInt32BE(crcVal);
    return Buffer.concat([len, typeB, data, crcB]);
  }
  
  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idat),
    makeChunk('IEND', iend)
  ]);
}

// Generate icons
const sizes = [
  { name: '32x32.png', size: 32 },
  { name: '128x128.png', size: 128 },
  { name: '128x128@2x.png', size: 256 },
];

for (const { name, size } of sizes) {
  const png = createPNG(size);
  writeFileSync(`src-tauri/icons/${name}`, png);
  console.log(`Created ${name} (${size}x${size})`);
}

// Create ICO file (wrap the 32x32 PNG)
const png32 = createPNG(32);
const icoHeader = Buffer.alloc(6);
icoHeader.writeUInt16LE(0, 0);     // reserved
icoHeader.writeUInt16LE(1, 2);     // ICO type
icoHeader.writeUInt16LE(1, 4);     // 1 image

const icoEntry = Buffer.alloc(16);
icoEntry.writeUInt8(32, 0);        // width
icoEntry.writeUInt8(32, 1);        // height
icoEntry.writeUInt8(0, 2);         // colors
icoEntry.writeUInt8(0, 3);         // reserved
icoEntry.writeUInt16LE(1, 4);      // planes
icoEntry.writeUInt16LE(32, 6);     // bpp
icoEntry.writeUInt32LE(png32.length, 8);   // image size
icoEntry.writeUInt32LE(22, 12);    // offset (6 + 16)

writeFileSync('src-tauri/icons/icon.ico', Buffer.concat([icoHeader, icoEntry, png32]));
console.log('Created icon.ico');

// Create ICNS (just use the 128x128 PNG as placeholder)
const png128 = createPNG(128);
writeFileSync('src-tauri/icons/icon.icns', png128);
console.log('Created icon.icns');

console.log('All icons generated successfully!');
