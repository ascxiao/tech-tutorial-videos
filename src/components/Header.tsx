import React from "react";
import { Terminal } from "lucide-react";

interface HeaderProps {
  seriesTitle: string;
  id: string;
  channelName?: string;
}

export const Header: React.FC<HeaderProps> = ({ seriesTitle, id, channelName }) => {
  return (
    <div className="w-full h-[288px] flex flex-col justify-between p-10 bg-[#1E293B] border-b-4 border-[#334155] relative box-border">
      {/* Decorative layout elements inside the Header */}
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-[#0B0F19] border-2 border-[#475569] rounded-md">
            <Terminal size={32} className="text-[#EAB308]" />
          </div>
          <span className="text-[#94A3B8] font-mono tracking-widest text-lg font-bold">
            TUTORIAL #{id}
          </span>
        </div>
        <div className="flex items-center px-4 py-1.5 bg-[#0B0F19] border-2 border-[#38BDF8] rounded-md">
          <span className="text-[#38BDF8] font-mono font-black text-base tracking-wider uppercase">
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
          <span className="px-3 py-1 bg-[#475569] text-white text-sm font-black tracking-widest uppercase font-mono rounded">
            60-SEC QUICK FIX
          </span>
          <span className="px-3 py-1 bg-[#EAB308] text-[#0B0F19] text-sm font-black tracking-widest uppercase font-mono rounded">
            100% OFFLINE
          </span>
        </div>
      </div>
    </div>
  );
};
