import React, { useState, useRef, useCallback } from 'react';
import axios from 'axios';
import ReactFlow, {
  Background, Controls, MiniMap,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { layoutGraph, statsFromGraph } from './graphLayout';

// ─── Design System ────────────────────────────────────────────────────────────
const ds = {
  color: {
    bg:           '#f4f6fb',
    surface:      '#ffffff',
    card:         '#ffffff',
    border:       '#e4e7f0',
    accent:       '#5b5fc7',
    accentLight:  '#ede9fe',
    accentDark:   '#4338ca',
    text:         '#0f1117',
    textSub:      '#6b7280',
    textDim:      '#9ca3af',
    green:        '#16a34a',
    greenBg:      '#f0fdf4',
    greenBorder:  '#bbf7d0',
    red:          '#dc2626',
    redBg:        '#fef2f2',
    redBorder:    '#fecaca',
    orange:       '#ea580c',
    orangeBg:     '#fff7ed',
    orangeBorder: '#fed7aa',
    blue:         '#2563eb',
    blueBg:       '#eff6ff',
    blueBorder:   '#bfdbfe',
    gold:         '#d97706',
    goldBg:       '#fffbeb',
    goldBorder:   '#fde68a',
    whatsapp:     '#16a34a',
    navBg:        '#ffffff',
    navBorder:    '#e4e7f0',
  },
  font: {
    display: "'DM Serif Display', Georgia, serif",
    body:    "'DM Sans', system-ui, sans-serif",
  },
  shadow: {
    sm:  '0 1px 3px rgba(0,0,0,0.08)',
    md:  '0 4px 12px rgba(0,0,0,0.08)',
    lg:  '0 10px 30px rgba(0,0,0,0.10)',
    active: '0 0 0 3px rgba(91,95,199,0.15)',
  },
  radius: { sm: '6px', md: '10px', lg: '16px', full: '9999px' },
  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
};

// ─── Icons ────────────────────────────────────────────────────────────────────
const EmailIcon = ({ size = 18, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2"/>
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
  </svg>
);
const WhatsAppIcon = ({ size = 18, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
  </svg>
);
const SMSIcon = ({ size = 18, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
);
const MapIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
    <line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/>
  </svg>
);
const StopIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <rect x="4" y="4" width="16" height="16" rx="2"/>
  </svg>
);

// ─── Node helpers ─────────────────────────────────────────────────────────────
const nodeStyle = (type) => ({
  happy_path: { bg: ds.color.greenBg,    border: ds.color.greenBorder,  text: ds.color.green,  label: 'Happy Path' },
  dropoff:    { bg: ds.color.redBg,      border: ds.color.redBorder,    text: ds.color.red,    label: 'Dropoff'    },
  retention:  { bg: ds.color.orangeBg,   border: ds.color.orangeBorder, text: ds.color.orange, label: 'Retention'  },
  start:      { bg: ds.color.accentLight,border: ds.color.accent,       text: ds.color.accent, label: 'Start'      },
}[type] || { bg: ds.color.greenBg, border: ds.color.greenBorder, text: ds.color.green, label: 'Step' });

// ─── Custom Node ──────────────────────────────────────────────────────────────
const CustomNode = ({ data, selected }) => {
  const ns = nodeStyle(data.type);
  return (
    <div style={{
      background: ds.color.surface,
      border: `1.5px solid ${selected ? ds.color.accent : ns.border}`,
      borderRadius: ds.radius.md,
      padding: '10px 14px',
      width: 200,
      cursor: 'pointer',
      transition: ds.transition,
      boxShadow: selected ? ds.shadow.active : ds.shadow.sm,
      borderLeft: `4px solid ${ns.text}`,
    }}>
      <div style={{ fontSize: '11px', fontWeight: '600', color: ds.color.text, fontFamily: ds.font.body, marginBottom: '6px', lineHeight: 1.3 }}>
        {data.label}
      </div>
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '9px', fontWeight: '600', color: ns.text, background: ns.bg, border: `1px solid ${ns.border}`, padding: '1px 6px', borderRadius: ds.radius.full }}>
          {ns.label}
        </span>
        {data.messageType && (
          <span style={{
            fontSize: '9px', fontWeight: '600',
            color: data.messageType === 'UTILITY' ? ds.color.blue : ds.color.gold,
            background: data.messageType === 'UTILITY' ? ds.color.blueBg : ds.color.goldBg,
            border: `1px solid ${data.messageType === 'UTILITY' ? ds.color.blueBorder : ds.color.goldBorder}`,
            padding: '1px 6px', borderRadius: ds.radius.full,
          }}>
            {data.messageType}
          </span>
        )}
        {data.shouldCampaign && (
          <span style={{ fontSize: '9px', fontWeight: '600', color: ds.color.accent, background: ds.color.accentLight, border: `1px solid ${ds.color.accent}40`, padding: '1px 6px', borderRadius: ds.radius.full }}>
            Campaign
          </span>
        )}
      </div>
      {data.type === 'dropoff' && data.step?.dropoffReason && (
        <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: `1px solid ${ds.color.redBorder}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '9px', color: ds.color.red, lineHeight: 1.3, flex: 1 }}>
            {data.step.dropoffReason}
          </span>
          {data.step.dropoffRate && (
            <span style={{ fontSize: '9px', fontWeight: '700', color: ds.color.red, background: ds.color.redBg, border: `1px solid ${ds.color.redBorder}`, padding: '1px 5px', borderRadius: ds.radius.full, whiteSpace: 'nowrap' }}>
              {data.step.dropoffRate}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
const nodeTypes = { custom: CustomNode };

// ─── Branch Loader ────────────────────────────────────────────────────────────
const BranchLoader = ({ message }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '32px' }}>
    <svg width="320" height="260" viewBox="0 0 320 260" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <style>{`
          .bl { stroke-dasharray: 120; stroke-dashoffset: 120; }
          .bs { stroke-dasharray: 80; stroke-dashoffset: 80; }
          .bt { stroke-dasharray: 40; stroke-dashoffset: 40; }
          .bn { opacity: 0; }
          .e0 { animation: dl 0.5s ease forwards 0.3s; }
          .e1 { animation: dl 0.5s ease forwards 0.4s; }
          .e2 { animation: ds 0.4s ease forwards 1.1s; }
          .e3 { animation: ds 0.4s ease forwards 1.2s; }
          .e4 { animation: ds 0.4s ease forwards 1.3s; }
          .e5 { animation: ds 0.4s ease forwards 1.4s; }
          .e6 { animation: dt 0.3s ease forwards 2.0s; }
          .e7 { animation: dt 0.3s ease forwards 2.1s; }
          .n0 { animation: fn 0.3s ease forwards 0.1s; }
          .n1 { animation: fn 0.3s ease forwards 0.9s; }
          .n2 { animation: fn 0.3s ease forwards 1.0s; }
          .n3 { animation: fn 0.3s ease forwards 1.6s; }
          .n4 { animation: fn 0.3s ease forwards 1.7s; }
          .n5 { animation: fn 0.3s ease forwards 1.8s; }
          .n6 { animation: fn 0.3s ease forwards 1.9s; }
          .n7 { animation: fn 0.3s ease forwards 2.4s; }
          .n8 { animation: fn 0.3s ease forwards 2.5s; }
          .bc { animation: fn 0.3s ease forwards 2.8s; }
          @keyframes dl { to { stroke-dashoffset: 0; } }
          @keyframes ds { to { stroke-dashoffset: 0; } }
          @keyframes dt { to { stroke-dashoffset: 0; } }
          @keyframes fn { to { opacity: 1; } }
          .dot { animation: travelLoop 3s ease-in-out infinite 3s; }
          @keyframes travelLoop {
            0%   { cx: 160; cy: 44; opacity: 0; }
            5%   { opacity: 0.9; }
            25%  { cx: 72;  cy: 120; opacity: 0.9; }
            45%  { cx: 34;  cy: 196; opacity: 0.9; }
            55%  { cx: 34;  cy: 196; opacity: 0; }
            60%  { cx: 160; cy: 44; opacity: 0; }
            65%  { opacity: 0.9; }
            85%  { cx: 248; cy: 120; opacity: 0.9; }
            95%  { cx: 208; cy: 196; opacity: 0.9; }
            100% { opacity: 0; }
          }
          .ping2 { animation: pingN 1.2s ease-in-out infinite 3.2s; transform-box: fill-box; transform-origin: center; }
          .ping6 { animation: pingN 1.2s ease-in-out infinite 3.6s; transform-box: fill-box; transform-origin: center; }
          @keyframes pingN {
            0%, 100% { stroke-width: 1.5; }
            50% { stroke-width: 3; }
          }
        `}</style>
      </defs>
      {/* Edges */}
      <line className="bl e0" x1="160" y1="44" x2="72" y2="96" stroke="#c7c9e8" strokeWidth="1.8"/>
      <line className="bl e1" x1="160" y1="44" x2="248" y2="96" stroke="#fca5a5" strokeWidth="1.8"/>
      <line className="bs e2" x1="72" y1="120" x2="34" y2="172" stroke="#86efac" strokeWidth="1.8"/>
      <line className="bs e3" x1="72" y1="120" x2="112" y2="172" stroke="#93c5fd" strokeWidth="1.8"/>
      <line className="bs e4" x1="248" y1="120" x2="208" y2="172" stroke="#fcd34d" strokeWidth="1.8"/>
      <line className="bs e5" x1="248" y1="120" x2="286" y2="172" stroke="#fca5a5" strokeWidth="1.8"/>
      <line className="bt e6" x1="34" y1="196" x2="34" y2="226" stroke="#86efac" strokeWidth="1.8"/>
      <line className="bt e7" x1="112" y1="196" x2="112" y2="226" stroke="#93c5fd" strokeWidth="1.8"/>
      {/* Root */}
      <g className="bn n0">
        <rect x="122" y="12" width="76" height="28" rx="7" fill="#ede9fe" stroke="#5b5fc7" strokeWidth="1.5"/>
        <text x="160" y="26" textAnchor="middle" fontSize="9.5" fontFamily="DM Sans,sans-serif" fill="#4338ca" fontWeight="600">Homepage</text>
      </g>
      {/* L1 */}
      <g className="bn n1">
        <rect x="30" y="96" width="84" height="28" rx="7" fill="#f0fdf4" stroke="#86efac" strokeWidth="1.5"/>
        <text x="72" y="110" textAnchor="middle" fontSize="9.5" fontFamily="DM Sans,sans-serif" fill="#15803d" fontWeight="600">Category Browse</text>
      </g>
      <g className="bn n2">
        <rect x="206" y="96" width="84" height="28" rx="7" fill="#fef2f2" stroke="#fca5a5" strokeWidth="1.5" className="ping2"/>
        <text x="248" y="110" textAnchor="middle" fontSize="9.5" fontFamily="DM Sans,sans-serif" fill="#dc2626" fontWeight="600">Cart Abandon</text>
      </g>
      {/* L2 */}
      <g className="bn n3">
        <rect x="4" y="172" width="60" height="28" rx="6" fill="#f0fdf4" stroke="#86efac" strokeWidth="1.5"/>
        <text x="34" y="183" textAnchor="middle" fontSize="9" fontFamily="DM Sans,sans-serif" fill="#15803d" fontWeight="600">Product</text>
        <text x="34" y="194" textAnchor="middle" fontSize="9" fontFamily="DM Sans,sans-serif" fill="#15803d" fontWeight="600">View</text>
      </g>
      <g className="bn n4">
        <rect x="82" y="172" width="60" height="28" rx="6" fill="#eff6ff" stroke="#93c5fd" strokeWidth="1.5"/>
        <text x="112" y="183" textAnchor="middle" fontSize="9" fontFamily="DM Sans,sans-serif" fill="#1d4ed8" fontWeight="600">Add to</text>
        <text x="112" y="194" textAnchor="middle" fontSize="9" fontFamily="DM Sans,sans-serif" fill="#1d4ed8" fontWeight="600">Cart</text>
      </g>
      <g className="bn n5">
        <rect x="176" y="172" width="64" height="28" rx="6" fill="#fffbeb" stroke="#fcd34d" strokeWidth="1.5"/>
        <text x="208" y="183" textAnchor="middle" fontSize="9" fontFamily="DM Sans,sans-serif" fill="#b45309" fontWeight="600">Checkout</text>
        <text x="208" y="194" textAnchor="middle" fontSize="9" fontFamily="DM Sans,sans-serif" fill="#b45309" fontWeight="600">Drop</text>
      </g>
      <g className="bn n6">
        <rect x="252" y="172" width="60" height="28" rx="6" fill="#fef2f2" stroke="#fca5a5" strokeWidth="1.5" className="ping6"/>
        <text x="282" y="183" textAnchor="middle" fontSize="9" fontFamily="DM Sans,sans-serif" fill="#dc2626" fontWeight="600">Payment</text>
        <text x="282" y="194" textAnchor="middle" fontSize="9" fontFamily="DM Sans,sans-serif" fill="#dc2626" fontWeight="600">Fail</text>
      </g>
      {/* L3 */}
      <g className="bn n7">
        <rect x="4" y="226" width="60" height="24" rx="6" fill="#f0fdf4" stroke="#86efac" strokeWidth="1.5"/>
        <text x="34" y="238" textAnchor="middle" fontSize="9" fontFamily="DM Sans,sans-serif" fill="#15803d" fontWeight="600">Purchase ✓</text>
      </g>
      <g className="bn n8">
        <rect x="82" y="226" width="60" height="24" rx="6" fill="#ede9fe" stroke="#c4b5fd" strokeWidth="1.5"/>
        <text x="112" y="238" textAnchor="middle" fontSize="9" fontFamily="DM Sans,sans-serif" fill="#5b5fc7" fontWeight="600">Campaign</text>
      </g>
      {/* Campaign badge */}
      <g className="bn bc">
        <rect x="214" y="88" width="68" height="14" rx="7" fill="#5b5fc7"/>
        <text x="248" y="95.5" textAnchor="middle" fontSize="7.5" fontFamily="DM Sans,sans-serif" fill="#ffffff" fontWeight="700" letterSpacing="0.5">● CAMPAIGN</text>
      </g>
      {/* Travelling dot */}
      <circle className="dot" r="4" fill="#5b5fc7" opacity="0"/>
    </svg>

    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '18px', fontWeight: '600', fontFamily: ds.font.display, color: ds.color.text, marginBottom: '6px' }}>
        Building your journey map
      </div>
      <div style={{ fontSize: '13px', color: ds.color.textSub, minHeight: '20px', transition: 'opacity 0.4s ease' }}>
        {message}
      </div>
      <div style={{ fontSize: '11px', color: ds.color.textDim, marginTop: '4px' }}>
        Takes <span style={{ color: ds.color.accent, fontWeight: '600' }}>30–60 seconds</span> — Apify is crawling real pages
      </div>
    </div>
  </div>
);

// ─── Stat Card ────────────────────────────────────────────────────────────────
const StatCard = ({ label, value, color }) => (
  <div style={{ background: ds.color.surface, border: `1px solid ${ds.color.border}`, borderRadius: ds.radius.md, padding: '10px 12px', flex: 1, boxShadow: ds.shadow.sm }}>
    <div style={{ fontSize: '20px', fontWeight: '700', color, fontFamily: ds.font.display }}>{value}</div>
    <div style={{ fontSize: '9px', color: ds.color.textDim, letterSpacing: '1px', textTransform: 'uppercase', marginTop: '2px' }}>{label}</div>
  </div>
);

const SectionLabel = ({ children }) => (
  <div style={{ fontSize: '9px', fontWeight: '700', letterSpacing: '2px', textTransform: 'uppercase', color: ds.color.textDim, marginBottom: '6px', marginTop: '14px' }}>
    {children}
  </div>
);

const InfoBox = ({ children, accent, mono }) => (
  <div style={{ background: accent ? `${accent}08` : ds.color.bg, border: `1px solid ${accent ? `${accent}25` : ds.color.border}`, borderRadius: ds.radius.sm, padding: '10px 12px', fontSize: mono ? '12px' : '13px', lineHeight: 1.7, color: ds.color.text, marginBottom: '10px', fontFamily: mono ? 'monospace' : ds.font.body, whiteSpace: mono ? 'pre-wrap' : 'normal' }}>
    {children}
  </div>
);

const Tag = ({ children, color, bg, border }) => (
  <span style={{ fontSize: '11px', padding: '3px 9px', borderRadius: ds.radius.full, background: bg, color, border: `1px solid ${border}`, display: 'inline-block', fontFamily: ds.font.body }}>
    {children}
  </span>
);

const ProgressBar = ({ channel, progress, color }) => (
  <div style={{ marginBottom: '8px' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
      <span style={{ fontSize: '11px', color: ds.color.textSub, fontWeight: '500' }}>{channel}</span>
      <span style={{ fontSize: '11px', color, fontWeight: '600' }}>{progress}%</span>
    </div>
    <div style={{ height: '4px', background: ds.color.border, borderRadius: ds.radius.full, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${progress}%`, background: `linear-gradient(90deg, ${color}80, ${color})`, borderRadius: ds.radius.full, transition: 'width 0.3s ease' }}/>
    </div>
  </div>
);

// ─── Generate session ID ──────────────────────────────────────────────────────
const genSessionId = () => `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [url, setUrl]                       = useState('');
  const [loading, setLoading]               = useState(false);
  const [loadingMsg, setLoadingMsg]         = useState('');
  const [journey, setJourney]               = useState(null);
  const [nodes, setNodes]                   = useState([]);
  const [edges, setEdges]                   = useState([]);
  const [selectedStep, setSelectedStep]     = useState(null);
  const [activeChannel, setActiveChannel]   = useState(null);
  const [channelData, setChannelData]       = useState({});
  const [channelLoading, setChannelLoading] = useState(false);
  const [channelProgress, setChannelProgress] = useState(0);
  const [sidebarOpen, setSidebarOpen]       = useState(true);
  const [aborted, setAborted]               = useState(false);
  const campaignCache   = useRef({});
  const progressInterval = useRef(null);
  const loadingInterval  = useRef(null);
  const sessionId        = useRef(genSessionId());

  const loadingMessages = [
    'Starting Apify crawler...',
    'Crawling homepage structure...',
    'Following navigation links...',
    'Mapping category pages...',
    'Discovering product flows...',
    'Identifying checkout paths...',
    'Analysing user drop-off patterns...',
    'Building behaviour-first journey tree...',
    'Applying campaign trigger rules...',
    'Finalising journey map...',
  ];

  // ── Crawl ──────────────────────────────────────────────────────────────────
  const handleCrawl = async () => {
    if (!url) return;
    sessionId.current = genSessionId();
    setLoading(true);
    setAborted(false);
    setJourney(null);
    setSelectedStep(null);
    setActiveChannel(null);
    setChannelData({});
    campaignCache.current = {};

    let msgIdx = 0;
    setLoadingMsg(loadingMessages[0]);
    loadingInterval.current = setInterval(() => {
      msgIdx = (msgIdx + 1) % loadingMessages.length;
      setLoadingMsg(loadingMessages[msgIdx]);
    }, 4000);

    try {
      const res = await axios.post('http://localhost:5001/api/crawler/crawl', {
        url,
        sessionId: sessionId.current,
      });

      if (res.data.aborted) {
        setAborted(true);
      } else if (res.data.success && res.data.graph?.nodes?.length) {
        // The crawl API returns { brand, graph: { nodes, edges } }; graphLayout
        // turns that into React Flow nodes/edges. Keep brand fields on `journey`
        // so the sidebar + campaign generator read them unchanged.
        const { nodes: n, edges: e } = layoutGraph(res.data.graph, ds);
        setNodes(n);
        setEdges(e);
        setJourney({ ...res.data.brand, graph: res.data.graph });
      } else {
        // Missing/malformed graph or success:false — surface it instead of crashing.
        alert('Error: ' + (res.data.error || 'No journey data returned for this URL.'));
      }
    } catch (err) {
      if (!aborted) alert('Error: ' + err.message);
    }

    clearInterval(loadingInterval.current);
    setLoading(false);
  };

  // ── Stop crawl ─────────────────────────────────────────────────────────────
  const handleStop = async () => {
    setAborted(true);
    clearInterval(loadingInterval.current);
    try {
      await axios.post('http://localhost:5001/api/crawler/stop', {
        sessionId: sessionId.current,
      });
    } catch (e) {}
    setLoading(false);
    setLoadingMsg('');
  };

  // ── Node click ─────────────────────────────────────────────────────────────
  const handleNodeClick = useCallback((_, node) => {
    if (!node.data?.step) return;
    setSelectedStep(node.data.step);
    setActiveChannel(null);
    setChannelData({});
  }, []);

  // ── Progress bar ───────────────────────────────────────────────────────────
  const simulateProgress = () => {
    setChannelProgress(0);
    clearInterval(progressInterval.current);
    let p = 0;
    progressInterval.current = setInterval(() => {
      p += Math.random() * 12 + 3;
      if (p >= 92) { clearInterval(progressInterval.current); p = 92; }
      setChannelProgress(Math.min(Math.round(p), 92));
    }, 200);
  };
  const completeProgress = () => { clearInterval(progressInterval.current); setChannelProgress(100); };

  // ── Channel click ──────────────────────────────────────────────────────────
  const handleChannelClick = async (channel) => {
    if (!selectedStep) return;
    setActiveChannel(channel);
    const cacheKey = `${selectedStep.step}-${channel}`;
    if (campaignCache.current[cacheKey]) {
      setChannelData(prev => ({ ...prev, [channel]: campaignCache.current[cacheKey] }));
      setChannelProgress(100);
      return;
    }
    setChannelLoading(true);
    simulateProgress();
    try {
      const res = await axios.post('http://localhost:5001/api/crawler/generate-campaign', {
        brandName:     journey.brandName,
        brandTone:     journey.brandTone,
        brandVertical: journey.brandVertical,
        step:          selectedStep.step,
        messageType:   selectedStep.messageType,
        phase:         selectedStep.phase,
        channel,
      });
      campaignCache.current[cacheKey] = res.data.campaign;
      setChannelData(prev => ({ ...prev, [channel]: res.data.campaign }));
      completeProgress();
    } catch (err) {
      alert('Error: ' + err.message);
      setChannelProgress(0);
    }
    setChannelLoading(false);
  };

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = journey ? statsFromGraph(journey.graph) : {};
  const campaign = activeChannel ? channelData[activeChannel] : null;

  const channelConfig = {
    email:    { color: ds.color.green,    bg: ds.color.greenBg, border: ds.color.greenBorder, label: 'Email',    Icon: EmailIcon    },
    whatsapp: { color: ds.color.whatsapp, bg: ds.color.greenBg, border: ds.color.greenBorder, label: 'WhatsApp', Icon: WhatsAppIcon },
    sms:      { color: ds.color.blue,     bg: ds.color.blueBg,  border: ds.color.blueBorder,  label: 'SMS',      Icon: SMSIcon      },
  };

  return (
    <div style={{ fontFamily: ds.font.body, background: ds.color.bg, minHeight: '100vh', color: ds.color.text, display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100vh' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Serif+Display&display=swap" rel="stylesheet"/>

      {/* ── NAV ── */}
      <div style={{ height: '56px', borderBottom: `1px solid ${ds.color.navBorder}`, background: ds.color.navBg, display: 'flex', alignItems: 'center', padding: '0 20px', gap: '16px', flexShrink: 0, boxShadow: ds.shadow.sm, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <div style={{ width: '30px', height: '30px', background: `linear-gradient(135deg, ${ds.color.accent}, ${ds.color.accentDark})`, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MapIcon size={14} />
          </div>
          <span style={{ fontSize: '16px', fontWeight: '700', fontFamily: ds.font.display, color: ds.color.accent }}>EngagR</span>
        </div>

        <div style={{ width: '1px', height: '20px', background: ds.color.border }}/>

        <div style={{ flex: 1, display: 'flex', gap: '8px', maxWidth: '640px' }}>
          <input
            style={{ flex: 1, padding: '7px 14px', fontSize: '13px', background: ds.color.bg, border: `1px solid ${ds.color.border}`, borderRadius: ds.radius.md, color: ds.color.text, outline: 'none', fontFamily: ds.font.body }}
            placeholder="https://www.mamaearth.in"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !loading && handleCrawl()}
            disabled={loading}
          />
          {!loading ? (
            <button
              onClick={handleCrawl}
              style={{ padding: '7px 18px', fontSize: '12px', fontWeight: '700', background: `linear-gradient(135deg, ${ds.color.accent}, ${ds.color.accentDark})`, color: '#ffffff', border: 'none', borderRadius: ds.radius.md, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: ds.font.body, boxShadow: ds.shadow.sm }}
            >
              Map Journey
            </button>
          ) : (
            <button
              onClick={handleStop}
              style={{ padding: '7px 16px', fontSize: '12px', fontWeight: '700', background: ds.color.redBg, color: ds.color.red, border: `1.5px solid ${ds.color.redBorder}`, borderRadius: ds.radius.md, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: ds.font.body, display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <StopIcon size={12}/> Stop
            </button>
          )}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button onClick={() => setSidebarOpen(o => !o)} style={{ background: 'transparent', border: `1px solid ${ds.color.border}`, borderRadius: ds.radius.sm, color: ds.color.textSub, padding: '5px 10px', fontSize: '11px', cursor: 'pointer', fontFamily: ds.font.body }}>
            {sidebarOpen ? '◀ Hide' : '▶ Show'}
          </button>
          <span style={{ fontSize: '9px', fontWeight: '700', letterSpacing: '2px', color: ds.color.accent, background: ds.color.accentLight, border: `1px solid ${ds.color.accent}40`, padding: '3px 8px', borderRadius: ds.radius.full }}>BETA</span>
        </div>
      </div>

      {/* ── BODY ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── LEFT SIDEBAR ── */}
        <div style={{ width: sidebarOpen ? '220px' : '0px', flexShrink: 0, borderRight: `1px solid ${ds.color.border}`, background: ds.color.surface, overflow: 'hidden', transition: 'width 0.3s cubic-bezier(0.4,0,0.2,1)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '16px', overflowY: 'auto', flex: 1, minWidth: '220px' }}>
            {journey ? (
              <>
                <div style={{ background: ds.color.accentLight, border: `1px solid ${ds.color.accent}30`, borderRadius: ds.radius.md, padding: '12px', marginBottom: '16px' }}>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: ds.color.accent, marginBottom: '4px' }}>{journey.brandName}</div>
                  <p style={{ fontSize: '11px', color: ds.color.textSub, lineHeight: 1.5, margin: 0 }}>{journey.brandTone}</p>
                  {journey.brandVertical && (
                    <div style={{ fontSize: '10px', color: ds.color.accent, marginTop: '4px', fontWeight: '600', textTransform: 'capitalize' }}>
                      {journey.brandVertical}
                    </div>
                  )}
                  {journey.pagesFound && (
                    <div style={{ fontSize: '10px', color: ds.color.textDim, marginTop: '2px' }}>
                      {journey.pagesFound} pages crawled
                    </div>
                  )}
                </div>

                <div style={{ fontSize: '9px', fontWeight: '700', letterSpacing: '2px', color: ds.color.textDim, textTransform: 'uppercase', marginBottom: '8px' }}>Journey Stats</div>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                  <StatCard label="Nodes" value={stats.total} color={ds.color.accent}/>
                  <StatCard label="Drops" value={stats.dropoffs} color={ds.color.red}/>
                </div>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '20px' }}>
                  <StatCard label="Happy" value={stats.happy} color={ds.color.green}/>
                  <StatCard label="Retain" value={stats.retention} color={ds.color.orange}/>
                </div>

                <div style={{ fontSize: '9px', fontWeight: '700', letterSpacing: '2px', color: ds.color.textDim, textTransform: 'uppercase', marginBottom: '10px' }}>Legend</div>
                {[
                  { color: ds.color.green,  label: 'Happy Path'   },
                  { color: ds.color.red,    label: 'Dropoff'      },
                  { color: ds.color.orange, label: 'Retention'    },
                  { color: ds.color.blue,   label: 'Utility'      },
                  { color: ds.color.gold,   label: 'Marketing'    },
                  { color: ds.color.accent, label: 'Has Campaign' },
                ].map(l => (
                  <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: l.color, flexShrink: 0 }}/>
                    <span style={{ fontSize: '11px', color: ds.color.textSub }}>{l.label}</span>
                  </div>
                ))}
              </>
            ) : (
              <div style={{ padding: '24px 0', textAlign: 'center' }}>
                <div style={{ fontSize: '32px', opacity: 0.15, marginBottom: '10px' }}><MapIcon size={32}/></div>
                <div style={{ fontSize: '12px', color: ds.color.textDim, lineHeight: 1.6 }}>Enter a website URL to generate an AI-powered journey map</div>
              </div>
            )}
          </div>
        </div>

        {/* ── CENTRE ── */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: ds.color.bg }}>

          {/* Loading */}
          {loading && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: ds.color.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <BranchLoader message={loadingMsg}/>
            </div>
          )}

          {/* Aborted state */}
          {!loading && aborted && !journey && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
              <div style={{ fontSize: '24px', fontWeight: '700', fontFamily: ds.font.display, color: ds.color.text }}>Crawl stopped</div>
              <div style={{ fontSize: '14px', color: ds.color.textSub }}>Enter a URL and try again.</div>
            </div>
          )}

          {/* Empty state */}
          {!loading && !journey && !aborted && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '48px' }}>
              <div style={{ fontSize: '48px', fontWeight: '700', fontFamily: ds.font.display, color: ds.color.text, textAlign: 'center', lineHeight: 1.1 }}>
                Map. Engage.<br/>Retain.
              </div>
              <div style={{ fontSize: '15px', color: ds.color.textSub, textAlign: 'center', maxWidth: '400px', lineHeight: 1.7 }}>
                Enter any B2C website URL to generate a real branching user journey with AI-optimised campaign templates.
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px', flexWrap: 'wrap', justifyContent: 'center' }}>
                {['mamaearth.in', 'boat-lifestyle.com', 'sugarcosmetics.com'].map(site => (
                  <button key={site} onClick={() => setUrl(`https://www.${site}`)} style={{ padding: '6px 14px', fontSize: '12px', background: ds.color.surface, border: `1px solid ${ds.color.border}`, borderRadius: ds.radius.full, color: ds.color.accent, cursor: 'pointer', fontFamily: ds.font.body, boxShadow: ds.shadow.sm, fontWeight: '500' }}>
                    {site}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ReactFlow */}
          {journey && !loading && (
            <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodeClick={handleNodeClick} fitView fitViewOptions={{ padding: 0.15 }} style={{ background: ds.color.bg }} minZoom={0.1} maxZoom={2}>
              <Background color={ds.color.border} gap={24} size={1} variant="dots"/>
              <Controls style={{ background: ds.color.surface, border: `1px solid ${ds.color.border}`, borderRadius: ds.radius.md, boxShadow: ds.shadow.sm }}/>
              <MiniMap style={{ background: ds.color.surface, border: `1px solid ${ds.color.border}`, borderRadius: ds.radius.md, boxShadow: ds.shadow.sm }} nodeColor={n => nodeStyle(n.data?.type)?.text || ds.color.accent}/>
            </ReactFlow>
          )}

          {journey && !selectedStep && !loading && (
            <div style={{ position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)', background: ds.color.surface, border: `1px solid ${ds.color.border}`, borderRadius: ds.radius.full, padding: '7px 18px', fontSize: '12px', color: ds.color.textSub, pointerEvents: 'none', boxShadow: ds.shadow.md, whiteSpace: 'nowrap' }}>
              Click any node to generate campaign templates
            </div>
          )}
        </div>

        {/* ── RIGHT PANEL ── */}
        <div style={{ width: selectedStep ? '420px' : '0px', flexShrink: 0, borderLeft: `1px solid ${ds.color.border}`, background: ds.color.surface, overflow: 'hidden', transition: 'width 0.3s cubic-bezier(0.4,0,0.2,1)', display: 'flex', flexDirection: 'column', boxShadow: selectedStep ? ds.shadow.lg : 'none' }}>
          {selectedStep && (
            <div style={{ minWidth: '420px', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

              {/* Panel header */}
              <div style={{ padding: '14px 16px', borderBottom: `1px solid ${ds.color.border}`, background: ds.color.surface, flexShrink: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div style={{ fontSize: '15px', fontWeight: '700', fontFamily: ds.font.display, color: ds.color.text, lineHeight: 1.2, flex: 1, marginRight: '10px' }}>
                    {selectedStep.step}
                  </div>
                  <button onClick={() => { setSelectedStep(null); setActiveChannel(null); setChannelData({}); }} style={{ background: ds.color.bg, border: `1px solid ${ds.color.border}`, borderRadius: ds.radius.sm, color: ds.color.textDim, width: '24px', height: '24px', cursor: 'pointer', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
                </div>
                <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '10px', fontWeight: '600', color: selectedStep.messageType === 'UTILITY' ? ds.color.blue : ds.color.gold, background: selectedStep.messageType === 'UTILITY' ? ds.color.blueBg : ds.color.goldBg, border: `1px solid ${selectedStep.messageType === 'UTILITY' ? ds.color.blueBorder : ds.color.goldBorder}`, padding: '2px 8px', borderRadius: ds.radius.full }}>
                    {selectedStep.messageType}
                  </span>
                  <span style={{ fontSize: '10px', color: ds.color.textSub, background: ds.color.bg, border: `1px solid ${ds.color.border}`, padding: '2px 8px', borderRadius: ds.radius.full }}>
                    {selectedStep.phase}
                  </span>
                  {selectedStep.timing && selectedStep.timing !== 'N/A' && (
                    <span style={{ fontSize: '10px', color: ds.color.textSub, background: ds.color.bg, border: `1px solid ${ds.color.border}`, padding: '2px 8px', borderRadius: ds.radius.full }}>
                      ⏰ {selectedStep.timing}
                    </span>
                  )}
                  {selectedStep.shouldCampaign && (
                    <span style={{ fontSize: '10px', fontWeight: '600', color: ds.color.accent, background: ds.color.accentLight, border: `1px solid ${ds.color.accent}40`, padding: '2px 8px', borderRadius: ds.radius.full }}>
                      ✓ Campaign Triggered
                    </span>
                  )}
                  {selectedStep.dropoffRate && (
                    <span style={{ fontSize: '10px', fontWeight: '700', color: ds.color.red, background: ds.color.redBg, border: `1px solid ${ds.color.redBorder}`, padding: '2px 8px', borderRadius: ds.radius.full }}>
                      {selectedStep.dropoffRate} drop
                    </span>
                  )}
                </div>
                {selectedStep.dropoffReason && (
                  <div style={{ fontSize: '11px', color: ds.color.red, marginTop: '6px', fontStyle: 'italic' }}>
                    Reason: {selectedStep.dropoffReason}
                  </div>
                )}
              </div>

              {/* Channel selector */}
              <div style={{ padding: '12px 16px', borderBottom: `1px solid ${ds.color.border}`, flexShrink: 0, background: ds.color.bg }}>
                <div style={{ fontSize: '9px', fontWeight: '700', letterSpacing: '2px', color: ds.color.textDim, textTransform: 'uppercase', marginBottom: '10px' }}>Select Channel</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {Object.entries(channelConfig).map(([ch, cfg]) => (
                    <button key={ch} onClick={() => handleChannelClick(ch)} style={{ flex: 1, padding: '10px 6px', border: `1.5px solid ${activeChannel === ch ? cfg.color : ds.color.border}`, borderRadius: ds.radius.md, background: activeChannel === ch ? cfg.bg : ds.color.surface, color: activeChannel === ch ? cfg.color : ds.color.textSub, cursor: 'pointer', fontFamily: ds.font.body, fontSize: '11px', fontWeight: '600', transition: ds.transition, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', boxShadow: activeChannel === ch ? ds.shadow.sm : 'none' }}>
                      <cfg.Icon size={16} color={activeChannel === ch ? cfg.color : ds.color.textDim}/>
                      {cfg.label}
                    </button>
                  ))}
                </div>
                {activeChannel && (channelLoading || channelProgress === 100) && (
                  <div style={{ marginTop: '12px' }}>
                    <ProgressBar channel={channelConfig[activeChannel]?.label} progress={channelProgress} color={channelConfig[activeChannel]?.color}/>
                  </div>
                )}
              </div>

              {/* Campaign content */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
                {!activeChannel && (
                  <div style={{ textAlign: 'center', padding: '40px 16px', color: ds.color.textDim }}>
                    <div style={{ marginBottom: '10px', opacity: 0.3 }}><EmailIcon size={32} color={ds.color.textDim}/></div>
                    <div style={{ fontSize: '13px', lineHeight: 1.6 }}>Select a channel above to generate an optimised campaign template</div>
                  </div>
                )}

                {activeChannel && channelLoading && (
                  <div style={{ textAlign: 'center', padding: '40px 16px' }}>
                    <div style={{ fontSize: '13px', color: ds.color.textSub, marginBottom: '6px' }}>Crafting your {channelConfig[activeChannel]?.label} template...</div>
                    <div style={{ fontSize: '11px', color: ds.color.textDim }}>GPT-4o is writing an optimised message for this journey step</div>
                  </div>
                )}

                {activeChannel && !channelLoading && campaign && (
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: ds.color.text, padding: '8px 10px', background: ds.color.bg, border: `1px solid ${ds.color.border}`, borderRadius: ds.radius.sm, marginBottom: '4px' }}>
                      {campaign.name}
                    </div>

                    {/* KPI row */}
                    {(campaign.expectedOpenRate || campaign.expectedCTR || campaign.expectedRPR) && (
                      <>
                        <SectionLabel>Expected KPIs</SectionLabel>
                        <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' }}>
                          {campaign.expectedOpenRate && <Tag color={ds.color.green} bg={ds.color.greenBg} border={ds.color.greenBorder}>OR: {campaign.expectedOpenRate}</Tag>}
                          {campaign.expectedCTR && <Tag color={ds.color.blue} bg={ds.color.blueBg} border={ds.color.blueBorder}>CTR: {campaign.expectedCTR}</Tag>}
                          {campaign.expectedRPR && <Tag color={ds.color.gold} bg={ds.color.goldBg} border={ds.color.goldBorder}>RPR: {campaign.expectedRPR}</Tag>}
                          {campaign.bestSendTime && <Tag color={ds.color.orange} bg={ds.color.orangeBg} border={ds.color.orangeBorder}>⏰ {campaign.bestSendTime}</Tag>}
                        </div>
                      </>
                    )}

                    {activeChannel === 'email' && campaign.subjectLine && (
                      <>
                        <SectionLabel>Subject Line</SectionLabel>
                        <InfoBox accent={ds.color.green}>
                          <span style={{ fontWeight: '600', color: ds.color.text }}>{campaign.subjectLine}</span>
                        </InfoBox>
                        {campaign.preheader && (
                          <>
                            <SectionLabel>Preheader</SectionLabel>
                            <InfoBox><span style={{ fontStyle: 'italic', color: ds.color.textSub }}>{campaign.preheader}</span></InfoBox>
                          </>
                        )}
                      </>
                    )}

                    {campaign.hasImage !== undefined && (
                      <>
                        <SectionLabel>{campaign.hasImage ? 'Image Recommended' : 'No Image Needed'}</SectionLabel>
                        <InfoBox accent={campaign.hasImage ? ds.color.gold : undefined}>
                          {campaign.hasImage
                            ? <span style={{ color: ds.color.gold }}>◈ {campaign.imageGuidance}</span>
                            : <span style={{ color: ds.color.textDim }}>— {campaign.imageGuidance}</span>
                          }
                        </InfoBox>
                      </>
                    )}

                    <SectionLabel>Message Template</SectionLabel>
                    <InfoBox mono>{campaign.template}</InfoBox>

                    <SectionLabel>Conversion Metric</SectionLabel>
                    <InfoBox><span style={{ color: ds.color.textSub }}>{campaign.conversionMetric}</span></InfoBox>

                    {campaign.events?.length > 0 && (
                      <>
                        <SectionLabel>Events to Track</SectionLabel>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '10px' }}>
                          {campaign.events.map((e, i) => <Tag key={i} color={ds.color.orange} bg={ds.color.orangeBg} border={ds.color.orangeBorder}>{e}</Tag>)}
                        </div>
                      </>
                    )}

                    {campaign.personalizationVariables?.length > 0 && (
                      <>
                        <SectionLabel>Personalisation Variables</SectionLabel>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '10px' }}>
                          {campaign.personalizationVariables.map((v, i) => <Tag key={i} color={ds.color.blue} bg={ds.color.blueBg} border={ds.color.blueBorder}>{v}</Tag>)}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${ds.color.border}; border-radius: 4px; }
        button:hover { opacity: 0.88; }
      `}</style>
    </div>
  );
}