import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

interface UserCreditsProps {
  userId: string;
}

interface UserCreditsData {
  created_at: string;
  credits: number;
  id: string;
  user_id: string;
}

const UserCredits = ({ userId }: UserCreditsProps) => {
  const [credits, setCredits] = useState<UserCreditsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    console.log("userId", userId)
    // Função para buscar os créditos atuais do usuário
    const fetchCredits = async (userId: string) => {
      try {
        setIsLoading(true);
        

        // Buscar os créditos do usuário
        const { data, error } = await supabase
          .from('credits')
          .select('*')
          .eq('user_id', userId)
          .single();
        
        if (error) {
          console.log("error", error)
            // Verificar se é o erro de "nenhuma linha"
          if (error.code === 'PGRST116') {
            // Retornar um valor padrão para usuários sem créditos
            setCredits({   credits: 0, created_at: '', id: '', user_id: userId });
            return;
          }
          throw error;
        }
        console.log("data", data)
        setCredits(data);
      } catch (error) {
        console.error("Erro ao buscar créditos:", error);
        setError("Não foi possível carregar seus créditos. Tente novamente mais tarde.");
      } finally {
        setIsLoading(false);
      }
    };

    // Busca inicial de créditos
    fetchCredits(userId);

  }, [userId]);

  useEffect(() => {
      // Configurar a subscrição realtime
      const subscription = supabase
      .channel('credits_changes')
      .on(
        'postgres_changes',
        {
          event: '*', // Escuta todos os eventos (insert, update, delete)
          schema: 'public',
          table: 'credits',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          console.log('Mudança em créditos detectada:', payload);
          // Atualiza o estado com os novos créditos
          if (payload.new) {
            setCredits(payload.new as UserCreditsData);
          }
        }
      )
      .subscribe();

      console.log("subscription", subscription)

    // Limpar a subscrição quando o componente for desmontado
    return () => {
      supabase.removeChannel(subscription);
    };
  }, [userId, setCredits])

  if (isLoading) {
    return <div className="user-credits loading">Carregando créditos...</div>;
  }

  if (error) {
    return <div className="user-credits error">{error}</div>;
  }

  return (
    <div className="user-credits">
      <span className="credits-label">Créditos disponíveis:</span>
      <span className="credits-value">{credits?.credits ?? 0}</span>
    </div>
  );
};

export default UserCredits; 