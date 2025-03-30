import { invoke } from "@tauri-apps/api/core";
import { message } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { getUpdatedToken, supabase } from "../supabaseClient";
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

const OUTPUT_FOLDER = "../output"; // TODO: Change to see if it's working on macos

type YoutubeInputProps = {
  initialUrl: string;
  onDownloadComplete: (audioPath: string, chapters: ChapterResponse[], timeTaken: string) => void;
  onLoadingChange: (isLoading: boolean) => void;
  onProgressUpdate: (step: string, progress: number) => void;
  onError: (step: string, error: any) => void;
  userSession?: any |undefined;
}

interface ChapterResponse {
  timecode: string;
  title: string;
}

// Função para esperar um determinado tempo (em milissegundos)
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Constantes para configuração de polling e delays
const POLLING_CONFIG = {
  INITIAL_DELAY: 3000, // 3 segundos
  BACKOFF_MULTIPLIER: 1.5,
  MAX_ATTEMPTS: {
    CHAPTERS: 10,
    TRANSCRIPTION: 10,
    TASK_STATUS: 60
  },
  TASK_STATUS_INTERVAL: 5000, // 5 segundos
  MAX_PROCESSING_TIME: 60 * 60 * 1000 // 1 hora em milissegundos
} as const;

export const PROGRESS_STEPS = {
  DOWNLOAD: "download",
  UPLOAD: "upload",
  CHAPTERS: "chapters",
  PROCESSING: "processando",
  TRANSCRIPTION: "transcription",
  COMPLETE: "complete"
} as const;

const PROCESSING_STATUS = {
  COMPLETED: "completed",
  BACKGROUND: "background_processing",
  ERROR: "error"
} as const;

