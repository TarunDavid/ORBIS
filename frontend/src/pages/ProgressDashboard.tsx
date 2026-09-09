import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { ArrowLeft, Download, Award, TrendingUp, Calendar, AlertCircle } from 'lucide-react';

interface ProgressSummary {
  subject_id: number;
  subject_name: string;
  total_chapters: number;
  completed_chapters: number;
  completion_percentage: number;
}

interface QuizResult {
  id: number;
  subject_name: string;
  chapter_title: string;
  score: number;
  total_questions: number;
  created_at: string;
}

interface ActivityDay {
  date: string;
  count: number;
}

const ProgressDashboard = () => {
  const navigate = useNavigate();
  const studentId = localStorage.getItem('student_id');
  const studentName = localStorage.getItem('student_name') || 'Student';

  const [loading, setLoading] = useState(true);
  const [progressSummary, setProgressSummary] = useState<ProgressSummary[]>([]);
  const [quizResults, setQuizResults] = useState<QuizResult[]>([]);
  const [activity, setActivity] = useState<ActivityDay[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!studentId) {
      navigate('/');
      return;
    }
    fetchDashboardData();
  }, [studentId]);

  const fetchDashboardData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [progressRes, quizRes, activityRes] = await Promise.all([
        api.get(`students/${studentId}/progress-summary/`),
        api.get(`quiz-attempts/?student_id=${studentId}`),
        api.get(`students/${studentId}/activity/`),
      ]);

      setProgressSummary(progressRes.data);
      setQuizResults(quizRes.data.results || quizRes.data);
      setActivity(activityRes.data);
    } catch (err) {
      console.error('Failed to load progress data', err);
      setErrorMsg('Could not load progress data. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadReport = async () => {
    if (!studentId) return;
    try {
      const response = await api.get(`students/${studentId}/report-card/`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `ReportCard_${studentName.replace(/\s+/g, '')}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error('Failed to download report', err);
      alert('Failed to download report card. Ensure the backend is running.');
    }
  };

  // Heatmap generation
  const renderHeatmap = () => {
    const today = new Date();
    const startDate = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000); // 90 days ago
    
    // Create a map of date string -> count
    const activityMap = new Map<string, number>();
    activity.forEach(item => activityMap.set(item.date, item.count));

    const weeks = [];
    let currentWeek = [];
    
    // Fill initial empty days if start date is not Sunday
    for (let i = 0; i < startDate.getDay(); i++) {
      currentWeek.push(null);
    }

    for (let i = 0; i <= 90; i++) {
      const d = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().split('T')[0];
      const count = activityMap.get(dateStr) || 0;
      
      currentWeek.push({ date: dateStr, count });
      
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) currentWeek.push(null);
      weeks.push(currentWeek);
    }

    const getColorClass = (count: number) => {
      if (count === 0) return 'bg-canvas border-stone-200';
      if (count < 3) return 'bg-mint/30 border-mint/40';
      if (count < 6) return 'bg-mint/60 border-mint/70';
      return 'bg-mint border-mint-dark';
    };

    return (
      <div className="flex gap-1 overflow-x-auto pb-2">
        {weeks.map((week, wIndex) => (
          <div key={wIndex} className="flex flex-col gap-1">
            {week.map((day, dIndex) => {
              if (!day) return <div key={dIndex} className="w-4 h-4 bg-transparent"></div>;
              return (
                <div 
                  key={dIndex}
                  className={`w-4 h-4 rounded-sm border ${getColorClass(day.count)} transition-all hover:scale-110`}
                  title={`${day.count} activities on ${day.date}`}
                ></div>
              );
            })}
          </div>
        ))}
      </div>
    );
  };

  const getOverallProgress = () => {
    if (progressSummary.length === 0) return 0;
    const completed = progressSummary.reduce((sum, s) => sum + s.completed_chapters, 0);
    const total = progressSummary.reduce((sum, s) => sum + s.total_chapters, 0);
    return total === 0 ? 0 : Math.round((completed / total) * 100);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-canvas gap-4">
        <div className="clay-spinner"></div>
        <p className="font-grotesk font-bold text-xs uppercase tracking-wider text-on-surface-variant">Loading Progress...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas p-6 md:p-12 text-structural font-jakarta pb-24">
      <div className="max-w-5xl mx-auto">
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/dashboard')}
              className="clay-btn bg-white text-structural px-4 py-2 text-sm flex items-center gap-2"
            >
              <ArrowLeft size={16} /> Back
            </button>
            <h1 className="font-syne text-3xl font-[800] text-structural tracking-tight">My Progress</h1>
          </div>
          <button
            onClick={handleDownloadReport}
            className="clay-btn bg-cobalt text-white px-5 py-2.5 text-sm flex items-center gap-2"
          >
            <Download size={16} /> Print Report Card
          </button>
        </header>

        {errorMsg && (
          <div className="clay-card bg-white p-6 mb-8 border-l-[8px] border-l-coral flex items-center gap-3 text-coral">
            <AlertCircle size={24} />
            <p className="font-jakarta font-medium text-stone-800 text-sm">{errorMsg}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Overall Progress Card */}
          <div className="clay-card bg-white p-6 lg:col-span-1 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-mint clay-circle flex items-center justify-center mb-4">
              <Award size={28} className="text-structural" />
            </div>
            <h2 className="font-syne text-xl font-bold mb-1">Overall Completion</h2>
            <p className="text-4xl font-black text-cobalt mb-2">{getOverallProgress()}%</p>
            <p className="text-sm text-on-surface-variant">Across all subjects</p>
          </div>

          {/* Activity Heatmap Card */}
          <div className="clay-card bg-white p-6 lg:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <Calendar size={18} className="text-coral" />
              <h2 className="font-syne text-lg font-bold">Activity (Last 90 Days)</h2>
            </div>
            {renderHeatmap()}
            <div className="flex items-center gap-2 mt-4 text-[10px] font-grotesk font-bold text-on-surface-variant uppercase">
              <span>Less</span>
              <div className="w-3 h-3 rounded-sm bg-canvas border border-stone-200"></div>
              <div className="w-3 h-3 rounded-sm bg-mint/30 border border-mint/40"></div>
              <div className="w-3 h-3 rounded-sm bg-mint/60 border border-mint/70"></div>
              <div className="w-3 h-3 rounded-sm bg-mint border border-mint-dark"></div>
              <span>More</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Subject Progress */}
          <div className="clay-card bg-white p-6">
            <div className="flex items-center gap-2 mb-6">
              <TrendingUp size={18} className="text-cobalt" />
              <h2 className="font-syne text-lg font-bold">Subject Progress</h2>
            </div>
            
            {progressSummary.length === 0 ? (
              <p className="text-on-surface-variant text-sm">No subjects enrolled yet.</p>
            ) : (
              <div className="space-y-5">
                {progressSummary.map(subject => (
                  <div key={subject.subject_id}>
                    <div className="flex justify-between text-sm font-semibold mb-1">
                      <span>{subject.subject_name}</span>
                      <span>{subject.completion_percentage}%</span>
                    </div>
                    <div className="w-full bg-canvas h-3 rounded-full overflow-hidden border border-stone-200">
                      <div 
                        className="bg-cobalt h-full rounded-full transition-all duration-500"
                        style={{ width: `${subject.completion_percentage}%` }}
                      ></div>
                    </div>
                    <p className="text-right text-[10px] text-on-surface-variant mt-1">
                      {subject.completed_chapters} of {subject.total_chapters} chapters
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quiz Results */}
          <div className="clay-card bg-white p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Award size={18} className="text-gold" />
                <h2 className="font-syne text-lg font-bold">Recent Quiz Results</h2>
              </div>
            </div>

            {quizResults.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-on-surface-variant text-sm">No quizzes attempted yet.</p>
                <button 
                  onClick={() => navigate('/dashboard')}
                  className="clay-btn bg-canvas text-structural px-4 py-2 text-xs mt-4"
                >
                  Start Learning
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b-2 border-stone-100">
                      <th className="pb-3 text-xs font-grotesk font-bold text-on-surface-variant uppercase">Date</th>
                      <th className="pb-3 text-xs font-grotesk font-bold text-on-surface-variant uppercase">Chapter</th>
                      <th className="pb-3 text-xs font-grotesk font-bold text-on-surface-variant uppercase text-right">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quizResults.slice(0, 5).map(quiz => (
                      <tr key={quiz.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
                        <td className="py-3 text-sm text-stone-500">
                          {new Date(quiz.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </td>
                        <td className="py-3">
                          <p className="text-sm font-semibold text-structural">{quiz.chapter_title}</p>
                          <p className="text-[10px] text-stone-500 uppercase">{quiz.subject_name}</p>
                        </td>
                        <td className="py-3 text-right">
                          {quiz.score === null ? (
                            <span className="clay-chip bg-stone-100 text-stone-500 font-bold px-2 py-1 text-[10px] uppercase tracking-wider">
                              Incomplete
                            </span>
                          ) : (
                            <span className="clay-chip bg-canvas text-structural font-bold px-2 py-1 text-xs">
                              {quiz.score}/{quiz.total_questions}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default ProgressDashboard;
