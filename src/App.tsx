import { useEffect, useState } from "react";
import "./App.css";
import { ProcessProgress } from "./components/ProcessProgress";
import { ServiceStatus } from "./components/ServiceStatus";
import SupabaseAuth from "./components/SupabaseAuth";
import { TranscriptionDisplay } from "./components/TranscriptionDisplay";
import { UpdateChecker } from "./components/UpdateChecker";
import UserCredits from "./components/UserCredits";
import { YoutubeInput } from "./components/YoutubeInput";
import "./styles/components.css";

import { getVersion } from "@tauri-apps/api/app";
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getCurrent as getCurrentDeepLink, onOpenUrl } from '@tauri-apps/plugin-deep-link';


import { supabase } from './supabaseClient'; // Ajuste o caminho conforme necessário

// Função para processar URLs de deep link
function processDeepLink(url: string) {
  console.log('Processando deep link:', url);
  
  // Se for uma URL de redirecionamento OAuth
  if (url.includes('code=') || url.includes('access_token=')) {
    // Lógica para processar o retorno do OAuth
    console.log('URL de redirecionamento OAuth detectada');
    
    // Aqui você pode extrair tokens, autenticar o usuário, etc.
    // Por exemplo:
    const params = new URLSearchParams(url.split('?')[1]);
    const code = params.get('code');
    if (code) {
      console.log('Código de autorização:', code);
      // Implementar lógica de troca de código por token
    }
  }
}

