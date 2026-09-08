import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api';
import { User, PlusCircle } from 'lucide-react';

interface StudentProfile {
  id: number;
  name: string;
  grade: string;
}

const AVATAR_COLORS = ['bg-cobalt', 'bg-gold', 'bg-mint', 'bg-coral', 'bg-lilac'];

const SelectProfile = () => {
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<StudentProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfiles = async () => {
      try {
        const res = await api.get('students/');
        setProfiles(res.data);
      } catch (error) {
        console.error('Error fetching profiles', error);
      } finally {
        setLoading(false);
      }
    };
    fetchProfiles();
  }, []);

  const handleSelect = (profile: StudentProfile) => {
    localStorage.setItem('student_id', profile.id.toString());
    localStorage.setItem('student_name', profile.name);
    localStorage.setItem('student_grade', profile.grade);
    localStorage.setItem('currentStudent', JSON.stringify(profile));
    navigate('/dashboard');
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-canvas p-4 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-8 right-8 clay-chip bg-mint text-structural px-3 py-1.5 sticker-tilt-right flex items-center gap-2">
        <span className="neon-dot"></span>
        100% OFFLINE
      </div>
      <div className="absolute bottom-12 left-8 clay-chip bg-gold text-structural px-3 py-1.5 sticker-tilt-left">
        🧠 ON-DEVICE AI
      </div>

      <div className="bg-white p-8 md:p-12 clay-card-lg w-full max-w-2xl text-center">
        {/* Logo */}
        <h1 className="font-syne text-5xl font-[900] text-structural mb-1 tracking-tight">ORBIS</h1>
        <p className="font-jakarta text-on-surface-variant text-lg mb-10">Who is learning today?</p>
        
        {loading ? (
           <div className="flex justify-center py-10">
             <div className="clay-spinner"></div>
           </div>
        ) : (
          <div className="flex flex-wrap justify-center gap-6">
            {profiles.map((profile, index) => (
              <button 
                key={profile.id}
                onClick={() => handleSelect(profile)}
                className="flex flex-col items-center p-5 bg-white clay-card hover:translate-y-[-2px] hover:shadow-clay-3 transition-all group w-36"
              >
                <div className={`w-16 h-16 ${AVATAR_COLORS[index % AVATAR_COLORS.length]} clay-circle flex items-center justify-center mb-3`}>
                  <User size={28} className="text-white" />
                </div>
                <h3 className="font-syne font-bold text-structural text-base truncate w-full">{profile.name}</h3>
                <p className="label-text text-on-surface-variant text-[10px] mt-1">{profile.grade}</p>
              </button>
            ))}

            <Link 
              to="/register"
              className="flex flex-col items-center justify-center p-5 bg-canvas border-3 border-dashed border-structural rounded-clay hover:bg-gold/20 hover:border-solid transition-all group w-36"
              style={{ borderWidth: '3px' }}
            >
              <div className="w-16 h-16 text-on-surface-variant rounded-full flex items-center justify-center group-hover:text-cobalt transition-colors mb-3">
                <PlusCircle size={40} strokeWidth={2.5} />
              </div>
              <h3 className="font-syne font-bold text-structural group-hover:text-cobalt">New Student</h3>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

export default SelectProfile;
