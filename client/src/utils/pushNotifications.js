// src/utils/pushNotifications.js
export async function subscribeUserToPush(userId) {
    const registration = await navigator.serviceWorker.register('/sw.js');
  
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: import.meta.env.VITE_VAPID_PUBLIC_KEY
    });
  
    const res = await fetch(`${import.meta.env.VITE_API_URL}/notifications/subscribe`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId, subscription }),
    });
  
    if (!res.ok) {
      throw new Error('Failed to subscribe to push notifications');
    }
  }
  