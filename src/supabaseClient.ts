import { createClient } from '@supabase/supabase-js';

// Substitua com suas credenciais do Supabase
const supabaseUrl = "https://aufsbulwzqtqujtgibli.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1ZnNidWx3enF0cXVqdGdpYmxpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA2ODc1NzYsImV4cCI6MjA1NjI2MzU3Nn0.-qsZeNqWno2M4UkNYoczhCs00FE4pVJT4avJbMJrrCw";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false, // Desabilite isto para o modo desktop
        flowType: 'pkce' // Use PKCE flow
    }
}); 