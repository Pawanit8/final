import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
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

// Constants
const API_URL = import.meta.env.VITE_API_URL;
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;
mapboxgl.accessToken = MAPBOX_TOKEN;

// Graph class for Dijkstra's algorithm
class Graph {
  constructor() {
    this.nodes = [];
    this.adjacencyList = {};
  }

  addNode(node) {
    this.nodes.push(node);
    this.adjacencyList[node] = [];
  }

  addEdge(node1, node2, weight) {
    this.adjacencyList[node1].push({ node: node2, weight });
    this.adjacencyList[node2].push({ node: node1, weight });
  }

  findShortestPath(startNode, endNode) {
    const times = {};
    const backtrace = {};
    const pq = new PriorityQueue();

    times[startNode] = 0;

    this.nodes.forEach(node => {
      if (node !== startNode) {
        times[node] = Infinity;
      }
    });

    pq.enqueue([startNode, 0]);

    while (!pq.isEmpty()) {
      const shortestStep = pq.dequeue();
      const currentNode = shortestStep[0];

      this.adjacencyList[currentNode].forEach(neighbor => {
        const time = times[currentNode] + neighbor.weight;

        if (time < times[neighbor.node]) {
          times[neighbor.node] = time;
          backtrace[neighbor.node] = currentNode;
          pq.enqueue([neighbor.node, time]);
        }
      });
    }

    const path = [endNode];
    let lastStep = endNode;

    while (lastStep !== startNode) {
      path.unshift(backtrace[lastStep]);
      lastStep = backtrace[lastStep];
    }

    return {
      path,
      distance: times[endNode]
    };
  }
}

// Priority Queue implementation for Dijkstra's
class PriorityQueue {
  constructor() {
    this.collection = [];
  }

  enqueue(element) {
    if (this.isEmpty()) {
      this.collection.push(element);
    } else {
      let added = false;
      for (let i = 1; i <= this.collection.length; i++) {
        if (element[1] < this.collection[i-1][1]) {
          this.collection.splice(i-1, 0, element);
          added = true;
          break;
        }
      }
      if (!added) {
        this.collection.push(element);
      }
    }
  }

  dequeue() {
    return this.collection.shift();
  }

  isEmpty() {
    return this.collection.length === 0;
  }
}

// Helper functions
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

// Throttle function to limit API calls
const throttle = (func, limit) => {
  let inThrottle;
  return function() {
    const args = arguments;
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  }
}

