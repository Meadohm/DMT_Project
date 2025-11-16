// src/utils/timeUtils.js
export function formatRelativeTime(dateString) {
  if (!dateString) return "";

  const serverDate = new Date(dateString);
  const localNow = new Date();

  const diffMs = localNow.getTime() - serverDate.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHrs = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHrs / 24);

  // 🩵 Ajustement : toute notification de moins de 90 secondes = “à l’instant”
  if (diffSec < 90) return "à l’instant";
  if (diffMin < 60) return `il y a ${diffMin} min`;
  if (diffHrs < 24) {
    const mins = diffMin % 60;
    return mins > 0 ? `il y a ${diffHrs} h ${mins} min` : `il y a ${diffHrs} h`;
  }

  if (diffDays === 1)
    return `hier à ${serverDate.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;

  return `${serverDate.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
  })} à ${serverDate.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}
