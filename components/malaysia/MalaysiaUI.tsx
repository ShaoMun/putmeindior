"use client";

import { useState } from "react";
import { Search, Layers, Crosshair, Flame } from "lucide-react";
import "./malaysia-ui.css";

interface MalaysiaUIProps {
  phase: "LOADING" | "DASHBOARD";
}

export default function MalaysiaUI({ phase }: MalaysiaUIProps) {
  // State to simulate a target being selected
  const [targetSelected, setTargetSelected] = useState(false);

  return (
    <div className={`malaysia-ui-wrapper ${phase === "DASHBOARD" ? "active" : "hidden"}`}>
      <div className="malaysia-ui-search frosted-panel">
        <div className="icon">
          <Search size={18} />
        </div>
        <input type="text" placeholder="Search city or coordinates..." />
      </div>

      {/* 2. The Right Sidebar (Info Card) */}
      <div className="malaysia-ui-infocard frosted-panel">
        <div className="header">
          <h2 className="title">Menara Ampang</h2>
          <p className="subtitle">Sector 7G</p>
        </div>

        <div className="data-rows">
          <div className="data-row">
            <span className="label">Risk Level</span>
            <span className="val-critical">CRITICAL</span>
          </div>
          <div className="data-row">
            <span className="label">Occupancy</span>
            <span className="val-white">~42</span>
          </div>
          <div className="data-row">
            <span className="label">Structure</span>
            <span className="val-grey">Concrete</span>
          </div>
        </div>

        <button 
          className="action-btn"
          onClick={() => setTargetSelected(!targetSelected)}
        >
          Analyze Target
        </button>
      </div>

      {/* 3. The Bottom Bar (The Tray) */}
      <div className="malaysia-ui-tray-container">
        <div className={`malaysia-ui-tray frosted-panel ${targetSelected ? "expanded" : ""}`}>
          <button className="icon-btn">
            <Layers size={20} />
          </button>
          <button className="icon-btn">
            <Crosshair size={20} />
          </button>
          <button className="icon-btn">
            <Flame size={20} />
          </button>
          
          {targetSelected && (
            <button className="live-info-btn">
              LIVE INFO
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