const DriverDashboard = () => {
  // Navigation and Refs
  const navigate = useNavigate();
  const mapContainerRef = useRef(null);
  const stopsListRef = useRef(null);
  const busMarkerRef = useRef(null); // Ref for bus marker

  // State declarations
  const [busDetails, setBusDetails] = useState(null);
  const [routePoints, setRoutePoints] = useState([]);
  const [isReturnTrip, setIsReturnTrip] = useState(false);
  const [currentStopIndex, setCurrentStopIndex] = useState(0);
  const [nextStopIndex, setNextStopIndex] = useState(1);
  const [stopETAs, setStopETAs] = useState({});
  const [routeProgress, setRouteProgress] = useState(0);
  const [locationHistory, setLocationHistory] = useState([]);
  const [delayedBuses, setDelayedBuses] = useState([]);
  const [isRouteOptimized, setIsRouteOptimized] = useState(false);
  const [location, setLocation] = useState(null);
  const [speed, setSpeed] = useState(0);
  const [sharingStopped, setSharingStopped] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [locationAccuracy, setLocationAccuracy] = useState(null);
  const [map, setMap] = useState(null);
  const [mapStyle, setMapStyle] = useState("streets-v11");
  const [fuelStations, setFuelStations] = useState([]);
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
  const [isPushSupported, setIsPushSupported] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState("default");

  // Refs
  const locationIntervalRef = useRef(null);
  const speechSynthesisRef = useRef(window.speechSynthesis);
  const pauseTimeoutRef = useRef(null);

  // Helper functions
  const getNextStop = useCallback((stops) => stops?.find(stop => stop.actualArrivalTime === null), []);

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
  }, [busDetails, routePoints, stopETAs]);

  const delayInfo = calculateBusDelay();

  // API functions
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

      setCurrentStopIndex(stopIndex);
      
      if (stopIndex === routePoints.length - 1) {
        handleRouteCompletion();
      } else {
        setNextStopIndex(stopIndex + 1);
        toast.info(`Arrived at ${currentStop.name}`);
      }
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

  // Map functions
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
          `))
          .addTo(mapInstance);
      });

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

      // Reset bus marker when map is reinitialized
      busMarkerRef.current = null;
      
      setMap(mapInstance);
      setRoutePoints(points);
    });

    return () => mapInstance?.remove();
  }, [map, mapStyle, isReturnTrip]);

  const optimizeRoute = useCallback((points) => {
    const graph = new Graph();
    
    // Add all stops as nodes
    points.forEach(point => {
      graph.addNode(point._id);
    });

    // Add edges between all stops
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const distance = calculateDistance(
          points[i].latitude,
          points[i].longitude,
          points[j].latitude,
          points[j].longitude
        );
        graph.addEdge(points[i]._id, points[j]._id, distance);
      }
    }

    // Find shortest path
    const startNode = points[0]._id;
    const endNode = points[points.length - 1]._id;
    const shortestPath = graph.findShortestPath(startNode, endNode);

    // Reorder points
    return shortestPath.path.map(nodeId => 
      points.find(point => point._id === nodeId)
    );
  }, []);

  const toggleRouteOptimization = useCallback(() => {
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
      
      const optimized = !isRouteOptimized;
      initializeMap(optimized ? optimizeRoute(points) : points);
      setIsRouteOptimized(optimized);
    }
  }, [busDetails, isReturnTrip, initializeMap, isRouteOptimized, optimizeRoute]);

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

      // Update existing source instead of recreating
      if (map.getSource('navigation-route')) {
        map.getSource('navigation-route').setData({
          type: 'Feature',
          geometry: routeData.geometry
        });
      } else {
        // Create only if doesn't exist
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
          paint: {
            'line-color': '#ff0000',
            'line-width': 3,
            'line-dasharray': [2, 2]
          }
        });
      }

      const instruction = currentStep.maneuver.instruction;
      setCurrentInstruction(instruction);
      setShowToast(true);
      setEta(Math.round(currentLeg.duration / 60));

      if (voiceEnabled) {
        speakInstruction(instruction);
      }

    } catch (error) {
      console.error("Error updating navigation path:", error);
    }
  }, [map, location, nextStopIndex, routePoints, voiceEnabled]);

  // Location functions
  const startLocationSharing = useCallback(() => {
    if (navigator.geolocation) {
      // Throttled position handler
      const throttledPositionUpdate = throttle(handlePositionUpdate, 10000); // 10 seconds
      
      // Get initial position
      navigator.geolocation.getCurrentPosition(
        throttledPositionUpdate,
        handlePositionError,
        { enableHighAccuracy: true }
      );
      
      // Set up interval for updates
      locationIntervalRef.current = setInterval(() => {
        navigator.geolocation.getCurrentPosition(
          throttledPositionUpdate,
          handlePositionError,
          { enableHighAccuracy: true }
        );
      }, 30000);

      setSharingStopped(false);
      toast.success("Location sharing started");
    } else {
      toast.warning("Geolocation not supported");
    }
  }, []);

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
    const newLocation = { latitude, longitude, timestamp: new Date().toISOString() };
    setLocation(newLocation);
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
        }
      }

      // Update location in backend
      await axios.post(
        `${API_URL}/update-location`,
        { 
          ...newLocation, 
          speed: currentSpeed ? (currentSpeed * 3.6) : 0,
          busId: busDetails._id,
          isReturnTrip,
          currentStopIndex,
          accuracy
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Update bus marker
      if (map) {
        if (!busMarkerRef.current) {
          const markerEl = document.createElement("div");
          markerEl.innerHTML = "🚍";
          markerEl.style.fontSize = "24px";
          
          // Apply animation styles directly
          markerEl.style.animation = "pulse 2s infinite";
          markerEl.style.transformOrigin = "center";
          
          const newMarker = new mapboxgl.Marker({ element: markerEl })
            .setLngLat([longitude, latitude])
            .addTo(map);
          
          busMarkerRef.current = newMarker;
        } else {
          // Update existing marker position
          busMarkerRef.current.setLngLat([longitude, latitude]);
          
          // Ensure animation is maintained
          const markerEl = busMarkerRef.current.getElement();
          if (!markerEl.style.animation) {
            markerEl.style.animation = "pulse 2s infinite";
          }
        }

        // Move map to follow bus
        map.flyTo({
          center: [longitude, latitude],
          zoom: 14,
          speed: 0.5
        });
      }

    } catch (error) {
      console.error("Error sharing location:", error);
      toast.error("Failed to update location");
    }
  }, [busDetails, handleStopArrival, isReturnTrip, map, nextStopIndex, routePoints]);

  const handlePositionError = useCallback((error) => {
    console.error("Geolocation error:", error);
    let errorMessage = "Error getting location: ";
    
    switch(error.code) {
      case error.PERMISSION_DENIED:
        errorMessage += "Permission denied";
        break;
      case error.POSITION_UNAVAILABLE:
        errorMessage += "Location unavailable";
        break;
      case error.TIMEOUT:
        errorMessage += "Request timed out";
        break;
      default:
        errorMessage += "Unknown error";
    }
    
    toast.error(errorMessage);
    stopLocationSharing();
  }, [stopLocationSharing]);

  // Other functions
  const calculateETAs = useCallback(() => {
    if (!location || !routePoints || routePoints.length === 0) return {};
  
    const currentTime = new Date();
    const etas = {};
    let cumulativeTime = 0;
    
    for (let i = nextStopIndex; i < routePoints.length; i++) {
      const prevPoint = i === nextStopIndex ? 
        location : 
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
  }, [location, routePoints, speed, nextStopIndex]);

  const calculateRouteProgress = useCallback(() => {
    if (!location || routePoints.length === 0) return 0;
    
    let totalDistance = 0;
    let traveledDistance = 0;
    
    // Calculate total distance
    for (let i = 1; i < routePoints.length; i++) {
      totalDistance += calculateDistance(
        routePoints[i-1].latitude,
        routePoints[i-1].longitude,
        routePoints[i].latitude,
        routePoints[i].longitude
      );
    }
    
    // Calculate distance traveled
    for (let i = 1; i <= currentStopIndex; i++) {
      traveledDistance += calculateDistance(
        routePoints[i-1].latitude,
        routePoints[i-1].longitude,
        routePoints[i].latitude,
        routePoints[i].longitude
      );
    }
    
    // Add distance from current stop to location
    if (currentStopIndex < routePoints.length - 1) {
      traveledDistance += calculateDistance(
        routePoints[currentStopIndex].latitude,
        routePoints[currentStopIndex].longitude,
        location.latitude,
        location.longitude
      );
    }
    
    return Math.min(100, Math.round((traveledDistance / totalDistance) * 100));
  }, [location, routePoints, currentStopIndex]);

  const handleRouteCompletion = useCallback(() => {
    const completionMessage = isReturnTrip 
      ? "Route completed! End of service." 
      : "Reached destination! Preparing return trip...";
      
    toast.info(completionMessage);
    if (voiceEnabled) speakInstruction(completionMessage);
    
    if (!isReturnTrip) {
      setIsPaused(true);
      pauseTimeoutRef.current = setTimeout(() => {
        setIsReturnTrip(true);
        setIsPaused(false);
        setNextStopIndex(1);
        setCurrentStopIndex(0);
        toast.info("Starting return trip now!");
      }, 30000);
    } else {
      stopLocationSharing();
    }
  }, [isReturnTrip, stopLocationSharing, voiceEnabled]);

  const speakInstruction = useCallback((text) => {
    if (speechSynthesisRef.current && voiceEnabled) {
      speechSynthesisRef.current.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      speechSynthesisRef.current.speak(utterance);
    }
  }, [voiceEnabled]);

  const toggleVoiceAssistant = useCallback(() => {
    const newVoiceEnabled = !voiceEnabled;
    setVoiceEnabled(newVoiceEnabled);
    toast.info(`Voice assistant ${newVoiceEnabled ? 'enabled' : 'disabled'}`);
  }, [voiceEnabled]);

  const toggleMapStyle = useCallback(() => {
    const styles = ["streets-v11", "satellite-streets-v11", "outdoors-v11", "light-v10", "dark-v10"];
    const currentIndex = styles.indexOf(mapStyle);
    const newStyle = styles[(currentIndex + 1) % styles.length];
    
    setMapStyle(newStyle);
    if (map) map.setStyle(`mapbox://styles/mapbox/${newStyle}`);
    toast.info(`Map style changed to ${newStyle.replace('-v11', '').replace('-v10', '').toUpperCase()}`);
  }, [map, mapStyle]);

  const findNearbyFuelStations = useCallback(async () => {
    try {
      setIsLoadingFuelStations(true);
      setShowFuelStations(true);
      
      if (!location) {
        toast.warning("Waiting for current location...");
        return;
      }

      const response = await axios.get(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/petrol%20pump.json`,
        {
          params: {
            proximity: `${location.longitude},${location.latitude}`,
            access_token: MAPBOX_TOKEN,
            limit: 10,
            country: 'in'
          }
        }
      );
  
      const stations = response.data.features.map(feature => ({
        id: feature.id,
        name: feature.text || "Petrol Pump",
        coordinates: feature.center,
        address: feature.place_name
      }));
  
      setFuelStations(stations);
      toast.success(`Found ${stations.length} nearby petrol pumps`);
    } catch (error) {
      console.error("Error finding petrol pumps:", error);
      toast.error("Failed to find petrol pumps");
    } finally {
      setIsLoadingFuelStations(false);
    }
  }, [location]);

  const clearFuelStations = useCallback(() => {
    setFuelStations([]);
    setShowFuelStations(false);
  }, []);

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
        if (permission !== 'granted') return;
      }
      
      const registration = await navigator.serviceWorker.register('/sw.js');
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
      
      await axios.post(`${API_URL}/subscribe`, { 
        subscription, 
        userId: busDetails?.driverId 
      }, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });
      
      setPushEnabled(true);
      toast.success('Push notifications enabled');
    } catch (error) {
      console.error('Push registration failed:', error);
      toast.error('Failed to enable notifications');
    }
  }, [notificationPermission, busDetails]);

  const unsubscribePush = useCallback(async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      
      if (subscription) {
        await subscription.unsubscribe();
        await axios.post(`${API_URL}/unsubscribe`, { 
          userId: busDetails?.driverId
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
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }, [routePoints, currentStopIndex, stopETAs, isReturnTrip]);

  // Memoize expensive calculations
  const memoizedStopETAs = useMemo(() => calculateETAs(), [calculateETAs]);
  const memoizedRouteProgress = useMemo(() => calculateRouteProgress(), [calculateRouteProgress]);

  useEffect(() => {
    setStopETAs(memoizedStopETAs);
    setRouteProgress(memoizedRouteProgress);
  }, [memoizedStopETAs, memoizedRouteProgress]);

  // Effects
  useEffect(() => {
    fetchBusDetails();
    checkPushSupport();
    
    return () => {
      clearInterval(locationIntervalRef.current);
      clearTimeout(pauseTimeoutRef.current);
      speechSynthesisRef.current?.cancel();
      
      // Clean up bus marker
      if (busMarkerRef.current) {
        busMarkerRef.current.remove();
        busMarkerRef.current = null;
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
    if (busDetails?.routeId && !map) {
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
      initializeMap(points);
    }
  }, [busDetails, isReturnTrip, initializeMap, map]);

  useEffect(() => {
    if (location && map && routePoints.length > 0) {
      updateNavigationPath();
    }
  }, [location, map, routePoints, updateNavigationPath]);

  useEffect(() => {
    if (stopsListRef.current && currentStopIndex > 0) {
      stopsListRef.current.children[currentStopIndex]?.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'center' 
      });
    }
  }, [currentStopIndex]);

  return (
    <>
      <Navbar />
      <ToastContainer position="top-right" autoClose={5000} />
      
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
                        Hide Fuel Stations
                      </CButton>
                    ) : (
                      <CButton 
                        color="info" 
                        onClick={findNearbyFuelStations}
                        className="w-100"
                        disabled={isLoadingFuelStations}
                      >
                        Find Fuel Stations
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
                
                {/* Route Optimization */}
                <CRow className="mb-3">
                  <CCol>
                    <CButton 
                      color={isRouteOptimized ? "success" : "info"} 
                      onClick={toggleRouteOptimization}
                      className="w-100"
                    >
                      <CIcon icon={cilArrowThickRight} className="me-2" />
                      {isRouteOptimized ? "Optimized Route" : "Optimize Route"}
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
                      <CAlert color="danger">
                        Notifications blocked. Please enable in browser settings.
                      </CAlert>
                    )}
                  </>
                ) : (
                  <CAlert color="warning">
                    Push notifications not supported in your browser
                  </CAlert>
                )}
              </CCardBody>
            </CCard>

            {/* Delayed Buses Card */}
            {showDelayedBuses && (
              <CCard className="mt-4 shadow-sm">
                <CCardHeader>
                  <div className="d-flex justify-content-between align-items-center">
                    <span>Delayed Buses</span>
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
                              </div>
                              <CBadge color="danger">
                                {formatTime(bus.duration)}
                              </CBadge>
                            </div>
                          </CListGroupItem>
                        ))}
                      </CListGroup>
                    ) : (
                      <CAlert color="success">No delays reported</CAlert>
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
                    {mapStyle.replace('-v11', '').replace('-v10', '').toUpperCase()}
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
                <option value="Traffic congestion">🚦 Traffic congestion</option>
                <option value="Road accident">🚨 Road accident</option>
                <option value="Road construction">🚧 Road construction</option>
                <option value="Vehicle breakdown">🔧 Vehicle breakdown</option>
                <option value="Passenger delay">👥 Passenger delay</option>
                <option value="Weather conditions">⛈️ Weather conditions</option>
              </CFormSelect>
            </div>
            
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
            disabled={isReportingDelay || !delayReason}
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
