import React, { useEffect, useState, useRef } from "react";
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
  CTooltip
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
  cilBell
} from '@coreui/icons';
import CIcon from "@coreui/icons-react";
import Navbar from "./Navbar";
import "mapbox-gl/dist/mapbox-gl.css";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const API_URL = import.meta.env.VITE_API_URL;
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

const DriverDashboard = () => {
  // State management
  const [location, setLocation] = useState(null);
  const [map, setMap] = useState(null);
  const [busDetails, setBusDetails] = useState(null);
  const [routePoints, setRoutePoints] = useState([]);
  const [sharingStopped, setSharingStopped] = useState(true);
  const [busMarker, setBusMarker] = useState(null);
  const [nextStopIndex, setNextStopIndex] = useState(1);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [currentInstruction, setCurrentInstruction] = useState("");
  const [showToast, setShowToast] = useState(false);
  const [speed, setSpeed] = useState(0);
  const [eta, setEta] = useState(null);
  const [isReturnTrip, setIsReturnTrip] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showDelayModal, setShowDelayModal] = useState(false);
  const [delayReason, setDelayReason] = useState("");
  const [delayDuration, setDelayDuration] = useState(10);
  const [delayNotes, setDelayNotes] = useState("");
  const [isReportingDelay, setIsReportingDelay] = useState(false);
  const [locationHistory, setLocationHistory] = useState([]);
  const [delayedBuses, setDelayedBuses] = useState([]);
  const [showDelayedBuses, setShowDelayedBuses] = useState(false);
  const [currentStopIndex, setCurrentStopIndex] = useState(0);
  const [stopETAs, setStopETAs] = useState({});
  const [routeProgress, setRouteProgress] = useState(0);
  const [mapStyle, setMapStyle] = useState("streets-v11");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [stopsWithTimestamps, setStopsWithTimestamps] = useState([]);
  const [fuelStations, setFuelStations] = useState([]);
  const [showFuelStations, setShowFuelStations] = useState(false);
  const [isLoadingFuelStations, setIsLoadingFuelStations] = useState(false);
  const [isPushSupported, setIsPushSupported] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);

  // Refs
  const mapContainerRef = useRef(null);
  const navigate = useNavigate();
  const locationIntervalRef = useRef(null);
  const speechSynthesisRef = useRef(window.speechSynthesis);
  const pauseTimeoutRef = useRef(null);
  const stopsListRef = useRef(null);

  // Helper functions
  const getNextStop = (stops) => stops?.find(stop => stop.actualArrivalTime === null);

  const convertTimeToMinutes = (timeString) => {
    if (!timeString) return 0;
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
  };

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const formatTime = (minutes) => {
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hrs > 0 ? `${hrs}h ` : ''}${mins}m`;
  };

  const calculateBusDelay = () => {
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
      const delayInfo = {
        isDelayed: true,
        delayMinutes: Math.round(timeSinceLastUpdate),
        reason: "Bus has stopped moving",
        nextStop: getNextStop(busDetails.routeId.stops)?.name || "Unknown",
        alreadyNotified: busDetails.delay?.isNotified || false
      };

      // Automatically report delay if not already reported
      if (!delayInfo.alreadyNotified) {
        reportDelay().catch(error => {
          console.error("Error auto-reporting delay:", error);
        });
      }

      return delayInfo;
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
  };

  const delayInfo = calculateBusDelay();

  // API functions
  const fetchBusDetails = async () => {
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
    } catch (error) {
      console.error("Error fetching bus details:", error);
      toast.error("Failed to fetch bus details");
      setLoading(false);
    }
  };

  const handleStopArrival = async (stopIndex) => {
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
  };

  const refreshData = async () => {
    setIsRefreshing(true);
    try {
      await fetchBusDetails();
      if (busDetails) {
        await fetchDelayedBuses();
        await fetchLocationHistory(busDetails._id);
      }
      toast.success("Data refreshed successfully");
    } catch (error) {
      console.error("Error refreshing data:", error);
      toast.error("Failed to refresh data");
    } finally {
      setIsRefreshing(false);
    }
  };

  const fetchLocationHistory = async (busId) => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API_URL}/buses/${busId}/tracking/history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setLocationHistory(response.data);
    } catch (error) {
      console.error("Error fetching location history:", error);
    }
  };

  const fetchDelayedBuses = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${API_URL}/buses/delays`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDelayedBuses(response.data);
    } catch (error) {
      console.error("Error fetching delayed buses:", error);
      toast.error(error.response?.data?.message || "Failed to fetch delayed buses");
    }
  };

  const reportDelay = async () => {
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
        fetchBusDetails();
      }
    } catch (error) {
      console.error("Error reporting delay:", error);
      toast.error("Failed to report delay");
    } finally {
      setIsReportingDelay(false);
    }
  };

  const resolveDelay = async () => {
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
        fetchBusDetails();
      }
    } catch (error) {
      console.error("Error resolving delay:", error);
      toast.error("Failed to resolve delay");
    }
  };

  // Map functions
  const initializeMap = (points) => {
    if (!points || points.length === 0) return;

    if (map) {
      map.remove();
    }

    const mapInstance = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: `mapbox://styles/mapbox/${mapStyle}`,
      center: [points[0].longitude, points[0].latitude],
      zoom: 14,
    });

    mapInstance.on("load", async () => {
      points.forEach((point, index) => {
        const markerColor = point.type === 'start' ? 'green' : 
                          point.type === 'end' ? 'red' : 'blue';

        new mapboxgl.Marker({ color: markerColor })
          .setLngLat([point.longitude, point.latitude])
          .setPopup(new mapboxgl.Popup().setHTML(`
            <strong>${point.name}</strong>
            <p>${point.type.toUpperCase()} ${point.type === 'stop' ? index : ''}</p>
          `))
          .addTo(mapInstance);
      });

      if (points.length > 1) {
        try {
          const coordinates = points.map(point => [point.longitude, point.latitude]);
          const response = await axios.get(
            `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coordinates.map(c => c.join(",")).join(";")}?geometries=geojson&access_token=${mapboxgl.accessToken}`
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
  };

  const updateNavigationPath = async () => {
    if (!map || !location || nextStopIndex >= routePoints.length) return;

    const nextStop = routePoints[nextStopIndex];
    
    try {
      const response = await axios.get(
        `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${location.longitude},${location.latitude};${nextStop.longitude},${nextStop.latitude}?geometries=geojson&steps=true&access_token=${mapboxgl.accessToken}`
      );
      
      const routeData = response.data.routes[0];
      const currentLeg = routeData.legs[0];
      const currentStep = currentLeg.steps[0];

      if (map.getSource('navigation-route')) {
        map.removeLayer('navigation-route-line');
        map.removeSource('navigation-route');
      }

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

      const delayInfo = calculateBusDelay();
      if (delayInfo.isDelayed && delayInfo.delayMinutes > 5 && !delayInfo.alreadyNotified) {
        toast.warning(`Potential delay detected: ${delayInfo.reason} (${formatTime(delayInfo.delayMinutes)})`);
      }

    } catch (error) {
      console.error("Error updating navigation path:", error);
    }
  };

  // Location functions
  const startLocationSharing = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(handlePositionUpdate);
      
      locationIntervalRef.current = setInterval(() => {
        navigator.geolocation.getCurrentPosition(handlePositionUpdate);
      }, isPaused ? 60000 : 30000);

      setSharingStopped(false);
      toast.success("Location sharing started");
    } else {
      toast.warning("Geolocation not supported");
    }
  };

  const stopLocationSharing = () => {
    if (locationIntervalRef.current) {
      clearInterval(locationIntervalRef.current);
      locationIntervalRef.current = null;
    }
    setSharingStopped(true);
    toast.info("Location sharing stopped");
  };

  const handlePositionUpdate = async (position) => {
    const { latitude, longitude, speed: currentSpeed } = position.coords;
    setLocation({ latitude, longitude });
    setSpeed(currentSpeed ? (currentSpeed * 3.6) : 0);

    try {
      const token = localStorage.getItem("token");
      if (!token || !busDetails?._id) return;

      if (nextStopIndex < routePoints.length) {
        const nextStop = routePoints[nextStopIndex];
        const distanceToStop = calculateDistance(
          latitude,
          longitude,
          nextStop.latitude,
          nextStop.longitude
        );

        if (distanceToStop < 0.1) {
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

      await axios.post(
        `${API_URL}/update-location`,
        { 
          latitude, 
          longitude, 
          speed: currentSpeed ? (currentSpeed * 3.6) : 0,
          busId: busDetails._id,
          isReturnTrip,
          currentStopIndex
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

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

      if (map) {
        if (!busMarker) {
          const markerEl = document.createElement("div");
          markerEl.innerHTML = "🚍";
          markerEl.style.fontSize = "24px";

          const newMarker = new mapboxgl.Marker({ element: markerEl })
            .setLngLat([longitude, latitude])
            .setPopup(new mapboxgl.Popup().setHTML("<strong>Your Bus</strong>"))
            .addTo(map);
          setBusMarker(newMarker);
        } else {
          busMarker.setLngLat([longitude, latitude]);
        }

        map.flyTo({ center: [longitude, latitude], zoom: 14 });
      }

    } catch (error) {
      console.error("Error sharing location:", error);
    }
  };

  // Other functions
  const calculateETAs = () => {
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
  };

  const calculateRouteProgress = () => {
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

    // Calculate distance traveled
    if (currentStopIndex > 0) {
      // Add distance between all passed stops
      for (let i = 1; i <= currentStopIndex; i++) {
        traveledDistance += calculateDistance(
          routePoints[i-1].latitude,
          routePoints[i-1].longitude,
          routePoints[i].latitude,
          routePoints[i].longitude
        );
      }
    }

    // Add distance from current stop to current location
    if (currentStopIndex < routePoints.length) {
      traveledDistance += calculateDistance(
        routePoints[currentStopIndex].latitude,
        routePoints[currentStopIndex].longitude,
        location.latitude,
        location.longitude
      );
    }

    // Calculate percentage
    const percentage = (traveledDistance / totalDistance) * 100;
    return Math.min(100, Math.max(0, Math.round(percentage)));
  };

  const handleRouteCompletion = () => {
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
  };

  const speakInstruction = (text) => {
    if (speechSynthesisRef.current) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      utterance.pitch = 1.2;
      speechSynthesisRef.current.speak(utterance);
    }
  };

  const toggleVoiceAssistant = () => {
    setVoiceEnabled(!voiceEnabled);
    if (!voiceEnabled && currentInstruction) {
      speakInstruction(currentInstruction);
    }
  };

  const toggleMapStyle = () => {
    const styles = ["streets-v11", "satellite-streets-v11", "outdoors-v11"];
    const currentIndex = styles.indexOf(mapStyle);
    const nextIndex = (currentIndex + 1) % styles.length;
    setMapStyle(styles[nextIndex]);
    if (map) {
      map.setStyle(`mapbox://styles/mapbox/${styles[nextIndex]}`);
    }
  };

  const findNearbyFuelStations = async () => {
    try {
      setIsLoadingFuelStations(true);
      setShowFuelStations(true);
      
      // Allahabad coordinates [longitude, latitude]
      const allahabadCenter = [81.8463, 25.4358];
      
      // Try different search terms - "petrol pump" works better in India than "fuel"
      const response = await axios.get(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/petrol%20pump.json`,
        {
          params: {
            proximity: `${allahabadCenter[0]},${allahabadCenter[1]}`,
            access_token: mapboxgl.accessToken,
            limit: 10,
            country: 'in',
            types: 'poi',
            bbox: '81.7,25.3,82.0,25.6' // Tighter bounding box around Allahabad
          }
        }
      );
  
      if (response.data.features.length === 0) {
        toast.warning("No petrol pumps found in Allahabad. Trying broader search...");
        // Fallback to a broader search if no results
        return await findFallbackFuelStations();
      }
  
      const stations = response.data.features.map(feature => ({
        name: feature.text || feature.properties.address || "Petrol Pump",
        coordinates: feature.center,
        address: feature.place_name
      }));
  
      setFuelStations(stations);
      addFuelStationsToMap(stations);
      toast.success(`Found ${stations.length} petrol pumps in Allahabad`);
    } catch (error) {
      console.error("Error finding petrol pumps:", error);
      toast.error("Failed to find petrol pumps. Please try again later.");
    } finally {
      setIsLoadingFuelStations(false);
    }
  };
  
  // Fallback function if primary search fails
  const findFallbackFuelStations = async () => {
    try {
      const allahabadCenter = [81.8463, 25.4358];
      
      const response = await axios.get(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/petrol.json`,
        {
          params: {
            proximity: `${allahabadCenter[0]},${allahabadCenter[1]}`,
            access_token: mapboxgl.accessToken,
            limit: 5,
            country: 'in'
          }
        }
      );
  
      const stations = response.data.features.map(feature => ({
        name: feature.text || "Fuel Station",
        coordinates: feature.center,
        address: feature.place_name
      }));
  
      setFuelStations(stations);
      addFuelStationsToMap(stations);
      toast.info(`Found ${stations.length} fuel stations near Allahabad`);
    } catch (error) {
      console.error("Fallback search failed:", error);
      toast.warning("Could not find fuel stations. Please check your internet connection.");
    }
  };

  const addFuelStationsToMap = (stations) => {
    if (!map) return;

    if (map.getLayer('fuel-stations')) {
      map.removeLayer('fuel-stations');
      map.removeSource('fuel-stations');
    }

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
            description: station.address
          }
        }))
      }
    });

    map.addLayer({
      id: 'fuel-stations',
      type: 'circle',
      source: 'fuel-stations',
      paint: {
        'circle-radius': 10,
        'circle-color': '#FFA500',
        'circle-stroke-width': 2,
        'circle-stroke-color': '#FFF'
      }
    });

    map.on('click', 'fuel-stations', (e) => {
      const coordinates = e.features[0].geometry.coordinates.slice();
      const description = e.features[0].properties.description;

      while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
        coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
      }

      new mapboxgl.Popup()
        .setLngLat(coordinates)
        .setHTML(description)
        .addTo(map);
    });

    map.on('mouseenter', 'fuel-stations', () => {
      map.getCanvas().style.cursor = 'pointer';
    });

    map.on('mouseleave', 'fuel-stations', () => {
      map.getCanvas().style.cursor = '';
    });
  };

  const clearFuelStations = () => {
    if (map && map.getLayer('fuel-stations')) {
      map.removeLayer('fuel-stations');
      map.removeSource('fuel-stations');
    }
    setFuelStations([]);
    setShowFuelStations(false);
  };

  const registerPushNotifications = async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        throw new Error('Permission not granted');
      }
      
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(import.meta.env.VITE_VAPID_PUBLIC_KEY)
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
  };

  const unsubscribePush = async () => {
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

  // Effects
  useEffect(() => {
    fetchBusDetails();
    
    const checkPushSupport = async () => {
      const supported = 'Notification' in window && 'serviceWorker' in navigator;
      setIsPushSupported(supported);
      
      if (supported) {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        setPushEnabled(!!subscription);
      }
    };
    
    checkPushSupport();

    return () => {
      if (locationIntervalRef.current) {
        clearInterval(locationIntervalRef.current);
      }
      if (pauseTimeoutRef.current) {
        clearTimeout(pauseTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (busDetails) {
      fetchDelayedBuses();
      fetchLocationHistory(busDetails._id);
    }
  }, [busDetails]);

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
  }, [busDetails, isReturnTrip]);

  useEffect(() => {
    if (routePoints.length > 0 && !map) {
      initializeMap(routePoints);
    }
  }, [routePoints]);

  useEffect(() => {
    if (location && map && routePoints.length > 0 && !isPaused) {
      updateNavigationPath();
    }
  }, [location, map, routePoints, isPaused]);

  useEffect(() => {
    if (location && routePoints.length > 0) {
      setStopETAs(calculateETAs());
      setRouteProgress(calculateRouteProgress());
    }
  }, [location, speed, routePoints, nextStopIndex, currentStopIndex]);

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
      
      {loading ? (
        <div className="d-flex justify-content-center align-items-center" style={{ height: '100vh' }}>
          <CSpinner color="primary" size="lg" />
        </div>
      ) : (
        <CRow className="m-4">
          <CCol md={5}>
            <CCard className="mb-4 shadow-sm">
              <CCardHeader className="bg-primary text-white d-flex justify-content-between align-items-center">
                <h4>Assigned Bus Details</h4>
                <div className="d-flex align-items-center">
                  <CBadge color={sharingStopped ? "danger" : "success"} className="me-2">
                    {sharingStopped ? "Location Sharing Off" : "Location Sharing On"}
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
                        </span>
                      </div>
                      <div className="mb-2">
                        <strong>Capacity:</strong> {busDetails.capacity} passengers
                      </div>
                    </div>

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
                        Start Sharing
                      </CButton>
                    ) : (
                      <CButton 
                        color="danger" 
                        onClick={stopLocationSharing}
                        className="w-100"
                      >
                        Stop Sharing
                      </CButton>
                    )}
                  </CCol>
                </CRow>
                
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
                </CRow>
              </CCardBody>
            </CCard>

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
                      >
                        <CIcon icon={cilBell} className="me-2" />
                        {pushEnabled ? "Disable Notifications" : "Enable Notifications"}
                      </CButton>
                    </div>
                    
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

            {showDelayedBuses && (
              <CCard className="mt-4 shadow-sm">
                <CCardHeader>Delayed Buses in Your Route</CCardHeader>
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
                                <small>Delayed for {formatTime(bus.duration)}</small>
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

            {showFuelStations && fuelStations.length > 0 && (
              <CCard className="mt-4 shadow-sm">
                <CCardHeader>Nearby Fuel Stations</CCardHeader>
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
          
          <CCol md={7}>
            <CCard className="shadow-sm">
              <CCardHeader className="d-flex justify-content-between align-items-center">
                <span>Bus Route Map</span>
                <CButton 
                  color="light" 
                  size="sm" 
                  onClick={toggleMapStyle}
                >
                  <CIcon icon={cilMap} className="me-2" />
                  Change Map Style
                </CButton>
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

            {locationHistory.length > 0 && (
              <CCard className="mt-4 shadow-sm">
                <CCardHeader>Recent Locations</CCardHeader>
                <CCardBody>
                  <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    <CListGroup>
                      {locationHistory.slice(0, 5).map((loc, index) => (
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
                    <strong>Current Delay:</strong> {delayInfo.reason}
                  </div>
                  <CBadge color="danger">
                    {formatTime(delayInfo.delayMinutes)}
                  </CBadge>
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
                <option value="Traffic congestion">🚦 Traffic congestion</option>
                <option value="Road accident">🚨 Road accident</option>
                <option value="Road construction">🚧 Road construction</option>
                <option value="Vehicle breakdown">🔧 Vehicle breakdown</option>
                <option value="Passenger delay">👥 Passenger delay</option>
                <option value="Weather conditions">⛈️ Weather conditions</option>
                <option value="Police activity">👮 Police activity</option>
                <option value="Medical emergency">🚑 Medical emergency</option>
                <option value="Mechanical issue">⚙️ Mechanical issue</option>
                <option value="Driver change">👤 Driver change</option>
                <option value="Schedule adjustment">⏱️ Schedule adjustment</option>
                <option value="Other">❔ Other (specify below)</option>
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
                <option value="5">5 minutes</option>
                <option value="10">10 minutes</option>
                <option value="15">15 minutes</option>
                <option value="20">20 minutes</option>
                <option value="30">30 minutes</option>
                <option value="45">45 minutes</option>
                <option value="60">60 minutes</option>
                <option value="90">90 minutes</option>
                <option value="120">2 hours</option>
                <option value="180">3+ hours</option>
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

      {showToast && (
        <div style={{ position: 'fixed', bottom: '20px', right: '20px', zIndex: 1000 }}>
          <CToast show={showToast} onClose={() => setShowToast(false)} autohide={5000}>
            <CToastHeader closeButton className="bg-primary text-white">
              <strong>Navigation Instruction</strong>
            </CToastHeader>
            <CToastBody className="bg-light">
              <CIcon icon={cilArrowThickRight} className="me-2 text-primary" />
              {currentInstruction}
            </CToastBody>
          </CToast>
        </div>
      )}

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
        
        .custom-marker {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          color: white;
          display: flex;
          justify-content: center;
          align-items: center;
          font-weight: bold;
          font-size: 10px;
          border: 2px solid white;
        }
        
        .bus-marker {
          animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.2); }
          100% { transform: scale(1); }
        }
      `}</style>
    </>
  );
};

export default DriverDashboard;