export function YoutubeInput({ 
  initialUrl, 
  onDownloadComplete, 
  onLoadingChange,
  onProgressUpdate,
  onError,
  userSession
}: YoutubeInputProps) {
  const [youtubeUrl, setYoutubeUrl] = useState(initialUrl);
  const [isLoading, setIsLoading] = useState(false);
  
  // Função para tentar obter a transcrição com exponential backoff
  // const pollForTranscription = async (filenameId: string, maxAttempts: number = POLLING_CONFIG.MAX_ATTEMPTS.TRANSCRIPTION): Promise<string> => {
  //   let attempt = 1;
  //   let delay = POLLING_CONFIG.INITIAL_DELAY;
    
  //   while (attempt <= maxAttempts) {
  //     try {
  //       console.log(`Tentativa ${attempt}/${maxAttempts} de obter a transcrição (aguardando ${delay/1000}s)`);
  //       onProgressUpdate(PROGRESS_STEPS.TRANSCRIPTION, (attempt / maxAttempts) * 90);
        
  //       const transcriptionRes = await invoke<string>("take_transcription", { filenameId });
        
  //       console.log("Transcrição obtida com sucesso na tentativa", attempt);
  //       return transcriptionRes;
  //     } catch (error: any) {
  //       console.log(`Erro na tentativa ${attempt}:`, error);
        
  //       if (error.toString().includes("Transcription not found") || 
  //           error.toString().includes("not found") || 
  //           error.toString().includes("still processing")) {
          
  //         if (attempt < maxAttempts) {
  //           await sleep(delay);
  //           delay *= POLLING_CONFIG.BACKOFF_MULTIPLIER;
  //           attempt++;
  //         } else {
  //           throw new Error(`Transcrição não encontrada após ${maxAttempts} tentativas`);
  //         }
  //       } else {
  //         throw error;
  //       }
  //     }
  //   }
    
  //   throw new Error(`Número máximo de tentativas (${maxAttempts}) excedido`);
  // };
  
  // // Função para verificar o status da tarefa via API
  // const checkTaskStatus = async (taskId: string) => {
  //   try {
  //     const response = await fetch(`${API_URL}/task-status/${taskId}`);
  //     const data = await response.json();
      
  //     console.log("Status da tarefa:", data);
      
  //     // Verificar se a tarefa falhou
  //     if (data.task_result && data.task_result.result) {
  //       const resultStatus = data.task_result.result;
        
  //       if (resultStatus === "failure") {
  //         onError("processamento", "O processamento do vídeo falhou no servidor.");
  //         return false;
  //       } else if (resultStatus === "terminated") {
  //         onError("processamento", "O processamento foi terminado antes da conclusão.");
  //         return false;
  //       } else if (resultStatus === "timeout") {
  //         onError("processamento", "O processamento do vídeo excedeu o tempo limite.");
  //         return false;
  //       } else if (resultStatus === "init_failure") {
  //         onError("inicialização", "Falha na inicialização do processo.");
  //         return false;
  //       } else if (resultStatus === "expired") {
  //         onError("processamento", "O resultado do processamento expirou.");
  //         return false;
  //       } else if (resultStatus === "error") {
  //         onError("processamento", data.task_result.error || "Erro desconhecido no servidor.");
  //         return false;
  //       } else if (resultStatus === "success") {
  //         return true;
  //       }
  //     }
      
  //     // Se ainda estiver em andamento
  //     return null;
  //   } catch (error) {
  //     console.error("Erro ao verificar status da tarefa:", error);
  //     onError("verificação", `Erro ao verificar status: ${error}`);
  //     return false;
  //   }
  // };

  // // Função para polling do status da tarefa
  // const pollTaskStatus = async (taskId: string) => {
  //   let attempts = 0;
  //   const maxAttempts = POLLING_CONFIG.MAX_ATTEMPTS.TASK_STATUS;
    
  //   while (attempts < maxAttempts) {
  //     const status = await checkTaskStatus(taskId);
      
  //     if (status === true) {
  //       return true;
  //     } else if (status === false) {
  //       return false;
  //     }
      
  //     onProgressUpdate(PROGRESS_STEPS.PROCESSING, Math.min(90, attempts * 2));
      
  //     await sleep(POLLING_CONFIG.TASK_STATUS_INTERVAL);
  //     attempts++;
  //   }
    
  //   onError("timeout", "O tempo máximo de espera foi atingido.");
  //   return false;
  // };

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
  const checkFileCache = async (filename_id: string) => {
    console.log("Verificando se arquivo já existe:", filename_id);
    const checkResponse = await fetch(`${TRANSCRIBER_URL}/check-cache/${filename_id}`);
    return await checkResponse.json();
  };

  // Verifica os créditos do usuário
  const checkUserCredits = async (filePath: string, authToken: string | null): Promise<boolean> => {
    try {
      if (!authToken) {
        throw new Error("Token de autenticação não fornecido");
      }
      
      // Chama a função Rust para obter a duração do áudio
      const duration = await invoke<number>("get_audio_duration", { filePath });
      console.log("Duração do áudio:", duration, "segundos");
      
      // Consulta os créditos do usuário diretamente no Supabase
      const { data: userData, error } = await supabase
        .from('credits')
        .select('credits')
        .eq('user_id', userSession?.user?.id)
        .single();
      
      if (error) {
        console.error("Erro ao consultar créditos:", error);
        throw new Error(`Erro ao verificar créditos: ${error.message}`);
      }
      
      if (!userData) {
        await message(
          "Não foi possível encontrar seus créditos. Por favor, entre em contato com o suporte.",
          { title: "Erro ao Verificar Créditos", kind: "error" }
        );
        return false;
      }
      
      // Calcula os minutos e o custo em dólares
      const durationInMinutes = Math.ceil(duration / 60);
      const costPerMinute = 0.04; // $0.04 por minuto
      const requiredCredits = durationInMinutes * costPerMinute; // 1 crédito = $1
      const hasEnoughCredits = userData.credits >= requiredCredits;
      
      if (!hasEnoughCredits) {
        await message(
          `Você não tem créditos suficientes para processar este áudio.\n\n` +
          `Duração: ${durationInMinutes} minutos\n` +
          `Custo: $${requiredCredits.toFixed(2)} (${durationInMinutes} min × $${costPerMinute}/min)\n` +
          `Créditos disponíveis: ${userData.credits.toFixed(2)}`,
          { title: "Créditos Insuficientes", kind: "error" }
        );
        return false;
      }
      
      return true;
    } catch (error) {
      console.error("Erro ao verificar créditos:", error);
      throw new Error(`Falha ao verificar créditos: ${error}`);
    }
  };

  // Processa o upload do arquivo
  const processFileUpload = async (result: string, checkResult: any) => {
    if (checkResult.status && checkResult.status.has_audio) {
      console.log("Arquivo já upado, pulando upload:", checkResult);
      onProgressUpdate("upload", 100);
      return {
        filename_id: checkResult.video_id,
        audio_cached: true
      };
    }

    // Verifica os créditos antes do upload
    const updatedToken = await getUpdatedToken();
    if (!(await checkUserCredits(result, updatedToken))) {
      throw new Error("Créditos insuficientes para processar o áudio");
    }

    onProgressUpdate("upload", 0);
    console.log("Uploading audio to server");
    // console.log("updatedToken", updatedToken);
    const uploadRes = await invoke<string>("upload_audio", { filePath: result, authToken: updatedToken });
    console.log("Upload result:", uploadRes);
    onProgressUpdate("upload", 100);
    return JSON.parse(uploadRes);
  };

  // Função para tentar obter os capítulos com exponential backoff
  const pollForChapters = async (filenameId: string, maxAttempts: number = POLLING_CONFIG.MAX_ATTEMPTS.CHAPTERS): Promise<any> => {
    let attempt = 1;
    let delay = POLLING_CONFIG.INITIAL_DELAY;
    
    while (attempt <= maxAttempts) {
      try {
        console.log(`Tentativa ${attempt}/${maxAttempts} de obter os capítulos (aguardando ${delay/1000}s)`);
        onProgressUpdate(PROGRESS_STEPS.CHAPTERS, (attempt / maxAttempts) * 90);
        
        const chaptersResponse = await fetch(`${TRANSCRIBER_URL}/chapters/${filenameId}`);
        const chaptersData = await chaptersResponse.json();
        
        if (chaptersData.status === "completed" && chaptersData.chapters) {
          console.log("Capítulos obtidos com sucesso na tentativa", attempt);
          return {
            status: PROCESSING_STATUS.COMPLETED,
            chapters: chaptersData.chapters
          };
        }
        
        if (attempt < maxAttempts) {
          await sleep(delay);
          delay *= POLLING_CONFIG.BACKOFF_MULTIPLIER;
          attempt++;
        } else {
          console.log("Máximo de tentativas excedido, processamento continuará em background");
          return {
            status: PROCESSING_STATUS.BACKGROUND,
            message: "O processamento dos capítulos está demorando mais que o normal. Você será notificado quando estiver pronto."
          };
        }
      } catch (error: any) {
        console.log(`Erro na tentativa ${attempt}:`, error);
        
        if (attempt < maxAttempts) {
          await sleep(delay);
          delay *= POLLING_CONFIG.BACKOFF_MULTIPLIER;
          attempt++;
        } else {
          console.log("Máximo de tentativas excedido após erros, processamento continuará em background");
          return {
            status: PROCESSING_STATUS.BACKGROUND,
            message: "O processamento dos capítulos está demorando mais que o normal. Você será notificado quando estiver pronto."
          };
        }
      }
    }
    
    return {
      status: PROCESSING_STATUS.BACKGROUND,
      message: "O processamento dos capítulos está demorando mais que o normal. Você será notificado quando estiver pronto."
    };
  };

  // // Verifica se os capítulos precisam ser reprocessados baseado no tempo
  // const shouldReprocessChapters = (checkResult: any): boolean => {
  //   if (!checkResult.status?.has_chapters || !checkResult.metadata?.created_at) {
  //     console.log("Não há capítulos ou data de criação, reprocessando");
  //     return true;
  //   }

  //   const createdAt = new Date(checkResult.metadata.created_at).getTime();
  //   const now = Date.now();
  //   const processingTime = now - createdAt;
  //   console.log("processingTime", processingTime);
  //   console.log("MAX_PROCESSING_TIME", POLLING_CONFIG.MAX_PROCESSING_TIME);
  //   const result = processingTime > POLLING_CONFIG.MAX_PROCESSING_TIME;
  //   console.log("shouldReprocessChapters", result);
  //   return result;

  // };

  // Obtém os capítulos
  const getChapters = async (filenameId: string, checkResult: any ) => {
    onProgressUpdate(PROGRESS_STEPS.CHAPTERS, 0);
    
    try {
      // Verifica se precisa reprocessar os capítulos
      // const needsReprocessing = shouldReprocessChapters(checkResult);
      
      if (checkResult.status?.has_chapters && checkResult.status?.processing_complete) {
        console.log("Capítulos encontrados no cache e ainda válidos");
        const chaptersResponse = await fetch(`${TRANSCRIBER_URL}/chapters/${filenameId}`);
        const chaptersData = await chaptersResponse.json();
        
        if (chaptersData.status === "completed" && chaptersData.chapters) {
          console.log("Usando capítulos do cache");
          onProgressUpdate(PROGRESS_STEPS.CHAPTERS, 100);
          return {
            status: PROCESSING_STATUS.COMPLETED,
            chapters: chaptersData.chapters
          };
        }
      }else{
        console.log("Iniciando novo processamento via take_transcription");
        // const confirmResult = await confirm("Iniciando geração de novos capítulos...", { title: "Processamento de Capítulos", kind: "info" });
        // // if (!confirmResult) {
        // //   return {
        // //     status: PROCESSING_STATUS.BACKGROUND,
        // //     message: "Processamento cancelado pelo usuário."
        // //   };
        // // }
        
        try {
          console.log("userSession", userSession);
          const updatedToken = await getUpdatedToken();
          console.log("updatedToken", updatedToken);
          await invoke<string>("take_transcription", { filenameId, authToken: updatedToken });
          
          // Após o processamento, fazemos polling para obter os capítulos
          console.log("Processamento completo, aguardando geração dos capítulos");
          return await pollForChapters(filenameId);
        } catch (transcriptionError: unknown) {
          console.error("Erro no take_transcription:", transcriptionError);
          
          // Verifica se é um erro de quota ou rate limit
          const errorMessage = transcriptionError instanceof Error ? transcriptionError.message : String(transcriptionError);
          
          if (errorMessage.includes("402")) {
            await message(
              "O limite de uso da OpenAI foi excedido. Por favor, tente novamente mais tarde ou entre em contato com o suporte.",
              { title: "Limite Excedido", kind: "error" }
            );
          } else if (errorMessage.includes("429")) {
            await message(
              "Muitas requisições simultâneas. Por favor, aguarde um momento e tente novamente.",
              { title: "Muitas Requisições", kind: "warning" }
            );
          }
          
          throw transcriptionError;
        }
      }
      
      // Se chegou aqui sem reprocessamento, tenta polling normal
      console.log("Tentando obter capítulos via polling");
      return await pollForChapters(filenameId);
      
    } catch (error) {
      console.error("Erro ao obter capítulos:", error);
      throw new Error(`Erro ao obter capítulos: ${error}`);
    }
  };

  // Processa o resultado final
  const processResult = (result: string, chaptersResult: any, startTime: number, isFromCache: boolean) => {
    console.log("Resultado dos capítulos:", chaptersResult);
    
    const endTime = Date.now();
    const timeTaken = endTime - startTime;
    const seconds = Math.floor((timeTaken / 1000) % 60);
    const minutes = Math.floor((timeTaken / 1000) / 60);
    const timeResult = `Tempo do processo: ${minutes} minutos e ${seconds} segundos${isFromCache ? ' (cache)' : ''}`;
    
    if (chaptersResult.status === PROCESSING_STATUS.BACKGROUND) {
      // Se está em processamento background, mostra mensagem amigável
      message(chaptersResult.message, { title: "Processamento em Andamento", kind: "info" });
      onDownloadComplete(result, [], timeResult);
    } else {
      // Se completou com sucesso, processa normalmente
      console.log("chaptersResult.chapters", chaptersResult.chapters.chapters);
      onDownloadComplete(result, chaptersResult.chapters.chapters, timeResult);
    }
    
    onProgressUpdate(PROGRESS_STEPS.COMPLETE, 100);
  };


  async function processTranscription(filenameId: string) {
    try {
      if (!filenameId) {
        throw new Error("ID do arquivo não fornecido");
      }
      
      // Verifica os créditos antes do processamento
      const updatedToken = await getUpdatedToken();
      const audioPath = `${OUTPUT_FOLDER}/${filenameId}.mp3`;
      if (!(await checkUserCredits(audioPath, updatedToken))) {
        throw new Error("Créditos insuficientes para processar o áudio");
      }

      console.log("processTranscription", filenameId);
      console.log("updatedToken", updatedToken);
      const transcriptionResponse = await invoke<string>("process_transcription", { filenameId, authToken: updatedToken });
      const transcriptionData = JSON.parse(transcriptionResponse);
      console.log("transcriptionData", transcriptionData);

      if (transcriptionData.error) {
        throw new Error(transcriptionData.error);
      }

      const taskId = transcriptionData.task_id;
      
      // Polling para verificar o status da transcrição
      while (true) {
        const statusResponse = await fetch(`${API_URL}/task-status/${taskId}`);
        const statusData = await statusResponse.json();
        console.log("statusData", statusData);

        if (statusData.task_result?.result === "pending") {
          // Aguarda 5 segundos antes de verificar novamente
          await new Promise(resolve => setTimeout(resolve, 5000));
          continue;
        }

        if (statusData.task_result?.result === "timeout_get") {
          throw new Error("Timeout ao processar a transcrição");
        }

        if (statusData.task_result?.result === "success") {
          return statusData.task_result;
        }

        throw new Error("Erro inesperado ao processar a transcrição");
      }
    } catch (error) {
      console.error("Erro ao processar transcrição:", error);
      throw error;
    }
  }
    

  const handleGenerateClick = async () => {
    if (isLoading) return;
    
    try {
      setIsLoading(true);
      onLoadingChange(true);
      
      if (!await checkOnlineServices()) {
        setIsLoading(false);
        onLoadingChange(false);
        return;
      }
      
      const startTime = Date.now();
      
      onProgressUpdate(PROGRESS_STEPS.DOWNLOAD, 0);
      console.log("Downloading audio from YouTube");
      const result = await invoke<string>("download_audio", { url: youtubeUrl });
      onProgressUpdate(PROGRESS_STEPS.DOWNLOAD, 100);
      
      const filename = result.split("/").pop();
      console.log("filename", filename);
      if (!filename) throw new Error("Nome do arquivo inválido");
      
      const checkResult = await checkFileCache(filename);
      console.log("checkResult", checkResult);
      
      const uploadResultJson = await processFileUpload(result, checkResult);
      const filenameId = uploadResultJson["filename_id"];
      if (uploadResultJson.error) {
        console.error("Erro durante o processamento do upload:", uploadResultJson.error);
        throw new Error(uploadResultJson.error);
      }
      if (!filenameId) {
        throw new Error("ID do arquivo não foi retornado pelo servidor após o upload");
      }
      
      if (!uploadResultJson["task_id"] && !checkResult.status?.has_transcript) {
        console.log("Aguardando 10 segundos antes de iniciar o processamento da transcrição...");
        await sleep(10000); // Atraso de 10 segundos
        console.log("Iniciando processamento de transcrição...");
        onProgressUpdate(PROGRESS_STEPS.TRANSCRIPTION, 0);
        try {
          await processTranscription(filenameId);
          onProgressUpdate(PROGRESS_STEPS.TRANSCRIPTION, 100);
        } catch (transcriptionError) {
          console.error("Erro durante o processamento da transcrição:", transcriptionError);
          throw new Error(`Falha ao processar a transcrição: ${transcriptionError}`);
        }
      }

      const chaptersResult = await getChapters(filenameId, checkResult);
      console.log("Chapters result:", chaptersResult);
      
      processResult(result, chaptersResult, startTime, checkResult.status?.has_transcript || false);
      
    } catch (error: unknown) {
      console.error("Erro:", error);
      const step = (error instanceof Error) ? 
        (error.message.includes("download") ? PROGRESS_STEPS.DOWNLOAD :
         error.message.includes("upload") ? PROGRESS_STEPS.UPLOAD :
         error.message.includes("capítulos") ? PROGRESS_STEPS.CHAPTERS : "unknown")
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