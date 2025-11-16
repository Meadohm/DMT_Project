import API_BASE_URL from "../config";

export async function updateSharePermission(shareId, data) {
  const res = await fetch(`${API_BASE_URL}/shares/${shareId}/update-permission/`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Token ${localStorage.getItem("token")}`,
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    throw new Error("Erreur API update permission");
  }
  return await res.json();
}
