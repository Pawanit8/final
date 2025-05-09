import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  CCard,
  CCardBody,
  CCardHeader,
  CCol,
  CRow,
  CSpinner,
  CAlert,
  CBadge,
  CButton,
  CListGroup,
  CListGroupItem,
  CProgress,
  CTooltip
} from '@coreui/react';
import { 
  cilTruck, 
  cilSpeedometer, 
  cilLocationPin, 
  cilClock,
  cilUser,
  cilHistory,
  cilWarning,
  cilSync,
  cilInfo,
  cilChart
} from '@coreui/icons';
import CIcon from '@coreui/icons-react';
import axios from 'axios';
import MapboxMap from '../../components/MapboxMap';
import AppHeader from '../../components/AppHeader';
import AppSidebar from '../../components/AppSidebar';

const API_URL = import.meta.env.VITE_API_URL;

const BusTracking = () => {
  const { id } = useParams();
  const [busData, setBusData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshInterval, setRefreshInterval] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [showDelayPopup, setShowDelayPopup] = useState(false);
  const [delayAcknowledged, setDelayAcknowledged] = useState(false);

  const fetchBusDetails = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('adminToken');
      const response = await axios.get(`${API_URL}/Bus/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data.success) {
        const busDetails = response.data.data.busDetails;
        const transformedData = {
          ...busDetails,
          bus: {
            ...busDetails,
            currentLocation: busDetails.currentLocation,
            trackingHistory: busDetails.recentTracking || [],
            delayInfo: busDetails.delayInfo || null,
            routeId: busDetails.routeId,
            driverId: busDetails.driverId
          }
        };
        
        setBusData(transformedData.bus);
        setError('');
        setLastRefresh(new Date());
      } else {
        setError(response.data.message || 'Failed to fetch bus details');
      }
    } catch (err) {
      console.error('Error fetching bus details:', err);
      setError(err.response?.data?.message || 'Failed to fetch bus details');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchBusDetails();
    
    const interval = setInterval(fetchBusDetails, 150000);
    setRefreshInterval(interval);

    return () => clearInterval(interval);
  }, [fetchBusDetails]);

  useEffect(() => {
    if (busData?.delayInfo?.isDelayed && !delayAcknowledged) {
      setShowDelayPopup(true);
      
      const timer = setTimeout(() => {
        setShowDelayPopup(false);
      }, 30000);
      
      return () => clearTimeout(timer);
    }
  }, [busData, delayAcknowledged]);

  const handleManualRefresh = () => {
    clearInterval(refreshInterval);
    fetchBusDetails();
    const interval = setInterval(fetchBusDetails, 150000);
    setRefreshInterval(interval);
  };

  const acknowledgeDelay = () => {
    setShowDelayPopup(false);
    setDelayAcknowledged(true);
  };

  const formatTime = (minutes) => {
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hrs > 0 ? `${hrs}h ` : ''}${mins}m`;
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'N/A';
    
    const date = new Date(timestamp);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    
    if (diffInSeconds < 60) return `${diffInSeconds} seconds ago`;
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
    return `${Math.floor(diffInSeconds / 86400)} days ago`;
  };

  const getDelayDuration = (bus) => {
    if (!bus?.delayInfo?.timestamp) return "N/A";
    
    const delayTime = new Date(bus.delayInfo.timestamp);
    const now = new Date();
    const diffMs = now - delayTime;
    
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);
    const remainingMinutes = diffMinutes % 60;
    
    if (diffHours > 0) {
      return `${diffHours}h ${remainingMinutes}m`;
    }
    return `${diffMinutes}m`;
  };

  const calculateOccupancyPercentage = () => {
    if (!busData?.passengerCount || !busData?.capacity) return 0;
    return Math.min(100, Math.round((busData.passengerCount / busData.capacity) * 100));
  };

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ height: '50vh' }}>
        <CSpinner color="primary" />
        <span className="ms-3">Loading bus details...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mt-4">
        <CAlert color="danger" className="d-flex align-items-center">
          <CIcon icon={cilWarning} className="me-2 flex-shrink-0" />
          <div>
            <h5>Error loading bus data</h5>
            <p className="mb-0">{error}</p>
            <CButton color="primary" size="sm" className="mt-2" onClick={fetchBusDetails}>
              <CIcon icon={cilSync} className="me-1" /> Retry
            </CButton>
          </div>
        </CAlert>
      </div>
    );
  }

  if (!busData) {
    return (
      <div className="container mt-4">
        <CAlert color="warning" className="d-flex align-items-center">
          <CIcon icon={cilInfo} className="me-2 flex-shrink-0" />
          <div>
            <h5>No bus data available</h5>
            <p className="mb-0">The requested bus information could not be found.</p>
          </div>
        </CAlert>
      </div>
    );
  }

  const currentLocation = busData.currentLocation ? {
    latitude: busData.currentLocation.latitude,
    longitude: busData.currentLocation.longitude,
    speed: busData.currentLocation.speed,
    timestamp: busData.currentLocation.timestamp
  } : null;

  const trackingHistory = busData.trackingHistory?.map(track => ({
    location: {
      latitude: track.location.coordinates[1],
      longitude: track.location.coordinates[0]
    },
    speed: track.speed,
    timestamp: track.timestamp
  })) || [];

  const occupancyPercentage = calculateOccupancyPercentage();
  const occupancyColor = occupancyPercentage > 90 ? 'danger' : 
                       occupancyPercentage > 70 ? 'warning' : 'success';

  return (
    <div className="wrapper d-flex flex-column min-vh-100 bg-light">
      <AppSidebar />
      <div className="wrapper d-flex flex-column min-vh-100">
        <AppHeader />
        
        {/* Delay Popup Notification */}
        {showDelayPopup && busData?.delayInfo?.isDelayed && (
          <div className="delay-popup-overlay">
            <div className="delay-popup-container bg-warning rounded shadow-lg p-4">
              <div className="d-flex justify-content-between align-items-start mb-3">
                <h4 className="mb-0">
                  <CIcon icon={cilWarning} className="me-2" />
                  Bus Delay Alert
                </h4>
                <CButton 
                  color="transparent" 
                  onClick={acknowledgeDelay}
                  className="p-0"
                >
                  &times;
                </CButton>
              </div>
              
              <div className="delay-details">
                <p><strong>Bus:</strong> {busData.busNumber}</p>
                <p><strong>Route:</strong> {busData.routeId?.routeName || 'N/A'}</p>
                <p><strong>Reason:</strong> {busData.delayInfo.reason || 'Not specified'}</p>
                <p><strong>Duration:</strong> {getDelayDuration(busData)}</p>
                <p><strong>Delay Since:</strong> {formatTimestamp(busData.delayInfo.timestamp)}</p>
              </div>
              
              <div className="d-flex justify-content-end mt-3">
                <CButton 
                  color="dark" 
                  onClick={acknowledgeDelay}
                  className="ms-2"
                >
                  Acknowledge
                </CButton>
              </div>
            </div>
          </div>
        )}

        <CRow className="mb-4">
          <CCol xs={12}>
            <CCard className="bus-tracking-card shadow-sm">
              <CCardHeader className="d-flex justify-content-between align-items-center py-3">
                <div className="d-flex align-items-center">
                  <CIcon icon={cilTruck} className="me-3 text-primary" size="xl" />
                  <div>
                    <h4 className="mb-0">Bus Tracking - {busData.busNumber}</h4>
                    <div className="d-flex align-items-center mt-1">
                      <CBadge 
                        color={busData.status === 'active' ? 'success' : 'warning'} 
                        className="me-2"
                      >
                        {busData.status.toUpperCase()}
                      </CBadge>
                      {busData.delayInfo?.isDelayed && (
                        <CBadge color="warning" className="me-2">
                          DELAYED
                        </CBadge>
                      )}
                      <small className="text-muted">
                        Last updated: {formatTimestamp(lastRefresh)}
                      </small>
                    </div>
                  </div>
                </div>
                <div>
                  <CButton 
                    color="primary" 
                    onClick={handleManualRefresh}
                    className="d-flex align-items-center"
                  >
                    <CIcon icon={cilSync} className="me-2" />
                    Refresh
                  </CButton>
                </div>
              </CCardHeader>
              
              <CCardBody>
                {/* Delay Alert Banner */}
                {busData.delayInfo?.isDelayed && (
                  <CRow className="mb-4">
                    <CCol>
                      <CAlert color="warning" className="d-flex align-items-center py-3">
                        <CIcon icon={cilWarning} className="me-3 flex-shrink-0" size="xl" />
                        <div>
                          <h5 className="mb-2">Bus Delay Detected</h5>
                          <p className="mb-1">
                            <strong>Reason:</strong> {busData.delayInfo.reason || 'Not specified'}
                          </p>
                          <p className="mb-0">
                            <strong>Duration:</strong> {getDelayDuration(busData)}
                          </p>
                        </div>
                        <CButton 
                          color="warning" 
                          onClick={() => setShowDelayPopup(true)}
                          className="ms-auto"
                        >
                          View Details
                        </CButton>
                      </CAlert>
                    </CCol>
                  </CRow>
                )}

                <CRow>
                  {/* Left Column - Information Cards */}
                  <CCol md={4}>
                    {/* Bus Info Card */}
                    <CCard className="mb-4 shadow-sm">
                      <CCardHeader className="bg-primary text-white py-2">
                        <h5 className="mb-0">
                          <CIcon icon={cilTruck} className="me-2" />
                          Bus Information
                        </h5>
                      </CCardHeader>
                      <CCardBody>
                        <CListGroup flush>
                          <CListGroupItem className="d-flex justify-content-between align-items-center py-3">
                            <span className="text-muted">Bus Number:</span>
                            <strong>{busData.busNumber}</strong>
                          </CListGroupItem>
                          <CListGroupItem className="d-flex justify-content-between align-items-center py-3">
                            <span className="text-muted">Current Speed:</span>
                            <div className="d-flex align-items-center">
                              <strong>{currentLocation?.speed || 0} km/h</strong>
                              <CIcon icon={cilSpeedometer} className="ms-2 text-primary" />
                            </div>
                          </CListGroupItem>
                          <CListGroupItem className="d-flex justify-content-between align-items-center py-3">
                            <span className="text-muted">Last Update:</span>
                            <strong>
                              {currentLocation?.timestamp 
                                ? formatTimestamp(currentLocation.timestamp)
                                : 'N/A'}
                            </strong>
                          </CListGroupItem>
                          <CListGroupItem className="py-3">
                            <div className="d-flex justify-content-between mb-2">
                              <span className="text-muted">Passenger</span>
                              <strong>  {busData.capacity}</strong>
                            </div>
                          </CListGroupItem>
                        </CListGroup>
                      </CCardBody>
                    </CCard>

                    {/* Driver Info Card */}
                    {busData.driverId && (
                      <CCard className="mb-4 shadow-sm">
                        <CCardHeader className="bg-info text-white py-2">
                          <h5 className="mb-0">
                            <CIcon icon={cilUser} className="me-2" />
                            Driver Information
                          </h5>
                        </CCardHeader>
                        <CCardBody>
                          <CListGroup flush>
                            <CListGroupItem className="d-flex justify-content-between align-items-center py-3">
                              <span className="text-muted">Name:</span>
                              <strong>{busData.driverId.userId.name}</strong>
                            </CListGroupItem>
                            <CListGroupItem className="d-flex justify-content-between align-items-center py-3">
                              <span className="text-muted">License:</span>
                              <strong>{busData.driverId.licenseNumber}</strong>
                            </CListGroupItem>
                            <CListGroupItem className="d-flex justify-content-between align-items-center py-3">
                              <span className="text-muted">Contact:</span>
                              <strong>{busData.driverId?.userId?.phone || 'N/A'}</strong>
                            </CListGroupItem>
                          </CListGroup>
                        </CCardBody>
                      </CCard>
                    )}

                    {/* Route Info Card */}
                    {busData.routeId && (
                      <CCard className="shadow-sm">
                        <CCardHeader className="bg-success text-white py-2">
                          <h5 className="mb-0">
                            <CIcon icon={cilLocationPin} className="me-2" />
                            Route Information
                          </h5>
                        </CCardHeader>
                        <CCardBody>
                          <CListGroup flush>
                            <CListGroupItem className="d-flex justify-content-between align-items-center py-3">
                              <span className="text-muted">Route:</span>
                              <strong>{busData.routeId.routeName}</strong>
                            </CListGroupItem>
                            <CListGroupItem className="d-flex justify-content-between align-items-center py-3">
                              <span className="text-muted">Distance:</span>
                              <strong>{busData.routeId.totalDistance} km</strong>
                            </CListGroupItem>
                            <CListGroupItem className="d-flex justify-content-between align-items-center py-3">
                              <span className="text-muted">Duration:</span>
                              <strong>{formatTime(busData.routeId.estimatedDuration)}</strong>
                            </CListGroupItem>
                            <CListGroupItem className="d-flex justify-content-between align-items-center py-3">
                              <span className="text-muted">Stops:</span>
                              <strong>{busData.routeId.stops.length}</strong>
                            </CListGroupItem>
                          </CListGroup>
                        </CCardBody>
                      </CCard>
                    )}
                  </CCol>

                  {/* Right Column - Map and Stats */}
                  <CCol md={8}>
                    {/* Map Container */}
                    <div className="mb-4">
                      <CCard className="shadow-sm">
                        <CCardHeader className="bg-white py-2">
                          <h5 className="mb-0">
                            <CIcon icon={cilLocationPin} className="me-2 text-danger" />
                            Live Location Tracking
                          </h5>
                        </CCardHeader>
                        <CCardBody className="p-0" style={{ height: '400px' }}>
                          <MapboxMap
                            startLocation={busData.routeId?.startLocation}
                            endLocation={busData.routeId?.endLocation}
                            stops={busData.routeId?.stops}
                            busLocation={currentLocation}
                            busNumber={busData.busNumber}
                            passengerCount={busData.passengerCount || 0}
                            capacity={busData.capacity}
                            isDelayed={busData.delayInfo?.isDelayed}
                          />
                        </CCardBody>
                      </CCard>
                    </div>

                    {/* Stats Cards */}
                    <CRow>
                      <CCol md={6} className="mb-4">
                        <CCard className="h-100 shadow-sm">
                          <CCardHeader className="bg-white py-2">
                            <h5 className="mb-0">
                              <CIcon icon={cilSpeedometer} className="me-2 text-primary" />
                              Speed Statistics
                            </h5>
                          </CCardHeader>
                          <CCardBody className="text-center py-4">
                            <h2 className="display-4">
                              {currentLocation?.speed || 0} <small className="text-muted">km/h</small>
                            </h2>
                            <div className="mt-3">
                              <CBadge color="info" className="me-2">
                                Avg: 45 km/h
                              </CBadge>
                              <CBadge color="warning">
                                Max: 80 km/h
                              </CBadge>
                            </div>
                          </CCardBody>
                        </CCard>
                      </CCol>
                    </CRow>
                  </CCol>
                </CRow>
              </CCardBody>
            </CCard>
          </CCol>
        </CRow>
      </div>

      {/* CSS styles for the popup */}
      <style jsx>{`
        .delay-popup-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0,0,0,0.5);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 1050;
        }
        
        .delay-popup-container {
          width: 90%;
          max-width: 500px;
          animation: fadeIn 0.3s ease-out;
        }
        
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        .delay-details p {
          margin-bottom: 0.5rem;
        }
      `}</style>
    </div>
  );
};

export default BusTracking;