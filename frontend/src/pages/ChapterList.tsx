import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import { PlayCircle, ArrowLeft } from 'lucide-react';

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

  useEffect(() => {
    const fetchChapters = async () => {
      try {
        const res = await api.get(`subjects/${subjectId}/`);
        setSubjectName(res.data.display_name);
        setChapters(res.data.chapters.sort((a: Chapter, b: Chapter) => a.order - b.order));
      } catch (error) {
        console.error('Error fetching chapters', error);
      } finally {
        setLoading(false);
      }
    };
    fetchChapters();
  }, [subjectId]);

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-12">
      <div className="max-w-4xl mx-auto">
        <button 
          onClick={() => navigate('/dashboard')}
          className="flex items-center text-slate-500 hover:text-slate-800 transition mb-8 font-medium"
        >
          <ArrowLeft className="mr-2" size={20} /> Back to Dashboard
        </button>

        <header className="mb-10">
          <h1 className="text-4xl font-extrabold text-slate-800 tracking-tight">{subjectName}</h1>
          <p className="text-slate-500 mt-2 text-lg">Select a chapter to start learning</p>
        </header>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
          </div>
        ) : (
          <div className="space-y-4">
            {chapters.length === 0 ? (
              <div className="bg-white p-8 rounded-2xl shadow-sm text-center border border-slate-200">
                <p className="text-slate-500">No chapters found for this subject yet.</p>
              </div>
            ) : (
              chapters.map((chapter) => (
                <button
                  key={chapter.id}
                  onClick={() => navigate(`/chapters/${chapter.id}`)}
                  className="w-full text-left bg-white p-6 rounded-2xl shadow-sm hover:shadow-md transition flex items-center justify-between border border-slate-100 group"
                >
                  <div>
                    <span className="text-sm font-bold text-indigo-500 uppercase tracking-wider block mb-1">
                      Chapter {chapter.order}
                    </span>
                    <h3 className="text-xl font-bold text-slate-800">{chapter.title}</h3>
                  </div>
                  <div className="text-slate-300 group-hover:text-indigo-500 transition-colors">
                    <PlayCircle size={32} />
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
