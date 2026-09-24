// Skia browser builds do not use Node fs or React Native numeric asset IDs.
export function getAssetByID() { throw new Error('Use a URL for Skia browser assets.'); }
