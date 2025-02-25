import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

import "./App.css";

function App() {
  const [youtubeUrl, setYoutubeUrl] = useState("https://www.youtube.com/watch?v=d3djdjLhH_g"); // rick https://www.youtube.com/watch?v=dQw4w9WgXcQ

  const [textResult, setTextResult] = useState("");
  const [audioPath, setAudioPath] = useState("");
  const [uploadResult, setUploadResult] = useState(""); // Estado para armazenar o resultado do upload
  const [transcriptionResult, setTranscriptionResult] = useState(""); // Estado para armazenar o resultado da transcrição
  const [loading, setLoading] = useState(false);
  const [timeLapse, setTimeLapse] = useState("");

  async function downloadAudio() {
    setLoading(true);
    const startTime = Date.now();
    console.log("Downloading audio from YouTube");

    try {
      const result = await invoke<string>("download_audio", { url: youtubeUrl });
      setAudioPath(result);
      let uploadRes = "";
      
      if (uploadResult === "") { // Verifica se o upload já foi feito
        console.log("Uploading audio to server");
        uploadRes = await invoke<string>("upload_audio", { filePath: result });
        console.log("Upload result:", uploadRes);
        setUploadResult(_ => uploadRes);
      } else {
        console.log("Audio already uploaded, skipping upload.");
      }

      if (transcriptionResult === "") { // Verifica se a transcrição já foi feita
        console.log("Taking transcription");
        // uploadResult = "{\"task_id\":\"fc-01JMXSVX074Z5Z50B1D4VRW1PJ\",\"filename_id\":\"d3djdjLhH_g\",\"error\":null}"
        

        const uploadResultJson = JSON.parse(uploadRes);
        console.log("Upload result JSON:", uploadResultJson);

        const filenameId = uploadResultJson["filename_id"];
        console.log("Filename ID:", filenameId);
        const transcriptionRes = await invoke<string>("take_transcription", { filenameId: filenameId });
        console.log("Transcription result:", transcriptionRes);
        
        // Remover aspas e escapes
        const cleanTranscription = JSON.parse(transcriptionRes);
        console.log("cleanTrans",cleanTranscription)
        setTranscriptionResult(cleanTranscription);
      } else {
        console.log("Transcription already done, skipping transcription.");
      }

    } catch (error) {
      const errorMessage = "Error processing audio: " + error;
      console.error(errorMessage);
      setTextResult(errorMessage);
    } finally {
      setLoading(false);
      const endTime = Date.now();
      const timeTaken = endTime - startTime;
      const seconds = Math.floor((timeTaken / 1000) % 60);
      const minutes = Math.floor((timeTaken / 1000) / 60);
      const timeResult = `Tempo do processo: ${minutes} minutos e ${seconds} segundos`;
      console.log(timeResult);
      setTimeLapse(timeResult);
    }
  }

  async function checkForUpdates() {
    try {
      const update = await check();
      if (update) {
        console.log(
          `found update ${update.version} from ${update.date} with notes ${update.body}`
        );
        let downloaded = 0;
        let contentLength = 0;
        // alternatively we could also call update.download() and update.install() separately
        await update.downloadAndInstall((event) => {
          switch (event.event) {
            case 'Started':
              contentLength = event.data.contentLength ?? 0;
              console.log(`started downloading ${event.data.contentLength} bytes`);
              break;
            case 'Progress':
              downloaded += event.data.chunkLength;
              console.log(`downloaded ${downloaded} from ${contentLength}`);
              break;
            case 'Finished':
              console.log('download finished');
              break;
          }
        });
      
        console.log('update installed');
        await relaunch();
      }
    } catch (error) {
      console.error("Failed to check for updates:", error);
    }
  }

  const copyToClipboard = () => {
    const textGenByCapituAI = "Gerado por https://capituai.cc"
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
      <input
        id="youtube-url-input"
        value={youtubeUrl}
        onChange={(e) => setYoutubeUrl(e.currentTarget.value)}
        placeholder="Enter a YouTube URL..."
      />
      <button onClick={() => downloadAudio()} disabled={loading}>
        {loading ? "Baixando..." : "Download Audio"}
      </button>
      <button onClick={checkForUpdates}>Check for Updates</button>
      <button onClick={copyToClipboard}>Copy to Clipboard</button>
      {loading && <p>Carregando...</p>}
      <div style={{ textAlign: 'left' }}>
        {transcriptionResult.split('\n').map((value, index) => {
          return <div key={`${value}-${index}`}>{value}</div>;
        })}
      </div>
      <div>{textResult}</div>

      <p style={{ textAlign: 'left' }}>{audioPath}</p>
      <p style={{ textAlign: 'left' }}>{timeLapse}</p>
    </main>
  );
}

export default App;
