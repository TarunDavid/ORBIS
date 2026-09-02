import React from 'react';

interface ProgressProps {
  video_watched: boolean;
  notes_viewed: boolean;
  summary_generated: boolean;
}

const ProgressIndicator: React.FC<{ progress?: ProgressProps }> = ({ progress }) => {
  if (!progress) {
    return (
      <div className="flex gap-1 mt-2">
        <div className="h-1.5 flex-1 bg-slate-100 rounded-full" />
        <div className="h-1.5 flex-1 bg-slate-100 rounded-full" />
        <div className="h-1.5 flex-1 bg-slate-100 rounded-full" />
      </div>
    );
  }

  return (
    <div className="mt-2">
      <div className="flex gap-1">
        <div className={`h-1.5 flex-1 rounded-full ${progress.video_watched ? 'bg-green-500' : 'bg-slate-200'}`} title="Video Watched" />
        <div className={`h-1.5 flex-1 rounded-full ${progress.notes_viewed ? 'bg-green-500' : 'bg-slate-200'}`} title="Notes Viewed" />
        <div className={`h-1.5 flex-1 rounded-full ${progress.summary_generated ? 'bg-green-500' : 'bg-slate-200'}`} title="Summary Generated" />
      </div>
      <div className="text-[10px] text-slate-400 mt-1 uppercase tracking-wide flex justify-between font-bold">
        <span>Video</span>
        <span>Notes</span>
        <span>Summary</span>
      </div>
    </div>
  );
};

export default ProgressIndicator;
