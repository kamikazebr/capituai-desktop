import { createClient } from '@supabase/supabase-js';

// Substitua com suas credenciais do Supabase
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_KEY;
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false, // Desabilite isto para o modo desktop
        flowType: 'pkce' // Use PKCE flow
    }
});

/**
 * Obtém um token de acesso atualizado.
 * Tenta atualizar a sessão primeiro e, se falhar, tenta obter a sessão atual.
 * @returns O token de acesso atualizado ou null se não houver sessão
 */
export async function getUpdatedToken(): Promise<string | null> {
    try {
        // Tenta atualizar a sessão
        const { data: { session }, error: refreshError } = await supabase.auth.refreshSession();

        if (refreshError) {
            console.error('Erro ao atualizar a sessão:', refreshError);

            // Se falhar ao atualizar, tenta obter a sessão atual
            const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession();

            if (sessionError) {
                console.error('Erro ao obter a sessão:', sessionError);
                return null;
            }

            return currentSession?.access_token || null;
        }

        return session?.access_token || null;
    } catch (error) {
        console.error('Erro ao obter token atualizado:', error);
        return null;
    }
} 