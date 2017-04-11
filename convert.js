function clamp(x, min, max) {
  return Math.min(max, Math.max(x, min));
}

function mod(x, n) {
  return ((x % n) + n) % n;
}

function copyPixelNearest(read, write, grid) {
  const width = read.width;
  const readIndex = (x, y) => 4 * (y * width + x);
  return (xFrom, yFrom, to) => {

    const nearest = readIndex(
      clamp(Math.round(xFrom), 0, read.width - 1),
      clamp(Math.round(yFrom), 0, read.height - 1)
    );

    for (let c = 0; c < 3; c++) {
      write.data[to + c] = read.data[nearest + c];
    }
  };
}

function copyPixelBilinear(read, write) {
  const width = read.width;
  const readIndex = (x, y) => 4 * (y * width + x);
  return (xFrom, yFrom, to) => {
    const xl = clamp(Math.floor(xFrom), 0, read.width - 1);
    const xr = clamp(Math.ceil(xFrom), 0, read.width - 1);
    const xf = xFrom - xl;

    const yl = clamp(Math.floor(yFrom), 0, read.height - 1);
    const yr = clamp(Math.ceil(yFrom), 0, read.height - 1);
    const yf = yFrom - yl;

    const p00 = readIndex(xl, yl);
    const p10 = readIndex(xr ,yl);
    const p01 = readIndex(xl, yr);
    const p11 = readIndex(xr, yr);

    for (let c = 0; c < 3; c++) {
      const p0 = read.data[p00 + c] * (1 - xf) + read.data[p10 + c] * xf;
      const p1 = read.data[p01 + c] * (1 - xf) + read.data[p11 + c] * xf;
      write.data[to + c] = Math.ceil(p0 * (1 - yf) + p1 * yf);
    }
  };
}

function kernelResample(read, write, a, kernel) {
  const a2 = 2*a;

  const width = read.width;
  const readIndex = (x, y) => 4 * (y * width + x);

  const xMax = read.width - 1;
  const yMax = read.height - 1;
  const xKernel = new Array(4);
  const yKernel = new Array(4);

  return (xFrom, yFrom, to) => {
    const xl = Math.floor(xFrom);
    const yl = Math.floor(yFrom);
    const xStart = xl - a + 1;
    const yStart = yl - a + 1;

    for (let i = 0; i < a2; i++) {
      xKernel[i] = kernel(xFrom - (xStart + i));
      yKernel[i] = kernel(yFrom - (yStart + i));
    }

    for (let c = 0; c < 3; c++) {
      let q = 0;
      for (let i = 0; i < a2; i++) {
        const y = yStart + i;
        const yClamped = clamp(y, 0, yMax);
        let p = 0;
        for (let j = 0; j < a2; j++) {
          const x = xStart + j;
          const index = readIndex(clamp(x, 0, xMax), yClamped);
          p += read.data[index + c] * xKernel[j];

        }
        q += p * yKernel[i];
      }
      write.data[to + c] = Math.round(q);
    }
  };
}

function copyPixelBicubic(read, write) {
  const b = -0.5;
  const kernel = x => {
    x = Math.abs(x);
    x2 = x*x;
    x3 = x*x*x;
    return x <= 1 ?
      (b + 2)*x3 - (b + 3)*x2 + 1 :
      b*x3 - 5*b*x2 + 8*b*x - 4*b;
  };

  return kernelResample(read, write, 2, kernel);
}

function copyPixelLanczos(read, write, grid) {
  const kernel = x => {
    if (x === 0) {
      return 1;
    }
    else {
      const xp = Math.PI * x;
      return 3 * Math.sin(xp) * Math.sin(xp / 3) / (xp * xp);
    }
  };
  return kernelResample(read, write, 3, kernel);
}

const orientations = {
  pz: (out, x, y) => {
    out.x = -1;
    out.y = -x;
    out.z = -y;
  },
  nz: (out, x, y) => {
    out.x = 1;
    out.y = x;
    out.z = -y;
  },
  px: (out, x, y) => {
    out.x = x;
    out.y = -1;
    out.z = -y;
  },
  nx: (out, x, y) => {
    out.x = -x;
    out.y = 1;
    out.z = -y;
  },
  py: (out, x, y) => {
    out.x = -y;
    out.y = -x;
    out.z = 1;
  },
  ny: (out, x, y) => {
    out.x = y;
    out.y = -x;
    out.z = -1;
  }
};

function renderFace({data: readData, face, rotation, interpolation, maxWidth = Infinity}) {

  const faceWidth = Math.min(maxWidth, readData.width / 4);
  const faceHeight = faceWidth;

  // const scale = 160;
  // const faceWidth = scale * readData.width;
  // const faceHeight = scale * readData.height;

  const cube = {};
  const orientation = orientations[face];

  const writeData = new ImageData(faceWidth, faceHeight);

  const c =
    interpolation === 'linear' ? copyPixelBilinear(readData, writeData) :
    interpolation === 'cubic' ? copyPixelBicubic(readData, writeData) :
    interpolation === 'lanczos' ? copyPixelLanczos(readData, writeData) :
    copyPixelNearest(readData, writeData);

  for (let x = 0; x < faceWidth; x++) {
    for (let y = 0; y < faceHeight; y++) {
      const to = 4*(y * faceWidth + x);
      writeData.data[to + 3] = 255;
      orientation(cube, (2 * (x + 0.5) / faceWidth - 1), (2 * (y + 0.5) / faceHeight - 1));
      const r = Math.sqrt(cube.x*cube.x + cube.y*cube.y + cube.z*cube.z);
      const lon = mod(Math.atan2(cube.y, cube.x) + rotation, 2 * Math.PI);
      const lat = Math.acos(cube.z / r);
      c(readData.width * lon / Math.PI / 2 - 0.5, readData.height * lat / Math.PI - 0.5, to);
      // c(readData.width * (x + 0.5) / faceWidth - 0.5, readData.height * (y + 0.5) / faceHeight - 0.5, to);
    }
  }

  postMessage({
    faceData: writeData
  });
}

onmessage = function(e) {
  renderFace(e.data);
};