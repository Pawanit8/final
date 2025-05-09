/**
 * Utility functions for map and location calculations
 */

/**
 * Calculates distance between two coordinates in kilometers using Haversine formula
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lon1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lon2 - Longitude of point 2
 * @returns {number} Distance in kilometers
 */
export const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Earth radius in km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };
  
  /**
   * Converts degrees to radians
   * @param {number} value - Value in degrees
   * @returns {number} Value in radians
   */
  const toRad = (value) => {
    return (value * Math.PI) / 180;
  };
  
  /**
   * Converts time string (HH:MM) to total minutes
   * @param {string} timeStr - Time string in HH:MM format
   * @returns {number} Total minutes
   */
  export const convertTimeToMinutes = (timeStr) => {
    if (!timeStr) return 0;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  };
  
  /**
   * Formats minutes into HH:MM format
   * @param {number} totalMinutes - Total minutes
   * @returns {string} Formatted time string
   */
  export const formatMinutesToTime = (totalMinutes) => {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };
  
  /**
   * Calculates bearing between two coordinates
   * @param {number} lat1 - Latitude of point 1
   * @param {number} lon1 - Longitude of point 1
   * @param {number} lat2 - Latitude of point 2
   * @param {number} lon2 - Longitude of point 2
   * @returns {number} Bearing in degrees
   */
  export const calculateBearing = (lat1, lon1, lat2, lon2) => {
    const φ1 = toRad(lat1);
    const φ2 = toRad(lat2);
    const Δλ = toRad(lon2 - lon1);
  
    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    const θ = Math.atan2(y, x);
    return ((θ * 180 / Math.PI) + 360) % 360;
  };
  
  /**
   * Checks if a coordinate is within a polygon
   * @param {Array} point - [latitude, longitude] to check
   * @param {Array} polygon - Array of [latitude, longitude] points
   * @returns {boolean} True if point is inside polygon
   */
  export const isPointInPolygon = (point, polygon) => {
    const [lat, lng] = point;
    let inside = false;
    
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i];
      const [xj, yj] = polygon[j];
      
      const intersect = ((yi > lat) !== (yj > lat)) &&
        (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    
    return inside;
  };
  
  /**
   * Calculates ETA based on distance and average speed
   * @param {number} distance - Distance in km
   * @param {number} speed - Speed in km/h
   * @returns {number} ETA in minutes
   */
  export const calculateETA = (distance, speed) => {
    const avgSpeed = speed > 0 ? speed : 30; // Default to 30 km/h if speed is 0
    return Math.round((distance / avgSpeed) * 60);
  };
  
  /**
   * Formats distance for display
   * @param {number} distance - Distance in km
   * @returns {string} Formatted distance string
   */
  export const formatDistance = (distance) => {
    if (distance < 1) {
      return `${Math.round(distance * 1000)} meters`;
    }
    return `${distance.toFixed(1)} km`;
  };
  
  export default {
    calculateDistance,
    convertTimeToMinutes,
    formatMinutesToTime,
    calculateBearing,
    isPointInPolygon,
    calculateETA,
    formatDistance
  };