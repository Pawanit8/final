import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  CContainer,
  CFormInput,
  CButton,
  CAlert,
  CRow,
  CCol,
  CFormCheck,
  CCard,
  CCardBody,
  CCardHeader,
  CBadge,
  CProgress,
  CSpinner,
  CModal,
  CModalHeader,
  CModalTitle,
  CModalBody,
  CModalFooter,
} from "@coreui/react";
import { CIcon } from '@coreui/icons-react';
import { 
  cilLocationPin, 
  cilSpeedometer, 
  cilArrowThickRight, 
  cilVolumeHigh, 
  cilVolumeOff, 
  cilClock, 
  cilWarning,
  cilInfo,
  cilCheckCircle,
  cilTruck,
  cilArrowCircleBottom,
  cilArrowCircleTop,
  cilReload,
  cilMap,
  cilBell,
  cilBan
} from '@coreui/icons';
import axios from "axios";
import MapboxMap from "../../components/MapboxMap";
import Navbar from "./Navbar";
import Footer from "./Footer";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const API_URL = import.meta.env.VITE_API_URL;

const SearchBus = () => {
  // Initialize refs
  const stopsListRef = useRef(null);
  const mapRef = useRef(null);

  // State management
  const [busNumber, setBusNumber] = useState("");
  const [busInfo, setBusInfo] = useState(null);
  const [busLocation, setBusLocation] = useState(null);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(300);
  const [refreshInterval, setRefreshInterval] = useState(null);
  const [countdownInterval, setCountdownInterval] = useState(null);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [routePoints, setRoutePoints] = useState([]);
  const [nextStopIndex, setNextStopIndex] = useState(1);
  const [currentInstruction, setCurrentInstruction] = useState("");
  const [eta, setEta] = useState(null);
  const [distanceToNextStop, setDistanceToNextStop] = useState(0);
  const [passengerCount, setPassengerCount] = useState(0);
  const [weatherData, setWeatherData] = useState(null);
  const [delayInfo, setDelayInfo] = useState(null);
  const [currentStopIndex, setCurrentStopIndex] = useState(0);
  const [routeProgress, setRouteProgress] = useState(0);
  const [stopETAs, setStopETAs] = useState({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [busMarkerPosition, setBusMarkerPosition] = useState(null);
  const [interpolatedPosition, setInterpolatedPosition] = useState(null);
  const [lastUpdateTime, setLastUpdateTime] = useState(null);
  const [isPushSupported, setIsPushSupported] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [showPermissionRequest, setShowPermissionRequest] = useState(false);
  const [subscription, setSubscription] = useState(null);
  const [showDelayPopup, setShowDelayPopup] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [onBus, setOnBus] = useState(false);
  const [userCoordinates, setUserCoordinates] = useState([]);
  const [cellTowerLocation, setCellTowerLocation] = useState(null);
  const [watchId, setWatchId] = useState(null);
  const [manualTracking, setManualTracking] = useState(false);
  const [lastCellTowerUpdate, setLastCellTowerUpdate] = useState(null);


  // Helper functions
  const calculateDistance = useCallback((lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
  }, []);

  const formatTime = useCallback((minutes) => {
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hrs > 0 ? `${hrs}h ` : ''}${mins}m`;
  }, []);

  // Offline handling
  const checkOnlineStatus = useCallback(() => {
    const isOnline = navigator.onLine;
    setIsOffline(!isOnline);
    setManualTracking(!isOnline && onBus);
  }, [onBus]);

  // Calculate average speed
  const calculateAverageSpeed = useCallback((locations) => {
    if (locations.length < 2) return 0;
    const totalDistance = locations.slice(1).reduce((sum, loc, i) => 
      sum + calculateDistance(locations[i].latitude, locations[i].longitude, loc.latitude, loc.longitude),
      0
    );
    const totalTime = (locations[locations.length-1].timestamp - locations[0].timestamp) / 3600000;
    return totalTime > 0 ? totalDistance / totalTime : 0;
  }, [calculateDistance]);

  // Start tracking user's own position
  const startLocationTracking = () => {
    if (!busNumber || !busInfo) return;

    const successCallback = (position) => {
      const { latitude, longitude } = position.coords;
      setUserCoordinates([longitude, latitude]);
      
      // Update bus location based on user's position
      if (busInfo.route && busInfo.route.stops) {
        const nextStop = busInfo.route.stops[nextStopIndex];
        if (nextStop) {
          const distance = calculateDistance(latitude, longitude, nextStop.lat, nextStop.lng);
          setDistanceToNextStop(distance);
          
          // Calculate ETA based on distance and average speed
          const averageSpeed = 30; // km/h
          const etaInMinutes = (distance / averageSpeed) * 60;
          setEta(etaInMinutes);
        }
      }
    };

    const errorCallback = (error) => {
      console.error('Error getting location:', error);
      // If GPS fails, try using cell tower location
      if (error.code === error.PERMISSION_DENIED && cellTowerLocation) {
        setUserCoordinates([cellTowerLocation.longitude, cellTowerLocation.latitude]);
        if (busInfo.route && busInfo.route.stops) {
          const nextStop = busInfo.route.stops[nextStopIndex];
          if (nextStop) {
            const distance = calculateDistance(cellTowerLocation.latitude, cellTowerLocation.longitude, nextStop.lat, nextStop.lng);
            setDistanceToNextStop(distance);
            const averageSpeed = 30; // km/h
            const etaInMinutes = (distance / averageSpeed) * 60;
            setEta(etaInMinutes);
          }
        }
      }
    };

    const options = {
      enableHighAccuracy: true,
      timeout: 5000,
      maximumAge: 0
    };

    const watchId = navigator.geolocation.watchPosition(
      successCallback,
      errorCallback,
      options
    );
    setWatchId(watchId);
  };

  // Toggle manual tracking
  const toggleManualTracking = useCallback(() => {
    if (!isOffline) return;

    const newOnBusState = !onBus;
    setOnBus(newOnBusState);
    setManualTracking(newOnBusState);
    
    if (newOnBusState) {
      startLocationTracking();
      toast.info("Using your device location for bus tracking");
    } else {
      if (watchId) {
        navigator.geolocation.clearWatch(watchId);
      }
      setBusLocation(null);
      setUserCoordinates([]);
    }
  }, [isOffline, onBus, watchId, startLocationTracking]);

  const renderOfflineStatus = () => (
    <CAlert color="warning" className="mb-3">
      <div className="d-flex align-items-center justify-content-between">
        <div>
          <CIcon icon={cilSignalCellularOff} className="me-2" />
          Offline Mode - Using your device GPS for tracking
        </div>
        <CButton 
          color={onBus ? "danger" : "success"}
          size="sm"
          onClick={toggleManualTracking}
          disabled={!isOffline}
        >
          {onBus ? "Stop Tracking" : "I'm On This Bus"}
        </CButton>
      </div>
      {onBus && (
        <div className="mt-2 small">
          <CIcon icon={cilCheckCircle} className="me-1 text-success" />
          Tracking your position - {userCoordinates.length} updates received
        </div>
      )}
    </CAlert>
  );

  // Search bar functionality
  const handleSearch = useCallback(async () => {
    if (!busNumber.trim()) {
      setError("Please enter a bus number");
      toast.warning("Please enter a bus number");
      return;
    }
    
    setIsLoading(true);
    setError("");
    try {
      const res = await axios.get(`${API_URL}/searchBus/${busNumber}`);
      
      if (!res.data) {
        throw new Error("Empty response from server");
      }
  
      if (res.data.success) {
        const { data } = res.data;
  
        if (!data || !data.bus) {
          throw new Error("Invalid bus data format");
        }
  
        const { routeId, currentLocation, delayInfo } = data.bus;

        const points = [  
          { ...routeId.startLocation, type: 'start' },
          ...(routeId.stops || []).map(stop => ({ ...stop, type: 'stop' })),
          { ...routeId.endLocation, type: 'end' }
        ];
        
        setRoutePoints(points);
        setNextStopIndex(1);
        setDelayInfo(delayInfo || data.latestDelay);

        if (delayInfo?.isDelayed) {
          setShowDelayPopup(true);
        }
  
        setBusInfo({
          _id: data.bus._id,
          busNumber: data.bus.busNumber,
          capacity: data.bus.capacity,
          startLocation: routeId.startLocation,
          endLocation: routeId.endLocation,
          stops: routeId.stops,
          routeName: routeId.routeName,
          isReturnTrip: data.bus.isReturnTrip,
          status: data.bus.status,
          driverId: data.bus.driverId,
          duration: data?.bus?.latestDelay?.duration
        });
  
        if (currentLocation) {
          const locationData = {
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
            speed: currentLocation.speed,
            timestamp: currentLocation.timestamp
          };
          
          if (busLocation) {
            interpolatePosition(busLocation, locationData);
          }
          
          setBusLocation(locationData);
          setBusMarkerPosition(locationData);
          updateNextStopIndex(locationData, points);
          
          for (let i = 0; i < points.length - 1; i++) {
            const distance = calculateDistance(
              locationData.latitude,
              locationData.longitude,
              points[i].latitude,
              points[i].longitude
            );
            if (distance < 0.1) {
              setCurrentStopIndex(i);
              break;
            }
          }
        }
  
        setPassengerCount(Math.floor(Math.random() * data.bus.capacity));
        setLastUpdateTime(new Date());
        toast.success(`Successfully tracking bus ${data.bus.busNumber}`);
  
        if (pushEnabled && !subscription) {
          registerPushNotifications();
        }
      } else {
        setError(res.data.message || "Bus not found");
        toast.error(res.data.message || "Bus not found");
      }
    } catch (err) {
      console.error("Fetch error details:", {
        message: err.message,
        response: err.response,
        stack: err.stack
      });
      
      const errorMsg = err.response?.data?.message || 
                      err.message || 
                      "Error fetching bus details";
      
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setIsLoading(false);
    }
  }, [busNumber, pushEnabled, subscription]);

  // Render function for the search bar
  const renderSearchBar = () => (
    <div className="py-4 bg-primary text-white position-relative overflow-hidden"
      style={{
        clipPath: 'polygon(0 0, 100% 0, 100% 90%, 0 100%)',
        height: '300px'
      }}>
      <div className="position-absolute w-100 h-100" style={{
        background: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)',
        zIndex: 1
      }}></div>
      <CContainer className="position-relative" style={{ zIndex: 2 }}>
        <h2 className="mb-3 text-center">Track Your Bus</h2>
        <CRow className="justify-content-center">
          <CCol xs={12} md={8} lg={6}>
            <div className="d-flex gap-2">
              <CFormInput
                placeholder="Enter Bus Number (e.g., B101)"
                value={busNumber}
                onChange={(e) => setBusNumber(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                className="flex-grow-1"
              />
              <CButton 
                color="light" 
                onClick={handleSearch}
                className="text-primary"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <CSpinner size="sm" />
                    <span className="ms-2">Searching...</span>
                  </>
                ) : (
                  <>
                    <CIcon icon={cilReload} className="me-1" /> 
                    Track
                  </>
                )}
              </CButton>
            </div>
            {error && (
              <CAlert color="danger" className="mt-2 fade show">
                <CIcon icon={cilWarning} className="me-2" />
                {error}
              </CAlert>
            )}
          </CCol>
        </CRow>
      </CContainer>
    </div>
  );

  const getDelayDuration = () => {
    if (!delayInfo?.timestamp) return { delayText: "N/A", startTime: "N/A" };
  
    // Format the delay start time
    const delayStartTime = new Date(delayInfo.timestamp).toLocaleString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  
    // Calculate total delay duration if we have both estimated and scheduled times
    let delayHours = 0;
    let delayMins = 0;
    
    if (stopETAs[nextStopIndex]?.arrivalTime && routePoints[nextStopIndex]?.time) {
      try {
        // Parse scheduled time (assuming format "HH:MM AM/PM")
        const [timePart, period] = routePoints[nextStopIndex].time.split(' ');
        let [hours, minutes] = timePart.split(':').map(Number);
        
        // Convert to 24-hour format
        if (period === 'PM' && hours < 12) hours += 12;
        if (period === 'AM' && hours === 12) hours = 0;
        
        // Create scheduled date object
        const scheduledDate = new Date();
        scheduledDate.setHours(hours, minutes, 0, 0);
        
        // Calculate total delay in minutes
        const totalDelayMinutes = Math.round(
          (stopETAs[nextStopIndex].arrivalTime - scheduledDate) / (1000 * 60)
        );
        
        if (totalDelayMinutes > 0) {
          delayHours = Math.floor(totalDelayMinutes / 60);
          delayMins = totalDelayMinutes % 60;
        }
      } catch (e) {
        console.error("Error calculating delay:", e);
      }
    }
  
    return {
      delayText: delayHours > 0 || delayMins > 0 
        ? `Delayed by ${delayHours}h ${delayMins}m` 
        : "On time",
      startTime: delayStartTime
    };
  };

  const urlBase64ToUint8Array = (base64String) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const checkPushSupport = async () => {
    try {
      const supported = 'Notification' in window && 'serviceWorker' in navigator;
      setIsPushSupported(supported);
      
      if (supported) {
        const registration = await navigator.serviceWorker.ready;
        console.log("Service Worker registration:", registration);
        
        const sub = await registration.pushManager.getSubscription();
        console.log("Current subscription:", sub);
        
        if (sub) {
          setSubscription(sub);
          setPushEnabled(true);
        }
      }
    } catch (error) {
      console.error("Error checking push support:", error);
      toast.error("Error checking notification support");
    }
  };

  const registerPushNotifications = async () => {
    try {
      if (!('serviceWorker' in navigator)) {
        throw new Error('Service workers not supported');
      }

      const registration = await navigator.serviceWorker.register('/sw.js');
      
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        throw new Error('Permission not granted');
      }
      
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(import.meta.env.VITE_VAPID_PUBLIC_KEY)
      });
      
      const userId = localStorage.getItem('userId') || 'anonymous';
      
      await axios.post(`${API_URL}/subscribe`, { 
        subscription: sub,
        busNumber: busInfo?.busNumber,
        userId: userId
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      setSubscription(sub);
      setPushEnabled(true);
      toast.success('Push notifications enabled');
    } catch (error) {
      console.error('Push registration failed:', error);
      toast.error(`Failed to enable notifications: ${error.message}`);
    }
  };

  const unsubscribePush = async () => {
    try {
      if (subscription) {
        const user = JSON.parse(localStorage.getItem("user"));
        if (!user?._id) {
          toast.error("User not logged in");
          return;
        }
  
        console.log("Attempting to unsubscribe...");
        
        const response = await axios.post(`${API_URL}/unsubscribe`, { 
          endpoint: subscription.endpoint,
          busNumber: busInfo?.busNumber,
          userId: user._id
        }, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem("token")}`
          }
        });
  
        console.log("Unsubscribe response:", response);
        
        await subscription.unsubscribe();
        setPushEnabled(false);
        setSubscription(null);
        toast.success('Notifications disabled successfully!', {
          autoClose: 3000,
          position: toast.POSITION.TOP_CENTER
        });
      }
    } catch (error) {
      console.error("Unsubscribe error details:", error.response || error);
      toast.error(`Failed to disable notifications: ${error.message}`, {
        autoClose: 5000,
        position: toast.POSITION.TOP_CENTER
      });
    }
  };

  const enableNotifications = () => {
    if (!('Notification' in window)) {
      toast.error('Notifications not supported in your browser');
      return;
    }

    if (Notification.permission === 'granted') {
      registerPushNotifications();
    } else if (Notification.permission === 'denied') {
      toast.warning(
        'Notifications blocked. Please enable them in your browser settings.',
        { autoClose: 5000 }
      );
    } else {
      setShowPermissionRequest(true);
    }
  };

  const handlePermissionResponse = async (allow) => {
    setShowPermissionRequest(false);
    if (allow) {
      try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          await registerPushNotifications();
        } else {
          toast.info('Notifications permission denied');
        }
      } catch (error) {
        console.error('Permission request failed:', error);
        toast.error('Failed to request notification permission');
      }
    }
  };

  const calculateRouteProgress = useCallback(() => {
    if (!busLocation || routePoints.length === 0) return 0;
    
    let totalDistance = 0;
    let traveledDistance = 0;
    
    // Calculate total route distance
    for (let i = 1; i < routePoints.length; i++) {
      totalDistance += calculateDistance(
        routePoints[i-1].latitude,
        routePoints[i-1].longitude,
        routePoints[i].latitude,
        routePoints[i].longitude
      );
    }
    
    // Calculate distance traveled so far
    for (let i = 1; i <= currentStopIndex; i++) {
      traveledDistance += calculateDistance(
        routePoints[i-1].latitude,
        routePoints[i-1].longitude,
        routePoints[i].latitude,
        routePoints[i].longitude
      );
    }
    
    // Add distance from last stop to current location
    if (currentStopIndex < routePoints.length - 1) {
      traveledDistance += calculateDistance(
        routePoints[currentStopIndex].latitude,
        routePoints[currentStopIndex].longitude,
        busLocation.latitude,
        busLocation.longitude
      );
    }
    
    return Math.min(100, Math.round((traveledDistance / totalDistance) * 100));
  }, [busLocation, routePoints, currentStopIndex, calculateDistance]);

  const calculateETAs = useCallback(() => {
    if (!busLocation || !routePoints || routePoints.length === 0) return {};
  
    const currentTime = new Date();
    const etas = {};
    let cumulativeTime = 0;
    const avgSpeed = busLocation?.speed > 0 ? busLocation.speed : 30; // Default to 30 km/h if speed is 0
  
    for (let i = nextStopIndex; i < routePoints.length; i++) {
      const prevPoint = i === nextStopIndex ? 
        { latitude: busLocation.latitude, longitude: busLocation.longitude } : 
        routePoints[i - 1];
      
      const distance = calculateDistance(
        prevPoint.latitude,
        prevPoint.longitude,
        routePoints[i].latitude,
        routePoints[i].longitude
      );
      
      const timeInHours = distance / avgSpeed;
      cumulativeTime += timeInHours * 60;
      
      etas[i] = {
        minutes: Math.round(cumulativeTime),
        arrivalTime: new Date(currentTime.getTime() + cumulativeTime * 60000),
        distance: distance.toFixed(2)
      };
    }
  
    return etas;
  }, [busLocation, routePoints, nextStopIndex, calculateDistance]);

  const updateNextStopIndex = useCallback((location, points) => {
    if (!location || !points.length) return;
    
    for (let i = 1; i < points.length; i++) {
      const distance = calculateDistance(
        location.latitude,
        location.longitude,
        points[i].latitude,
        points[i].longitude
      );
      
      if (distance > 0.1) {
        setNextStopIndex(i);
        return;
      }
    }
    
    setNextStopIndex(points.length - 1);
  }, [calculateDistance]);

  const interpolatePosition = useCallback((prevPos, newPos, duration = 5000) => {
    if (!prevPos || !newPos) return;
    
    const startTime = Date.now();
    const endTime = startTime + duration;
    
    const animate = () => {
      const now = Date.now();
      const progress = Math.min(1, (now - startTime) / duration);
      
      if (progress >= 1) {
        setInterpolatedPosition(null);
        return;
      }
      
      const lat = prevPos.latitude + (newPos.latitude - prevPos.latitude) * progress;
      const lng = prevPos.longitude + (newPos.longitude - prevPos.longitude) * progress;
      
      setInterpolatedPosition({
        latitude: lat,
        longitude: lng,
        speed: newPos.speed,
        timestamp: newPos.timestamp
      });
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    animate();
  }, []);

  const fetchBusDetailsAndLocation = useCallback(async () => {
    if (isOffline && manualTracking) {
      // Use user's own location for offline tracking
      if (userCoordinates.length > 0) {
        const avgLocation = userCoordinates.reduce((acc, curr) => {
          acc.lat += curr[1];
          acc.lng += curr[0];
          return acc;
        }, { lat: 0, lng: 0 });

        const avgLat = avgLocation.lat / userCoordinates.length;
        const avgLng = avgLocation.lng / userCoordinates.length;

        setBusLocation({
          latitude: avgLat,
          longitude: avgLng,
          speed: calculateAverageSpeed(userCoordinates),
          timestamp: Date.now()
        });
      }
      return;
    }

    // Original online fetch logic
    setIsLoading(true);
    setError("");
    try {
      const res = await axios.get(`${API_URL}/searchBus/${busNumber}`);
      
      console.log("API Response:", res); // Debug log
      
      if (!res.data) {
        throw new Error("Empty response from server");
      }
  
      if (res.data.success) {
        const { data } = res.data;
  
        if (!data || !data.bus) {
          throw new Error("Invalid bus data format");
        }
  
        const { routeId, currentLocation, delayInfo } = data.bus;

        const points = [  
          { ...routeId.startLocation, type: 'start' },
          ...(routeId.stops || []).map(stop => ({ ...stop, type: 'stop' })),
          { ...routeId.endLocation, type: 'end' }
        ];
        
        setRoutePoints(points);
        setNextStopIndex(1);
        setDelayInfo(delayInfo || data.latestDelay);

        // Show delay popup if bus is delayed
        if (delayInfo?.isDelayed) {
          setShowDelayPopup(true);
        }
  
        setBusInfo({
          _id: data.bus._id,
          busNumber: data.bus.busNumber,
          capacity: data.bus.capacity,
          startLocation: routeId.startLocation,
          endLocation: routeId.endLocation,
          stops: routeId.stops,
          routeName: routeId.routeName,
          isReturnTrip: data.bus.isReturnTrip,
          status: data.bus.status,
          driverId: data.bus.driverId,
          duration: data?.bus?.latestDelay?.duration
        });
  
        if (currentLocation) {
          const locationData = {
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
            speed: currentLocation.speed,
            timestamp: currentLocation.timestamp
          };
          
          if (busLocation) {
            interpolatePosition(busLocation, locationData);
          }
          
          setBusLocation(locationData);
          setBusMarkerPosition(locationData);
          updateNextStopIndex(locationData, points);
          
          for (let i = 0; i < points.length - 1; i++) {
            const distance = calculateDistance(
              locationData.latitude,
              locationData.longitude,
              points[i].latitude,
              points[i].longitude
            );
            if (distance < 0.1) {
              setCurrentStopIndex(i);
              break;
            }
          }
        }
  
        setPassengerCount(Math.floor(Math.random() * data.bus.capacity));
        setLastUpdateTime(new Date());
        toast.success(`Successfully tracking bus ${data.bus.busNumber}`);
  
        if (pushEnabled && !subscription) {
          registerPushNotifications();
        }
      } else {
        setError(res.data.message || "Bus not found");
        toast.error(res.data.message || "Bus not found");
      }
    } catch (err) {
      console.error("Fetch error details:", {
        message: err.message,
        response: err.response,
        stack: err.stack
      });
      
      const errorMsg = err.response?.data?.message || 
                      err.message || 
                      "Error fetching bus details";
      
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setIsLoading(false);
    }
  }, [busNumber, updateNextStopIndex, calculateDistance, busLocation, interpolatePosition, pushEnabled, subscription, isOffline, manualTracking, calculateAverageSpeed]);

  const startAutoRefresh = useCallback(() => {
    clearInterval(refreshInterval);
    clearInterval(countdownInterval);

    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchBusDetailsAndLocation();
      setCountdown(300);
    }, 300000);

    const countdownTimer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    setRefreshInterval(interval);
    setCountdownInterval(countdownTimer);

    return () => {
      clearInterval(interval);
      clearInterval(countdownTimer);
    };
  }, [autoRefresh, fetchBusDetailsAndLocation]);

  const handleManualRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await fetchBusDetailsAndLocation();
    setCountdown(300);
    setIsRefreshing(false);
  }, [fetchBusDetailsAndLocation]);

  // Effects
  useEffect(() => {
    // Generate or retrieve a unique user ID
    if (!localStorage.getItem('userId')) {
      localStorage.setItem('userId', `anon-${Math.random().toString(36).substr(2, 9)}`);
    }

    checkPushSupport();
    checkOnlineStatus();

    return () => {
      clearInterval(refreshInterval);
      clearInterval(countdownInterval);
      window.removeEventListener('online', checkOnlineStatus);
      window.removeEventListener('offline', checkOnlineStatus);
      if (watchId) navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  useEffect(() => {
    if (isOffline && manualTracking) {
      const interval = setInterval(fetchBusDetailsAndLocation, 15000);
      return () => clearInterval(interval);
    }
  }, [isOffline, manualTracking, fetchBusDetailsAndLocation]);

  useEffect(() => {
    if (busLocation && routePoints.length > 0) {
      const etas = calculateETAs();
      setStopETAs(etas);
      setRouteProgress(calculateRouteProgress());
      
      if (etas[routePoints.length - 1]) {
        setEta(etas[routePoints.length - 1].minutes);
      }
    }
  }, [busLocation, routePoints, calculateETAs, calculateRouteProgress]);

  // Add null check for stopsListRef
  useEffect(() => {
    if (stopsListRef.current && currentStopIndex > 0) {
      const stopElement = stopsListRef.current.children[currentStopIndex];
      if (stopElement) {
        stopElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentStopIndex, stopsListRef]);

  const renderRouteStops = () => {
    return (
      <div className="route-progress-container">
        <div className="route-progress-line"></div>
        <div className="route-stops-list" ref={stopsListRef}>
          {routePoints.map((point, index) => (
            <div 
              key={index} 
              className={`route-stop ${index === currentStopIndex ? 'current' : ''} ${index < currentStopIndex ? 'passed' : ''}`}
            >
              <div className="stop-marker">
                {index === 0 && <CIcon icon={cilArrowCircleTop} className="text-success" />}
                {index === routePoints.length - 1 && <CIcon icon={cilArrowCircleBottom} className="text-danger" />}
                {index > 0 && index < routePoints.length - 1 && (
                  <div className={`stop-dot ${index === currentStopIndex ? 'current-dot' : ''}`}></div>
                )}
              </div>
              <div className="stop-details">
                <div className="stop-name">
                  <strong>{point.name}</strong>
                  {index === currentStopIndex && (
                    <CBadge color="success" className="ms-2">Current</CBadge>
                  )}
                </div>
                <div className="stop-time">
                  {point.time && (
                    <small>
                      <strong>Scheduled: </strong>{point.time}
                    </small>
                  )}
                  {stopETAs[index] && (
                    <>
                      {point.time && <br />}
                      <small>
                        <strong>Estimated: </strong>
                        {stopETAs[index].arrivalTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </small><br/>
                      <small>
                        <strong>reached in {stopETAs[index].minutes} min</strong>
                      </small>
                    </>
                  )}
                </div>
                {stopETAs[index]?.distance && (
                  <div className="stop-distance">
                    <small>
                      <strong>Distance: </strong>
                      {stopETAs[index].distance} km
                    </small>
                  </div>
                )}
              </div>
              {index < routePoints.length - 1 && (
                <div className="stop-connector"></div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderDelayInfo = () => {
    if (!delayInfo?.isDelayed) return null;
  
    const { delayText, startTime } = getDelayDuration();
  
    return (
      <CRow className="mt-2">
        <CCol>
          <CAlert color="warning" className="py-1 mb-0">
            <div className="d-flex flex-column">
              <div>
                <CIcon icon={cilWarning} className="me-2" />
                <strong>Bus Delay: {delayText}</strong>
              </div>
              <div className="mt-1">
                <small>Delay Started: {startTime}</small>
              </div>
              {delayInfo.reason && (
                <div className="mt-1">
                  <small><strong>Reason:</strong> {delayInfo.reason}</small>
                </div>
              )}
            </div>
          </CAlert>
        </CCol>
      </CRow>
    );
  };

  const renderBusInfoHeader = () => (
    <CRow className="mb-4">
      <CCol>
        <CCard className="shadow-sm border-0">
          <CCardBody className="bg-white rounded">
            <CRow className="align-items-center">
              <CCol md={4} className="border-end">
                <div className="d-flex align-items-center">
                  <CIcon icon={cilTruck} size="xl" className="text-primary me-3" />
                  <div>
                    <h4 className="mb-0">Bus {busInfo.busNumber}</h4>
                    <small className="text-muted">{busInfo.routeName}</small>
                    <div className="small text-muted">
                      Driver: {busInfo.driverId?.userId?.name || 'Not assigned'}
                    </div>
                  </div>
                </div>
              </CCol>
              <CCol md={4} className="border-end">
                <div className="d-flex flex-column">
                  <div>
                    <strong className="text-muted">Next Stop:</strong>
                    {routePoints[nextStopIndex]?.name || 'Terminus'}
                    {stopETAs[nextStopIndex] && (
                      <strong className="text-muted">
                        <br/>
                        Arrival to nextstop: {formatTime(stopETAs[nextStopIndex].minutes)}
                      </strong>
                    )}
                  </div>
                </div>
              </CCol>
              <CCol md={4}>
                <div className="d-flex flex-column">
                  <div className="d-flex justify-content-between mb-1">
                    <strong className="text-muted">Status</strong>
                    <CBadge color={busInfo.status === 'active' ? 'success' : 'warning'}>
                      {busInfo.status}
                    </CBadge>
                  </div>
                  <div className="d-flex justify-content-between">
                    <strong className="text-muted">Last Update</strong>
                    <small>
                      {lastUpdateTime?.toLocaleTimeString() || 'N/A'}
                    </small>
                  </div>
                </div>
              </CCol>
            </CRow>
            {renderDelayInfo()}
          </CCardBody>
        </CCard>
      </CCol>
    </CRow>
  );

  const renderNotificationControls = () => (
    <div className="mb-3">
      <h6 className="mb-2">
        <CIcon icon={cilBell} className="me-2" /> 
        Bus Notifications
      </h6>
      {isPushSupported ? (
        <CButton 
          color={pushEnabled ? "success" : "secondary"} 
          onClick={pushEnabled ? unsubscribePush : enableNotifications}
          className="w-100"
        >
          <CIcon icon={pushEnabled ? cilBell : cilBan} className="me-2" />
          {pushEnabled ? "Disable Notifications" : "Enable Notifications"}
        </CButton>
      ) : (
        <CAlert color="warning" className="p-2 mb-0">
          <CIcon icon={cilWarning} className="me-2" />
          Push notifications not supported in your browser
        </CAlert>
      )}
    </div>
  );

  const renderPermissionRequestModal = () => (
    <CModal 
      visible={showPermissionRequest} 
      onClose={() => setShowPermissionRequest(false)}
      alignment="center"
    >
      <CModalHeader closeButton>
        <CModalTitle>Enable Notifications?</CModalTitle>
      </CModalHeader>
      <CModalBody>
        <p>Get real-time updates about:</p>
        <ul>
          <li>Bus delays and schedule changes</li>
          <li>Estimated arrival times</li>
          <li>Important route updates</li>
        </ul>
      </CModalBody>
      <CModalFooter>
        <CButton 
          color="secondary" 
          onClick={() => handlePermissionResponse(false)}
        >
          Not Now
        </CButton>
        <CButton 
          color="primary" 
          onClick={() => handlePermissionResponse(true)}
        >
          Allow Notifications
        </CButton>
      </CModalFooter>
    </CModal>
  );

  const renderControlsCard = () => (
    <CCard className="shadow-sm">
      <CCardHeader className="bg-white">
        <h6 className="mb-0">
          <CIcon icon={cilInfo} className="me-2 text-primary" /> Controls
        </h6>
      </CCardHeader>
      <CCardBody>
        {renderNotificationControls()}
        <div className="d-flex flex-column gap-3">
          <CFormCheck
            label={
              <>
                <CIcon icon={voiceEnabled ? cilVolumeHigh : cilVolumeOff} className="me-2" />
                Voice Navigation {voiceEnabled ? '(ON)' : '(OFF)'}
              </>
            }
            checked={voiceEnabled}
            onChange={() => setVoiceEnabled(!voiceEnabled)}
          />
          <CFormCheck
            label={
              <>
                <CIcon icon={cilClock} className="me-2" />
                Auto Refresh {autoRefresh ? '(ON)' : '(OFF)'}
              </>
            }
            checked={autoRefresh}
            onChange={() => setAutoRefresh(!autoRefresh)}
          />
        </div>
      </CCardBody>
    </CCard>
  );

  const renderDelayPopup = () => {
    if (!showDelayPopup || !delayInfo?.isDelayed) return null;
  
    const { delayText, startTime } = getDelayDuration();
  
    return (
      <CModal 
        visible={showDelayPopup} 
        onClose={() => setShowDelayPopup(false)}
        alignment="center"
        backdrop="static"
      >
        <CModalHeader closeButton className="bg-warning">
          <CModalTitle>
            <CIcon icon={cilWarning} className="me-2" />
            Bus Delay Details
          </CModalTitle>
        </CModalHeader>
        <CModalBody>
          <div className="mb-3">
            <h5>Bus {busInfo?.busNumber} Delay Information</h5>
            <div className="delay-details">
              <p className="mb-1"><strong>Route:</strong> {busInfo?.routeName}</p>
              <p className="mb-1"><strong>Status:</strong> {delayText || busInfo?.duration}</p>
              <p className="mb-1"><strong>Delay Started:</strong> {startTime}</p>
              {delayInfo.reason && (
                <p className="mb-1"><strong>Reason:</strong> {delayInfo.reason}</p>
              )}
              <p className="mb-0">
                <strong>Last Location Update:</strong> {lastUpdateTime?.toLocaleTimeString() || 'N/A'}
              </p>
            </div>
          </div>
        </CModalBody>
        <CModalFooter>
          <CButton 
            color="secondary" 
            onClick={() => setShowDelayPopup(false)}
          >
            Close
          </CButton>
          <CButton 
            color="warning" 
            onClick={handleManualRefresh}
          >
            <CIcon icon={cilReload} className="me-2" />
            Refresh Status
          </CButton>
        </CModalFooter>
      </CModal>
    );
  };

 

  return (
    <div className="d-flex flex-column min-vh-100 bg-light">
      <Navbar />
      <ToastContainer 
        position="top-center"
        autoClose={5000}
        newestOnTop
        closeOnClick
        pauseOnFocusLoss
        draggable
        pauseOnHover
      />
      {renderSearchBar()}
      
      {isOffline && renderOfflineStatus()}
      
     

      <main className="flex-grow-1 py-4">
        <CContainer>
          {isLoading ? (
            <div className="text-center py-5">
              <CSpinner color="primary" size="lg" />
              <p className="mt-3">Locating bus {busNumber}...</p>
            </div>
          ) : busInfo ? (
            <>
              {renderBusInfoHeader()}

              <CRow>
                <CCol md={4}>
                  <CCard className="mb-4 shadow-sm">
                    <CCardHeader className="bg-white">
                      <h6 className="mb-0">
                        <CIcon icon={cilMap} className="me-2 text-primary" /> Route Progress ({routeProgress}%)
                      </h6>
                    </CCardHeader>
                    <CCardBody>
                      <CProgress className="mb-3" color="primary" value={routeProgress} />
                      {renderRouteStops()}
                    </CCardBody>
                  </CCard>

                  {weatherData && (
                    <CCard className="mb-4 shadow-sm">
                      <CCardHeader className="bg-white">
                        <h6 className="mb-0">
                          <CIcon icon={cilLocationPin} className="me-2 text-primary" />
                          Weather
                        </h6>
                      </CCardHeader>
                      <CCardBody>
                        <div className="d-flex justify-content-between">
                          <div>
                            <h5>{weatherData.main.temp}°C</h5>
                            <p className="mb-1">{weatherData.weather[0].description}</p>
                          </div>
                          <div className="text-end">
                            <p className="mb-1">Humidity: {weatherData.main.humidity}%</p>
                            <p className="mb-0">Wind: {weatherData.wind.speed} m/s</p>
                          </div>
                        </div>
                      </CCardBody>
                    </CCard>
                  )}

                  {renderControlsCard()}
                </CCol>

                <CCol md={8}>
                  <CCard className="h-100 shadow-sm">
                    <CCardHeader className="bg-white">
                      <div className="d-flex justify-content-between align-items-center">
                        <h6 className="mb-0">
                          <CIcon icon={cilMap} className="me-2 text-primary" /> Live Route Map
                        </h6>
                        <div>
                          <CBadge color="info" className="me-2">
                            {formatTime(countdown)}
                          </CBadge>
                          <CButton 
                            size="sm" 
                            color="outline-primary" 
                            onClick={handleManualRefresh}
                            disabled={isRefreshing}
                          >
                            <CIcon icon={cilReload} spin={isRefreshing} className="me-1" /> Refresh
                          </CButton>
                        </div>
                      </div>
                    </CCardHeader>
                    <CCardBody className="p-0" style={{ height: '600px' }}>
                      <MapboxMap
                        startLocation={busInfo?.startLocation}
                        endLocation={busInfo?.endLocation}
                        stops={busInfo?.stops}
                        busLocation={interpolatedPosition || busMarkerPosition}
                        enableVoice={voiceEnabled}
                        routePoints={routePoints}
                        nextStopIndex={nextStopIndex}
                        onInstructionChange={setCurrentInstruction}
                        onEtaChange={setEta}
                        onDistanceChange={setDistanceToNextStop}
                        busNumber={busInfo.busNumber}
                        passengerCount={passengerCount}
                        capacity={busInfo.capacity}
                        isReturnTrip={busInfo.isReturnTrip}
                        offlineMode={isOffline}
                        userLocation={busLocation}
                         userCoordinates={userCoordinates}
                        manualTracking={manualTracking}
                      />
                    </CCardBody>
                  </CCard>
                </CCol>
              </CRow>

              {currentInstruction && (
                <CRow className="mt-4">
                  <CCol>
                    <CCard className="shadow-sm border-info">
                      <CCardHeader className="bg-info text-white">
                        <h6 className="mb-0">
                          <CIcon icon={cilArrowThickRight} className="me-2" /> Navigation Instruction
                        </h6>
                      </CCardHeader>
                      <CCardBody>
                        <div className="d-flex align-items-center">
                          <CIcon icon={cilArrowThickRight} className="me-3 text-info" size="xl" />
                          <div>
                            <h5 className="mb-1">{currentInstruction}</h5>
                            {eta && (
                              <small className="text-muted">
                                Arriving in ~{formatTime(eta)} to {routePoints[routePoints.length - 1].name}
                              </small>
                            )}
                          </div>
                        </div>
                      </CCardBody>
                    </CCard>
                  </CCol>
                </CRow>
              )}
            </>
          ) : (
            <div className="text-center py-5">
              <CIcon icon={cilTruck} size="xl" className="text-primary mb-3" />
              <h3>Track Your Bus in Real-Time</h3>
              <p className="text-muted mb-4">
                Enter a bus number above to view its current location, route, and other details
              </p>
            </div>
          )}
        </CContainer>
      </main>

      {renderPermissionRequestModal()}
      {renderDelayPopup()}
      <Footer />

      <style jsx>{`
        .route-progress-container {
          position: relative;
          padding-left: 20px;
        }
        
        .route-progress-line {
          position: absolute;
          left: 9px;
          top: 0;
          bottom: 0;
          width: 2px;
          background-color: #007bff;
          z-index: 1;
        }
        
        .route-stops-list {
          position: relative;
          z-index: 2;
          max-height: 500px;
          overflow-y: auto;
          padding-right: 10px;
        }
        
        .route-stop {
          display: flex;
          flex-direction: column;
          margin-bottom: 15px;
          position: relative;
          transition: all 0.3s ease;
        }
        
        .stop-marker {
          position: absolute;
          left: -20px;
          width: 20px;
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 3;
        }
        
        .stop-dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background-color: #007bff;
          border: 2px solid white;
          transition: all 0.3s ease;
        }
        
        .stop-dot.current-dot {
          background-color: #28a745;
          transform: scale(1.3);
          box-shadow: 0 0 0 2px rgba(40, 167, 69, 0.5);
          animation: pulse 1.5s infinite;
        }
        
        .route-stop.passed .stop-dot {
          background-color: #6c757d;
        }
        
        .stop-details {
          margin-left: 10px;
          padding: 8px 12px;
          background-color: #f8f9fa;
          border-radius: 4px;
          border-left: 3px solid #007bff;
          transition: all 0.3s ease;
        }
        
        .route-stop.current .stop-details {
          background-color: #e2f0ff;
          border-left-color: #28a745;
          box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }
        
        .route-stop.passed .stop-details {
          background-color: #f8f9fa;
          border-left-color: #6c757d;
        }
        
        .stop-connector {
          height: 15px;
          width: 2px;
          background-color: #dee2e6;
          margin-left: 4px;
          transition: all 0.3s ease;
        }
        
        .route-stop:last-child .stop-connector {
          display: none;
        }
        
        .stop-name .badge {
          font-size: 12px;
        }
        
        .stop-distance {
          font-size: 12px;
          color: #6c757d;
          margin-top: 4px;
        }
        
        @keyframes pulse {
          0% {
            box-shadow: 0 0 0 0 rgba(40, 167, 69, 0.7);
          }
          70% {
            box-shadow: 0 0 0 10px rgba(40, 167, 69, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(40, 167, 69, 0);
          }
        }
      `}</style>
    </div>
  );
};

export default SearchBus;