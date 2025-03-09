// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use serde_json::Value;
use std::path::Path;
use std::time::Duration;
use tauri::{command, Emitter, Manager, Window};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_oauth::start;
use tokio::time::sleep;
use youtube_dl::YoutubeDl;
const OUTPUT_FOLDER: &str = "../output";
const CAPITU_LANGCHAIN_URL: &str =
    "https://kamikazebr--capitu-ai-langchain-fastapi-app-dev.modal.run";

const TRANSCRIBE_YOUTUBE_URL: &str = "https://kamikazebr--transcribe-youtube-fastapi-app.modal.run";

#[command]
async fn start_server(window: Window) -> Result<u16, String> {
    start(move |url| {
        // Because of the unprotected localhost port, you must verify the URL here.
        // Preferebly send back only the token, or nothing at all if you can handle everything else in Rust.
        let _ = window.emit("redirect_uri", url);
    })
    .map_err(|err| err.to_string())
}

#[command]
async fn download_audio(url: &str) -> Result<String, String> {
    // Extrai o ID do vídeo da URL
    let video_id = url.split("v=").nth(1).unwrap_or("output");
    let file_path = format!("{}/{}.mp3", OUTPUT_FOLDER, video_id);

    // Verifica se o arquivo já existe
    if Path::new(&file_path).exists() {
        println!("Arquivo já existe: {}", file_path);
        return Ok(file_path);
    }

    // Configura o youtube-dl para baixar apenas o áudio
    YoutubeDl::new(url)
        .extract_audio(true) // Define para extrair apenas o áudio
        .format("bestaudio")
        .extra_arg("-o")
        .extra_arg(&format!("{}.mp3", video_id)) // Usa o ID do vídeo como nome do arquivo
        .extra_arg("--audio-format")
        .extra_arg("mp3")
        .socket_timeout("15")
        .download_to(OUTPUT_FOLDER)
        .map_err(|e| format!("Failed to download audio: {}", e))?;

    Ok(file_path)
}

#[command]
async fn upload_audio(file_path: &str) -> Result<String, String> {
    let url = format!("{}/upload", TRANSCRIBE_YOUTUBE_URL);

    println!("Iniciando upload do arquivo: {}", file_path);

    // Abre o arquivo para leitura
    // let file = File::open(file_path).map_err(|e| format!("Failed to open file: {}", e))?;

    // Cria um formulário multipart
    println!("Criando formulário multipart...");
    let form = reqwest::multipart::Form::new()
        .file("file", file_path)
        .await
        .map_err(|e| format!("Failed to create form: {}", e))?;
    println!("Formulário criado com sucesso.");

    // Cria um cliente HTTP assíncrono
    let client = reqwest::Client::new();

    // Envia a requisição POST de forma assíncrona
    println!("Enviando requisição POST para {}", url);
    let response = client
        .post(url)
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("Failed to upload file: {}", e))?;
    println!("Requisição enviada, status: {}", response.status());

    // Lê a resposta como texto de forma assíncrona
    println!("Lendo resposta do servidor...");
    let result = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;
    println!("Resposta recebida: {}", result);

    Ok(result)
}

