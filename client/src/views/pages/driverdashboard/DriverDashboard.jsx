import React, { useEffect, useState, useRef, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { 
  CButton, 
  CCard, 
  CCardBody, 
  CCardHeader, 
  CRow, 
  CCol, 
  CToast, 
  CToastBody, 
  CToastHeader,
  CAlert,
  CListGroup,
  CListGroupItem,
  CBadge,
  CProgress,
  CSpinner,
  CForm,
  CFormInput,
  CFormSelect,
  CModal,
  CModalHeader,
  CModalTitle,
  CModalBody,
  CModalFooter,
  CTooltip,
  CToaster
} from "@coreui/react";
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
  cilGas
} from '@coreui/icons';
import CIcon from "@coreui/icons-react";
import Navbar from "./Navbar";
import "mapbox-gl/dist/mapbox-gl.css";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

// Constants
const API_URL = import.meta.env.VITE_API_URL;
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;
mapboxgl.accessToken = MAPBOX_TOKEN;

// Delay reasons for dropdown
const DELAY_REASONS = [
  { value: "Traffic congestion", label: "🚦 Traffic congestion" },
  { value: "Road accident", label: "🚨 Road accident" },
  { value: "Road construction", label: "🚧 Road construction" },
  { value: "Vehicle breakdown", label: "🔧 Vehicle breakdown" },
  { value: "Passenger delay", label: "👥 Passenger delay" },
  { value: "Weather conditions", label: "⛈️ Weather conditions" },
  { value: "Police activity", label: "👮 Police activity" },
  { value: "Medical emergency", label: "🚑 Medical emergency" },
  { value: "Mechanical issue", label: "⚙️ Mechanical issue" },
  { value: "Driver change", label: "👤 Driver change" },
  { value: "Schedule adjustment", label: "⏱️ Schedule adjustment" },
  { value: "Other", label: "❔ Other (specify below)" }
];

// Delay durations for dropdown
const DELAY_DURATIONS = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180];

// Map styles
const MAP_STYLES = [
  { id: "streets-v11", name: "Streets" },
  { id: "satellite-streets-v11", name: "Satellite" },
  { id: "outdoors-v11", name: "Outdoors" },
  { id: "light-v10", name: "Light" },
  { id: "dark-v10", name: "Dark" }
];

