import { SupabaseClient } from '@supabase/supabase-js';

export interface RegistrarMemoriaParams {
    url: string;
    tipo: 'video' | 'foto' | 'audio' | 'video_clip';
    nombre: string;
    metadata?: any;
    personaje_id?: string;
    contexto_programa?: string;
    estado?: string;
}

export function detectarPlataforma(url: string): string {
    if (!url) return 'Stock/Genérico';
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) return 'YouTube';
    if (lowerUrl.includes('tiktok.com')) return 'TikTok';
    if (lowerUrl.includes('instagram.com')) return 'Instagram';
    if (lowerUrl.includes('twitter.com') || lowerUrl.includes('x.com')) return 'X/Twitter';
    if (lowerUrl.includes('facebook.com')) return 'Facebook';
    if (lowerUrl.includes('twitch.tv')) return 'Twitch';
    if (lowerUrl.includes('pixabay.com')) return 'Pixabay';
    if (lowerUrl.includes('last.fm') || lowerUrl.includes('audioscrobbler.com')) return 'Last.fm';
    return 'Stock/Genérico';
}

export async function registrarMemoriaUniversal(
    supabase: SupabaseClient,
    params: RegistrarMemoriaParams
) {
    const {
        url,
        tipo,
        nombre,
        metadata = {},
        personaje_id = 'Nayla',
        contexto_programa = 'General',
        estado = 'completado'
    } = params;

    const originalUrlForPlatform = metadata?.originalUrl || url;
    const plataforma = detectarPlataforma(originalUrlForPlatform);

    // 1. Ingest into memoria_nayla (for the gallery)
    const { data: memoriaData, error: memoriaError } = await supabase
        .from('memoria_nayla')
        .insert({
            url: url,
            tipo: tipo,
            nombre: nombre,
            estado: estado,
            metadata: metadata
        })
        .select('id')
        .single();

    if (memoriaError) {
        console.error('[MemoriaUniversal] Error inserting into memoria_nayla:', memoriaError);
        throw memoriaError;
    }

    // 2. Manage identidades_sociales_universales
    // Since we don't have a specific user ID to match on initially if it's just a URL,
    // we might just create a general record for this platform interaction or look up if we know the creator.
    // For now, based on instructions: create or update based on platform and character.

    // We'll try to find an existing identity for this character + platform just to link it,
    // or create a new generic one if we don't have user specifics.
    // In a real scenario, we'd extract the author username from the URL/metadata.
    let id_global = null;

    // Try to find if we already have an identity for this platform (simplified logic)
    const { data: existingIdentity } = await supabase
        .from('identidades_sociales_universales')
        .select('id_global')
        .eq('personaje_id', personaje_id)
        .eq('plataforma', plataforma)
        .limit(1)
        .single();

    if (existingIdentity) {
        id_global = existingIdentity.id_global;
    } else {
        const { data: newIdentity, error: identityError } = await supabase
            .from('identidades_sociales_universales')
            .insert({
                personaje_id: personaje_id,
                plataforma: plataforma,
                plataforma_user_id: 'unknown', // Will update later when we extract author info
                alias: `Fuente: ${plataforma}`,
                metadata: { source_url: originalUrlForPlatform }
            })
            .select('id_global')
            .single();

        if (!identityError && newIdentity) {
            id_global = newIdentity.id_global;
        } else {
            console.error('[MemoriaUniversal] Error creating identity:', identityError);
        }
    }

    // 3. Insert into historial_interacciones_ia
    const mensajeContexto = `Procesando medio: ${nombre} (${tipo}) desde ${originalUrlForPlatform}`;

    const { error: historialError } = await supabase
        .from('historial_interacciones_ia')
        .insert({
            id_global_usuario: id_global,
            mensaje_usuario: mensajeContexto,
            respuesta_ia: `Medio ingresado a la bodega correctamente (ID: ${memoriaData?.id}).`,
            plataforma_origen: plataforma,
            contexto_programa: contexto_programa
        });

    if (historialError) {
        console.error('[MemoriaUniversal] Error inserting into historial_interacciones_ia:', historialError);
    }

    return {
        memoriaId: memoriaData?.id,
        id_global: id_global,
        plataforma: plataforma
    };
}
