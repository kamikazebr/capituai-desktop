import { onUrl, start } from "@fabianlars/tauri-plugin-oauth";
// import { openUrl as openBrowser } from "@tauri-apps/plugin-opener";
import { open as openBrowser } from "@tauri-apps/plugin-shell";
import { useEffect, useState } from "react";
import { supabase } from '../supabaseClient';


interface SupabaseAuthProps {
  onLogin: (session: any) => void;
  authError?: {type: string; code: string; description: string} | null;
}

// Componentes SVG melhorados e otimizados
const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

const GithubIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0012 2z" fill="white"/>
  </svg>
);

const EmailIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" fill="white"/>
  </svg>
);

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
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);

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

              console.log("data.session", data);
              if (error) {
                console.error("Erro ao trocar código de autorização por sessão:", error);
                console.log("error", error.message);
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

  // Função para enviar magic link
  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    
    if (!email) {
      setErrorMessage("Digite seu email para receber o link de acesso.");
      return;
    }
    
    try {
      setIsLoading(true);
      
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `capituai://${window.location.origin}`,
        }
      });
      
      if (error) throw error;
      
      setMagicLinkSent(true);
      setErrorMessage("Link de acesso enviado! Verifique seu email.");
    } catch (error: any) {
      console.error("Erro ao enviar magic link:", error);
      setErrorMessage(error.message || "Erro ao enviar link de acesso. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-container">
        {user ? (
          <div className="user-info">
            <p>Conectado como: {user.email}</p>
            <button onClick={handleLogout} disabled={isLoading} className="logout-button">
              Sair
            </button>
          </div>
        ) : (
          <div className="login-options">
            <h2>Log In</h2>

            {!showEmailForm ? (
              <>
                {/* Botão Google - sem Last used */}
                <button
                  onClick={() => handleOAuthLogin("google")}
                  disabled={isLoading}
                  className="auth-button google-button"
                >
                  <div className="button-content">
                    <GoogleIcon />
                    <span className="button-text">Continue with Google</span>
                  </div>
                </button>
                
                {/* Botão Github */}
                <button
                  onClick={() => handleOAuthLogin("github")}
                  disabled={isLoading}
                  className="auth-button github-button"
                >
                  <div className="button-content">
                    <GithubIcon />
                    <span className="button-text">Continue with Github</span>
                  </div>
                </button>

                <div className="divider">
                  <span>OR</span>
                </div>
                
                {/* Botão Email */}
                <button 
                  onClick={() => setShowEmailForm(true)}
                  disabled={isLoading}
                  className="auth-button email-button"
                >
                  <div className="button-content">
                    <EmailIcon />
                    <span className="button-text">Log in with email</span>
                  </div>
                </button>
              </>
            ) : (
              <div className="email-form-container">
                <button 
                  onClick={() => {
                    setShowEmailForm(false);
                    setMagicLinkSent(false);
                    setErrorMessage("");
                  }} 
                  className="back-button"
                >
                  ← Voltar
                </button>
                
                <form onSubmit={handleMagicLink} className="email-form">
                  <div className="form-group">
                    <label htmlFor="email">Email</label>
                    <input
                      type="email"
                      id="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={isLoading || magicLinkSent}
                      placeholder="seu@email.com"
                      required
                      autoFocus
                    />
                  </div>
                  
                  {errorMessage && (
                    <div className="message error-message">
                      {errorMessage}
                    </div>
                  )}
                  
                  {magicLinkSent ? (
                    <div className="message success-message">
                      Link de acesso enviado! Verifique seu email.
                    </div>
                  ) : (
                    <button 
                      type="submit" 
                      disabled={isLoading}
                      className="auth-button email-submit"
                    >
                      {isLoading ? "Enviando..." : "Enviar link de acesso"}
                    </button>
                  )}
                </form>
              </div>
            )}

            <div className="auth-footer">
              <p className="terms">
                Ao continuar, você concorda com nossos{" "}
                <a href="/terms">Termos de Serviço</a> e{" "}
                <a href="/privacy">Política de Privacidade</a>.
              </p>
              <p className="security-info">
                A segurança dos dados é importante para nós. Para saber mais sobre nossas políticas e
                certificações, visite <a href="/trust">trust.capituai.com</a> para mais informações.
              </p>
            </div>
          </div>
        )}
        
        {authError && (
          <div className="auth-error">
            <p>{authError.description}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SupabaseAuth; 