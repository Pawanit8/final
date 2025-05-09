import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import axios from "axios";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

const MapboxMap = ({ 
  startLocation, 
  endLocation, 
  stops, 
  busLocation, 
  enableVoice,
  offlineMode,
  manualTracking,
  userCoordinates
}) => {
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const mapInstance = useRef(null);
  const [currentInstruction, setCurrentInstruction] = useState("");
  const [nextStopEta, setNextStopEta] = useState(null);

  // Initialize map
  useEffect(() => {
    mapInstance.current = new mapboxgl.Map({
      container: mapRef.current,
      style: "mapbox://styles/mapbox/streets-v11",
      center: [startLocation.longitude, startLocation.latitude],
      zoom: 12,
    });

    return () => mapInstance.current?.remove();
  }, [startLocation]);

  // Add/update layers based on mode
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !busLocation) return;

    map.once("load", async () => {
      // Clear existing layers
      removeLayers(map);
      addMarkers(map);
      addBusMarker(map);

      if (offlineMode && manualTracking) {
        addOfflineLayers(map);
      } else {
        await calculateRoute(map);
      }
    });
  }, [busLocation, stops, enableVoice, offlineMode, manualTracking]);

  // Update bus marker position
  useEffect(() => {
    if (markerRef.current && busLocation) {
      markerRef.current.setLngLat([busLocation.longitude, busLocation.latitude]);
      mapInstance.current.flyTo({
        center: [busLocation.longitude, busLocation.latitude],
        zoom: 14
      });
    }
  }, [busLocation]);

  // Add offline tracking layers
  const addOfflineLayers = (map) => {
    // User location points
    map.addSource('user-location', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: userCoordinates.map(coord => ({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [coord.longitude, coord.latitude]
          },
          properties: { type: 'user' }
        }))
      }
    });

    map.addLayer({
      id: 'user-location-points',
      type: 'circle',
      source: 'user-location',
      paint: {
        'circle-radius': 6,
        'circle-color': '#28a745',
        'circle-stroke-width': 2,
        'circle-stroke-color': '#fff'
      }
    });

    // User path line
    map.addLayer({
      id: 'user-location-path',
      type: 'line',
      source: 'user-location',
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': '#28a745',
        'line-width': 3,
        'line-dasharray': [2, 2]
      }
    });
  };

  // Cleanup layers
  const removeLayers = (map) => {
    ['route', 'navigation-route-line', 'user-location-points', 'user-location-path']
      .forEach(layer => {
        if (map.getLayer(layer)) map.removeLayer(layer);
        if (map.getSource(layer)) map.removeSource(layer);
      });
  };

  const addMarkers = (map) => {
    // Start marker
    new mapboxgl.Marker({ color: "green" })
      .setLngLat([startLocation.longitude, startLocation.latitude])
      .addTo(map);

    // End marker
    new mapboxgl.Marker({ color: "red" })
      .setLngLat([endLocation.longitude, endLocation.latitude])
      .addTo(map);

    // Stop markers
    stops.forEach((stop) => {
      new mapboxgl.Marker({ color: "blue" })
        .setLngLat([stop.longitude, stop.latitude])
        .addTo(map);
    });
  };

  const addBusMarker = (map) => {
    const busIcon = document.createElement("div");
    busIcon.className = "bus-marker";
    busIcon.innerHTML = "🚍";
    busIcon.style.fontSize = "24px";
    busIcon.style.width = "40px";
    busIcon.style.height = "40px";
    busIcon.style.textAlign = "center";

    markerRef.current = new mapboxgl.Marker(busIcon)
      .setLngLat([busLocation.longitude, busLocation.latitude])
      .setPopup(new mapboxgl.Popup().setHTML(`
        <strong>${offlineMode ? "Your Location" : "Bus Location"}</strong>
        <div>Speed: ${busLocation.speed || 0} km/h</div>
        ${nextStopEta ? `<div>Next Stop ETA: ${nextStopEta} min</div>` : ''}
      `))
      .addTo(map);
  };

  const calculateRoute = async (map) => {
    try {
      const waypoints = [
        [startLocation.longitude, startLocation.latitude],
        ...stops.map(stop => [stop.longitude, stop.latitude]),
        [endLocation.longitude, endLocation.latitude]
      ];

      const routeResponse = await axios.get(
        `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${waypoints.map(wp => wp.join(',')).join(';')}?geometries=geojson&access_token=${mapboxgl.accessToken}`
      );

      map.addSource("route", {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: routeResponse.data.routes[0].geometry,
        },
      });

      map.addLayer({
        id: "route",
        type: "line",
        source: "route",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "#3b82f6",
          "line-width": 4,
        },
      });

      // Add navigation instructions
      const nextStop = stops.find(stop => 
        calculateDistance(busLocation.latitude, busLocation.longitude, stop.latitude, stop.longitude) > 0.1
      ) || endLocation;

      const navResponse = await axios.get(
        `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${[
          [busLocation.longitude, busLocation.latitude],
          [nextStop.longitude, nextStop.latitude]
        ].map(wp => wp.join(',')).join(';')}?geometries=geojson&steps=true&access_token=${mapboxgl.accessToken}`
      );

      map.addSource("navigation-route-line", {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: navResponse.data.routes[0].geometry,
        },
      });

      map.addLayer({
        id: "navigation-route-line",
        type: "line",
        source: "navigation-route-line",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "#ef4444",
          "line-width": 3,
          "line-dasharray": [2, 2],
        },
      });

      const instruction = navResponse.data.routes[0].legs[0].steps[0].maneuver.instruction;
      setCurrentInstruction(instruction);
      setNextStopEta(Math.round(navResponse.data.routes[0].duration / 60));

      if (enableVoice && window.speechSynthesis) {
        const utterance = new SpeechSynthesisUtterance(instruction);
        utterance.rate = 0.9;
        window.speechSynthesis.speak(utterance);
      }

    } catch (err) {
      console.error("Directions API error:", err);
    }
  };

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
  };

  return (
    <div style={{ position: 'relative' }}>
      <div ref={mapRef} style={{ height: "500px", width: "100%" }} />
      
      {!offlineMode && currentInstruction && (
        <div className="navigation-instruction">
          <strong>Next Instruction:</strong> {currentInstruction}
          {nextStopEta && <div><strong>ETA:</strong> {nextStopEta} minutes</div>}
        </div>
      )}
    </div>
  );
};

export default MapboxMap;