const DriverDashboard = () => {
  // Navigation and Refs
  const navigate = useNavigate();
  const mapContainerRef = useRef(null);
  const stopsListRef = useRef(null);
  const toasterRef = useRef(null);

  // Bus and Route State
  const [busDetails, setBusDetails] = useState(null);
  const [routePoints, setRoutePoints] = useState([]);
  const [isReturnTrip, setIsReturnTrip] = useState(false);
  const [currentStopIndex, setCurrentStopIndex] = useState(0);
  const [nextStopIndex, setNextStopIndex] = useState(1);
  const [stopETAs, setStopETAs] = useState({});
  const [routeProgress, setRouteProgress] = useState(0);
  const [stopsWithTimestamps, setStopsWithTimestamps] = useState([]);
  const [locationHistory, setLocationHistory] = useState([]);
  const [delayedBuses, setDelayedBuses] = useState([]);

  // Location Tracking State
  const [location, setLocation] = useState(null);
  const [speed, setSpeed] = useState(0);
  const [sharingStopped, setSharingStopped] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [locationAccuracy, setLocationAccuracy] = useState(null);

  // Map State
  const [map, setMap] = useState(null);
  const [busMarker, setBusMarker] = useState(null);
  const [mapStyle, setMapStyle] = useState(MAP_STYLES[0].id);
  const [fuelStations, setFuelStations] = useState([]);

  // UI State
  const [loading, setLoading] = useState(true);
  const [currentInstruction, setCurrentInstruction] = useState("");
  const [showToast, setShowToast] = useState(false);
  const [eta, setEta] = useState(null);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [showDelayModal, setShowDelayModal] = useState(false);
  const [delayReason, setDelayReason] = useState("");
  const [delayDuration, setDelayDuration] = useState(10);
  const [delayNotes, setDelayNotes] = useState("");
  const [isReportingDelay, setIsReportingDelay] = useState(false);
  const [showDelayedBuses, setShowDelayedBuses] = useState(false);
  const [showFuelStations, setShowFuelStations] = useState(false);
  const [isLoadingFuelStations, setIsLoadingFuelStations] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Notification State
  const [isPushSupported, setIsPushSupported] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState("default");

  // Refs for intervals and timeouts
  const locationIntervalRef = useRef(null);
  const speechSynthesisRef = useRef(window.speechSynthesis);
  const pauseTimeoutRef = useRef(null);

  // Helper Functions
  const getNextStop = useCallback((stops) => stops?.find(stop => stop.actualArrivalTime === null), []);

  const convertTimeToMinutes = useCallback((timeString) => {
    if (!timeString) return 0;
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
  }, []);

  const calculateDistance = useCallback((lat1, lon1, lat2, lon2) => {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }, []);

  const formatTime = useCallback((minutes) => {
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hrs > 0 ? `${hrs}h ` : ''}${mins}m`;
  }, []);

  // Calculate bus delay information
  const calculateBusDelay = useCallback(() => {
    if (!busDetails?.routeId?.stops || !busDetails.currentLocation) {
      return {
        isDelayed: false,
        delayMinutes: 0,
        reason: "No data available",
        nextStop: "Unknown",
        alreadyNotified: false
      };
    }

    const now = new Date();
    const currentLocationTime = new Date(busDetails.currentLocation.timestamp);
    const timeSinceLastUpdate = (now - currentLocationTime) / (1000 * 60);

    // Check if bus has stopped moving
    if (busDetails.currentLocation.speed === 0 && timeSinceLastUpdate > 5) {
      return {
        isDelayed: true,
        delayMinutes: Math.round(timeSinceLastUpdate),
        reason: "Bus has stopped moving",
        nextStop: getNextStop(busDetails.routeId.stops)?.name || "Unknown",
        alreadyNotified: busDetails.delay?.isNotified || false
      };
    }

    // Check each stop for delays
    for (const stop of busDetails.routeId.stops) {
      if (stop.actualArrivalTime !== null) {
        const scheduledTime = convertTimeToMinutes(stop.time);
        const actualTime = convertTimeToMinutes(stop.actualArrivalTime);
        const delay = actualTime - scheduledTime;

        if (delay > 0) {
          return {
            isDelayed: true,
            delayMinutes: delay,
            reason: `Delayed at ${stop.name}`,
            nextStop: getNextStop(busDetails.routeId.stops)?.name || "Unknown",
            alreadyNotified: busDetails.delay?.isNotified || false
          };
        }
      } else {
        const scheduledArrival = convertTimeToMinutes(stop.time);
        const currentTimeMinutes = now.getHours() * 60 + now.getMinutes();
        
        const stopIndex = routePoints.findIndex(p => p._id === stop._id);
        const stopETA = stopETAs[stopIndex];
        
        if (stopETA) {
          const estimatedArrivalMinutes = stopETA.arrivalTime.getHours() * 60 + stopETA.arrivalTime.getMinutes();
          
          if (estimatedArrivalMinutes > scheduledArrival) {
            const delay = estimatedArrivalMinutes - scheduledArrival;
            return {
              isDelayed: true,
              delayMinutes: delay,
              reason: `Expected delay at ${stop.name}`,
              nextStop: stop.name,
              alreadyNotified: busDetails.delay?.isNotified || false
            };
          }
        } else if (currentTimeMinutes > scheduledArrival) {
          return {
            isDelayed: true,
            delayMinutes: currentTimeMinutes - scheduledArrival,
            reason: `Expected delay at ${stop.name}`,
            nextStop: stop.name,
            alreadyNotified: busDetails.delay?.isNotified || false
          };
        }
        break;
      }
    }

    return {
      isDelayed: false,
      delayMinutes: 0,
      reason: "On schedule",
      nextStop: getNextStop(busDetails.routeId.stops)?.name || "Unknown",
      alreadyNotified: false
    };
  }, [busDetails, routePoints, stopETAs, convertTimeToMinutes, getNextStop]);

  const delayInfo = calculateBusDelay();

  // API Functions
  const fetchBusDetails = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      if (!token) {
        toast.error("Session expired. Please log in again.");
        navigate("/");
        return;
      }

      const response = await axios.get(`${API_URL}/driver/bus`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setBusDetails(response.data);
      setLoading(false);
      return response.data;
    } catch (error) {
      console.error("Error fetching bus details:", error);
      toast.error("Failed to fetch bus details");
      setLoading(false);
      throw error;
    }
  }, [navigate]);

  const handleStopArrival = useCallback(async (stopIndex) => {
    try {
      const token = localStorage.getItem("token");
      if (!token || !busDetails?._id) return;

      const currentStop = routePoints[stopIndex];
      const now = new Date();
      
      await axios.post(
        `${API_URL}/update-stop-timestamp`,
        { 
          busId: busDetails._id,
          stopId: currentStop._id,
          leaveTimestamp: now.toISOString(),
          isReturnTrip
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setStopsWithTimestamps(prev => [
        ...prev,
        {
          stopId: currentStop._id,
          leaveTimestamp: now.toISOString()
        }
      ]);

      toast.success(`Left ${currentStop.name} at ${now.toLocaleTimeString()}`);
    } catch (error) {
      console.error("Error updating leave timestamp:", error);
      toast.error("Failed to update departure time");
    }
  }, [busDetails, isReturnTrip, routePoints]);

  const refreshData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const busData = await fetchBusDetails();
      if (busData) {
        await Promise.all([
          fetchDelayedBuses(),
          fetchLocationHistory(busData._id)
        ]);
      }
      toast.success("Data refreshed successfully");
    } catch (error) {
      console.error("Error refreshing data:", error);
      toast.error("Failed to refresh data");
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchBusDetails]);

  const fetchLocationHistory = useCallback(async (busId) => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API_URL}/buses/${busId}/tracking/history`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { limit: 10 }
      });
      setLocationHistory(response.data);
    } catch (error) {
      console.error("Error fetching location history:", error);
    }
  }, []);

  const fetchDelayedBuses = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API_URL}/buses/delays`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { routeId: busDetails?.routeId?._id }
      });
      setDelayedBuses(response.data);
    } catch (error) {
      console.error("Error fetching delayed buses:", error);
      toast.error(error.response?.data?.message || "Failed to fetch delayed buses");
    }
  }, [busDetails]);

  const reportDelay = useCallback(async () => {
    try {
      setIsReportingDelay(true);
      const token = localStorage.getItem("token");
      if (!token || !busDetails?._id) return;

      const response = await axios.post(
        `${API_URL}/buses/report-delay`,
        {
          busId: busDetails._id,
          reason: delayReason || delayInfo.reason,
          duration: delayDuration || delayInfo.delayMinutes,
          notes: delayNotes
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.success) {
        toast.success("Delay reported successfully");
        
        await axios.post(
          `${API_URL}/buses/${busDetails._id}/delay-notification`,
          {
            delayMinutes: delayDuration || delayInfo.delayMinutes,
            reason: delayReason || delayInfo.reason,
            nextStop: delayInfo.nextStop
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        setShowDelayModal(false);
        setDelayReason("");
        setDelayDuration(10);
        setDelayNotes("");
        await fetchBusDetails();
      }
    } catch (error) {
      console.error("Error reporting delay:", error);
      toast.error("Failed to report delay");
    } finally {
      setIsReportingDelay(false);
    }
  }, [busDetails, delayDuration, delayInfo, delayNotes, delayReason, fetchBusDetails]);

  const resolveDelay = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token || !busDetails?._id) return;

      const response = await axios.post(
        `${API_URL}/buses/delay/resolve`,
        { 
          busId: busDetails._id,
          resolve: true
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.success) {
        toast.success("Delay resolved successfully");
        await fetchBusDetails();
      }
    } catch (error) {
      console.error("Error resolving delay:", error);
      toast.error("Failed to resolve delay");
    }
  }, [busDetails, fetchBusDetails]);

  // Map Functions
  const initializeMap = useCallback((points) => {
    if (!points || points.length === 0 || !mapContainerRef.current) return;

    // Clean up existing map
    if (map) {
      map.remove();
      setMap(null);
    }

    const mapInstance = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: `mapbox://styles/mapbox/${mapStyle}`,
      center: [points[0].longitude, points[0].latitude],
      zoom: 14,
      attributionControl: false
    });

    // Add navigation control
    mapInstance.addControl(new mapboxgl.NavigationControl(), 'top-right');

    mapInstance.on("load", async () => {
      // Add route markers
      points.forEach((point, index) => {
        const markerColor = point.type === 'start' ? 'green' : 
                          point.type === 'end' ? 'red' : 'blue';

        new mapboxgl.Marker({ color: markerColor })
          .setLngLat([point.longitude, point.latitude])
          .setPopup(new mapboxgl.Popup().setHTML(`
            <strong>${point.name}</strong>
            <p>${point.type.toUpperCase()} ${point.type === 'stop' ? index : ''}</p>
            ${point.time ? `<p>Scheduled: ${point.time}</p>` : ''}
          `))
          .addTo(mapInstance);
      });

      // Draw route line if we have multiple points
      if (points.length > 1) {
        try {
          const coordinates = points.map(point => [point.longitude, point.latitude]);
          const response = await axios.get(
            `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coordinates.map(c => c.join(",")).join(";")}?geometries=geojson&access_token=${MAPBOX_TOKEN}`
          );
          
          const routeData = response.data.routes[0].geometry;

          mapInstance.addSource("route", {
            type: "geojson",
            data: {
              type: "Feature",
              geometry: routeData,
            },
          });

          mapInstance.addLayer({
            id: "route-line",
            type: "line",
            source: "route",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: {
              "line-color": isReturnTrip ? "#ff9900" : "#007bff",
              "line-width": 4,
            },
          });
        } catch (error) {
          console.error("Error drawing route:", error);
        }
      }

      setMap(mapInstance);
    });

    return () => {
      if (mapInstance) {
        mapInstance.remove();
      }
    };
  }, [mapStyle, isReturnTrip]);

  const updateNavigationPath = useCallback(async () => {
    if (!map || !location || nextStopIndex >= routePoints.length) return;

    const nextStop = routePoints[nextStopIndex];
    
    try {
      const response = await axios.get(
        `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${location.longitude},${location.latitude};${nextStop.longitude},${nextStop.latitude}?geometries=geojson&steps=true&access_token=${MAPBOX_TOKEN}`
      );
      
      const routeData = response.data.routes[0];
      const currentLeg = routeData.legs[0];
      const currentStep = currentLeg.steps[0];

      // Remove existing navigation route if it exists
      if (map.getSource('navigation-route')) {
        map.removeLayer('navigation-route-line');
        map.removeSource('navigation-route');
      }

      // Add new navigation route
      map.addSource('navigation-route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: routeData.geometry
        }
      });

      map.addLayer({
        id: 'navigation-route-line',
        type: 'line',
        source: 'navigation-route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#ff0000',
          'line-width': 3,
          'line-dasharray': [2, 2]
        }
      });

      const instruction = currentStep.maneuver.instruction;
      setCurrentInstruction(instruction);
      setShowToast(true);
      setEta(Math.round(currentLeg.duration / 60));

      if (voiceEnabled) {
        speakInstruction(instruction);
      }

      // Check for potential delays
      const delayInfo = calculateBusDelay();
      if (delayInfo.isDelayed && delayInfo.delayMinutes > 5 && !delayInfo.alreadyNotified) {
        toast.warning(`Potential delay detected: ${delayInfo.reason} (${formatTime(delayInfo.delayMinutes)})`);
      }

    } catch (error) {
      console.error("Error updating navigation path:", error);
    }
  }, [map, location, nextStopIndex, routePoints, voiceEnabled, calculateBusDelay, formatTime]);

  // Location Functions
  const startLocationSharing = useCallback(() => {
    if (navigator.geolocation) {
      // Get initial position
      navigator.geolocation.getCurrentPosition(
        handlePositionUpdate,
        handlePositionError,
        { enableHighAccuracy: true }
      );
      
      // Set up interval for continuous updates
      locationIntervalRef.current = setInterval(() => {
        navigator.geolocation.getCurrentPosition(
          handlePositionUpdate,
          handlePositionError,
          { enableHighAccuracy: true }
        );
      }, isPaused ? 60000 : 30000); // Update every 30s (or 60s if paused)

      setSharingStopped(false);
      toast.success("Location sharing started");
    } else {
      toast.warning("Geolocation not supported by your browser");
    }
  }, [isPaused]);

  const stopLocationSharing = useCallback(() => {
    if (locationIntervalRef.current) {
      clearInterval(locationIntervalRef.current);
      locationIntervalRef.current = null;
    }
    setSharingStopped(true);
    toast.info("Location sharing stopped");
  }, []);

  const handlePositionUpdate = useCallback(async (position) => {
    const { latitude, longitude, speed: currentSpeed, accuracy } = position.coords;
    setLocation({ latitude, longitude, timestamp: new Date().toISOString() });
    setSpeed(currentSpeed ? (currentSpeed * 3.6) : 0);
    setLocationAccuracy(accuracy);

    try {
      const token = localStorage.getItem("token");
      if (!token || !busDetails?._id) return;

      // Check if we've arrived at the next stop
      if (nextStopIndex < routePoints.length) {
        const nextStop = routePoints[nextStopIndex];
        const distanceToStop = calculateDistance(
          latitude,
          longitude,
          nextStop.latitude,
          nextStop.longitude
        );

        if (distanceToStop < 0.1) { // 100 meters threshold
          await handleStopArrival(nextStopIndex);
          setCurrentStopIndex(nextStopIndex);
          
          if (nextStopIndex === routePoints.length - 1) {
            handleRouteCompletion();
          } else {
            setNextStopIndex(nextStopIndex + 1);
            const arrivalMessage = `Arrived at ${nextStop.name}`;
            toast.info(arrivalMessage);
            if (voiceEnabled) speakInstruction(arrivalMessage);
          }
        }
      }

      // Update location in backend
      await axios.post(
        `${API_URL}/update-location`,
        { 
          latitude, 
          longitude, 
          speed: currentSpeed ? (currentSpeed * 3.6) : 0,
          busId: busDetails._id,
          isReturnTrip,
          currentStopIndex,
          accuracy
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Check for delays and notify if necessary
      const delayInfo = calculateBusDelay();
      if (delayInfo.isDelayed && delayInfo.delayMinutes > 5 && !delayInfo.alreadyNotified) {
        try {
          await axios.post(
            `${API_URL}/buses/${busDetails._id}/delay-notification`,
            {
              delayMinutes: delayInfo.delayMinutes,
              reason: delayInfo.reason,
              nextStop: delayInfo.nextStop
            },
            { headers: { Authorization: `Bearer ${token}` } }
          );
          toast.warning(`Delay notification sent to passengers`);
        } catch (error) {
          console.error("Error sending delay notification:", error);
        }
      }

      // Update bus marker on map
      if (map) {
        if (!busMarker) {
          const markerEl = document.createElement("div");
          markerEl.innerHTML = "🚍";
          markerEl.style.fontSize = "24px";
          markerEl.className = "bus-marker";

          const newMarker = new mapboxgl.Marker({ element: markerEl })
            .setLngLat([longitude, latitude])
            .setPopup(new mapboxgl.Popup().setHTML(`
              <strong>Your Bus</strong>
              <div>Speed: ${(currentSpeed * 3.6).toFixed(1)} km/h</div>
              <div>Accuracy: ${Math.round(accuracy)} meters</div>
            `))
            .addTo(map);
          setBusMarker(newMarker);
        } else {
          busMarker.setLngLat([longitude, latitude]);
        }

        // Smoothly move the map to follow the bus
        map.flyTo({
          center: [longitude, latitude],
          zoom: 14,
          speed: 0.5,
          curve: 1,
          easing: (t) => t
        });
      }

    } catch (error) {
      console.error("Error sharing location:", error);
      toast.error("Failed to update location");
    }
  }, [busDetails, busMarker, calculateBusDelay, calculateDistance, handleStopArrival, isReturnTrip, map, nextStopIndex, routePoints, voiceEnabled]);

  const handlePositionError = useCallback((error) => {
    console.error("Geolocation error:", error);
    let errorMessage = "Error getting location: ";
    
    switch(error.code) {
      case error.PERMISSION_DENIED:
        errorMessage += "Location permission denied";
        break;
      case error.POSITION_UNAVAILABLE:
        errorMessage += "Location information unavailable";
        break;
      case error.TIMEOUT:
        errorMessage += "Location request timed out";
        break;
      default:
        errorMessage += "Unknown error";
    }
    
    toast.error(errorMessage);
    
    // If we have a persistent error, stop sharing
    if (locationIntervalRef.current) {
      stopLocationSharing();
    }
  }, [stopLocationSharing]);

  // Other Functions
  const calculateETAs = useCallback(() => {
    if (!location || !routePoints || routePoints.length === 0) return {};
  
    const currentTime = new Date();
    const etas = {};
    let cumulativeTime = 0;
    
    for (let i = nextStopIndex; i < routePoints.length; i++) {
      const prevPoint = i === nextStopIndex ? 
        { latitude: location.latitude, longitude: location.longitude } : 
        routePoints[i - 1];
      
      const distance = calculateDistance(
        prevPoint.latitude,
        prevPoint.longitude,
        routePoints[i].latitude,
        routePoints[i].longitude
      );
      
      // Use current speed if available, otherwise assume 30 km/h average
      const avgSpeed = speed > 0 ? speed : 30;
      const timeInHours = distance / avgSpeed;
      cumulativeTime += timeInHours * 60;
      
      etas[i] = {
        minutes: Math.round(cumulativeTime),
        arrivalTime: new Date(currentTime.getTime() + cumulativeTime * 60000),
        distance: distance.toFixed(2)
      };
    }
  
    return etas;
  }, [location, routePoints, speed, nextStopIndex, calculateDistance]);

  const calculateRouteProgress = useCallback(() => {
    if (!location || routePoints.length === 0) return 0;
    
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
    
    // Calculate distance traveled up to current stop
    for (let i = 1; i <= currentStopIndex; i++) {
      traveledDistance += calculateDistance(
        routePoints[i-1].latitude,
        routePoints[i-1].longitude,
        routePoints[i].latitude,
        routePoints[i].longitude
      );
    }
    
    // Add distance from current stop to current location
    if (currentStopIndex < routePoints.length - 1) {
      traveledDistance += calculateDistance(
        routePoints[currentStopIndex].latitude,
        routePoints[currentStopIndex].longitude,
        location.latitude,
        location.longitude
      );
    }
    
    return Math.min(100, Math.round((traveledDistance / totalDistance) * 100));
  }, [location, routePoints, currentStopIndex, calculateDistance]);

  const handleRouteCompletion = useCallback(() => {
    if (isReturnTrip) {
      const completionMessage = "Route completed! End of service.";
      toast.info(completionMessage);
      if (voiceEnabled) speakInstruction(completionMessage);
      stopLocationSharing();
    } else {
      setIsPaused(true);
      const pauseMessage = "Reached destination! Preparing return trip in 30 seconds...";
      toast.info(pauseMessage);
      if (voiceEnabled) speakInstruction(pauseMessage);
      
      pauseTimeoutRef.current = setTimeout(() => {
        setIsReturnTrip(true);
        setIsPaused(false);
        const startMessage = "Starting return trip now!";
        toast.info(startMessage);
        if (voiceEnabled) speakInstruction(startMessage);
      }, 30000);
    }
  }, [isReturnTrip, stopLocationSharing, voiceEnabled]);

  const speakInstruction = useCallback((text) => {
    if (speechSynthesisRef.current && voiceEnabled) {
      // Cancel any ongoing speech
      speechSynthesisRef.current.cancel();
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      utterance.pitch = 1.2;
      utterance.volume = 1;
      speechSynthesisRef.current.speak(utterance);
    }
  }, [voiceEnabled]);

  const toggleVoiceAssistant = useCallback(() => {
    const newVoiceEnabled = !voiceEnabled;
    setVoiceEnabled(newVoiceEnabled);
    
    if (newVoiceEnabled && currentInstruction) {
      speakInstruction(currentInstruction);
    }
    
    toast.info(`Voice assistant ${newVoiceEnabled ? 'enabled' : 'disabled'}`);
  }, [voiceEnabled, currentInstruction, speakInstruction]);

  const toggleMapStyle = useCallback(() => {
    const currentIndex = MAP_STYLES.findIndex(style => style.id === mapStyle);
    const nextIndex = (currentIndex + 1) % MAP_STYLES.length;
    const newStyle = MAP_STYLES[nextIndex].id;
    
    setMapStyle(newStyle);
    if (map) {
      map.setStyle(`mapbox://styles/mapbox/${newStyle}`);
    }
    
    toast.info(`Map style changed to ${MAP_STYLES[nextIndex].name}`);
  }, [map, mapStyle]);

  const findNearbyFuelStations = useCallback(async () => {
    try {
      setIsLoadingFuelStations(true);
      setShowFuelStations(true);
      
      if (!location) {
        toast.warning("Waiting for current location...");
        return;
      }

      // Try different search terms - "petrol pump" works better in India than "fuel"
      const response = await axios.get(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/petrol%20pump.json`,
        {
          params: {
            proximity: `${location.longitude},${location.latitude}`,
            access_token: MAPBOX_TOKEN,
            limit: 10,
            country: 'in',
            types: 'poi',
            radius: 10000 // 10km radius
          }
        }
      );
  
      if (response.data.features.length === 0) {
        toast.warning("No petrol pumps found nearby. Trying broader search...");
        return await findFallbackFuelStations();
      }
  
      const stations = response.data.features.map(feature => ({
        id: feature.id,
        name: feature.text || feature.properties.address || "Petrol Pump",
        coordinates: feature.center,
        address: feature.place_name
      }));
  
      setFuelStations(stations);
      addFuelStationsToMap(stations);
      toast.success(`Found ${stations.length} nearby petrol pumps`);
    } catch (error) {
      console.error("Error finding petrol pumps:", error);
      toast.error("Failed to find petrol pumps. Please try again later.");
    } finally {
      setIsLoadingFuelStations(false);
    }
  }, [location]);

  const findFallbackFuelStations = useCallback(async () => {
    try {
      const response = await axios.get(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/petrol.json`,
        {
          params: {
            proximity: `${location.longitude},${location.latitude}`,
            access_token: MAPBOX_TOKEN,
            limit: 5,
            country: 'in'
          }
        }
      );
  
      const stations = response.data.features.map(feature => ({
        id: feature.id,
        name: feature.text || "Fuel Station",
        coordinates: feature.center,
        address: feature.place_name
      }));
  
      setFuelStations(stations);
      addFuelStationsToMap(stations);
      toast.info(`Found ${stations.length} fuel stations nearby`);
    } catch (error) {
      console.error("Fallback search failed:", error);
      toast.warning("Could not find fuel stations. Please check your internet connection.");
    }
  }, [location]);

  const addFuelStationsToMap = useCallback((stations) => {
    if (!map) return;

    // Clear existing fuel stations
    if (map.getLayer('fuel-stations')) {
      map.removeLayer('fuel-stations');
      map.removeSource('fuel-stations');
    }

    // Add new source and layer
    map.addSource('fuel-stations', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: stations.map(station => ({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: station.coordinates
          },
          properties: {
            title: station.name,
            description: station.address,
            id: station.id
          }
        }))
      }
    });

    map.addLayer({
      id: 'fuel-stations',
      type: 'circle',
      source: 'fuel-stations',
      paint: {
        'circle-radius': 8,
        'circle-color': '#FFA500',
        'circle-stroke-width': 2,
        'circle-stroke-color': '#FFF'
      }
    });

    // Add interactivity
    map.on('click', 'fuel-stations', (e) => {
      const coordinates = e.features[0].geometry.coordinates.slice();
      const description = e.features[0].properties.description;

      // Ensure the popup appears in the correct place
      while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
        coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
      }

      new mapboxgl.Popup()
        .setLngLat(coordinates)
        .setHTML(`
          <h6>${e.features[0].properties.title}</h6>
          <p>${description}</p>
          <small>${calculateDistance(
            location.latitude,
            location.longitude,
            coordinates[1],
            coordinates[0]
          ).toFixed(2)} km away</small>
        `)
        .addTo(map);
    });

    map.on('mouseenter', 'fuel-stations', () => {
      map.getCanvas().style.cursor = 'pointer';
    });

    map.on('mouseleave', 'fuel-stations', () => {
      map.getCanvas().style.cursor = '';
    });
  }, [map, location, calculateDistance]);

  const clearFuelStations = useCallback(() => {
    if (map && map.getLayer('fuel-stations')) {
      map.removeLayer('fuel-stations');
      map.removeSource('fuel-stations');
    }
    setFuelStations([]);
    setShowFuelStations(false);
  }, [map]);

  // Notification Functions
  const checkPushSupport = useCallback(async () => {
    const supported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
    setIsPushSupported(supported);
    
    if (supported) {
      const permission = Notification.permission;
      setNotificationPermission(permission);
      
      if (permission === 'granted') {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        setPushEnabled(!!subscription);
      }
    }
  }, []);

  const registerPushNotifications = useCallback(async () => {
    try {
      if (notificationPermission !== 'granted') {
        const permission = await Notification.requestPermission();
        setNotificationPermission(permission);
        
        if (permission !== 'granted') {
          throw new Error('Permission not granted');
        }
      }
      
      const registration = await navigator.serviceWorker.register('/sw.js');
      
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
      
      const userId = localStorage.getItem('userId') || busDetails?.driverId;
      await axios.post(`${API_URL}/subscribe`, { 
        subscription, 
        userId 
      }, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });
      
      setPushEnabled(true);
      toast.success('Push notifications enabled');
    } catch (error) {
      console.error('Push registration failed:', error);
      toast.error('Failed to enable push notifications');
    }
  }, [notificationPermission, busDetails]);

  const unsubscribePush = useCallback(async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      
      if (subscription) {
        await subscription.unsubscribe();
        
        const userId = localStorage.getItem('userId') || busDetails?.driverId;
        await axios.post(`${API_URL}/unsubscribe`, { 
          userId 
        }, {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
        });
        
        setPushEnabled(false);
        toast.success("Notifications disabled");
      }
    } catch (error) {
      console.error("Error unsubscribing:", error);
      toast.error("Failed to disable notifications");
    }
  }, [busDetails]);

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

  // Route Stops Component
  const renderRouteStops = useCallback(() => {
    return (
      <div className="route-progress-container">
        <div className="route-progress-line"></div>
        <div className="route-stops-list" ref={stopsListRef}>
          {routePoints.map((point, index) => (
            <div 
              key={`${point._id || index}-${isReturnTrip ? 'return' : 'outbound'}`} 
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
                        <strong>ETA: {stopETAs[index].minutes} min</strong>
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
  }, [routePoints, currentStopIndex, stopETAs, isReturnTrip]);

  // Effects
  useEffect(() => {
    fetchBusDetails();
    checkPushSupport();
    
    return () => {
      if (locationIntervalRef.current) {
        clearInterval(locationIntervalRef.current);
      }
      if (pauseTimeoutRef.current) {
        clearTimeout(pauseTimeoutRef.current);
      }
      if (speechSynthesisRef.current) {
        speechSynthesisRef.current.cancel();
      }
    };
  }, [fetchBusDetails, checkPushSupport]);

  useEffect(() => {
    if (busDetails) {
      fetchDelayedBuses();
      fetchLocationHistory(busDetails._id);
    }
  }, [busDetails, fetchDelayedBuses, fetchLocationHistory]);

  useEffect(() => {
    if (busDetails?.routeId) {
      const routeData = busDetails.routeId;
      let points = [
        { ...routeData.startLocation, type: 'start' },
        ...(routeData.stops || []).map(stop => ({ ...stop, type: 'stop' })),
        { ...routeData.endLocation, type: 'end' }
      ];
      
      if (isReturnTrip) {
        points = [
          { ...routeData.endLocation, type: 'start' },
          ...(routeData.stops || []).map(stop => ({ ...stop, type: 'stop' })).reverse(),
          { ...routeData.startLocation, type: 'end' }
        ];
      }
      
      setRoutePoints(points);
      setNextStopIndex(1);
      setCurrentStopIndex(0);
      
      if (map) {
        initializeMap(points);
      }
    }
  }, [busDetails, isReturnTrip, initializeMap, map]);

  useEffect(() => {
    if (routePoints.length > 0 && !map) {
      initializeMap(routePoints);
    }
  }, [routePoints, initializeMap, map]);

  useEffect(() => {
    if (location && map && routePoints.length > 0 && !isPaused) {
      updateNavigationPath();
    }
  }, [location, map, routePoints, isPaused, updateNavigationPath]);

  useEffect(() => {
    if (location && routePoints.length > 0) {
      setStopETAs(calculateETAs());
      setRouteProgress(calculateRouteProgress());
    }
  }, [location, speed, routePoints, nextStopIndex, currentStopIndex, calculateETAs, calculateRouteProgress]);

  useEffect(() => {
    if (stopsListRef.current && currentStopIndex > 0) {
      const stopElement = stopsListRef.current.children[currentStopIndex];
      if (stopElement) {
        stopElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentStopIndex]);

  return (
    <>
      <Navbar />
      <ToastContainer position="top-right" autoClose={5000} />
      <CToaster ref={toasterRef} push={toast} placement="top-right" />
      
      {loading ? (
        <div className="d-flex justify-content-center align-items-center" style={{ height: '80vh' }}>
          <CSpinner color="primary" size="lg" />
          <span className="ms-3">Loading bus details...</span>
        </div>
      ) : (
        <CRow className="m-4">
          <CCol md={5}>
            {/* Bus Details Card */}
            <CCard className="mb-4 shadow-sm">
              <CCardHeader className="bg-primary text-white d-flex justify-content-between align-items-center">
                <h4>Assigned Bus Details</h4>
                <div className="d-flex align-items-center">
                  <CBadge color={sharingStopped ? "danger" : "success"} className="me-2">
                    {sharingStopped ? "Location Off" : "Location On"}
                  </CBadge>
                  <CTooltip content="Refresh data">
                    <CButton 
                      color="light" 
                      size="sm" 
                      onClick={refreshData}
                      disabled={isRefreshing}
                    >
                      <CIcon icon={cilReload} spin={isRefreshing} />
                    </CButton>
                  </CTooltip>
                </div>
              </CCardHeader>
              <CCardBody>
                {busDetails ? (
                  <>
                    <div className="mb-4">
                      <h5 className="border-bottom pb-2">Bus Information</h5>
                      <div className="d-flex align-items-center mb-2">
                        <CIcon icon={cilTruck} className="me-2 text-primary" />
                        <span><strong>Bus Number:</strong> {busDetails.busNumber}</span>
                      </div>
                      <div className="d-flex align-items-center mb-2">
                        <CIcon icon={cilSpeedometer} className="me-2 text-primary" />
                        <span>
                          <strong>Current Speed:</strong> 
                          <CBadge color={speed > 80 ? "danger" : speed > 0 ? "success" : "secondary"} className="ms-2">
                            {speed.toFixed(1)} km/h
                          </CBadge>
                        </span>
                      </div>
                      <div className="d-flex align-items-center mb-2">
                        <CIcon icon={cilLocationPin} className="me-2 text-primary" />
                        <span>
                          <strong>Location:</strong> 
                          {location ? `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}` : "Unknown"}
                          {locationAccuracy && (
                            <small className="text-muted ms-2">(±{Math.round(locationAccuracy)}m)</small>
                          )}
                        </span>
                      </div>
                      <div className="mb-2">
                        <strong>Capacity:</strong> {busDetails.capacity} passengers
                      </div>
                    </div>

                    {/* Delay Status */}
                    <div className="mt-3">
                      <h6 className="d-flex align-items-center">
                        <CIcon icon={cilWarning} className="me-2 text-warning" />
                        <strong>Delay Status</strong>
                      </h6>
                      <CAlert color={delayInfo.isDelayed ? "warning" : "success"}>
                        <div className="d-flex justify-content-between align-items-center">
                          <div>
                            {delayInfo.isDelayed ? (
                              <>
                                <strong>Delayed:</strong> {delayInfo.reason}
                                {delayInfo.delayMinutes > 0 && (
                                  <span> ({formatTime(delayInfo.delayMinutes)})</span>
                                )}
                                <div className="mt-1">
                                  <small>Next Stop: {delayInfo.nextStop}</small>
                                </div>
                              </>
                            ) : (
                              <span className="d-flex align-items-center">
                                <CIcon icon={cilCheckCircle} className="me-2" />
                                On schedule
                              </span>
                            )}
                          </div>
                          <CBadge color={delayInfo.isDelayed ? "danger" : "success"}>
                            {delayInfo.isDelayed ? "Delayed" : "On Time"}
                          </CBadge>
                        </div>
                      </CAlert>
                    </div>
                    
                    {/* Route Information */}
                    <div className="mb-4">
                      <h5 className="border-bottom pb-2">Route Information</h5>
                      <div className="d-flex align-items-center mb-2">
                        <CIcon icon={cilArrowThickRight} className="me-2 text-primary" />
                        <span>
                          <strong>Route:</strong> {busDetails.routeId?.routeName}
                        </span>
                      </div>
                      <div className="mb-2">
                        <strong>Direction:</strong> 
                        <CBadge color={isReturnTrip ? "warning" : "success"} className="ms-2">
                          {isReturnTrip ? "Return Trip" : "Outbound Trip"}
                        </CBadge>
                      </div>
                      <div className="mb-2">
                        <strong>Start:</strong> 
                        {isReturnTrip ? busDetails.routeId?.endLocation?.name : busDetails.routeId?.startLocation?.name}
                      </div>
                      <div className="mb-2">
                        <strong>Destination:</strong> 
                        {isReturnTrip ? busDetails.routeId?.startLocation?.name : busDetails.routeId?.endLocation?.name}
                      </div>
                    </div>
                    
                    {/* Route Progress */}
                    <div className="mb-3">
                      <h5 className="border-bottom pb-2">
                        Route Progress ({routeProgress}%)
                        <CProgress className="mt-2" color="primary" value={routeProgress} />
                      </h5>
                      {renderRouteStops()}
                    </div>
                  </>
                ) : (
                  <CAlert color="danger">Failed to load bus details</CAlert>
                )}
              </CCardBody>
            </CCard>

            {/* Driver Controls Card */}
            <CCard className="shadow-sm">
              <CCardHeader>Driver Controls</CCardHeader>
              <CCardBody>
                <CRow className="mb-3">
                  <CCol>
                    {showFuelStations ? (
                      <CButton 
                        color="warning" 
                        onClick={clearFuelStations}
                        className="w-100"
                        disabled={isLoadingFuelStations}
                      >
                        {isLoadingFuelStations ? (
                          <CSpinner size="sm" />
                        ) : (
                          <>
                            <CIcon icon={cilGas} className="me-2" />
                            Hide Fuel Stations
                          </>
                        )}
                      </CButton>
                    ) : (
                      <CButton 
                        color="info" 
                        onClick={findNearbyFuelStations}
                        className="w-100"
                        disabled={isLoadingFuelStations}
                      >
                        {isLoadingFuelStations ? (
                          <CSpinner size="sm" />
                        ) : (
                          <>
                            <CIcon icon={cilGas} className="me-2" />
                            Find Fuel Stations
                          </>
                        )}
                      </CButton>
                    )}
                  </CCol>
                  <CCol>
                    {sharingStopped ? (
                      <CButton 
                        color="primary" 
                        onClick={startLocationSharing}
                        className="w-100"
                      >
                        <CIcon icon={cilLocationPin} className="me-2" />
                        Start Sharing
                      </CButton>
                    ) : (
                      <CButton 
                        color="danger" 
                        onClick={stopLocationSharing}
                        className="w-100"
                      >
                        <CIcon icon={cilLocationPin} className="me-2" />
                        Stop Sharing
                      </CButton>
                    )}
                  </CCol>
                </CRow>
                
                {/* Delay Controls */}
                <CRow className="mb-3">
                  <CCol>
                    <CButton 
                      color={delayInfo.isDelayed ? "danger" : "warning"} 
                      onClick={() => setShowDelayModal(true)}
                      className="w-100"
                      disabled={delayInfo.isDelayed}
                    >
                      <CIcon icon={cilWarning} className="me-2" />
                      Report Delay
                    </CButton>
                  </CCol>
                  <CCol>
                    <CButton 
                      color={delayInfo.isDelayed ? "success" : "secondary"} 
                      onClick={resolveDelay}
                      className="w-100"
                      disabled={!delayInfo.isDelayed}
                    >
                      <CIcon icon={cilCheckCircle} className="me-2" />
                      Resolve Delay
                    </CButton>
                  </CCol>
                </CRow>
                
                {/* Additional Controls */}
                <CRow>
                  <CCol>
                    <CButton 
                      color="secondary" 
                      onClick={() => setShowDelayedBuses(!showDelayedBuses)}
                      className="w-100"
                    >
                      {showDelayedBuses ? "Hide Delays" : "Show Delays"}
                    </CButton>
                  </CCol>
                  <CCol>
                    <CButton 
                      color={voiceEnabled ? "success" : "secondary"} 
                      onClick={toggleVoiceAssistant}
                      className="w-100"
                    >
                      <CIcon icon={voiceEnabled ? cilVolumeHigh : cilVolumeOff} className="me-2" />
                      Voice {voiceEnabled ? "On" : "Off"}
                    </CButton>
                  </CCol>
                </CRow>
              </CCardBody>
            </CCard>

            {/* Notification Settings Card */}
            <CCard className="mt-4 shadow-sm">
              <CCardHeader className="d-flex justify-content-between align-items-center">
                <span>Notification Settings</span>
                <CBadge color={pushEnabled ? "success" : "secondary"}>
                  {pushEnabled ? "Active" : "Inactive"}
                </CBadge>
              </CCardHeader>
              <CCardBody>
                {isPushSupported ? (
                  <>
                    <div className="mb-3">
                      <CButton 
                        color={pushEnabled ? "success" : "primary"} 
                        onClick={pushEnabled ? unsubscribePush : registerPushNotifications}
                        className="w-100"
                        disabled={notificationPermission === "denied"}
                      >
                        <CIcon icon={cilBell} className="me-2" />
                        {pushEnabled ? "Disable Notifications" : "Enable Notifications"}
                      </CButton>
                    </div>
                    
                    {notificationPermission === "denied" && (
                      <CAlert color="danger" className="d-flex align-items-center">
                        <CIcon icon={cilWarning} className="flex-shrink-0 me-2" />
                        <div>
                          Notifications blocked. Please enable in browser settings.
                        </div>
                      </CAlert>
                    )}
                    
                    {pushEnabled && (
                      <CAlert color="info" className="d-flex align-items-center">
                        <CIcon icon={cilInfo} className="flex-shrink-0 me-2" />
                        <div>
                          You'll receive notifications for:
                          <ul className="mb-0 mt-2">
                            <li>Bus delays and schedule changes</li>
                            <li>Important route updates</li>
                            <li>Emergency announcements</li>
                          </ul>
                        </div>
                      </CAlert>
                    )}
                  </>
                ) : (
                  <CAlert color="warning" className="d-flex align-items-center">
                    <CIcon icon={cilWarning} className="flex-shrink-0 me-2" />
                    <span>Push notifications not supported in your browser</span>
                  </CAlert>
                )}
              </CCardBody>
            </CCard>

            {/* Delayed Buses Card */}
            {showDelayedBuses && (
              <CCard className="mt-4 shadow-sm">
                <CCardHeader>
                  <div className="d-flex justify-content-between align-items-center">
                    <span>Delayed Buses in Your Route</span>
                    <CBadge color="warning" shape="rounded-pill">
                      {delayedBuses.length}
                    </CBadge>
                  </div>
                </CCardHeader>
                <CCardBody>
                  <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    {delayedBuses.length > 0 ? (
                      <CListGroup>
                        {delayedBuses.map((bus, index) => (
                          <CListGroupItem key={index} color="warning">
                            <div className="d-flex justify-content-between align-items-center">
                              <div>
                                <strong>Bus {bus.busNumber}</strong>
                                <div>{bus.reason}</div>
                                <small>Next stop: {bus.nextStop}</small>
                              </div>
                              <CBadge color="danger">
                                {formatTime(bus.duration)}
                              </CBadge>
                            </div>
                          </CListGroupItem>
                        ))}
                      </CListGroup>
                    ) : (
                      <CAlert color="success">No delays reported in your route</CAlert>
                    )}
                  </div>
                </CCardBody>
              </CCard>
            )}

            {/* Fuel Stations Card */}
            {showFuelStations && fuelStations.length > 0 && (
              <CCard className="mt-4 shadow-sm">
                <CCardHeader>
                  <div className="d-flex justify-content-between align-items-center">
                    <span>Nearby Fuel Stations</span>
                    <CBadge color="warning" shape="rounded-pill">
                      {fuelStations.length}
                    </CBadge>
                  </div>
                </CCardHeader>
                <CCardBody>
                  <CListGroup>
                    {fuelStations.map((station, index) => (
                      <CListGroupItem key={index}>
                        <div className="d-flex justify-content-between align-items-center">
                          <div>
                            <strong>{station.name}</strong>
                            <div className="text-muted small">{station.address}</div>
                          </div>
                          <CBadge color="warning">
                            {Math.round(calculateDistance(
                              location.latitude,
                              location.longitude,
                              station.coordinates[1],
                              station.coordinates[0]
                            ) * 1000)} m
                          </CBadge>
                        </div>
                      </CListGroupItem>
                    ))}
                  </CListGroup>
                </CCardBody>
              </CCard>
            )}
          </CCol>
          
          {/* Map Column */}
          <CCol md={7}>
            <CCard className="shadow-sm">
              <CCardHeader className="d-flex justify-content-between align-items-center">
                <span>Bus Route Map</span>
                <div>
                  <CButton 
                    color="light" 
                    size="sm" 
                    onClick={toggleMapStyle}
                    className="me-2"
                  >
                    <CIcon icon={cilMap} className="me-2" />
                    {MAP_STYLES.find(s => s.id === mapStyle)?.name}
                  </CButton>
                  <CBadge color="primary">
                    {isReturnTrip ? "Return Trip" : "Outbound Trip"}
                  </CBadge>
                </div>
              </CCardHeader>
              <CCardBody>
                <div 
                  ref={mapContainerRef} 
                  style={{ 
                    width: "100%", 
                    height: "600px",
                    borderRadius: "4px",
                    border: "1px solid #ddd"
                  }} 
                />
              </CCardBody>
            </CCard>

            {/* Location History Card */}
            {locationHistory.length > 0 && (
              <CCard className="mt-4 shadow-sm">
                <CCardHeader>Recent Locations</CCardHeader>
                <CCardBody>
                  <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    <CListGroup>
                      {locationHistory.map((loc, index) => (
                        <CListGroupItem key={index}>
                          <div className="d-flex justify-content-between">
                            <div>
                              <strong>{new Date(loc.timestamp).toLocaleTimeString()}</strong>
                              <div>Lat: {loc.latitude.toFixed(6)}, Lng: {loc.longitude.toFixed(6)}</div>
                            </div>
                            <div>
                              <CBadge color={loc.isReturnTrip ? "warning" : "primary"}>
                                {loc.isReturnTrip ? "Return" : "Outbound"}
                              </CBadge>
                              {loc.speed && (
                                <div className="text-end">
                                  <small>{loc.speed.toFixed(1)} km/h</small>
                                </div>
                              )}
                            </div>
                          </div>
                        </CListGroupItem>
                      ))}
                    </CListGroup>
                  </div>
                </CCardBody>
              </CCard>
            )}
          </CCol>
        </CRow>
      )}

      {/* Delay Report Modal */}
      <CModal visible={showDelayModal} onClose={() => setShowDelayModal(false)}>
        <CModalHeader closeButton>
          <CModalTitle>Report Delay</CModalTitle>
        </CModalHeader>
        <CModalBody>
          <CForm>
            <div className="mb-3">
              <CAlert color="info">
                <div className="d-flex justify-content-between align-items-center">
                  <div>
                    <strong>Current Status:</strong> {delayInfo.reason}
                  </div>
                  {delayInfo.isDelayed && (
                    <CBadge color="danger">
                      {formatTime(delayInfo.delayMinutes)}
                    </CBadge>
                  )}
                </div>
              </CAlert>
            </div>
            
            <div className="mb-3">
              <label htmlFor="delayReason" className="form-label">Reason for delay*</label>
              <CFormSelect
                id="delayReason"
                value={delayReason}
                onChange={(e) => setDelayReason(e.target.value)}
                required
              >
                <option value="">Select a reason...</option>
                {DELAY_REASONS.map((reason) => (
                  <option key={reason.value} value={reason.value}>{reason.label}</option>
                ))}
              </CFormSelect>
            </div>
            
            {delayReason === "Other" && (
              <div className="mb-3">
                <label htmlFor="customReason" className="form-label">Specify reason*</label>
                <CFormInput
                  type="text"
                  id="customReason"
                  value={delayNotes}
                  onChange={(e) => setDelayNotes(e.target.value)}
                  placeholder="Please specify the delay reason"
                  required={delayReason === "Other"}
                />
              </div>
            )}
            
            <div className="mb-3">
              <label htmlFor="delayDuration" className="form-label">Estimated delay duration*</label>
              <CFormSelect
                id="delayDuration"
                value={delayDuration}
                onChange={(e) => setDelayDuration(Number(e.target.value))}
                required
              >
                {DELAY_DURATIONS.map((duration) => (
                  <option key={duration} value={duration}>{duration} minutes</option>
                ))}
              </CFormSelect>
            </div>
          </CForm>
        </CModalBody>
        <CModalFooter>
          <CButton color="secondary" onClick={() => setShowDelayModal(false)}>
            Cancel
          </CButton>
          <CButton 
            color="primary" 
            onClick={reportDelay}
            disabled={isReportingDelay || !delayReason || (delayReason === "Other" && !delayNotes)}
          >
            {isReportingDelay ? (
              <>
                <CSpinner size="sm" /> Reporting...
              </>
            ) : (
              "Submit Report"
            )}
          </CButton>
        </CModalFooter>
      </CModal>

      {/* Navigation Toast */}
      {showToast && (
        <div style={{ position: 'fixed', bottom: '20px', right: '20px', zIndex: 1000 }}>
          <CToast show={showToast} onClose={() => setShowToast(false)} autohide={5000}>
            <CToastHeader closeButton className="bg-primary text-white">
              <div className="d-flex align-items-center">
                <CIcon icon={cilArrowThickRight} className="me-2" />
                <strong>Next Instruction</strong>
                {eta && (
                  <CBadge color="light" className="ms-2">
                    ETA: {eta} min
                  </CBadge>
                )}
              </div>
            </CToastHeader>
            <CToastBody className="bg-light">
              {currentInstruction}
            </CToastBody>
          </CToast>
        </div>
      )}

      {/* Custom Styles */}
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
          max-height: 400px;
          overflow-y: auto;
          padding-right: 10px;
        }
        
        .route-stop {
          display: flex;
          flex-direction: column;
          margin-bottom: 15px;
          position: relative;
        }
        
        .stop-marker {
          position: absolute;
          left: -20px;
          width: 20px;
          display: flex;
          justify-content: center;
          align-items: center;
        }
        
        .stop-dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background-color: #007bff;
          border: 2px solid white;
        }
        
        .stop-dot.current-dot {
          background-color: #28a745;
          transform: scale(1.3);
          box-shadow: 0 0 0 2px rgba(40, 167, 69, 0.5);
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
        
        .bus-marker {
          animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.2); }
          100% { transform: scale(1); }
        }
        
        /* Custom scrollbar for route stops */
        .route-stops-list::-webkit-scrollbar {
          width: 6px;
        }
        
        .route-stops-list::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 10px;
        }
        
        .route-stops-list::-webkit-scrollbar-thumb {
          background: #888;
          border-radius: 10px;
        }
        
        .route-stops-list::-webkit-scrollbar-thumb:hover {
          background: #555;
        }
      `}</style>
    </>
  );
};

export default DriverDashboard;
