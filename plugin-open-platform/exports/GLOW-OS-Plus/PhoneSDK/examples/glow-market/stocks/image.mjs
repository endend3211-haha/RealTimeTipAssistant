export function toBase64(bytes) {
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 16384) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
    }
    return btoa(binary);
  }

export function compressLz4(input) {
    const output = [];
    const dictionary = new Int32Array(65536);
    dictionary.fill(-1);
    let anchor = 0;
    let position = 0;
    const hash = (offset) => {
      const value = (
        input[offset]
        | input[offset + 1] << 8
        | input[offset + 2] << 16
        | input[offset + 3] << 24
      ) >>> 0;
      return (Math.imul(value, 2654435761) >>> 16) & 65535;
    };
    const writeLength = (length) => {
      while (length >= 255) {
        output.push(255);
        length -= 255;
      }
      output.push(length);
    };

    while (position + 12 <= input.length) {
      const slot = hash(position);
      const match = dictionary[slot];
      dictionary[slot] = position;
      if (
        match < 0
        || position - match > 65535
        || input[match] !== input[position]
        || input[match + 1] !== input[position + 1]
        || input[match + 2] !== input[position + 2]
        || input[match + 3] !== input[position + 3]
      ) {
        position += 1;
        continue;
      }
      let matchLength = 4;
      while (
        position + matchLength < input.length - 5
        && input[match + matchLength] === input[position + matchLength]
      ) {
        matchLength += 1;
      }
      const literalLength = position - anchor;
      const encodedMatchLength = matchLength - 4;
      output.push(
        Math.min(literalLength, 15) << 4
        | Math.min(encodedMatchLength, 15),
      );
      if (literalLength >= 15) writeLength(literalLength - 15);
      output.push(...input.subarray(anchor, position));
      const distance = position - match;
      output.push(distance & 255, distance >>> 8);
      if (encodedMatchLength >= 15) writeLength(encodedMatchLength - 15);
      position += matchLength;
      anchor = position;
    }
    const remaining = input.length - anchor;
    output.push(Math.min(remaining, 15) << 4);
    if (remaining >= 15) writeLength(remaining - 15);
    output.push(...input.subarray(anchor));
    return Uint8Array.from(output);
  }

