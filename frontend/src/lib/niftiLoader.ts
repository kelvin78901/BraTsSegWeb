import type { VolumeData } from '../types/nifti.d';

export async function loadNifti(url: string): Promise<VolumeData> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch ${url}: ${resp.status}`);
  const buf = await resp.arrayBuffer();

  const n = window.nifti;
  const dec = n.isCompressed(buf) ? n.decompress(buf) : buf;

  if (!n.isNIFTI(dec)) throw new Error('Not a valid NIfTI file');

  const header = n.readHeader(dec);
  const image = n.readImage(header, dec);

  let data: Float32Array;
  switch (header.datatypeCode) {
    case 2:
      data = new Float32Array(new Uint8Array(image));
      break;
    case 4:
      data = new Float32Array(new Int16Array(image));
      break;
    case 8:
      data = new Float32Array(new Int32Array(image));
      break;
    case 16:
      data = new Float32Array(image);
      break;
    case 64:
      data = new Float32Array(new Float64Array(image));
      break;
    default:
      data = new Float32Array(new Uint8Array(image));
  }

  return {
    data,
    dims: [header.dims[1], header.dims[2], header.dims[3]],
  };
}
