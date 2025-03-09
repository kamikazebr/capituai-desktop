import { invoke } from "@tauri-apps/api/core";
import { message } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { checkServices } from "./ServiceStatus";


// Verificar os serviços antes de começar o processo
const services = [
  {
    name: "Capitu AI",
    url: "https://kamikazebr--capitu-ai-langchain-fastapi-app-dev.modal.run",
  },
  {
    name: "Transcriber",
    url: "https://kamikazebr--transcribe-youtube-fastapi-app.modal.run",
  },
];

const TRANSCRIBER_URL = services.find(s => s.name === "Transcriber")?.url || "";
// Extraindo a URL da API do Transcriber para uso em outras funções
const API_URL = services.find(s => s.name === "Capitu AI")?.url || "";

type YoutubeInputProps = {
  initialUrl: string;
  onDownloadComplete: (audioPath: string, transcript: string, timeTaken: string) => void;
  onLoadingChange: (isLoading: boolean) => void;
  onProgressUpdate: (step: string, progress: number) => void;
  onError: (step: string, error: any) => void;
}

// Função para esperar um determinado tempo (em milissegundos)
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function YoutubeInput({ 
  initialUrl, 
  onDownloadComplete, 
  onLoadingChange,
  onProgressUpdate,
  onError
}: YoutubeInputProps) {
  const [youtubeUrl, setYoutubeUrl] = useState(initialUrl);
  const [isLoading, setIsLoading] = useState(false);
  
  // Função para tentar obter a transcrição com exponential backoff
  const pollForTranscription = async (filenameId: string, maxAttempts: number = 10): Promise<string> => {
    let attempt = 1;
    let delay = 3000; // Começa com 3 segundos
    
    while (attempt <= maxAttempts) {
      try {
        console.log(`Tentativa ${attempt}/${maxAttempts} de obter a transcrição (aguardando ${delay/1000}s)`);
        onProgressUpdate("transcription", (attempt / maxAttempts) * 90); // Máximo 90% durante poll
        
        const transcriptionRes = await invoke<string>("take_transcription", { filenameId });
        
        // Se chegou aqui, a transcrição foi obtida com sucesso
        console.log("Transcrição obtida com sucesso na tentativa", attempt);
        return transcriptionRes;
      } catch (error: any) {
        console.log(`Erro na tentativa ${attempt}:`, error);
        
        // Verifica se o erro é porque a transcrição ainda está em processamento
        if (error.toString().includes("Transcription not found") || 
            error.toString().includes("not found") || 
            error.toString().includes("still processing")) {
          
          if (attempt < maxAttempts) {
            // Aguarda antes da próxima tentativa com backoff exponencial
            await sleep(delay);
            delay = Math.min(delay * 1.5, 30000); // Aumenta o delay, mas no máximo 30s
            attempt++;
          } else {
            throw new Error(`Transcrição não encontrada após ${maxAttempts} tentativas`);
          }
        } else {
          // Se for outro tipo de erro, propaga imediatamente
          throw error;
        }
      }
    }
    
    throw new Error(`Número máximo de tentativas (${maxAttempts}) excedido`);
  };
  
  // Função para verificar o status da tarefa via API
  const checkTaskStatus = async (taskId: string) => {
    try {
      const response = await fetch(`${API_URL}/task-status/${taskId}`);
      const data = await response.json();
      
      console.log("Status da tarefa:", data);
      
      // Verificar se a tarefa falhou
      if (data.task_result && data.task_result.result) {
        const resultStatus = data.task_result.result;
        
        if (resultStatus === "failure") {
          onError("processamento", "O processamento do vídeo falhou no servidor.");
          return false;
        } else if (resultStatus === "terminated") {
          onError("processamento", "O processamento foi terminado antes da conclusão.");
          return false;
        } else if (resultStatus === "timeout") {
          onError("processamento", "O processamento do vídeo excedeu o tempo limite.");
          return false;
        } else if (resultStatus === "init_failure") {
          onError("inicialização", "Falha na inicialização do processo.");
          return false;
        } else if (resultStatus === "expired") {
          onError("processamento", "O resultado do processamento expirou.");
          return false;
        } else if (resultStatus === "error") {
          onError("processamento", data.task_result.error || "Erro desconhecido no servidor.");
          return false;
        } else if (resultStatus === "success") {
          return true;
        }
      }
      
      // Se ainda estiver em andamento
      return null;
    } catch (error) {
      console.error("Erro ao verificar status da tarefa:", error);
      onError("verificação", `Erro ao verificar status: ${error}`);
      return false;
    }
  };

  // Função para polling do status da tarefa
  const pollTaskStatus = async (taskId: string) => {
    let attempts = 0;
    const maxAttempts = 60; // 5 minutos com intervalo de 5s
    
    while (attempts < maxAttempts) {
      const status = await checkTaskStatus(taskId);
      
      // Se tiver um resultado definitivo (true = sucesso, false = falha)
      if (status === true) {
        return true;
      } else if (status === false) {
        return false;
      }
      
      // Senão, ainda está processando
      onProgressUpdate("processando", Math.min(90, attempts * 2));
      
      // Esperar 5 segundos antes da próxima verificação
      await new Promise(resolve => setTimeout(resolve, 5000));
      attempts++;
    }
    
    // Se atingir o número máximo de tentativas
    onError("timeout", "O tempo máximo de espera foi atingido.");
    return false;
  };

  // Verifica serviços online
  const checkOnlineServices = async () => {
    const serviceStatus = await checkServices(services);
    const offlineServices = serviceStatus.filter(s => s.status === "offline");
    
    if (offlineServices.length > 0) {
      const serviceNames = offlineServices.map(s => s.name).join(", ");
      await message(
        `Os seguintes serviços estão offline: ${serviceNames}. Não é possível gerar capítulos no momento.`,
        { title: "Serviços Indisponíveis", kind: "error" }
      );
      return false;
    }
    return true;
  };

  // Verifica cache do arquivo
  const checkFileCache = async (filename: string) => {
    console.log("Verificando se arquivo já existe:", filename);
    const checkResponse = await fetch(`${TRANSCRIBER_URL}/check-cache/${filename}`);
    return await checkResponse.json();
  };

  // Processa o upload do arquivo
  const processFileUpload = async (result: string, checkResult: any) => {
    if (checkResult.status && checkResult.status.has_audio) {
      console.log("Arquivo já upado, pulando upload:", checkResult);
      onProgressUpdate("upload", 100);
      return {
        filename_id: checkResult.video_id,
        cached: true
      };
    }

    onProgressUpdate("upload", 0);
    console.log("Uploading audio to server");
    const uploadRes = await invoke<string>("upload_audio", { filePath: result });
    console.log("Upload result:", uploadRes);
    onProgressUpdate("upload", 100);
    return JSON.parse(uploadRes);
  };

  // Obtém a transcrição
  const getTranscription = async (filenameId: string, checkResult: any, uploadResultJson: any) => {
    onProgressUpdate("transcription", 0);
    
    if (checkResult.status && checkResult.status.has_transcript) {
      console.log("Transcrição já existe, pegando do cache");
      const transcriptResponse = await fetch(`${TRANSCRIBER_URL}/transcript/${filenameId}`);
      const transcriptionRes = await transcriptResponse.text();
      onProgressUpdate("transcription", 100);
      return transcriptionRes;
    }

    const taskId = uploadResultJson["task_id"];
    if (taskId) {
      console.log("Task ID disponível, usando verificação de status:", taskId);
      const success = await pollTaskStatus(taskId);
      if (!success) {
        throw new Error("A verificação de status da tarefa falhou");
      }
      console.log("Task ID disponível, pegando transcrição");
      return await invoke<string>("take_transcription", { filenameId });
    }

    console.log("Task ID não disponível, usando polling direto");
    return await pollForTranscription(filenameId);
  };

  // Processa o resultado final
  const processResult = (result: string, transcriptionRes: string, startTime: number, isFromCache: boolean) => {
    const cleanTranscription = JSON.parse(transcriptionRes);
    console.log("cleanTrans", cleanTranscription);
    
    const endTime = Date.now();
    const timeTaken = endTime - startTime;
    const seconds = Math.floor((timeTaken / 1000) % 60);
    const minutes = Math.floor((timeTaken / 1000) / 60);
    const timeResult = `Tempo do processo: ${minutes} minutos e ${seconds} segundos${isFromCache ? ' (cache)' : ''}`;
    
    onDownloadComplete(result, cleanTranscription.text, timeResult);
    onProgressUpdate("complete", 100);
  };

  const handleGenerateClick = async () => {
    if (isLoading) return;
    
    try {
      setIsLoading(true);
      onLoadingChange(true);
      
      // Verifica serviços
      if (!await checkOnlineServices()) {
        setIsLoading(false);
        onLoadingChange(false);
        return;
      }
      
      const startTime = Date.now();
      
      // Download do áudio, internamente já verifica se o arquivo existe no cache
      onProgressUpdate("download", 0);
      console.log("Downloading audio from YouTube");
      const result = await invoke<string>("download_audio", { url: youtubeUrl });
      onProgressUpdate("download", 100);
      
      // Verifica cache
      const filename = result.split("/").pop();
      if (!filename) throw new Error("Nome do arquivo inválido");
      
      const checkResult = await checkFileCache(filename);
      console.log("checkResult", checkResult);
      
      // Upload ou usa cache
      const uploadResultJson = await processFileUpload(result, checkResult);
      const filenameId = uploadResultJson["filename_id"];
      
      // Obtem transcrição
      const transcriptionRes = await getTranscription(filenameId, checkResult, uploadResultJson);
      console.log("Transcription result:", transcriptionRes);
      
      // Processa resultado
      processResult(result, transcriptionRes, startTime, checkResult.status?.has_transcript || false);
      
    } catch (error: unknown) {
      console.error("Erro:", error);
      const step = (error instanceof Error) ? 
        (error.message.includes("download") ? "download" :
         error.message.includes("upload") ? "upload" :
         error.message.includes("transcrição") ? "transcription" : "unknown")
        : "unknown";
      onError(step, `Erro: ${error}`);
    } finally {
      setIsLoading(false);
      onLoadingChange(false);
    }
  };

  return (
    <div className="youtube-input-container">
      <input
        id="youtube-url-input"
        value={youtubeUrl}
        onChange={(e) => setYoutubeUrl(e.currentTarget.value)}
        placeholder="Cole o link do vídeo do YouTube aqui..."
        className="youtube-url-input"
        disabled={isLoading}
      />
      <button 
        onClick={handleGenerateClick}
        className={`generate-button ${isLoading ? 'loading' : ''}`}
        disabled={isLoading}
      >
        {isLoading ? 'Processando...' : 'Gerar Capítulos'}
      </button>
    </div>
  );
} 