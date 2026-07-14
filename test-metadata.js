const { getVideoMetadata, getAudioDurationInSeconds } = require('@remotion/media-utils');

async function test() {
  const url = 'https://supabasekong-kictdox9jtcqpgc0oaxgi6ot.132.145.184.192.sslip.io/storage/v1/object/public/media_bodega/direct_c003d3cc-e646-424c-82db-9138e8c27cc6.wav';
  try {
    const videoData = await getVideoMetadata(url);
    console.log('video metadata:', videoData);
  } catch (e) {
    console.error('video metadata failed:', e.message);
  }

  try {
    const audioDuration = await getAudioDurationInSeconds(url);
    console.log('audio duration:', audioDuration);
  } catch (e) {
    console.error('audio duration failed:', e.message);
  }
}
test();
