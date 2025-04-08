// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use serde_json::Value;
use std::path::Path;
use std::time::Duration;
use tauri::{command, Emitter, Manager, Window};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_oauth::start;
use tokio::time::sleep;

use youtube_dl::YoutubeDl;
// use std::process::Command;
use std::fs::File;
// use std::io::BufReader;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
// use symphonia::core::units::Time;

#[cfg(target_os = "macos")]
const OUTPUT_FOLDER: &str = "/Users/Shared/capituai/output";
#[cfg(not(target_os = "macos"))]
const OUTPUT_FOLDER: &str = "../output";
const CAPITU_LANGCHAIN_URL: &str = "https://kamikazebr--capitu-ai-langchain-fastapi-app.modal.run";

const TRANSCRIBE_YOUTUBE_URL: &str = "https://kamikazebr--transcribe-youtube-fastapi-app.modal.run";

/// Extrai o ID do vídeo de uma URL do YouTube
///
/// Esta função extrai o ID de 11 caracteres de qualquer URL do YouTube usando o seguinte método:
/// 1. Divide a string em partes usando caracteres inválidos como separadores
/// 2. Procura por uma parte que tenha exatamente 11 caracteres (tamanho padrão dos IDs)
///
/// # Exemplos
/// ```rust
/// let id = extract_youtube_video_id("https://youtu.be/dQw4w9WgXcQ");
/// assert_eq!(id, Some("dQw4w9WgXcQ".to_string()));
///
/// // Funciona com vários formatos de URL
/// let id = extract_youtube_video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
/// let id = extract_youtube_video_id("https://youtube.com/shorts/dQw4w9WgXcQ");
/// let id = extract_youtube_video_id("https://youtu.be/dQw4w9WgXcQ");
/// ```
fn extract_youtube_video_id(url: &str) -> Option<String> {
    // IDs do YouTube sempre têm 11 caracteres
    // Procura por uma sequência de exatamente 11 caracteres que podem ser letras, números, - ou _
    url.split(|c| !matches!(c, 'a'..='z' | 'A'..='Z' | '0'..='9' | '-' | '_'))
        .find(|s| s.len() == 11)
        .map(String::from)
}

