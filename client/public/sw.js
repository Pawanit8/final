self.addEventListener('push', function(event) {
    let notificationData;
    
    try {
      notificationData = event.data.json();
    } catch (e) {
      notificationData = {
        title: 'Bus Alert',
        body: 'New notification',
        icon: '/icons/bus-icon.png',
        data: {
          url: '/'
        }
      };
    }
  
    event.waitUntil(
      self.registration.showNotification(notificationData.title, {
        body: notificationData.body,
        icon: notificationData.icon || '/icons/bus-icon.png',
        badge: '/icons/bus-badge.png',
        data: notificationData.data,
        vibrate: [200, 100, 200],
        actions: [
          { action: 'view-bus', title: 'View Bus' },
          { action: 'dismiss', title: 'Dismiss' }
        ]
      })
    );
  });
  
  self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    
    const urlToOpen = event.notification.data.url || '/';
    
    if (event.action === 'view-bus') {
      clients.openWindow(urlToOpen);
    } else {
      // Default behavior - open the app
      clients.openWindow('/');
    }
  });