const lineaDeTiempo = [];
const item = { id: '1', tipo: 'video', nombre: 'Test', etiqueta: 'V1', url: 'blob:...' };
const nuevo = { id: Date.now().toString(), mediaId: item.id, tipo: item.tipo, nombre: item.nombre, etiqueta: item.etiqueta, url: item.url };
lineaDeTiempo.push(nuevo);
const pistaVideo = lineaDeTiempo.filter(t => t.tipo === 'video' || t.tipo === 'foto');
console.log(pistaVideo);
