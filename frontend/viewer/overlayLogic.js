(function(global) {
  'use strict';

  function fitReadiness(correspondences, type) {
    var pairs = Array.isArray(correspondences) ? correspondences.filter(Boolean) : [];
    var required = type === 'similarity' ? 2 : 3;
    return {
      ready: pairs.length >= required,
      needed: Math.max(0, required - pairs.length)
    };
  }

  function formatUm(value) {
    if (typeof value !== 'number' || !isFinite(value)) return '?';
    return value.toFixed(2) + ' um';
  }

  function confidenceSummary(transform) {
    if (!transform) {
      return {
        tone: 'none',
        label: 'Not registered',
        detail: 'Add image/GDS pairs to fit a transform',
        requiresAcceptance: false
      };
    }
    var confidence = transform.confidence || 'low';
    var labels = {
      high: 'High confidence',
      medium: 'Medium confidence',
      low: 'Low confidence'
    };
    return {
      tone: confidence,
      label: labels[confidence] || 'Low confidence',
      detail: 'RMS ' + formatUm(transform.residualRmsUm) + ', max ' + formatUm(transform.maxResidualUm),
      requiresAcceptance: confidence === 'low'
    };
  }

  function registeredImageModel(overlay) {
    if (!overlay || !overlay.registeredAssetPath || !overlay.registeredBoundsUm) {
      return {
        ready: false,
        url: '',
        extent: null,
        opacity: 0,
        opacityPercent: 0,
        visible: false
      };
    }
    var opacity = typeof overlay.opacity === 'number' ? Math.max(0, Math.min(1, overlay.opacity)) : 0.5;
    return {
      ready: true,
      url: '/api/image-overlays/' + encodeURIComponent(overlay.id) + '/image?kind=registered',
      extent: overlay.registeredBoundsUm.slice(),
      opacity: opacity,
      opacityPercent: Math.round(opacity * 100),
      visible: overlay.visible !== false
    };
  }

  function statusText(overlay) {
    if (!overlay) return 'No image';
    if (overlay.stale && overlay.stale.status === 'stale') {
      return 'Stale overlay: ' + (overlay.stale.reasons || []).join(', ');
    }
    if (!overlay.transform) return 'Imported, not registered';
    return confidenceSummary(overlay.transform).label;
  }

  global.OverGDSOverlayLogic = {
    fitReadiness: fitReadiness,
    confidenceSummary: confidenceSummary,
    registeredImageModel: registeredImageModel,
    statusText: statusText
  };
})(typeof window !== 'undefined' ? window : globalThis);
