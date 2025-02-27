import { useState, useEffect } from "react";
import { check, DownloadEvent, Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { confirm } from '@tauri-apps/plugin-dialog';

export function UpdateChecker() {
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  useEffect(() => {
    if (!isOpen) {
      setIsOpen(_ => true);
      checkForUpdates();
    }
  }, []);

  async function checkForUpdates() {
    try {
      const update = await check();
      if (update) {
        console.log(
          `Nova atualização encontrada: ${update.version} de ${update.date} com notas: ${update.body}`
        );
        
        // Pedir confirmação ao usuário
        const confirmed = await confirm(`Nova atualização disponível: v${update.version}\n\nNotas da versão: ${update.body}\n\nDeseja atualizar agora?`, {
          title: 'Atualização disponível',
          kind: 'info',
        });
        
        if (confirmed) {
          await downloadAndInstallUpdate(update);
        }
      }else{
        console.log("Nenhuma atualização disponível");
      }
    } catch (error) {
      console.error("Falha ao verificar atualizações:", error);
    }
  }

  async function downloadAndInstallUpdate(update: Update) {
    setIsDownloading(true);
    let downloaded = 0;
    let contentLength = 0;
    
    try {
      await update.downloadAndInstall((event: DownloadEvent) => {
        switch (event.event) {
          case 'Started':
            contentLength = event.data.contentLength ?? 0;
            console.log(`Iniciado download de ${event.data.contentLength} bytes`);
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            const progress = contentLength > 0 ? Math.floor((downloaded / contentLength) * 100) : 0;
            setDownloadProgress(progress);
            console.log(`Baixado ${downloaded} de ${contentLength} (${progress}%)`);
            break;
          case 'Finished':
            console.log('Download finalizado');
            break;
        }
      });
    
      console.log('Atualização instalada');
      await relaunch();
    } catch (error) {
      console.error("Falha ao baixar ou instalar atualização:", error);
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <div className="update-checker">
      {/* Modal de progresso do download */}
      {isDownloading && (
        <div className="download-modal-backdrop">
          <div className="download-modal">
            <h3>Baixando Atualização</h3>
            <div className="progress-container">
              <progress value={downloadProgress} max="100" />
              <p>{downloadProgress}%</p>
            </div>
            <p>Por favor, aguarde enquanto baixamos a atualização...</p>
          </div>
        </div>
      )}
    </div>
  );
} 