import { useEffect, useState } from "react";
import { API_SERVICES } from "./YoutubeInput";

interface Service {
  name: string;
  url: string;
  status: "online" | "offline" | "checking";
}

// Função para verificar serviços que pode ser usada por outros componentes
export async function checkServices(services: { name: string; url: string }[]) {
  const results = await Promise.all(
    services.map(async (service) => {
      try {
        const response = await fetch(`${service.url}/docs?t=${Date.now()}`, {
          method: "GET",
          headers: { "Cache-Control": "no-cache" },
        });

        // Verifica se o status da resposta é 404
        if (response.status === 404) {
          return { ...service, status: "offline" as const };
        }

        const text = await response.text();

        // Verifica se a resposta contém a mensagem de erro específica
        if (text.includes("modal-http") || text.includes("app for invoked web endpoint is stopped")) {
          return { ...service, status: "offline" as const };
        }

        return { ...service, status: "online" as const };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes("modal-http")) {
          console.log(`Serviço ${service.name} fora do ar: ${errorMessage}`);
        }

        return { ...service, status: "offline" as const };
      }
    })
  );

  return results;
}

export function ServiceStatus() {
  const [services, setServices] = useState<Service[]>(API_SERVICES.map(service => ({
    ...service,
    status: "checking" as const
  })));

  const checkServiceStatus = async () => {
    const updatedServices = await checkServices(services);
    setServices(updatedServices);
  };

  useEffect(() => {
    checkServiceStatus();
    const interval = setInterval(checkServiceStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="service-status-compact">
      <div className="services-pills">
        {services.map((service) => (
          <div key={service.name} className={`service-pill ${service.status}`}>
            {service.name}
          </div>
        ))}
      </div>
      <button onClick={checkServiceStatus} className="refresh-btn-small" title="Atualizar status">
        ↻
      </button>
    </div>
  );
}