function App() {
  const [audioPath, setAudioPath] = useState("");
  const [transcriptionResult, setTranscriptionResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [timeLapse, setTimeLapse] = useState("");
  
  // Estados para o progresso do processo
  const [currentStep, setCurrentStep] = useState("");
  const [stepProgress, setStepProgress] = useState(0);
  
  // Novo estado para gerenciar erros de processamento
  const [processError, setProcessError] = useState<{ step: string; message: string } | null>(null);
  
  // Novo estado para gerenciar a autenticação do usuário
  const [userSession, setUserSession] = useState<any>(null);

  // Estado para o menu lateral
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    console.log("Iniciando fluxo OAuth");

    // Verificar se o aplicativo foi aberto com um deep link
    getCurrentDeepLink()
      .then((deepLink) => {
        if (deepLink) {
          console.log('Aplicativo iniciado com deep link:', deepLink);
          if (Array.isArray(deepLink) && deepLink.length > 0) {
            processDeepLink(deepLink[0]);
          } else if (typeof deepLink === 'string') {
            processDeepLink(deepLink);
          }
        }
      })
      .catch((err) => {
        console.error('Erro ao verificar deep link inicial:', err);
      });

      // Listener para deep links recebidos pelo plugin deep-link
    const unlistenOpenUrl = onOpenUrl((urls) => {
      console.log('Deep link do plugin deep-link:', urls);
      if (Array.isArray(urls) && urls.length > 0) {
        processDeepLink(urls[0]);
      } else if (typeof urls === 'string') {
        processDeepLink(urls);
      }
    });


    // Configurar listener para eventos de deep link do backend
    const unlisten = listen('deep_link_received', (event) => {
      console.log('Deep link recebido do backend:', event.payload);
      if (typeof event.payload === 'string') {
        processDeepLink(event.payload);
      }
    });

    return () => {
      console.log("Parando fluxo OAuth");
      // Remover o listener quando o componente for desmontado
      unlisten.then(unlistenFn => unlistenFn());
      unlistenOpenUrl.then(unlistenFn => unlistenFn());
    };
  }, []);

  useEffect(() => {
    getVersion().then((version) => {
      console.log("Version: ", version);
      getCurrentWindow().setTitle(`CapituAI - ${version}`).then(() => {
        console.log("Window title set");
      }).catch((err) => {
        console.error("Error setting window title: ", err);
      });
    });
  }, []);

  const handleDownloadComplete = (path: string, transcript: string, time: string) => {
    setAudioPath(path);
    setTranscriptionResult(transcript);
    setTimeLapse(time);
    // Quando conclui com sucesso, limpa qualquer erro anterior
    setProcessError(null);
  };

  const handleProgressUpdate = (step: string, progress: number) => {
    setCurrentStep(step);
    setStepProgress(progress);
  };
  
  const handleProcessError = (step: string, error: any) => {
    console.error(`Erro durante ${step}:`, error);
    
    // Armazenar informações do erro para exibir na UI
    setProcessError({
      step,
      message: error.toString()
    });
    
    // Não desativamos o loading state para manter o componente de progresso visível
    // mas atualizamos o passo para indicar que houve erro
    setCurrentStep(`${step}_error`);
  };

  // Função para lidar com a tentativa de repetir um processo que falhou
  const handleRetry = (step: string) => {
    // Limpar o estado de erro
    setProcessError(null);
    
    // Reiniciar o passo atual sem o sufixo de erro
    setCurrentStep(step);
    setStepProgress(0);
    
    // Aqui você pode adicionar lógica específica para cada tipo de passo
    // Por exemplo, se o erro foi no download, reinicie o processo de download
    
    // Este exemplo simples apenas volta para o estado de carregamento
    // Você precisará implementar a lógica real para reiniciar o passo específico
    if (step === "download") {
      // Lógica para reiniciar o download
      console.log("Reiniciando o download...");
    } else if (step === "upload") {
      // Lógica para reiniciar o upload
      console.log("Reiniciando o upload...");
    } else if (step === "transcription") {
      // Lógica para reiniciar a transcrição
      console.log("Reiniciando a transcrição...");
    }
  };

  const copyToClipboard = () => {
    const textGenByCapituAI = "Gerado por https://capituai.cc";
    const textToCopy = `${textGenByCapituAI}\n\n${transcriptionResult}\n\n${textGenByCapituAI}`;
    navigator.clipboard.writeText(textToCopy).then(() => {
      console.log('Text copied to clipboard');
    }).catch(err => {
      console.error('Could not copy text: ', err);
    });
  };

  // Função para lidar com o login bem-sucedido
  const handleLoginSuccess = (session: any) => {
    try {
      setUserSession(session);
      console.log("Usuário logado:", session);
    } catch (error) {
      console.error("Erro handleLoginSuccess:", error);
    }
  };

  // Função para lidar com logout
  const handleLogout = async () => {
    try {
      // Fazer logout no Supabase
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      // Limpar todos os estados relevantes
      setUserSession(null);
      setAudioPath("");
      setTranscriptionResult("");
      setTimeLapse("");
      setCurrentStep("");
      setStepProgress(0);
      setProcessError(null);
      
      // Limpar qualquer armazenamento local relacionado à autenticação
      localStorage.removeItem('supabase.auth.token');
      // Adicione outros itens que precisam ser removidos do localStorage
      
      console.log("Usuário deslogado com sucesso");
    } catch (error) {
      console.error("Erro ao fazer logout:", error);
    }
  };

  // Função para alternar o menu lateral
  const toggleMenu = () => {
    setMenuOpen(!menuOpen);
  };

  return (
    <main className="container">
      {/* Menu lateral */}
      <div className={`sidebar-menu ${menuOpen ? 'open' : ''}`}>
        <div className="menu-header">
          <button className="close-menu-btn" onClick={toggleMenu}>×</button>
          <h2>Menu</h2>
        </div>
        <div className="menu-content">
          <nav>
            <ul>
              <li><a href="#" onClick={() => setMenuOpen(false)}>Início</a></li>
              <li><a href="#" onClick={() => setMenuOpen(false)}>Histórico</a></li>
              <li><a href="#" onClick={() => setMenuOpen(false)}>Configurações</a></li>
              <li><a href="#" onClick={() => setMenuOpen(false)}>Sobre</a></li>
              {userSession && (
                <li><a href="#" onClick={() => { handleLogout(); setMenuOpen(false); }}>Sair</a></li>
              )}
            </ul>
          </nav>
        </div>
      </div>
      
      {/* Overlay do menu para quando estiver aberto */}
      {menuOpen && <div className="menu-overlay" onClick={toggleMenu}></div>}
      
      <div className="app-header">
        <button className="menu-toggle-btn" onClick={toggleMenu}>☰</button>
        <h1>bem vindo à CapituAI Desktop</h1>
        <div className="app-header-right">
          <ServiceStatus />
          
          {/* Exibir os créditos do usuário quando logado */}
          {userSession && (
            <UserCredits userId={userSession.user.id} />
          )}
          
          {/* Botão de logout */}
          {userSession && (
            <button className="logout-btn" onClick={handleLogout}>
              Sair
            </button>
          )}
        </div>
      </div>
      
      <UpdateChecker />
      
      {/* Renderizar o componente de autenticação se o usuário não estiver logado */}
      {!userSession ? (
        <SupabaseAuth onLogin={handleLoginSuccess} />
      ) : (
        <>
          <YoutubeInput 
            initialUrl="https://www.youtube.com/watch?v=d3djdjLhH_g"
            onDownloadComplete={handleDownloadComplete}
            onLoadingChange={setLoading}
            onProgressUpdate={handleProgressUpdate}
            onError={handleProcessError}
          />
          
          <ProcessProgress 
            currentStep={currentStep}
            progress={stepProgress}
            isVisible={loading || processError !== null}
            error={processError}
            onRetry={handleRetry}
          />
          
          <TranscriptionDisplay 
            transcription={transcriptionResult} 
            onCopyToClipboard={copyToClipboard} 
          />
          
          <p style={{ textAlign: 'left' }}>{audioPath}</p>
          <p style={{ textAlign: 'left' }}>{timeLapse}</p>
        </>
      )}
    </main>
  );
}

export default App;
