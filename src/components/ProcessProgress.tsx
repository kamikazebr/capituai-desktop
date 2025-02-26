type ProcessProgressProps = {
  currentStep: string;
  progress: number;
  isVisible: boolean;
  error: { step: string; message: string } | null;
}

export function ProcessProgress({ currentStep, isVisible, error }: ProcessProgressProps) {
  if (!isVisible) return null;
  
  const steps = [
    { id: "download", label: "Download do áudio" },
    { id: "upload", label: "Upload para servidor" },
    { id: "transcription", label: "Geração da transcrição" },
    { id: "complete", label: "Processo concluído" }
  ];
  
  // Verificar se o passo atual indica um erro
  const isError = currentStep.endsWith("_error");
  // Se for erro, pegar o passo real sem o sufixo
  const realStep = isError ? currentStep.replace("_error", "") : currentStep;
  
  // Encontrar o índice do passo atual
  const currentIndex = steps.findIndex(step => step.id === realStep);
  
  return (
    <div className="process-progress">
      <h3>Progresso</h3>
      
      {error && (
        <div className="error-message">
          <p>Ocorreu um erro durante o processamento: {error.message}</p>
        </div>
      )}
      
      <div className="steps-container">
        {steps.map((step, index) => {
          // Determinar o estado do passo (concluído, atual, pendente, erro)
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isPending = index > currentIndex;
          const hasError = isError && isCurrent;
          
          return (
            <div 
              key={step.id} 
              className={`step ${isCompleted ? 'completed' : ''} 
                               ${isCurrent ? 'current' : ''} 
                               ${isPending ? 'pending' : ''} 
                               ${hasError ? 'error' : ''}`}
            >
              <div className="step-indicator">
                {isCompleted ? '✓' : hasError ? '❌' : index + 1}
              </div>
              <div className="step-label">{step.label}</div>
              {isCurrent && !hasError && (
                <div className="progress-container">
                  <div className="infinite-progress"></div>
                </div>
              )}
              {hasError && (
                <div className="retry-container">
                  <button className="retry-button">Tentar Novamente</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
} 