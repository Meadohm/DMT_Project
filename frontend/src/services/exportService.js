// exportService.js
import API_BASE_URL from "../config";

export const exportSubmissionsCSV = async () => {
  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE_URL}/exporter_soumissions_csv/`, {
      method: 'GET',
      headers: {
        Authorization: `Token ${token}`,
      },
    });
    if (!response.ok) {
      console.error("Erreur de réponse pour CSV:", response.status, response.statusText);
      throw new Error("Erreur lors de l'exportation CSV");
    }
    return response;
  } catch (error) {
    console.error("Erreur réseau ou serveur pour CSV:", error.message);
    throw error;
  }
};

export const exportSubmissionsPDF = async () => {
  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE_URL}/exporter_soumissions_pdf/`, {
      method: 'GET',
      headers: {
        Authorization: `Token ${token}`,
      },
    });
    if (!response.ok) {
      console.error("Erreur de réponse pour PDF:", response.status, response.statusText);
      throw new Error("Erreur lors de l'exportation PDF");
    }
    return response;
  } catch (error) {
    console.error("Erreur réseau ou serveur pour PDF:", error.message);
    throw error;
  }
};
