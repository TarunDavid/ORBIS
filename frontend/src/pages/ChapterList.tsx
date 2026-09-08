import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import { PlayCircle, ArrowLeft } from 'lucide-react';
import ProgressIndicator from '../components/ProgressIndicator';

interface Chapter {
  id: number;
  identifier: string;
  title: string;
  order: number;
}

const ChapterList = () => {
  const { subjectId } = useParams();
  const navigate = useNavigate();
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [subjectName, setSubjectName] = useState('');
  const [loading, setLoading] = useState(true);
  const [progressMap, setProgressMap] = useState<Record<number, any>>({});

  const currentStudentStr = localStorage.getItem('currentStudent');
  const student = currentStudentStr ? JSON.parse(currentStudentStr) : null;
  const studentId = student?.id;

  useEffect(() => {
    const fetchChaptersAndProgress = async () => {
      try {
        const [res, progressRes] = await Promise.all([
          api.get(`subjects/${subjectId}/`),
          studentId ? api.get(`progress/?student_id=${studentId}`) : Promise.resolve({ data: [] })
        ]);
        
        setSubjectName(res.data.display_name);
        setChapters(res.data.chapters.sort((a: Chapter, b: Chapter) => a.order - b.order));
        
        // Handle both paginated ({results: [...]}) and non-paginated ([...]) responses
        const progressItems = Array.isArray(progressRes.data) 
          ? progressRes.data 
          : (progressRes.data.results || []);
        const pMap: Record<number, any> = {};
        progressItems.forEach((p: any) => {
          pMap[p.chapter] = p;
        });
        setProgressMap(pMap);
      } catch (error) {
        console.error('Error fetching chapters', error);
      } finally {
        setLoading(false);
      }
    };
    fetchChaptersAndProgress();
  }, [subjectId, studentId]);

  return (
    <div className="min-h-screen bg-canvas p-6 md:p-12">
      <div className="max-w-4xl mx-auto">
        <button 
          onClick={() => navigate('/dashboard')}
          className="clay-btn bg-white text-structural px-5 py-2.5 text-sm flex items-center gap-2 mb-8"
        >
          <ArrowLeft size={16} /> Back to Dashboard
        </button>

        <header className="mb-10">
          <h1 className="font-syne text-4xl font-[800] text-structural tracking-tight">{subjectName}</h1>
          <p className="text-on-surface-variant mt-2 text-lg font-jakarta">Select a chapter to start learning</p>
        </header>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="clay-spinner"></div>
          </div>
        ) : (
          <div className="space-y-4">
            {chapters.length === 0 ? (
              <div className="bg-white p-8 clay-card text-center">
                <p className="text-on-surface-variant font-jakarta">No chapters found for this subject yet.</p>
              </div>
            ) : (
              chapters.map((chapter) => (
                <button
                  key={chapter.id}
                  onClick={() => navigate(`/chapters/${chapter.id}`)}
                  className="w-full text-left bg-white p-6 clay-card flex items-center justify-between group hover:translate-y-[-2px] hover:shadow-clay-3 transition-all"
                >
                  <div className="w-full mr-6">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="clay-chip bg-gold text-structural px-3 py-1 text-[11px]">
                        CH {chapter.order}
                      </span>
                    </div>
                    <h3 className="font-syne text-xl font-bold text-structural mb-2">{chapter.title}</h3>
                    <div className="max-w-xs">
                      <ProgressIndicator progress={progressMap[chapter.id]} />
                    </div>
                  </div>
                  <div className="text-on-surface-variant group-hover:text-cobalt transition-colors flex-shrink-0">
                    <div className="w-12 h-12 rounded-full border-3 border-structural flex items-center justify-center group-hover:bg-cobalt group-hover:text-white transition-all" style={{ borderWidth: '3px' }}>
                      <PlayCircle size={24} />
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChapterList;
