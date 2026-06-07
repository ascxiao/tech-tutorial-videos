import React from "react";
import { Terminal } from "lucide-react";

interface HeaderProps {
  seriesTitle: string;
  id: string;
  channelName?: string;
}

export const Header: React.FC<HeaderProps> = ({ seriesTitle, id, channelName }) => {
  return (
    <div className="w-full h-[288px] flex flex-col justify-between p-10 bg-[#050B08] border-b-4 border-emerald-950/70 relative box-border">
      {/* Decorative layout elements inside the Header */}
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-[#0A1A14] border-2 border-emerald-900/40 rounded-md">
            <Terminal size={32} className="text-[#34D399]" />
          </div>
          <span className="text-emerald-500/80 font-mono tracking-widest text-lg font-bold">
            TUTORIAL #{id}
          </span>
        </div>
        <div className="flex items-center px-4 py-1.5 bg-[#0A1A14] border-2 border-emerald-500 rounded-md">
          <span className="text-emerald-400 font-mono font-black text-base tracking-wider uppercase">
            {channelName || "@CODETUTORIALS"}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2 mt-4">
        {/* Flat background category card with sharp solid colors */}
        <span className="text-white text-5xl font-black tracking-tight leading-none uppercase font-sans">
          {seriesTitle}
        </span>
        <div className="flex gap-2 mt-2">
          <span className="px-3 py-1 bg-emerald-950/40 border border-emerald-800/40 text-emerald-400 text-sm font-black tracking-widest uppercase font-mono rounded">
            60-SEC QUICK FIX
          </span>
        </div>
      </div>
    </div>
  );
};
