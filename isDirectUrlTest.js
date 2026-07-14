const isDirectUrl = (testUrl) => {
    try {
      const parsed = new URL(testUrl);
      const pathname = parsed.pathname.toLowerCase();
      return pathname.endsWith('.mp4') || pathname.endsWith('.webm') || pathname.endsWith('.mov') || pathname.endsWith('.mp3') || pathname.endsWith('.wav');
    } catch {
      return false;
    }
};

const getMediaType = (testUrl) => {
    try {
      const parsed = new URL(testUrl);
      const pathname = parsed.pathname.toLowerCase();
      if (pathname.endsWith('.mp4') || pathname.endsWith('.webm') || pathname.endsWith('.mov')) return 'video';
      if (pathname.endsWith('.mp3') || pathname.endsWith('.wav')) return 'audio';
      if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg') || pathname.endsWith('.png') || pathname.endsWith('.webp')) return 'foto';
      return 'video'; // default
    } catch {
      return 'video';
    }
};

console.log(isDirectUrl('https://supabasekong-kictdox9jtcqpgc0oaxgi6ot.132.145.184.192.sslip.io/storage/v1/object/public/media_bodega/direct_c003d3cc-e646-424c-82db-9138e8c27cc6.wav'));
console.log(getMediaType('https://supabasekong-kictdox9jtcqpgc0oaxgi6ot.132.145.184.192.sslip.io/storage/v1/object/public/media_bodega/direct_c003d3cc-e646-424c-82db-9138e8c27cc6.wav'));
