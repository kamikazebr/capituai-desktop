import { onUrl, start } from "@fabianlars/tauri-plugin-oauth";
// import { openUrl as openBrowser } from "@tauri-apps/plugin-opener";
import { open as openBrowser } from "@tauri-apps/plugin-shell";
import { useEffect, useState } from "react";
import { supabase } from '../supabaseClient';


interface SupabaseAuthProps {
  onLogin: (session: any) => void;
  authError?: {type: string; code: string; description: string} | null;
}

const SupabaseAuth: React.FC<SupabaseAuthProps> = ({ onLogin, authError }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [port, setPort] = useState<number | null>(null);
  const [user, setUser] = useState<any>(null);
  
  // Estados para login com email/senha
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showRegister, setShowRegister] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  
  // Novo estado para controlar a exibição do formulário de recuperação de senha
  const [showPasswordReset, setShowPasswordReset] = useState(false);

  useEffect(() => {
    const startOAuthServer = async () => {


      const newPort = await start();
      console.log("newPort", newPort);
      setPort(newPort);

       // Configure o listener para a URL de callback
       await onUrl(async (url: string) => {
        console.log("URL de callback completa:", url);
        console.log("URL hash:", new URL(url).hash);
        console.log("URL search params:", new URL(url).search);
        
        try {
          // Verificar se temos hash com tokens (OAuth implícito) ou código de autorização
          const urlObj = new URL(url);
          const hash = urlObj.hash.substring(1); // Remove o # do início
          
          if (hash && hash.includes('access_token=')) {
            // Temos um fluxo implícito com tokens na URL
            const params = new URLSearchParams(hash);
            const accessToken = params.get('access_token');
            const refreshToken = params.get('refresh_token');
            
            if (accessToken && refreshToken) {
              // Crie uma sessão com os tokens recebidos
              const { data, error } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken
              });
              
              if (error) {
                throw error;
              }
              
              console.log("Autenticado com sucesso:", data);
              setUser(data.user);
              onLogin(data.session);
            }
          } else {
            // Fluxo de código de autorização
            const code = urlObj.searchParams.get("code");
            
            if (code) {
              // Troque o código de autorização por uma sessão
              const { data, error } = await supabase.auth.exchangeCodeForSession(code);
              
              if (error) {
                console.error("Erro ao trocar código de autorização por sessão:", error);
                throw error;
              }
              
              console.log("Autenticado com sucesso:", data);
              setUser(data.session?.user);
              onLogin(data.session);
            }
          }
        } catch (error) {
          console.error("Erro ao processar callback OAuth:", error);
        } finally {
          // Encerre o servidor OAuth
          // if (newPort) {
          //   await cancel(newPort);
          //   setPort(null);
          // }
          setIsLoading(false);
        }
      });
    }
    startOAuthServer();

    return () => {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
   
     
    // Verifique se já existe uma sessão
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      console.log("checkSession data", data);
      if (data?.session) {
        setUser(data.session.user);
        onLogin(data.session);
      }
    };
    
    checkSession();

    // Configure o listener para mudanças de estado de autenticação
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log("onAuthStateChange event", event);
        console.log("onAuthStateChange session", session);
        if (session) {
          setUser(session.user);
          onLogin(session);
        } else {
          setUser(null);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
      // Certifique-se de cancelar o servidor OAuth se estiver ativo
      // if (port) {
      //   cancel(port).catch(console.error);
      // }
    };
  }, [onLogin, port]);

  useEffect(() => {
    // Ouvir o evento de logout
    const handleLogoutEvent = async () => {
      console.log("handleLogoutEvent");
      try {
        // Fazer logout no Supabase
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        
        console.log("Logout do Supabase realizado com sucesso");
        
        // Limpar qualquer armazenamento local relacionado à autenticação
        localStorage.removeItem('supabase.auth.token');
        // Adicione outros itens que precisam ser removidos do localStorage
        
      } catch (err) {
        console.error("Erro ao fazer logout do Supabase:", err);
      }
    };

    // Adicionar o listener de evento
    window.addEventListener('supabase-logout', handleLogoutEvent);

    // Remover o listener ao desmontar o componente
    return () => {
      window.removeEventListener('supabase-logout', handleLogoutEvent);
    };
  }, []);

  // Função para gerar e armazenar o code_verifier

  const handleOAuthLogin = async (provider: "github" | "google") => {
    try {
      setIsLoading(true);
      
      // URL de redirecionamento que aponta para nosso servidor local
      // URL de redirecionamento que aponta para nosso servidor local
      const redirectTo = `http://localhost:${port}?oauth=true`;
      
      // Inicie o fluxo OAuth com o Supabase
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });
      
      if (error) {
        console.error("Erro ao iniciar fluxo OAuth:", error);
        throw error;
      }
      
      // Abra o URL no navegador padrão para o fluxo de autenticação
      if (data?.url) {
        console.log("data.url", data.url);
        openBrowser(data.url);
      }
    } catch (error) {
      console.error("Erro ao iniciar fluxo OAuth:", error);
      setIsLoading(false);
      
      // Certifique-se de limpar o servidor OAuth em caso de erro
      // if (port) {
      //   await cancel(port);
      //   setPort(null);
      // }
    }
  };

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setUser(null);
    } catch (error) {
      console.error("Erro ao fazer logout:", error);
    }
  };

  // Função para lidar com o login com email/senha
  const handleEmailPasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    console.log("handleEmailPasswordLogin");
    if (!email || !password) {
      setErrorMessage("Email e senha são obrigatórios.");
      return;
    }
    
    try {
      setIsLoading(true);
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      
      if (error) {
        throw error;
      }
      
      if (data.session) {
        setUser(data.session.user);
        onLogin(data.session);
      }
    } catch (error: any) {
      console.error("Erro no login:", error);
      setErrorMessage(error.message || "Erro ao fazer login. Verifique suas credenciais.");
    } finally {
      setIsLoading(false);
    }
  };

  // Função para registrar novo usuário com email/senha
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    
    if (!email || !password) {
      setErrorMessage("Email e senha são obrigatórios.");
      return;
    }
    
    try {
      setIsLoading(true);
      
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}`,
          data: {
            email_confirmed: true
          }
        }
      });
      
      if (error) {
        throw error;
      }
      
      if (data.session) {
        setUser(data.session.user);
        onLogin(data.session);
      } else if (data.user) {
        setErrorMessage("Um email de confirmação foi enviado para o seu endereço.");
      }
    } catch (error: any) {
      console.error("Erro no registro:", error);
      setErrorMessage(error.message || "Erro ao criar conta. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  const resendConfirmationEmail = async () => {
    try {
      setIsLoading(true);
      setErrorMessage("");
      
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email
      });
      
      if (error) throw error;
      
      setErrorMessage("Email de confirmação reenviado com sucesso!");
    } catch (error: any) {
      console.error("Erro ao reenviar email:", error);
      setErrorMessage(error.message || "Erro ao reenviar o email de confirmação.");
    } finally {
      setIsLoading(false);
    }
  };

  // Função para solicitar redefinição de senha
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    
    if (!email) {
      setErrorMessage("Digite seu email para receber o link de recuperação.");
      return;
    }
    
    try {
      setIsLoading(true);
      
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `capituai://${window.location.origin}`,
      });
      
      if (error) throw error;
      
      setErrorMessage("Email de recuperação enviado! Verifique sua caixa de entrada.");
    } catch (error: any) {
      console.error("Erro ao solicitar redefinição de senha:", error);
      setErrorMessage(error.message || "Erro ao enviar email de recuperação. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-container">
      {user ? (
        <div className="user-info">
          <p>Conectado como: {user.email}</p>
          <button onClick={handleLogout} disabled={isLoading}>
            Sair
          </button>
        </div>
      ) : (
        <div className="login-options">
          <h2>Faça login para continuar</h2>
          
          {showPasswordReset ? (
            // Formulário de recuperação de senha
            <form onSubmit={handleResetPassword} className="email-form">
              <div className="form-group">
                <label htmlFor="reset-email">Email:</label>
                <input
                  type="email"
                  id="reset-email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  required
                />
              </div>
              
              {errorMessage && <p className="error-message">{errorMessage}</p>}
              
              <button 
                type="submit" 
                disabled={isLoading}
                className="auth-button email"
              >
                {isLoading ? "Enviando..." : "Enviar link de recuperação"}
              </button>
              
              <p className="toggle-auth-mode">
                <button 
                  type="button" 
                  onClick={() => setShowPasswordReset(false)}
                  className="text-button"
                >
                  Voltar ao login
                </button>
              </p>
            </form>
          ) : (
            // Formulário de login/registro com email e senha
            <form onSubmit={showRegister ? handleRegister : handleEmailPasswordLogin} className="email-form">
              <div className="form-group">
                <label htmlFor="email">Email:</label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  required
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="password">Senha:</label>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  required
                />
              </div>
              
              {errorMessage && <p className="error-message">{errorMessage}</p>}
              
              <button 
                type="submit" 
                disabled={isLoading}
                className="auth-button email"
              >
                {isLoading ? "Carregando..." : (showRegister ? "Registrar" : "Entrar")}
              </button>
              
              <div className="auth-links">
                <p className="toggle-auth-mode">
                  {showRegister ? "Já tem uma conta? " : "Não tem uma conta? "}
                  <button 
                    type="button" 
                    onClick={() => setShowRegister(!showRegister)}
                    className="text-button"
                  >
                    {showRegister ? "Faça login" : "Registre-se"}
                  </button>
                </p>
                
                {/* Adicionando o botão de esqueci a senha */}
                {!showRegister && (
                  <button 
                    type="button" 
                    onClick={() => setShowPasswordReset(true)}
                    className="forgot-password-btn"
                  >
                    Esqueci minha senha
                  </button>
                )}
              </div>
            </form>
          )}
          
          {!showPasswordReset && (
            <>
              <div className="divider">ou</div>
              
              {/* Botões OAuth existentes */}
              <button
                onClick={() => handleOAuthLogin("github")}
                disabled={isLoading}
                className="auth-button github"
              >
                {isLoading ? "Carregando..." : "Entrar com GitHub"}
              </button>
              <button
                onClick={() => handleOAuthLogin("google")}
                disabled={isLoading}
                className="auth-button google"
              >
                {isLoading ? "Carregando..." : "Entrar com Google"}
              </button>
              
              <button 
                type="button"
                onClick={resendConfirmationEmail}
                disabled={isLoading}
                className="resend-button"
              >
                Reenviar email de confirmação
              </button>
            </>
          )}
        </div>
      )}
      
      {/* Exibir mensagem de erro se houver */}
      {authError && (
        <div className="auth-error">
          <p>{authError.description}</p>
        </div>
      )}
    </div>
  );
};

export default SupabaseAuth; 