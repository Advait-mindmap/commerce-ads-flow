import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

/**
 * Runtime configuration from /api/config.
 *
 * Chiefly the USD→INR rate: the voice provider bills in USD but this product
 * reports in rupees, and that conversion used to be a literal `* 83` copied
 * into three components. It now comes from a live source with the rate's
 * provenance attached, so the UI can say where the number came from.
 */
const ConfigContext = createContext(null);

const DEFAULTS = {
  environment: 'unknown',
  data_mode: 'synthetic',
  voice_provider: 'simulated',
  calling_window: { enforced: true, start_hour_ist: 9, end_hour_ist: 20 },
  fx: { usd_inr: 83, source: 'fallback', as_of: null }
};

export function ConfigProvider({ children }) {
  const [config, setConfig] = useState(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/config', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((c) => { if (alive) setConfig({ ...DEFAULTS, ...c }); })
      // Falling back is correct here: a config blip must not blank the app,
      // and every consumer has a sane default.
      .catch(() => {})
      .finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, []);

  const value = useMemo(() => ({
    ...config,
    loaded,
    usdToInr: (usd) => (Number(usd) || 0) * (config.fx?.usd_inr || DEFAULTS.fx.usd_inr)
  }), [config, loaded]);

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

export const useConfig = () => {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error('useConfig must be used within a ConfigProvider');
  return ctx;
};
