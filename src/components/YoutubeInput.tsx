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

type YoutubeInputProps = {
  initialUrl: string;
  onDownloadComplete: (audioPath: string, transcript: string, timeTaken: string) => void;
  onLoadingChange: (isLoading: boolean) => void;
  onProgressUpdate: (step: string, progress: number) => void;
  onError: (step: string, error: any) => void;
}

export function YoutubeInput({ 
  initialUrl, 
  onDownloadComplete, 
  onLoadingChange,
  onProgressUpdate,
  onError
}: YoutubeInputProps) {
  const [youtubeUrl, setYoutubeUrl] = useState(initialUrl);
  const [_setLoading, setLoading] = useState(false);
  
  const handleGenerateClick = async () => {
    try {
      
      
      const serviceStatus = await checkServices(services);
      const offlineServices = serviceStatus.filter(s => s.status === "offline");
      
      if (offlineServices.length > 0) {
        // Notificar o usuário que alguns serviços estão offline
        const serviceNames = offlineServices.map(s => s.name).join(", ");
        await message(
          `Os seguintes serviços estão offline: ${serviceNames}. Não é possível gerar capítulos no momento.`,
          { title: "Serviços Indisponíveis", kind: "error" }
        );
        return;
      }
      
      // Se todos os serviços estiverem online, continue com o processo normal
      setLoading(true);
      onLoadingChange(true);
      const startTime = Date.now();
      
      // Etapa 1: Download do áudio
      onProgressUpdate("download", 0);
      console.log("Downloading audio from YouTube");
      try {
        const result = await invoke<string>("download_audio", { url: youtubeUrl });
        onProgressUpdate("download", 100);
        
        // Etapa 2: Upload do áudio
        onProgressUpdate("upload", 0);
        console.log("Uploading audio to server");
        try {
          const uploadRes = await invoke<string>("upload_audio", { filePath: result });
          console.log("Upload result:", uploadRes);
          onProgressUpdate("upload", 100);

          // Etapa 3: Transcrição
          onProgressUpdate("transcription", 0);
          console.log("Taking transcription");
          try {
            const uploadResultJson = JSON.parse(uploadRes);
            console.log("Upload result JSON:", uploadResultJson);

            const filenameId = uploadResultJson["filename_id"];
            console.log("Filename ID:", filenameId);
            
            try {
              const transcriptionRes = await invoke<string>("take_transcription", { filenameId: filenameId });
              console.log("Transcription result:", transcriptionRes);
              
              try {
                // Remover aspas e escapes
                const cleanTranscription = JSON.parse(transcriptionRes);
                console.log("cleanTrans", cleanTranscription);
                onProgressUpdate("transcription", 100);
                
                // Calcular tempo
                const endTime = Date.now();
                const timeTaken = endTime - startTime;
                const seconds = Math.floor((timeTaken / 1000) % 60);
                const minutes = Math.floor((timeTaken / 1000) / 60);
                const timeResult = `Tempo do processo: ${minutes} minutos e ${seconds} segundos`;
                
                onDownloadComplete(result, cleanTranscription, timeResult);
                
                // Completar o processo com sucesso
                onLoadingChange(false);
                onProgressUpdate("complete", 100);
              } catch (parseError) {
                onError("transcription", "Erro ao processar a transcrição: " + parseError);
              }
            } catch (transcriptionError) {
              onError("transcription", "Erro na transcrição: " + transcriptionError);
            }
          } catch (parseError) {
            onError("upload", "Erro ao analisar resultado do upload: " + parseError);
          }
        } catch (uploadError) {
          onError("upload", "Erro ao fazer upload do áudio: " + uploadError);
        }
      } catch (downloadError) {
        onError("download", "Erro ao baixar o áudio: " + downloadError);
      }
    } catch (error) {
      const errorMessage = "Erro inesperado: " + error;
      console.error(errorMessage);
      onError("unknown", errorMessage);
    } finally {
      setLoading(false);
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
      />
      <button 
        onClick={() => handleGenerateClick()}
        className="generate-button"
      >
        Gerar Capítulos
      </button>
    </div>
  );
} 