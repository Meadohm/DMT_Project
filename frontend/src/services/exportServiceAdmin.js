// src/services/exportServiceAdmin.js

/**
 * Service d'exportation pour l'administrateur - Export CSV
 */
export const exportAdminSubmissionsCSV = async () => {
  try {
    const token = localStorage.getItem('token');
    const response = await fetch('http://192.168.1.189:8000/api/exporter_soumissions_csv/', {
      method: 'GET',
      headers: {
        Authorization: `Token ${token}`,
      },
    });
    
    if (!response.ok) {
      console.error("Erreur de réponse pour CSV:", response.status, response.statusText);
      throw new Error("Erreur lors de l'exportation CSV");
    }

    // Créer un blob pour permettre le téléchargement direct
    const csvText = await response.text();
    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = 'soumissions_validees_admin.csv';
    link.click();
    URL.revokeObjectURL(blobUrl);

  } catch (error) {
    console.error("Erreur réseau ou serveur pour CSV:", error.message);
    throw error;
  }
};

/**
 * Service d'exportation pour l'administrateur - Export PDF
 */
export const exportAdminSubmissionsPDF = async () => {
  try {
    const token = localStorage.getItem('token');
    const response = await fetch('http://192.168.1.189:8000/api/exporter_soumissions_pdf/', {
      method: 'GET',
      headers: {
        Authorization: `Token ${token}`,
      },
    });
    
    if (!response.ok) {
      console.error("Erreur de réponse pour PDF:", response.status, response.statusText);
      throw new Error("Erreur lors de l'exportation PDF");
    }

    // Créer un blob pour permettre le téléchargement direct
    const pdfBlob = await response.blob();
    const pdfUrl = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = pdfUrl;
    link.download = 'soumissions_validees_admin.pdf';
    link.click();
    URL.revokeObjectURL(pdfUrl);

  } catch (error) {
    console.error("Erreur réseau ou serveur pour PDF:", error.message);
    throw error;
  }
};
