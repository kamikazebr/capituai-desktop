type TranscriptionDisplayProps = {
  transcription: string;
  onCopyToClipboard: () => void;
}

export function TranscriptionDisplay({ transcription, onCopyToClipboard }: TranscriptionDisplayProps) {
  if (!transcription) return null;
  
  return (
    <div className="transcription-container">
      <button onClick={onCopyToClipboard}>
        Copiar para Área de Transferência
      </button>
      
      <div style={{ textAlign: 'left' }}>
        {transcription.split('\n').map((value, index) => {
          return <div key={`${value}-${index}`}>{value}</div>;
        })}
      </div>
    </div>
  );
} 