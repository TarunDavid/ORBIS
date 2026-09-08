import React from 'react';

interface ProgressProps {
  video_watched: boolean;
  notes_viewed: boolean;
  summary_generated: boolean;
}

const ProgressIndicator: React.FC<{ progress?: ProgressProps }> = ({ progress }) => {
  if (!progress) {
    return (
      <div className="mt-3">
        <div className="flex gap-1.5">
          <div className="h-2.5 flex-1 bg-stone-200 border-2 border-[#121316] rounded-full" />
          <div className="h-2.5 flex-1 bg-stone-200 border-2 border-[#121316] rounded-full" />
          <div className="h-2.5 flex-1 bg-stone-200 border-2 border-[#121316] rounded-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <div className="flex gap-1.5">
        <div 
          className={`h-2.5 flex-1 rounded-full border-2 border-[#121316] transition-colors ${
            progress.video_watched ? 'bg-mint' : 'bg-stone-200'
          }`} 
          title="Video Watched" 
        />
        <div 
          className={`h-2.5 flex-1 rounded-full border-2 border-[#121316] transition-colors ${
            progress.notes_viewed ? 'bg-mint' : 'bg-stone-200'
          }`} 
          title="Notes Viewed" 
        />
        <div 
          className={`h-2.5 flex-1 rounded-full border-2 border-[#121316] transition-colors ${
            progress.summary_generated ? 'bg-mint' : 'bg-stone-200'
          }`} 
          title="Summary Generated" 
        />
      </div>
      <div className="text-[10px] text-stone-600 mt-1.5 font-grotesk font-bold uppercase tracking-wider flex justify-between">
        <span className={progress.video_watched ? 'text-[#121316]' : 'text-stone-400'}>Video</span>
        <span className={progress.notes_viewed ? 'text-[#121316]' : 'text-stone-400'}>Notes</span>
        <span className={progress.summary_generated ? 'text-[#121316]' : 'text-stone-400'}>Summary</span>
      </div>
    </div>
  );
};

export default ProgressIndicator;
