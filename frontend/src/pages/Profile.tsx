import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { Camera, Save, ArrowLeft, User, School, Calendar, GraduationCap, UserCheck, LogOut, CheckCircle, AlertCircle, Pencil } from 'lucide-react';

interface StudentData {
  id: number;
  name: string;
  age: number;
  school_name: string;
  grade: string;
  mentor_name: string;
  profile_picture: string | null;
  registration_timestamp: string;
}

const Profile = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const studentId = localStorage.getItem('student_id');

  const [student, setStudent] = useState<StudentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Editable form state
  const [form, setForm] = useState({
    name: '',
    age: '',
    school_name: '',
    grade: '',
    mentor_name: '',
  });

  // Local preview for profile picture (before upload completes)
  const [picturePreview, setPicturePreview] = useState<string | null>(null);

  useEffect(() => {
    if (!studentId) {
      navigate('/');
      return;
    }
    fetchStudent();
  }, [studentId]);

  const fetchStudent = async () => {
    try {
      const res = await api.get(`students/${studentId}/`);
      setStudent(res.data);
      setForm({
        name: res.data.name,
        age: String(res.data.age),
        school_name: res.data.school_name,
        grade: res.data.grade,
        mentor_name: res.data.mentor_name,
      });
    } catch (err) {
      console.error('Failed to load profile', err);
      showToast('error', 'Failed to load profile data.');
    } finally {
      setLoading(false);
    }
  };

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSave = async () => {
    if (!studentId) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        age: parseInt(form.age, 10),
      };
      const res = await api.patch(`students/${studentId}/`, payload);
      setStudent(res.data);

      // Update localStorage so header reflects changes immediately
      localStorage.setItem('student_name', res.data.name);
      localStorage.setItem('student_grade', res.data.grade);
      localStorage.setItem('currentStudent', JSON.stringify(res.data));

      setIsEditing(false);
      showToast('success', 'Profile updated successfully!');
    } catch (err) {
      console.error('Failed to save profile', err);
      showToast('error', 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  const handlePictureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !studentId) return;

    // Show instant preview
    const reader = new FileReader();
    reader.onload = (ev) => setPicturePreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('profile_picture', file);
      const res = await api.post(`students/${studentId}/upload-profile-picture/`, formData);
      setStudent(res.data);
      localStorage.setItem('currentStudent', JSON.stringify(res.data));
      // Store profile_picture URL in localStorage for the header
      if (res.data.profile_picture) {
        localStorage.setItem('student_profile_picture', res.data.profile_picture);
      }
      showToast('success', 'Profile picture updated!');
    } catch (err) {
      console.error('Upload failed', err);
      setPicturePreview(null);
      showToast('error', 'Failed to upload picture.');
    } finally {
      setUploading(false);
    }
  };

  const getProfilePicUrl = (): string | null => {
    if (picturePreview) return picturePreview;
    if (!student?.profile_picture) return null;
    // If the URL is already absolute, use it directly; otherwise, prepend backend origin
    if (student.profile_picture.startsWith('http')) return student.profile_picture;
    return `http://${window.location.hostname || 'localhost'}:8000${student.profile_picture}`;
  };

  const profilePicUrl = getProfilePicUrl();

  const handleLogout = () => {
    localStorage.clear();
    navigate('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="clay-spinner"></div>
          <p className="font-grotesk font-bold text-xs uppercase tracking-wider text-on-surface-variant">Loading Profile...</p>
        </div>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <div className="clay-card bg-white p-8 text-center">
          <p className="font-jakarta text-on-surface-variant">Could not load profile.</p>
          <button onClick={() => navigate('/dashboard')} className="clay-btn bg-cobalt text-white px-6 py-2.5 text-sm mt-4">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const memberSince = new Date(student.registration_timestamp).toLocaleDateString('en-IN', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <div className="min-h-screen bg-canvas p-6 md:p-12 text-structural font-jakarta">
      {/* Toast */}
      {toast && (
        <div className={`profile-toast ${toast.type === 'success' ? 'profile-toast-success' : 'profile-toast-error'}`}>
          {toast.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          <span>{toast.message}</span>
        </div>
      )}

      <div className="max-w-2xl mx-auto">
        {/* Back button */}
        <button
          onClick={() => navigate('/dashboard')}
          className="clay-btn bg-white text-structural px-5 py-2.5 text-sm flex items-center gap-2 mb-8"
        >
          <ArrowLeft size={16} /> Back to Dashboard
        </button>

        {/* Profile Card */}
        <div className="clay-card-lg bg-white p-8 md:p-10 relative overflow-hidden">
          {/* Color accent bar at top */}
          <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-cobalt via-lilac to-mint"></div>

          {/* --- Avatar Section --- */}
          <div className="flex flex-col items-center mb-8 pt-4">
            <div className="relative group">
              <div className="profile-avatar-lg">
                {profilePicUrl ? (
                  <img
                    src={profilePicUrl}
                    alt={student.name}
                    className="w-full h-full object-cover rounded-full"
                  />
                ) : (
                  <div className="w-full h-full bg-cobalt rounded-full flex items-center justify-center">
                    <User size={48} className="text-white" />
                  </div>
                )}
                {uploading && (
                  <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center">
                    <div className="clay-spinner" style={{ width: 28, height: 28, borderColor: '#fff', borderTopColor: '#2547F4' }}></div>
                  </div>
                )}
              </div>
              {/* Camera overlay button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="profile-avatar-upload-btn"
                title="Upload profile picture"
                disabled={uploading}
              >
                <Camera size={16} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePictureUpload}
                className="hidden"
              />
            </div>

            <h1 className="font-syne text-3xl font-[800] text-structural tracking-tight mt-4">{student.name}</h1>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="clay-chip bg-gold text-structural px-3 py-1 text-[11px]">{student.grade}</span>
              <span className="clay-chip bg-canvas text-on-surface-variant px-3 py-1 text-[11px]">SINCE {memberSince.toUpperCase()}</span>
            </div>
          </div>

          {/* --- Info / Edit Section --- */}
          <div className="border-t-3 border-structural pt-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-syne text-xl font-bold text-structural">Student Details</h2>
              {!isEditing ? (
                <button
                  onClick={() => setIsEditing(true)}
                  className="clay-btn bg-canvas text-structural px-4 py-2 text-xs flex items-center gap-2"
                >
                  <Pencil size={14} /> Edit
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setIsEditing(false); fetchStudent(); }}
                    className="clay-btn bg-canvas text-structural px-4 py-2 text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="clay-btn bg-cobalt text-white px-4 py-2 text-xs flex items-center gap-2"
                  >
                    <Save size={14} />
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-5">
              {/* Name */}
              <div className="profile-field">
                <div className="profile-field-icon bg-cobalt">
                  <User size={16} className="text-white" />
                </div>
                <div className="flex-1">
                  <label className="label-text text-[10px] text-on-surface-variant block mb-1">Full Name</label>
                  {isEditing ? (
                    <input
                      name="name"
                      value={form.name}
                      onChange={handleChange}
                      className="w-full px-3 py-2 clay-input text-sm"
                    />
                  ) : (
                    <p className="font-jakarta font-semibold text-structural">{student.name}</p>
                  )}
                </div>
              </div>

              {/* Age */}
              <div className="profile-field">
                <div className="profile-field-icon bg-coral">
                  <Calendar size={16} className="text-white" />
                </div>
                <div className="flex-1">
                  <label className="label-text text-[10px] text-on-surface-variant block mb-1">Age</label>
                  {isEditing ? (
                    <input
                      name="age"
                      type="number"
                      min="4"
                      max="20"
                      value={form.age}
                      onChange={handleChange}
                      className="w-full px-3 py-2 clay-input text-sm"
                    />
                  ) : (
                    <p className="font-jakarta font-semibold text-structural">{student.age} years old</p>
                  )}
                </div>
              </div>

              {/* School */}
              <div className="profile-field">
                <div className="profile-field-icon bg-gold">
                  <School size={16} className="text-structural" />
                </div>
                <div className="flex-1">
                  <label className="label-text text-[10px] text-on-surface-variant block mb-1">School</label>
                  {isEditing ? (
                    <input
                      name="school_name"
                      value={form.school_name}
                      onChange={handleChange}
                      className="w-full px-3 py-2 clay-input text-sm"
                    />
                  ) : (
                    <p className="font-jakarta font-semibold text-structural">{student.school_name}</p>
                  )}
                </div>
              </div>

              {/* Grade */}
              <div className="profile-field">
                <div className="profile-field-icon bg-mint">
                  <GraduationCap size={16} className="text-structural" />
                </div>
                <div className="flex-1">
                  <label className="label-text text-[10px] text-on-surface-variant block mb-1">Grade</label>
                  {isEditing ? (
                    <select
                      name="grade"
                      value={form.grade}
                      onChange={handleChange}
                      className="w-full px-3 py-2 clay-select text-sm"
                    >
                      {Array.from({ length: 10 }, (_, i) => (
                        <option key={i + 1} value={`Grade ${i + 1}`}>Grade {i + 1}</option>
                      ))}
                    </select>
                  ) : (
                    <p className="font-jakarta font-semibold text-structural">{student.grade}</p>
                  )}
                </div>
              </div>

              {/* Mentor */}
              <div className="profile-field">
                <div className="profile-field-icon bg-lilac">
                  <UserCheck size={16} className="text-white" />
                </div>
                <div className="flex-1">
                  <label className="label-text text-[10px] text-on-surface-variant block mb-1">Mentor</label>
                  {isEditing ? (
                    <input
                      name="mentor_name"
                      value={form.mentor_name}
                      onChange={handleChange}
                      className="w-full px-3 py-2 clay-input text-sm"
                    />
                  ) : (
                    <p className="font-jakarta font-semibold text-structural">{student.mentor_name}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* --- Actions --- */}
          <div className="border-t-3 border-structural mt-8 pt-6 flex justify-center">
            <button
              onClick={handleLogout}
              className="clay-btn bg-coral text-white px-6 py-2.5 text-sm flex items-center gap-2"
            >
              <LogOut size={16} /> Switch User
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