#[command]
fn get_audio_duration(file_path: &str) -> Result<f64, String> {
    // Abre o arquivo
    let file_path = format!("{}/{}", OUTPUT_FOLDER, file_path);
    println!("get_audio_duration::File path: {}", file_path);
    let file = File::open(file_path).map_err(|e| format!("Failed to open file: {}", e))?;

    // Cria o MediaSourceStream
    let mss = MediaSourceStream::new(Box::new(file), Default::default());

    // Cria um hint para ajudar no probe do formato
    let mut hint = Hint::new();
    hint.with_extension("mp3");

    // Usa o probe padrão do symphonia que já tem todos os formatos habilitados
    let mut format_opts = FormatOptions::default();
    // Habilita suporte a gapless playback que pode ajudar na precisão
    format_opts.enable_gapless = true;

    // Faz o probe do formato
    let probed = symphonia::default::get_probe()
        .format(&hint, mss, &format_opts, &MetadataOptions::default())
        .map_err(|e| format!("Failed to probe format: {}", e))?;

    // Obtém o primeiro track de áudio
    let track = probed
        .format
        .tracks()
        .iter()
        .find(|t| t.codec_params.codec != symphonia::core::codecs::CODEC_TYPE_NULL)
        .ok_or_else(|| "No valid audio track found".to_string())?;

    // Tenta obter a duração das propriedades do track
    if let Some(n_frames) = track.codec_params.n_frames {
        if let Some(sample_rate) = track.codec_params.sample_rate {
            let duration = (n_frames as f64) / (sample_rate as f64);
            return Ok(duration);
        }
    }

    // Se não conseguiu pelos frames, tenta obter a duração do formato
    if let Some(time_base) = track.codec_params.time_base {
        if let Some(n_frames) = track.codec_params.n_frames {
            let duration = (n_frames as f64) * (time_base.numer as f64) / (time_base.denom as f64);
            return Ok(duration);
        }
    }

    Err("Could not determine duration".to_string())
}

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
    // Extrai o ID do vídeo da URL usando a nova função
    let video_id = extract_youtube_video_id(url)
        .ok_or_else(|| "URL do YouTube inválida ou ID do vídeo não encontrado".to_string())?;

    // Garante que o diretório de saída exista
    std::fs::create_dir_all(OUTPUT_FOLDER)
        .map_err(|e| format!("Failed to create output directory: {}", e))?;

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
async fn upload_audio(file_path: &str, auth_token: &str) -> Result<String, String> {
    let url = format!("{}/upload", TRANSCRIBE_YOUTUBE_URL);

    println!("Iniciando upload do arquivo: {}", file_path);

    // Cria um formulário multipart apenas com o arquivo
    println!("Criando formulário multipart...");
    let form = reqwest::multipart::Form::new()
        .file("file", file_path)
        .await
        .map_err(|e| format!("Failed to create form: {}", e))?;

    // Cria um cliente HTTP assíncrono
    let client = reqwest::Client::new();

    // Envia a requisição POST de forma assíncrona
    println!("Enviando requisição POST para {}", url);
    let response = client
        .post(url)
        .header("Authorization", format!("Bearer {}", auth_token))
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("Failed to upload file: {}", e))?;
    let response_status = response.status();
    println!("Requisição enviada, status: {}", response_status);

    // Verifica se o status é de sucesso
    if !response_status.is_success() {
        let error_text = response
            .text()
            .await
            .map_err(|e| format!("Failed to read error response: {}", e))?;
        return Err(format!(
            "Upload failed with status {}: {}",
            response_status, error_text
        ));
    }

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
async fn process_transcription(filename_id: &str, auth_token: &str) -> Result<String, String> {
    let url = format!(
        "{}/process-transcription/{}",
        TRANSCRIBE_YOUTUBE_URL, filename_id
    );

    println!(
        "Iniciando processamento de transcrição para filename_id: {}",
        filename_id
    );

    let client = reqwest::Client::new();

    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", auth_token))
        .send()
        .await
        .map_err(|e| format!("Failed to process transcription: {}", e))?;

    let result = response
        .text()
        .await
        .map_err(|e| format!("Failed to read status response: {}", e))?;
    println!("Result process transcription: {}", result);
    Ok(result)
}

