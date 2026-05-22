import React from 'react';
import type { DashboardMetrics } from '../../../backend/src/types';

interface DashboardProps {
  metrics: DashboardMetrics | null;
  onRefresh: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ metrics, onRefresh }) => {
  
  // Custom helper to generate an SVG line path and area gradient path
  const generateSvgPaths = (data: { time: string; value: number }[], width: number, height: number) => {
    if (!data || data.length < 2) return { linePath: '', areaPath: '', points: [] };

    const padding = 10;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    const values = data.map(d => d.value);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const valRange = maxVal - minVal === 0 ? 1 : maxVal - minVal;

    const points = data.map((d, index) => {
      const x = padding + (index / (data.length - 1)) * chartWidth;
      // Invert Y so higher values are higher up in the SVG container
      const y = padding + chartHeight - ((d.value - minVal) / valRange) * chartHeight;
      return { x, y, value: d.value, time: d.time };
    });

    // Create line path string
    const linePath = points.reduce((acc, p, i) => {
      return i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
    }, '');

    // Close the area path at the bottom of the chart
    const areaPath = points.length > 0 
      ? `${linePath} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z` 
      : '';

    return { linePath, areaPath, points };
  };

  const renderSparkline = (
    data: { time: string; value: number }[],
    gradientId: string,
    color: string,
    title: string,
    unit: string = ''
  ) => {
    const width = 450;
    const height = 180;
    const { linePath, areaPath, points } = generateSvgPaths(data, width, height);

    if (data.length === 0) {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '180px', color: 'var(--text-muted)' }}>
          Awaiting more ingestion payloads...
        </div>
      );
    }

    return (
      <div style={{ position: 'relative' }}>
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} aria-label={`${title} Sparkline`}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.4" />
              <stop offset="100%" stopColor={color} stopOpacity="0.0" />
            </linearGradient>
          </defs>
          
          {/* Subtle horizontal grid lines */}
          <line x1="0" y1={height / 3} x2={width} y2={height / 3} stroke="rgba(255,255,255,0.03)" strokeDasharray="3 3" />
          <line x1="0" y1={(height / 3) * 2} x2={width} y2={(height / 3) * 2} stroke="rgba(255,255,255,0.03)" strokeDasharray="3 3" />

          {/* Area Fill */}
          {areaPath && <path d={areaPath} fill={`url(#${gradientId})`} />}

          {/* Line Path */}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke={color}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ filter: `drop-shadow(0px 4px 6px ${color}22)` }}
            />
          )}

          {/* Data Points */}
          {points.map((p, idx) => (
            <g key={idx} className="chart-marker">
              <circle
                cx={p.x}
                cy={p.y}
                r="3"
                fill={color}
                stroke="#060608"
                strokeWidth="1"
              />
              <title>{`${p.value}${unit} at ${p.time}`}</title>
            </g>
          ))}
        </svg>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '4px' }}>
          <span>{data[0]?.time}</span>
          <span>{data[data.length - 1]?.time}</span>
        </div>
      </div>
    );
  };

  if (!metrics || metrics.totalRequests === 0) {
    return (
      <div className="dashboard">
        <header className="dashboard-header">
          <h1 className="dashboard-title">Database & Ingestion Metrics</h1>
          <button onClick={onRefresh} className="refresh-btn">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
            </svg>
            Refresh
          </button>
        </header>
        <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '100px' }}>
          <div className="empty-state-icon">📊</div>
          <h2>System Operational Metrics</h2>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '400px', margin: '8px auto 0', textAlign: 'center' }}>
            No logs have been ingested yet. Start a chat session and send a few prompts to generate inference metadata.
          </p>
        </div>
      </div>
    );
  }

  // Calculate highest count for model scaling
  const maxModelCount = Math.max(...metrics.modelStats.map(m => m.count), 1);

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1 className="dashboard-title">System Metrics</h1>
        <button onClick={onRefresh} className="refresh-btn">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
          </svg>
          Refresh Data
        </button>
      </header>

      {/* Primary KPI Grid */}
      <div className="metrics-grid">
        <div className="glass-panel metric-card">
          <span className="metric-label">Total Ingestion Calls</span>
          <span className="metric-value">{metrics.totalRequests}</span>
          <span className="metric-subtext">Total successful & failed API runs</span>
        </div>

        <div className="glass-panel metric-card">
          <span className="metric-label">Average Latency</span>
          <span className="metric-value" style={{ color: 'var(--accent-violet)' }}>{metrics.averageLatencyMs} ms</span>
          <span className="metric-subtext">Compute round-trip inference speed</span>
        </div>

        <div className="glass-panel metric-card">
          <span className="metric-label">Tokens Consumed</span>
          <span className="metric-value">{metrics.totalTokens.toLocaleString()}</span>
          <span className="metric-subtext">Sum of prompt + model tokens</span>
        </div>

        <div className="glass-panel metric-card">
          <span className="metric-label">Failure / Error Rate</span>
          <span className="metric-value" style={{ color: metrics.errorRate > 0 ? 'var(--accent-rose)' : 'var(--accent-emerald)' }}>
            {(metrics.errorRate * 100).toFixed(2)}%
          </span>
          <span className="metric-subtext">Inference request error status ratio</span>
        </div>
      </div>

      {/* Chronological Sparklines Grid */}
      <div className="charts-grid">
        <div className="glass-panel chart-card">
          <span className="chart-title">Latency Trends (ms)</span>
          {renderSparkline(
            metrics.latencyHistory.map(h => ({ time: h.time, value: h.latency })),
            'latencyGradient',
            '#8b5cf6',
            'Latency',
            'ms'
          )}
        </div>

        <div className="glass-panel chart-card">
          <span className="chart-title">Token Load per Request</span>
          {renderSparkline(
            metrics.tokensHistory.map(h => ({ time: h.time, value: h.tokens })),
            'tokensGradient',
            '#3b82f6',
            'Tokens'
          )}
        </div>

        <div className="glass-panel chart-card">
          <span className="chart-title">Error Rate Rolling Curve</span>
          {renderSparkline(
            metrics.errorRateHistory.map(h => ({ time: h.time, value: h.errorRate * 100 })),
            'errorsGradient',
            '#f43f5e',
            'Error Rate',
            '%'
          )}
        </div>

        {/* Model Distribution & Average Latency per Model */}
        <div className="glass-panel chart-card">
          <span className="chart-title">Model Load Distribution</span>
          <div className="models-list">
            {metrics.modelStats.map((modelInfo) => (
              <div key={modelInfo.model} className="model-bar-wrapper">
                <div className="model-info-row">
                  <span className="model-name">{modelInfo.model}</span>
                  <span className="model-count">
                    {modelInfo.count} requests (avg {modelInfo.avgLatency}ms)
                  </span>
                </div>
                <div className="model-bar-bg">
                  <div
                    className="model-bar-fill"
                    style={{ width: `${(modelInfo.count / maxModelCount) * 100}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