#[command]
async fn take_transcription(filename_id: &str) -> Result<String, String> {
    let url = format!("{}/transcript/{}", TRANSCRIBE_YOUTUBE_URL, filename_id);

    println!(
        "Verificando status da transcrição para filename_id: {}",
        filename_id
    );

    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to check transcription status: {}", e))?;
    println!(
        "Requisição de status enviada, status: {}",
        response.status()
    );

    let result = response
        .text()
        .await
        .map_err(|e| format!("Failed to read status response: {}", e))?;

    // Parse the JSON response
    let json: Value = serde_json::from_str(&result)
        .map_err(|e| format!("Failed to parse JSON response: {}", e))?;

    // Extract the transcript or handle errors
    if let Some(transcript) = json.get("transcript") {
        println!("Transcrição: {}", transcript);

        // Chamada para generate-chapters
        let new_url_chapters = format!("{}/generate-chapters", CAPITU_LANGCHAIN_URL);
        let response = client
            .post(&new_url_chapters)
            .body(transcript.to_string())
            .send()
            .await
            .map_err(|e| format!("Failed to generate chapters: {}", e))?;

        let result = response
            .json::<Value>()
            .await
            .map_err(|e| format!("Failed to parse generate chapters response: {}", e))?;
        println!("Result Generate Chapters: {:?}", result.clone().to_string());

        let task_id = result
            .get("task_id")
            .ok_or("Task ID not found")?
            .as_str()
            .ok_or("Task ID is not a string")?;
        println!("Task ID: {}", task_id);

        // Chamada para task-status
        let new_url_full_chapters = format!("{}/task-status/{}", CAPITU_LANGCHAIN_URL, task_id);

        loop {
            let response = client
                .get(&new_url_full_chapters)
                .send()
                .await
                .map_err(|e| format!("Failed to get task status: {}", e))?;
            let result = response
                .json::<Value>()
                .await
                .map_err(|e| format!("Failed to parse task status response: {}", e))?;
            println!("Result Full Chapters: {:?}", result.clone());

            if let Some(task_result) = result.get("task_result") {
                if let Some(status) = task_result.get("result") {
                    if status.as_str().unwrap() == "pending" {
                        println!("Result is pending, waiting...");
                        sleep(Duration::from_secs(5)).await; // Espera 5 segundos antes de tentar novamente
                        continue;
                    } else {
                        let text = task_result.get("text").unwrap();
                        println!("Text: {:?}", text.as_str().unwrap());
                        return Ok(text.to_string());
                    }
                } else {
                    println!("Unexpected status result");
                }
            }
        }
    } else {
        Err("Transcription not found in response.".into())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_single_instance::init(|app, args, cmd| {
            println!("Received args: {:?}", args);
            println!("Received cmd: {:?}", cmd);

            if args.len() > 1 {
                let deep_link = args[1].clone();
                println!("Deep link: {:?}", deep_link);

                if deep_link.starts_with("capituai://") {
                    let url = deep_link.clone();
                    println!("URL: {:?}", url);

                    // Emitir o evento deep_link_received para o frontend
                    if let Some(window) = app.get_webview_window("main") {
                        window
                            .emit("deep_link_received", url)
                            .expect("falha ao emitir evento deep_link_received");
                    }
                }
            }

            let _ = app
                .get_webview_window("main")
                .expect("no main window")
                .set_focus();
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_oauth::init())
        .invoke_handler(tauri::generate_handler![
            download_audio,
            upload_audio,
            take_transcription,
            start_server
        ])
        .setup(|app| {
            #[cfg(desktop)]
            app.deep_link().register("capituai")?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use std::env;

    use super::*;

    const VIDEO_ID: &str = "dQw4w9WgXcQ";

    #[test]
    fn test_download_audio() {
        let url = format!("https://www.youtube.com/watch?v={}", VIDEO_ID);

        let video_id = url.split("v=").nth(1).unwrap_or("output");

        let output = YoutubeDl::new(url.clone())
            .extract_audio(true)
            .format("bestaudio")
            .extra_arg("-o")
            .extra_arg(&format!("{}.mp3", video_id))
            .extra_arg("--audio-format")
            .extra_arg("mp3")
            .download_to(OUTPUT_FOLDER)
            .unwrap();

        println!("Output: {:?}", output);

        // Obtém o diretório atual
        match env::current_dir() {
            Ok(path) => println!("Diretório atual: {}", path.display()),
            Err(e) => println!("Erro ao obter o diretório atual: {}", e),
        }
    }

    #[tokio::test]
    async fn test_upload_audio() {
        let file_path = format!("../output/{}.mp3", VIDEO_ID); // Certifique-se de que este arquivo existe para o teste

        let current_dir = env::current_dir().unwrap();
        println!("Diretório atual: {}", current_dir.display());

        let file_path = current_dir.join(file_path);

        if !file_path.exists() {
            panic!("File does not exist: {}", file_path.display());
        }

        let result = upload_audio(file_path.to_str().unwrap()).await;
        assert!(result.is_ok(), "Upload failed: {:?}", result);

        println!("Upload result: {:?}", result.unwrap());
    }

    #[tokio::test]
    async fn test_take_transcription() {
        let filename_id = VIDEO_ID; // Use o task_id retornado pelo upload

        let result = take_transcription(filename_id).await;
        assert!(
            result.is_ok(),
            "Failed to check transcription status: {:?}",
            result
        );

        let json_result: Value = serde_json::from_str(&result.unwrap()).unwrap();

        println!("Transcription status: {:?}", json_result);

        let new_url_chapters = format!("{}/generate-chapters", CAPITU_LANGCHAIN_URL);

        let client = reqwest::Client::new();
        let response = client
            .post(new_url_chapters)
            .body(json_result.to_string())
            .send()
            .await
            .unwrap();

        let result = response.json::<Value>().await.unwrap();
        println!("Result Generate Chapters: {:?}", result.clone());
        let task_id = result.get("task_id").unwrap().as_str().unwrap();
        println!("Task ID: {}", task_id);

        let new_url_full_chapters = format!("{}/task-status/{}", CAPITU_LANGCHAIN_URL, task_id);

        let client = reqwest::Client::new();

        loop {
            let response = client.get(&new_url_full_chapters).send().await.unwrap();
            let result = response.json::<Value>().await.unwrap();
            println!("Result Full Chapters: {:?}", result.clone());

            if let Some(task_result) = result.get("task_result") {
                if let Some(status) = task_result.get("result") {
                    if status.as_str().unwrap() == "pending" {
                        println!("Result is pending, waiting...");
                        sleep(Duration::from_secs(5)).await; // Espera 5 segundos antes de tentar novamente
                        continue;
                    } else {
                        let text = task_result.get("text").unwrap();
                        println!("Text: {:?}", text.as_str().unwrap());
                        break;
                    }
                } else {
                    println!("Unexpected status result");
                }
            }
        }
    }
}
