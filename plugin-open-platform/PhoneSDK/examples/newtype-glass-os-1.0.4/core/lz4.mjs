// Pure JS LZ4 compressor & Base64 encoder for MemoMind 4-bit GRAY_4 frames
export function compressLz4(input) {
  const output = [];
  const dictionary = new Int32Array(65536);
  dictionary.fill(-1);
  let anchor = 0;
  let position = 0;

  const hash = (p) => {
    const val = (input[p] | (input[p + 1] << 8) | (input[p + 2] << 16) | (input[p + 3] << 24)) >>> 0;
    return ((val * 2654435761) >>> 16) & 0xffff;
  };

  while (position + 4 < input.length) {
    const h = hash(position);
    const ref = dictionary[h];
    dictionary[h] = position;

    if (ref >= 0 && position - ref < 65536 &&
        input[ref] === input[position] &&
        input[ref + 1] === input[position + 1] &&
        input[ref + 2] === input[position + 2] &&
        input[ref + 3] === input[position + 3]) {

      // Match found
      let matchLen = 4;
      while (position + matchLen < input.length && input[ref + matchLen] === input[position + matchLen]) {
        matchLen++;
      }

      const litLen = position - anchor;
      const offset = position - ref;
      let token = (Math.min(litLen, 15) << 4) | Math.min(matchLen - 4, 15);
      output.push(token);

      if (litLen >= 15) {
        let remaining = litLen - 15;
        while (remaining >= 255) {
          output.push(255);
          remaining -= 255;
        }
        output.push(remaining);
      }

      for (let i = 0; i < litLen; i++) {
        output.push(input[anchor + i]);
      }

      output.push(offset & 0xff);
      output.push((offset >> 8) & 0xff);

      if (matchLen - 4 >= 15) {
        let remaining = (matchLen - 4) - 15;
        while (remaining >= 255) {
          output.push(255);
          remaining -= 255;
        }
        output.push(remaining);
      }

      position += matchLen;
      anchor = position;
    } else {
      position++;
    }
  }

  // Trailing literals
  const litLen = input.length - anchor;
  let token = Math.min(litLen, 15) << 4;
  output.push(token);

  if (litLen >= 15) {
    let remaining = litLen - 15;
    while (remaining >= 255) {
      output.push(255);
      remaining -= 255;
    }
    output.push(remaining);
  }

  for (let i = 0; i < litLen; i++) {
    output.push(input[anchor + i]);
  }

  return new Uint8Array(output);
}

export function toBase64(bytes) {
  let binary = '';
  const chunkSize = 16384;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