#[command]
async fn take_transcription(filename_id: &str, auth_token: Option<&str>) -> Result<String, String> {
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
        // println!("Transcrição: {}", transcript);
        let json_body_new =
            serde_json::json!({"filename_id":filename_id,"transcript":transcript.to_string()});

        // println!("JSON Body New: {}", json_body_new.clone());

        // Escolhe a URL baseado na presença do token
        let new_url_chapters = match auth_token {
            Some(_) => format!("{}/generate-chapters-auth", CAPITU_LANGCHAIN_URL),
            None => format!("{}/generate-chapters", CAPITU_LANGCHAIN_URL),
        };

        println!("New URL Chapters: {}", new_url_chapters);

        let mut request = client.post(&new_url_chapters).json(&json_body_new);

        // Adiciona o header de autorização se o token estiver presente
        if let Some(token) = auth_token {
            request = request.header("Authorization", format!("Bearer {}", token));
        }

        let response = request
            .send()
            .await
            .map_err(|e| format!("Failed to generate chapters: {}", e))?;

        let result = response
            .json::<Value>()
            .await
            .map_err(|e| format!("Failed to parse generate chapters response: {}", e))?;
        // println!("Result Generate Chapters: {:?}", result.clone().to_string());

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
            // println!("Result Full Chapters: {:?}", result.clone());

            if let Some(task_result) = result.get("task_result") {
                if let Some(status) = task_result.get("result") {
                    if status.as_str().unwrap() == "pending" {
                        println!("Result is pending, waiting...");
                        sleep(Duration::from_secs(5)).await; // Espera 5 segundos antes de tentar novamente
                        continue;
                    } else if status == "timeout_get" {
                        println!("Result is timeout_get, waiting...");
                    } else {
                        let text = task_result.get("text");
                        if let Some(text) = text {
                            println!("Text: {:?}", text.as_str().unwrap());
                            return Ok(text.to_string());
                        } else {
                            println!("Text not found in response: {}", task_result.to_string());
                            return Err("Text not found in response.".into());
                        }
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
            process_transcription,
            start_server,
            get_audio_duration
        ])
        .setup(|app| {
            #[cfg(debug_assertions)] // only include this code on debug builds
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
                // window.close_devtools();
            }

            // #[cfg(any(target_os = "linux", target_os = "windows", windows))]
            let result = app.deep_link().register("capituai");
            if let Err(e) = result {
                println!("Error: {:?}", e);
            }
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
    use youtube_dl::download_yt_dlp;

    #[tokio::test]
    async fn test_download_yt_dlp() {
        let result = download_yt_dlp(".").await;
        assert!(result.is_ok(), "Failed to download yt-dlp: {:?}", result);
    }

    #[test]
    fn test_download_audio() {
        let url = format!("https://www.youtube.com/watch?v={}", VIDEO_ID);

        let video_id = url.split("v=").nth(1).unwrap_or("output");

        let result = YoutubeDl::new(url.clone())
            .extract_audio(true)
            .format("bestaudio")
            .extra_arg("-o")
            .extra_arg(&format!("{}.mp3", video_id))
            .extra_arg("--audio-format")
            .extra_arg("mp3")
            .download_to(OUTPUT_FOLDER)
            .map_err(|e| format!("Failed to download audio: {}", e));

        println!("Result: {:?}", result);

        match result {
            Ok(output) => println!("Output: {:?}", output),
            Err(e) => println!("Error: {:?}", e),
        }

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

        // let result = upload_audio(file_path.to_str().unwrap()).await;
        // assert!(result.is_ok(), "Upload failed: {:?}", result);

        // println!("Upload result: {:?}", result.unwrap());
    }

    #[tokio::test]
    async fn test_take_transcription() {
        let filename_id = VIDEO_ID; // Use o task_id retornado pelo upload

        let result = take_transcription(filename_id, None).await;
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

    #[test]
    fn test_extract_youtube_video_id() {
        // Testa diferentes formatos de URL do YouTube
        let test_cases = vec![
            // Formato padrão watch?v=
            (
                "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                Some("dQw4w9WgXcQ"),
            ),
            // Formato curto youtu.be
            ("https://youtu.be/dQw4w9WgXcQ", Some("dQw4w9WgXcQ")),
            // Formato de shorts
            (
                "https://youtube.com/shorts/dQw4w9WgXcQ",
                Some("dQw4w9WgXcQ"),
            ),
            // Com parâmetros adicionais
            (
                "https://www.youtube.com/watch?v=dQw4w9WgXcQ&feature=share",
                Some("dQw4w9WgXcQ"),
            ),
            // Com timestamp
            ("https://youtu.be/dQw4w9WgXcQ?t=123", Some("dQw4w9WgXcQ")),
            // URL inválida
            ("https://youtube.com/invalid", None),
            // String vazia
            ("", None),
            // ID muito curto
            ("https://youtu.be/abc123", None),
            // ID muito longo
            ("https://youtu.be/abc123456789", None),
        ];

        // Executa todos os casos de teste
        for (input, expected) in test_cases {
            let result = extract_youtube_video_id(input);
            assert_eq!(
                result.as_deref(),
                expected,
                "Falha ao extrair ID de '{}'. Esperado: {:?}, Obtido: {:?}",
                input,
                expected,
                result
            );
        }
    }

    #[test]
    fn test_get_audio_duration() {
        let file_path = format!("{}/kjMVWetJUXg.mp3", OUTPUT_FOLDER);

        // Testa a função get_audio_duration
        let result = get_audio_duration(&file_path);
        assert!(result.is_ok(), "Failed to get audio duration: {:?}", result);

        let duration = result.unwrap();
        println!(
            "Duração do áudio: {:.2} segundos ({:.2} minutos)",
            duration,
            duration / 60.0
        );

        // Verifica se a duração está dentro de um intervalo razoável (por exemplo, entre 1 segundo e 2 horas)
        assert!(duration > 1.0, "Duração muito curta: {}", duration);
    }
}
