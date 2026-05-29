import React, { useState, useEffect } from "react";
import { StandaloneDashboard } from "./components/StandaloneDashboard";
import { TutorialData } from "./types";

export const App: React.FC = () => {
  const [tutorials, setTutorials] = useState<TutorialData[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);

  // Load tutorials database dynamically from public folder
  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch("/data/tutorials.json");
        const data = await res.json();
        setTutorials(data);
        if (data.length > 0) {
          setActiveId(data[0].id);
        }
      } catch (err) {
        console.error("Failed to load tutorials database:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const activeTutorial = tutorials.find((t) => t.id === activeId);

  if (loading) {
    return (
      <div className="w-screen h-screen bg-[#F8FAFC] text-[#475569] flex flex-col justify-center items-center font-mono">
        <span className="text-xl tracking-widest animate-pulse uppercase">
          BOOTING CREATOR DECK CORE ENVIRONMENT...
        </span>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen bg-[#F8FAFC] text-[#0F172A] flex flex-col justify-start items-stretch">
      {/* Dynamic Selector Header if multiple tutorials exist */}
      {tutorials.length > 1 && (
        <div className="bg-white border-b border-[#E2E8F0] px-6 py-2 flex items-center justify-between shrink-0 font-mono text-xs select-none">
          <div className="flex items-center gap-3 text-[#0F172A]">
            <span className="text-slate-500 font-bold uppercase tracking-widest">Active Workspace:</span>
            <select
              value={activeId}
              onChange={(e) => setActiveId(e.target.value)}
              className="bg-[#F8FAFC] border border-[#CBD5E1] text-[#0F172A] px-2 py-1 rounded focus:outline-none cursor-pointer"
            >
              {tutorials.map((t) => (
                <option key={t.id} value={t.id}>
                  TUTORIAL #{t.id} - {t.seriesTitle}
                </option>
              ))}
            </select>
          </div>
          <span className="text-slate-400 uppercase">Interactive Workspace Registry</span>
        </div>
      )}

      {/* Render Dashboard for the chosen active video tutorial */}
      {activeTutorial ? (
        <StandaloneDashboard key={activeTutorial.id} initialProps={activeTutorial} />
      ) : (
        <div className="flex-1 flex justify-center items-center text-slate-400 font-mono">
          No tutorial configuration registered in tutorials.json!
        </div>
      )}
    </div>
  );
};
export default App;
