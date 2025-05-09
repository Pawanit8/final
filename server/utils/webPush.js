import webpush from 'web-push';
import dotenv from 'dotenv';
dotenv.config();

// Initialize web-push with VAPID keys
webpush.setVapidDetails(
  'mailto:transport@yourcollege.edu',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Store subscriptions (in production, use a database)
export const subscriptions = new Map();

// Function to send notification to a specific user
export async function sendPushToUser(userId, payload) {
  const subscription = subscriptions.get(userId);
  if (!subscription) {
    console.log('No subscription found for user:', userId);
    return false;
  }

  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return true;
  } catch (error) {
    console.error('Error sending notification:', error);
    if (error.statusCode === 410) {
      // Subscription expired - remove it
      subscriptions.delete(userId);
    }
    return false;
  }
}

// Function to send delay notification to all affected users
export async function sendDelayNotification(busId, delayInfo) {
  // In a real app, you would query which users are tracking this bus
  // For demo, we'll send to all subscribers
  
  const payload = {
    title: `Bus ${busId} Delay Alert`,
    body: `Bus is delayed by ${delayInfo.delayMinutes} minutes: ${delayInfo.reason}`,
    icon: '/icons/bus-icon.png',
    data: {
      url: `/bus-tracking/${busId}`,
      busId,
      timestamp: new Date().toISOString()
    }
  };

  const results = await Promise.all(
    Array.from(subscriptions.values()).map(sub => 
      webpush.sendNotification(sub, JSON.stringify(payload))
        .catch(err => {
          console.error('Notification failed:', err);
          return false;
        })
    )
  );

  return results.filter(Boolean).length;
}