import { useEffect, useState } from "react";
import "./App.css";
import { ProcessProgress } from "./components/ProcessProgress";
import { TranscriptionDisplay } from "./components/TranscriptionDisplay";
import { UpdateChecker } from "./components/UpdateChecker";
import { YoutubeInput } from "./components/YoutubeInput";
import "./styles/components.css";

import { getVersion } from "@tauri-apps/api/app";
import { getCurrentWindow } from '@tauri-apps/api/window';

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

  return (
    <main className="container">
      <h1>bem vindo à CapituAI Desktop</h1>
      
      <UpdateChecker />
      
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
 
    </main>
  );
}

export default App;
