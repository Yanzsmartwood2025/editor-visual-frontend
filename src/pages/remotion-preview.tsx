import Head from 'next/head';

export default function RemotionPreview() {
  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
      <Head>
        <title>Nayla Render Diagnostics</title>
      </Head>
      <div className="w-full max-w-md bg-black rounded-lg overflow-hidden shadow-2xl">
        <div className="p-4 bg-gray-800 text-white font-semibold text-center border-b border-gray-700">
          Nayla Render Diagnostics
        </div>
        <div className="p-6 text-gray-300 text-sm leading-relaxed">
          La composición profesional se empaqueta de forma independiente para el motor de render.
          Esta ruta de desarrollo no carga el compositor completo para mantener aislados los motores
          gráficos avanzados del bundle principal de Next.js.
        </div>
      </div>
    </div>
  );
}
