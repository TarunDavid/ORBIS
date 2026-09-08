import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { BookOpen, RefreshCw, AlertCircle, Calculator, FlaskConical, Languages, Globe, Type, Pen } from 'lucide-react';

interface Subject {
  id: number;
  identifier: string;
  display_name: string;
  chapters?: any[];
}

const SUBJECT_COLORS = [
  { bg: 'bg-cobalt', text: 'text-white', stripe: 'bg-cobalt' },
  { bg: 'bg-gold', text: 'text-structural', stripe: 'bg-gold' },
  { bg: 'bg-mint', text: 'text-structural', stripe: 'bg-mint' },
  { bg: 'bg-coral', text: 'text-white', stripe: 'bg-coral' },
  { bg: 'bg-lilac', text: 'text-structural', stripe: 'bg-lilac' },
  { bg: 'bg-cobalt-dark', text: 'text-white', stripe: 'bg-cobalt-dark' },
  { bg: 'bg-mint-dark', text: 'text-white', stripe: 'bg-mint-dark' },
];

const SUBJECT_ICONS: Record<string, React.ComponentType<any>> = {
  mathematics: Calculator,
  science: FlaskConical,
  english: Languages,
  social_science: Globe,
  hindi: Type,
  kannada: Pen,
};

const Dashboard = () => {
  const navigate = useNavigate();
  const studentName = localStorage.getItem('student_name') || 'Student';
  const studentGrade = localStorage.getItem('student_grade') || 'Grade 5';
  
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchSubjects = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await api.get('grades/');
      const rawData = res.data;
      const grades: any[] = Array.isArray(rawData) ? rawData : (rawData?.results || []);
      
      if (grades.length === 0) {
        setSubjects([]);
        return;
      }

      // Match grade case-insensitively, e.g. "Grade 5", "grade 5", "5"
      const normalizedStudentGrade = studentGrade.toLowerCase().replace(/\s+/g, '');
      const currentGrade = grades.find((g: any) => {
        const ident = (g.identifier || '').toLowerCase().replace(/\s+/g, '');
        return ident === normalizedStudentGrade || ident.includes(normalizedStudentGrade) || normalizedStudentGrade.includes(ident);
      }) || grades[0]; // fallback to first available grade so subjects are never blank

      if (currentGrade && currentGrade.subjects) {
        setSubjects(currentGrade.subjects);
      } else {
        setSubjects([]);
      }
    } catch (error: any) {
      console.error('Error fetching subjects', error);
      setErrorMsg('Could not connect to the backend server. Please make sure the backend is running on port 8000.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubjects();
  }, [studentGrade]);

  const handleLogout = () => {
    localStorage.clear();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-canvas p-6 md:p-12 text-structural font-jakarta">
      <div className="max-w-5xl mx-auto">
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-12 gap-4">
          <div>
            <h1 className="font-syne text-4xl font-[800] text-structural tracking-tight">Hello, {studentName} 👋</h1>
            <p className="text-on-surface-variant mt-2 text-lg font-jakarta">Ready to learn something new in {studentGrade}?</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Offline Status Pill */}
            <div className="clay-chip bg-mint text-structural px-3 py-1.5 flex items-center gap-2 hidden md:flex">
              <span className="neon-dot"></span>
              100% OFFLINE
            </div>
            <button
              onClick={() => navigate('/sync')}
              className="clay-btn bg-cobalt text-white px-5 py-2.5 text-sm flex items-center gap-2"
            >
              <RefreshCw size={16} />
              <span className="hidden sm:inline">Sync Content</span>
            </button>
            <button onClick={handleLogout} className="label-text text-sm text-on-surface-variant hover:text-structural transition underline underline-offset-4">
              Switch User
            </button>
          </div>
        </header>

        {errorMsg && (
          <div className="clay-card bg-white p-6 mb-8 border-l-[8px] border-l-coral flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-coral">
              <AlertCircle size={24} className="flex-shrink-0" />
              <p className="font-jakarta font-medium text-stone-800 text-sm">{errorMsg}</p>
            </div>
            <button 
              onClick={fetchSubjects} 
              className="clay-btn bg-coral text-white px-4 py-2 text-xs font-grotesk whitespace-nowrap"
            >
              Retry Connection
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="clay-spinner"></div>
            <p className="font-grotesk font-bold text-xs uppercase tracking-wider text-on-surface-variant">Loading Subjects...</p>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-syne text-2xl font-bold text-structural">Your Subjects</h2>
              <span className="clay-chip bg-gold text-structural px-3 py-1 text-xs">
                {subjects.length} AVAILABLE
              </span>
            </div>

            {subjects.length === 0 ? (
              <div className="bg-white p-8 clay-card text-center space-y-4">
                <p className="text-on-surface-variant font-jakarta">No subjects found for this grade yet.</p>
                <button 
                  onClick={fetchSubjects}
                  className="clay-btn bg-cobalt text-white px-6 py-2.5 text-sm"
                >
                  Reload Subjects
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                {subjects.map((subject, index) => {
                  const color = SUBJECT_COLORS[index % SUBJECT_COLORS.length];
                  const IconComponent = SUBJECT_ICONS[subject.identifier] || BookOpen;
                  const chapterCount = subject.chapters?.length || 0;
                  return (
                    <button 
                      key={subject.id}
                      onClick={() => navigate(`/subjects/${subject.id}/chapters`)}
                      className="bg-white clay-card p-6 flex flex-col items-center justify-center gap-4 text-center group hover:translate-y-[-2px] hover:shadow-clay-3 transition-all relative overflow-hidden"
                    >
                      {/* Color accent stripe */}
                      <div className={`absolute left-0 top-0 bottom-0 w-[6px] ${color.stripe} rounded-l-clay`}></div>
                      <div className={`w-16 h-16 ${color.bg} clay-circle flex items-center justify-center`}>
                        <IconComponent size={28} className={color.text} />
                      </div>
                      <h3 className="font-syne text-lg font-bold text-structural">{subject.display_name}</h3>
                      {chapterCount > 0 && (
                        <span className="clay-chip bg-canvas text-on-surface-variant px-2.5 py-0.5 text-[10px]">
                          {chapterCount} {chapterCount === 1 ? 'CHAPTER' : 'CHAPTERS'}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
