//src/hooks/useNotifications.js
import { useEffect, useState } from "react";
import { listNotifications } from "../services/notificationService";

export default function useNotifications(interval = 10000) {
  const [notifications, setNotifications] = useState([]);

  const fetchNotifications = async () => {
    try {
      const data = await listNotifications();
      setNotifications(data);
    } catch (err) {
      console.error("❌ Erreur récupération notifications", err);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const timer = setInterval(fetchNotifications, interval);
    return () => clearInterval(timer);
  }, []);

  return { notifications, refresh: fetchNotifications, setNotifications };
}
